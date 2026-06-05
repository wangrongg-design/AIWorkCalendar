import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Prisma, RoleCode, SubscriptionPlan, SubscriptionStatus } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { createHash, randomBytes } from "crypto";
import { AuditService } from "../../common/audit/audit.service";
import { ensureStandardDepartments } from "../../common/default-departments";
import { PrismaService } from "../../common/prisma.service";
import { RateLimitService } from "../../common/rate-limit/rate-limit.service";
import { normalizeTenantLogoUrl } from "../../common/tenant-logo";
import { CurrentUser } from "../../common/types/current-user";
import { normalizeUnifiedSocialCreditCode } from "../../common/unified-social-credit-code";
import {
  buildPlatformOpsAuthUser,
  PLATFORM_OPS_TENANT_ID,
  PLATFORM_OPS_USER_ID
} from "../../common/platform-ops";
import { LoginDto, OpsLoginDto } from "./dto/login.dto";
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

function configuredOpsPassword() {
  return process.env.OPS_ADMIN_PASSWORD ?? (process.env.NODE_ENV === "production" ? "" : "Passw0rd!");
}

const loginUserInclude = Prisma.validator<Prisma.UserInclude>()({
  tenant: true,
  department: true,
  roles: { where: { deletedAt: null }, include: { role: true } }
});

type LoginUser = Prisma.UserGetPayload<{ include: typeof loginUserInclude }>;

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
    const tenantCode = normalizeUnifiedSocialCreditCode(dto.tenantCode);
    this.rateLimit.consume(`register:${adminEmail}`, 5, 60 * 60 * 1000);
    const existingTenant = await this.prisma.tenant.findUnique({ where: { code: tenantCode } });
    if (existingTenant && !existingTenant.deletedAt) {
      throw new BadRequestException("该统一社会信用代码已注册");
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const logoUrl = normalizeTenantLogoUrl(dto.logoUrl);
    const roleDefs: Array<{ code: RoleCode; name: string }> = [
      { code: RoleCode.COMPANY_ADMIN, name: "企业管理员" },
      { code: RoleCode.DEPARTMENT_MANAGER, name: "部门经理" },
      { code: RoleCode.EMPLOYEE, name: "普通员工" }
    ];
    const { user, roles, emailVerificationToken } = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: dto.companyName,
          code: tenantCode,
          logoUrl
        }
      });
      const periodEnd = oneMonthTrialEnd();
      await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          plan: SubscriptionPlan.TRIAL,
          status: SubscriptionStatus.TRIALING,
          seatLimit: 0,
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
      const departmentsByKey = await ensureStandardDepartments(tx, tenant.id);
      const admin = await tx.user.create({
        data: {
          tenantId: tenant.id,
          departmentId: departmentsByKey.get("executive")?.id,
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
      metadata: { tenantCode, adminEmail }
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
    const tenantId = dto.tenantId?.trim() || undefined;
    this.rateLimit.consume(`login:${tenantId ?? dto.tenantCode ?? "any"}:${normalizedEmail}`, 10, 15 * 60 * 1000);
    const where: Prisma.UserWhereInput = {
      OR: [{ email: normalizedEmail }, { phone: normalizedPhone }],
      deletedAt: null,
      ...(tenantId ? { tenantId } : {}),
      tenant: {
        deletedAt: null,
        ...(dto.tenantCode ? { code: dto.tenantCode } : {})
      }
    };

    const users = await this.prisma.user.findMany({
      where,
      include: loginUserInclude,
      orderBy: [{ tenant: { createdAt: "asc" } }, { createdAt: "asc" }]
    });

    const activeUsers = users.filter((user) => user.isActive);
    if (!activeUsers.length) {
      throw new UnauthorizedException("Invalid email or password");
    }
    const now = new Date();
    const unlockedUsers = activeUsers.filter((user) => !user.lockedUntil || user.lockedUntil <= now);
    if (!unlockedUsers.length) {
      throw new UnauthorizedException("Account is temporarily locked");
    }
    const eligibleUsers =
      process.env.REQUIRE_EMAIL_VERIFICATION === "true"
        ? unlockedUsers.filter((user) => !user.email || user.emailVerifiedAt)
        : unlockedUsers;
    if (!eligibleUsers.length) {
      throw new UnauthorizedException("Email is not verified");
    }

    const validUsers: LoginUser[] = [];
    for (const user of eligibleUsers) {
      if (await bcrypt.compare(dto.password, user.passwordHash)) {
        validUsers.push(user);
      }
    }
    if (!validUsers.length) {
      await Promise.all(
        eligibleUsers.map((user) => {
          const failedLoginCount = user.failedLoginCount + 1;
          return this.prisma.user.update({
            where: { id: user.id },
            data: {
              failedLoginCount,
              lockedUntil: failedLoginCount >= 5 ? addHours(1) : undefined
            }
          });
        })
      );
      throw new UnauthorizedException("Invalid email or password");
    }

    const businessUsers = validUsers.filter((user) => !this.roleCodesForLogin(user).includes(RoleCode.SUPER_ADMIN));
    if (!businessUsers.length) {
      throw new UnauthorizedException("Use platform ops login");
    }
    if (businessUsers.length > 1 && !tenantId && !dto.tenantCode) {
      return {
        requiresTenantSelection: true,
        options: businessUsers.map((user) => this.buildTenantSelectionOption(user))
      };
    }

    const user = businessUsers[0];
    const roleCodes = this.roleCodesForLogin(user);

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

    return this.buildAuthResponse(user, roleCodes);
  }

  async opsLogin(dto: OpsLoginDto) {
    const opsPassword = configuredOpsPassword();
    this.rateLimit.consume("ops-login", 10, 15 * 60 * 1000);
    if (!opsPassword) {
      throw new UnauthorizedException("Ops login is not configured");
    }
    if (dto.password !== opsPassword) {
      throw new UnauthorizedException("Invalid ops password");
    }

    return {
      accessToken: await this.jwtService.signAsync({
        sub: PLATFORM_OPS_USER_ID,
        tenantId: PLATFORM_OPS_TENANT_ID,
        scope: "ops",
        roles: [RoleCode.SUPER_ADMIN]
      }),
      user: buildPlatformOpsAuthUser()
    };
  }

  async me(user: CurrentUser) {
    if (user.isPlatformOps) {
      return buildPlatformOpsAuthUser();
    }
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
      tenantLogoUrl: fullUser.tenant.logoUrl,
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
    if (user.isPlatformOps) {
      throw new BadRequestException("平台运维口令由服务器环境变量 OPS_ADMIN_PASSWORD 管理");
    }
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

  private roleCodesForLogin(user: LoginUser) {
    return user.roles.map((item) => item.role.code);
  }

  private buildTenantSelectionOption(user: LoginUser) {
    return {
      tenantId: user.tenantId,
      tenantName: user.tenant.name,
      tenantCode: user.tenant.code,
      tenantLogoUrl: user.tenant.logoUrl ?? null,
      userName: user.name,
      departmentName: user.department?.name ?? null
    };
  }

  private async buildAuthResponse(
    user: {
      id: string;
      tenantId: string;
      email: string | null;
      phone?: string | null;
      name: string;
      departmentId: string | null;
      tenant: { name: string; code: string; logoUrl?: string | null };
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
        tenantLogoUrl: user.tenant.logoUrl ?? null,
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
