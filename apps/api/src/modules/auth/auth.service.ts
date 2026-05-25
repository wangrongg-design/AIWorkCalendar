import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Prisma, RoleCode, SubscriptionPlan, SubscriptionStatus } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { createHash, randomBytes } from "crypto";
import { AuditService } from "../../common/audit/audit.service";
import { PrismaService } from "../../common/prisma.service";
import { RateLimitService } from "../../common/rate-limit/rate-limit.service";
import { CurrentUser } from "../../common/types/current-user";
import { LoginDto } from "./dto/login.dto";
import { ChangePasswordDto, PasswordResetConfirmDto, PasswordResetRequestDto, VerifyEmailDto } from "./dto/password.dto";
import { RegisterTenantDto } from "./dto/register.dto";

function dateOnly(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function oneMonthTrialEnd() {
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() + 1);
  return dateOnly(date);
}

function randomToken() {
  return randomBytes(32).toString("hex");
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function addHours(hours: number) {
  const date = new Date();
  date.setHours(date.getHours() + hours);
  return date;
}

function normalizeLoginAccount(dto: LoginDto) {
  return (dto.account ?? dto.email ?? "").trim();
}

function normalizePhone(value: string) {
  return value.replace(/[\s-]/g, "");
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly audit: AuditService,
    private readonly rateLimit: RateLimitService
  ) {}

  async register(dto: RegisterTenantDto) {
    const adminEmail = dto.adminEmail.trim().toLowerCase();
    this.rateLimit.consume(`register:${adminEmail}`, 5, 60 * 60 * 1000);
    const existingTenant = await this.prisma.tenant.findUnique({ where: { code: dto.tenantCode } });
    if (existingTenant && !existingTenant.deletedAt) {
      throw new BadRequestException("企业代码已被使用");
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const roleDefs: Array<{ code: RoleCode; name: string }> = [
      { code: RoleCode.SUPER_ADMIN, name: "超级管理员" },
      { code: RoleCode.COMPANY_ADMIN, name: "企业管理员" },
      { code: RoleCode.DEPARTMENT_MANAGER, name: "部门经理" },
      { code: RoleCode.EMPLOYEE, name: "普通员工" }
    ];
    const { user, roles, emailVerificationToken } = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: dto.companyName,
          code: dto.tenantCode
        }
      });
      const periodEnd = oneMonthTrialEnd();
      await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          plan: SubscriptionPlan.TRIAL,
          status: SubscriptionStatus.TRIALING,
          seatLimit: 3,
          currentPeriodStart: dateOnly(),
          currentPeriodEnd: periodEnd,
          trialEndsAt: periodEnd,
          provider: "self_service"
        }
      });
      const rolesByCode = new Map<RoleCode, string>();
      for (const roleDef of roleDefs) {
        const role = await tx.role.create({
          data: { tenantId: tenant.id, code: roleDef.code, name: roleDef.name }
        });
        rolesByCode.set(role.code, role.id);
      }
      const admin = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: adminEmail,
          name: dto.adminName,
          passwordHash,
          isActive: true,
          requiresWorkReport: false,
          emailVerifiedAt: null,
          lastPasswordChangedAt: new Date()
        },
        include: {
          tenant: true,
          department: true,
          roles: { where: { deletedAt: null }, include: { role: true } }
        }
      });
      const companyAdminRoleId = rolesByCode.get(RoleCode.COMPANY_ADMIN);
      if (!companyAdminRoleId) {
        throw new BadRequestException("Company admin role missing");
      }
      await tx.userRole.create({
        data: {
          tenantId: tenant.id,
          userId: admin.id,
          roleId: companyAdminRoleId
        }
      });
      const emailToken = randomToken();
      await tx.emailVerificationToken.create({
        data: {
          tenantId: tenant.id,
          userId: admin.id,
          tokenHash: tokenHash(emailToken),
          expiresAt: addHours(48)
        }
      });
      return {
        user: {
          ...admin,
          roles: [{ role: { code: RoleCode.COMPANY_ADMIN } }]
        },
        roles: [RoleCode.COMPANY_ADMIN],
        emailVerificationToken: process.env.NODE_ENV === "production" ? undefined : emailToken
      };
    });
    await this.audit.log({
      tenantId: user.tenantId,
      actorUserId: user.id,
      action: "TENANT_REGISTERED",
      targetType: "Tenant",
      targetId: user.tenantId,
      metadata: { tenantCode: dto.tenantCode, adminEmail }
    });
    return {
      ...(await this.buildAuthResponse(user, roles)),
      emailVerificationRequired: process.env.REQUIRE_EMAIL_VERIFICATION === "true",
      emailVerificationToken
    };
  }

  async login(dto: LoginDto) {
    const account = normalizeLoginAccount(dto);
    if (!account) {
      throw new BadRequestException("请输入邮箱或手机号");
    }
    const normalizedEmail = account.toLowerCase();
    const normalizedPhone = normalizePhone(account);
    this.rateLimit.consume(`login:${dto.tenantCode ?? "any"}:${normalizedEmail}`, 10, 15 * 60 * 1000);
    const where: Prisma.UserWhereInput = dto.tenantCode
      ? {
          OR: [{ email: normalizedEmail }, { phone: normalizedPhone }],
          deletedAt: null,
          tenant: { code: dto.tenantCode, deletedAt: null }
        }
      : {
          OR: [{ email: normalizedEmail }, { phone: normalizedPhone }],
          deletedAt: null
        };

    const users = await this.prisma.user.findMany({
      where,
      include: {
        tenant: true,
        department: true,
        roles: { where: { deletedAt: null }, include: { role: true } }
      },
      take: 2
    });

    if (users.length > 1 && !dto.tenantCode) {
      throw new BadRequestException("该账号存在于多个企业，请填写企业代码");
    }
    const user = users[0];
    if (!user || !user.isActive) {
      throw new UnauthorizedException("Invalid email or password");
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException("Account is temporarily locked");
    }
    if (process.env.REQUIRE_EMAIL_VERIFICATION === "true" && user.email && !user.emailVerifiedAt) {
      throw new UnauthorizedException("Email is not verified");
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      const failedLoginCount = user.failedLoginCount + 1;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount,
          lockedUntil: failedLoginCount >= 5 ? addHours(1) : undefined
        }
      });
      throw new UnauthorizedException("Invalid email or password");
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), failedLoginCount: 0, lockedUntil: null }
    });
    await this.audit.log({
      tenantId: user.tenantId,
      actorUserId: user.id,
      action: "AUTH_LOGIN",
      targetType: "User",
      targetId: user.id
    });

    return this.buildAuthResponse(user, user.roles.map((item) => item.role.code));
  }

  async me(user: CurrentUser) {
    const fullUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      include: {
        tenant: true,
        department: true,
        roles: { where: { deletedAt: null }, include: { role: true } }
      }
    });
    if (!fullUser) {
      throw new UnauthorizedException("User not found");
    }
    return {
      id: fullUser.id,
      tenantId: fullUser.tenantId,
      tenantName: fullUser.tenant.name,
      tenantCode: fullUser.tenant.code,
      email: fullUser.email,
      phone: fullUser.phone,
      name: fullUser.name,
      departmentId: fullUser.departmentId,
      departmentName: fullUser.department?.name ?? null,
      roles: fullUser.roles.map((item) => item.role.code),
      requiresWorkReport: fullUser.requiresWorkReport
    };
  }

  async requestPasswordReset(dto: PasswordResetRequestDto) {
    const email = dto.email.trim().toLowerCase();
    this.rateLimit.consume(`password-reset:${email}`, 5, 60 * 60 * 1000);
    const user = await this.prisma.user.findFirst({
      where: {
        email,
        deletedAt: null,
        tenant: dto.tenantCode ? { code: dto.tenantCode, deletedAt: null } : { deletedAt: null }
      },
      include: { tenant: true }
    });
    if (!user) {
      return { ok: true };
    }
    const token = randomToken();
    await this.prisma.passwordResetToken.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        tokenHash: tokenHash(token),
        expiresAt: addHours(2)
      }
    });
    await this.audit.log({
      tenantId: user.tenantId,
      actorUserId: user.id,
      action: "PASSWORD_RESET_REQUESTED",
      targetType: "User",
      targetId: user.id
    });
    return {
      ok: true,
      resetToken: process.env.NODE_ENV === "production" ? undefined : token
    };
  }

  async confirmPasswordReset(dto: PasswordResetConfirmDto) {
    this.rateLimit.consume(`password-reset-confirm:${tokenHash(dto.token)}`, 10, 60 * 60 * 1000);
    const reset = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: tokenHash(dto.token) },
      include: { user: true }
    });
    if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
      throw new BadRequestException("重置链接无效或已过期");
    }
    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: reset.userId },
        data: {
          passwordHash,
          failedLoginCount: 0,
          lockedUntil: null,
          lastPasswordChangedAt: new Date()
        }
      }),
      this.prisma.passwordResetToken.update({
        where: { id: reset.id },
        data: { usedAt: new Date() }
      })
    ]);
    await this.audit.log({
      tenantId: reset.tenantId,
      actorUserId: reset.userId,
      action: "PASSWORD_RESET_CONFIRMED",
      targetType: "User",
      targetId: reset.userId
    });
    return { ok: true };
  }

  async changePassword(user: CurrentUser, dto: ChangePasswordDto) {
    const fullUser = await this.prisma.user.findFirstOrThrow({
      where: { id: user.id, tenantId: user.tenantId, deletedAt: null }
    });
    const valid = await bcrypt.compare(dto.currentPassword, fullUser.passwordHash);
    if (!valid) {
      throw new BadRequestException("当前密码不正确");
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(dto.newPassword, 10),
        lastPasswordChangedAt: new Date()
      }
    });
    await this.audit.log({
      tenantId: user.tenantId,
      actorUserId: user.id,
      action: "PASSWORD_CHANGED",
      targetType: "User",
      targetId: user.id
    });
    return { ok: true };
  }

  async verifyEmail(dto: VerifyEmailDto) {
    const verification = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash: tokenHash(dto.token) }
    });
    if (!verification || verification.usedAt || verification.expiresAt < new Date()) {
      throw new BadRequestException("验证链接无效或已过期");
    }
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: verification.userId },
        data: { emailVerifiedAt: new Date() }
      }),
      this.prisma.emailVerificationToken.update({
        where: { id: verification.id },
        data: { usedAt: new Date() }
      })
    ]);
    await this.audit.log({
      tenantId: verification.tenantId,
      actorUserId: verification.userId,
      action: "EMAIL_VERIFIED",
      targetType: "User",
      targetId: verification.userId
    });
    return { ok: true };
  }

  private async buildAuthResponse(
    user: {
      id: string;
      tenantId: string;
      email: string | null;
      phone?: string | null;
      name: string;
      departmentId: string | null;
      tenant: { name: string; code: string };
      department?: { name: string } | null;
      requiresWorkReport?: boolean;
    },
    roles: RoleCode[]
  ) {
    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      tenantId: user.tenantId,
      roles
    });

    return {
      accessToken,
      user: {
        id: user.id,
        tenantId: user.tenantId,
        tenantName: user.tenant.name,
        tenantCode: user.tenant.code,
        email: user.email,
        phone: user.phone ?? null,
        name: user.name,
        departmentId: user.departmentId,
        departmentName: user.department?.name ?? null,
        roles,
        requiresWorkReport: user.requiresWorkReport ?? true
      }
    };
  }
}
