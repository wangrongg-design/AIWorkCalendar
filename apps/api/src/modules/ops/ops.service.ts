import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, RoleCode } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { AuditService } from "../../common/audit/audit.service";
import { PrismaService } from "../../common/prisma.service";
import { normalizeTenantLogoUrl } from "../../common/tenant-logo";
import { CurrentUser } from "../../common/types/current-user";
import { CreateOpsCompanyAdminDto } from "./dto/create-company-admin.dto";
import { UpdateOpsAccountDto } from "./dto/update-account.dto";
import { UpdateOpsTenantLogoDto } from "./dto/update-tenant-logo.dto";

const activeMemberMonthlyPriceCents = 1900;
const businessAccountWhere: Prisma.UserWhereInput = {
  deletedAt: null,
  roles: {
    none: {
      role: { code: RoleCode.SUPER_ADMIN }
    }
  }
};

function generateTemporaryPassword(length = 14) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  return Array.from(randomBytes(length), (byte) => alphabet[byte % alphabet.length]).join("");
}

function normalizeEmail(value?: string | null) {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

function normalizePhone(value?: string | null) {
  const normalized = value?.trim().replace(/[\s-]/g, "");
  return normalized || null;
}

function contactWhere(email?: string | null, phone?: string | null): Prisma.UserWhereInput | null {
  const OR: Prisma.UserWhereInput[] = [];
  if (email) OR.push({ email });
  if (phone) OR.push({ phone });
  return OR.length ? { OR } : null;
}

@Injectable()
export class OpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async overview() {
    const [tenants, accounts, usersByTenant, activeUsersByTenant, totals] = await Promise.all([
      this.prisma.tenant.findMany({
        where: { deletedAt: null },
        include: {
          subscription: true,
          _count: {
            select: {
              users: true,
              departments: true,
              projects: true,
              workLogs: true,
              reports: true
            }
          }
        },
        orderBy: [{ createdAt: "desc" }]
      }),
      this.prisma.user.findMany({
        where: businessAccountWhere,
        include: {
          tenant: { select: { id: true, name: true, code: true, logoUrl: true } },
          department: { select: { id: true, name: true } },
          roles: { where: { deletedAt: null }, include: { role: true } }
        },
        orderBy: [{ createdAt: "desc" }],
        take: 300
      }),
      this.prisma.user.groupBy({
        by: ["tenantId"],
        where: businessAccountWhere,
        _count: { _all: true }
      }),
      this.prisma.user.groupBy({
        by: ["tenantId"],
        where: { ...businessAccountWhere, isActive: true },
        _count: { _all: true }
      }),
      Promise.all([
        this.prisma.tenant.count({ where: { deletedAt: null } }),
        this.prisma.user.count({ where: businessAccountWhere }),
        this.prisma.user.count({ where: { ...businessAccountWhere, isActive: true } }),
        this.prisma.workLog.count({ where: { deletedAt: null } }),
        this.prisma.report.count({ where: { deletedAt: null } })
      ])
    ]);

    const [tenantCount, accountCount, activeAccountCount, workLogCount, reportCount] = totals;
    const userCountMap = new Map(usersByTenant.map((item) => [item.tenantId, item._count._all]));
    const activeUserCountMap = new Map(activeUsersByTenant.map((item) => [item.tenantId, item._count._all]));

    return {
      developerCompany: "北京七数智联科技有限公司",
      totals: {
        tenants: tenantCount,
        accounts: accountCount,
        activeAccounts: activeAccountCount,
        workLogs: workLogCount,
        reports: reportCount
      },
      tenants: tenants.map((tenant) => {
        const userCount = userCountMap.get(tenant.id) ?? 0;
        const activeUserCount = activeUserCountMap.get(tenant.id) ?? 0;
        return {
          id: tenant.id,
          name: tenant.name,
          code: tenant.code,
          logoUrl: tenant.logoUrl,
          createdAt: tenant.createdAt,
          subscription: tenant.subscription
            ? {
                plan: tenant.subscription.plan,
                status: tenant.subscription.status,
                seatLimit: tenant.subscription.seatLimit,
                currentPeriodEnd: tenant.subscription.currentPeriodEnd,
                trialEndsAt: tenant.subscription.trialEndsAt,
                activeUserCount,
                activeMemberMonthlyPriceCents,
                estimatedMonthlyAmountCents: activeUserCount * activeMemberMonthlyPriceCents
              }
            : null,
          counts: {
            ...tenant._count,
            users: userCount
          }
        };
      }),
      accounts: accounts.map((account) => ({
        id: account.id,
        tenantId: account.tenantId,
        tenantName: account.tenant.name,
        tenantCode: account.tenant.code,
        tenantLogoUrl: account.tenant.logoUrl,
        email: account.email,
        phone: account.phone,
        name: account.name,
        departmentName: account.department?.name ?? null,
        isActive: account.isActive,
        requiresWorkReport: account.requiresWorkReport,
        roles: account.roles.map((item) => item.role.code),
        lastLoginAt: account.lastLoginAt,
        createdAt: account.createdAt
      }))
    };
  }

  async updateAccount(actor: CurrentUser, accountId: string, dto: UpdateOpsAccountDto) {
    if (actor.id === accountId && dto.isActive === false) {
      throw new BadRequestException("Cannot deactivate your own ops account");
    }
    const existing = await this.prisma.user.findFirst({
      where: { id: accountId, ...businessAccountWhere },
      select: { id: true, tenantId: true, name: true, email: true, phone: true }
    });
    if (!existing) {
      throw new NotFoundException("Account not found");
    }
    const updated = await this.prisma.user.update({
      where: { id: accountId },
      data: {
        isActive: dto.isActive,
        name: dto.name?.trim()
      },
      include: {
        tenant: { select: { id: true, name: true, code: true, logoUrl: true } },
        department: { select: { id: true, name: true } },
        roles: { where: { deletedAt: null }, include: { role: true } }
      }
    });
    await this.audit.log({
      tenantId: existing.tenantId,
      actorUserId: actor.isPlatformOps ? null : actor.id,
      action: "OPS_ACCOUNT_UPDATED",
      targetType: "User",
      targetId: accountId,
      metadata: {
        targetTenantId: existing.tenantId,
        email: existing.email,
        phone: existing.phone,
        isActive: dto.isActive,
        name: dto.name
      }
    });
    return {
      id: updated.id,
      tenantId: updated.tenantId,
      tenantName: updated.tenant.name,
      tenantCode: updated.tenant.code,
      tenantLogoUrl: updated.tenant.logoUrl,
      email: updated.email,
      phone: updated.phone,
      name: updated.name,
      departmentName: updated.department?.name ?? null,
      isActive: updated.isActive,
      requiresWorkReport: updated.requiresWorkReport,
      roles: updated.roles.map((item) => item.role.code),
      lastLoginAt: updated.lastLoginAt,
      createdAt: updated.createdAt
    };
  }

  async createCompanyAdmin(actor: CurrentUser, dto: CreateOpsCompanyAdminDto) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: dto.tenantId, deletedAt: null },
      select: { id: true, name: true, code: true, logoUrl: true }
    });
    if (!tenant) {
      throw new NotFoundException("Tenant not found");
    }
    const email = normalizeEmail(dto.email);
    const phone = normalizePhone(dto.phone);
    if (!email && !phone) {
      throw new BadRequestException("请至少填写邮箱或手机号");
    }
    if (phone && !/^\+?\d{6,20}$/.test(phone)) {
      throw new BadRequestException("手机号格式不正确");
    }
    const contactFilter = contactWhere(email, phone);
    const matchingUsers = contactFilter
      ? await this.prisma.user.findMany({
          where: { tenantId: tenant.id, ...contactFilter },
          select: { id: true, deletedAt: true }
        })
      : [];
    const activeConflict = matchingUsers.find((item) => !item.deletedAt);
    if (activeConflict) {
      throw new BadRequestException("邮箱或手机号已被当前企业其他账号使用");
    }
    const deletedMatches = [...new Set(matchingUsers.map((item) => item.id))];
    if (deletedMatches.length > 1) {
      throw new BadRequestException("邮箱和手机号分别匹配到不同的已删除账号，请更换联系方式或联系运维处理");
    }

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);
    const updated = await this.prisma.$transaction(async (tx) => {
      const adminRole = await tx.role.upsert({
        where: { tenantId_code: { tenantId: tenant.id, code: RoleCode.COMPANY_ADMIN } },
        update: { name: "企业管理员", deletedAt: null },
        create: { tenantId: tenant.id, code: RoleCode.COMPANY_ADMIN, name: "企业管理员" }
      });
      const accountData = {
        email,
        phone,
        name: dto.name.trim(),
        departmentId: null,
        passwordHash,
        isActive: true,
        requiresWorkReport: false,
        failedLoginCount: 0,
        lockedUntil: null,
        lastPasswordChangedAt: new Date(),
        deletedAt: null
      };
      const account = deletedMatches[0]
        ? await tx.user.update({
            where: { id: deletedMatches[0] },
            data: accountData
          })
        : await tx.user.create({
            data: {
              tenantId: tenant.id,
              ...accountData
            }
          });
      await tx.userRole.updateMany({
        where: { tenantId: tenant.id, userId: account.id, roleId: { not: adminRole.id }, deletedAt: null },
        data: { deletedAt: new Date() }
      });
      await tx.userRole.upsert({
        where: { userId_roleId: { userId: account.id, roleId: adminRole.id } },
        update: { tenantId: tenant.id, deletedAt: null },
        create: { tenantId: tenant.id, userId: account.id, roleId: adminRole.id }
      });
      return tx.user.findUniqueOrThrow({
        where: { id: account.id },
        include: {
          tenant: { select: { id: true, name: true, code: true, logoUrl: true } },
          department: { select: { id: true, name: true } },
          roles: { where: { deletedAt: null }, include: { role: true } }
        }
      });
    });
    await this.audit.log({
      tenantId: tenant.id,
      actorUserId: actor.isPlatformOps ? null : actor.id,
      action: "OPS_COMPANY_ADMIN_CREATED",
      targetType: "User",
      targetId: updated.id,
      metadata: {
        targetTenantId: tenant.id,
        tenantCode: tenant.code,
        email,
        phone,
        name: updated.name
      }
    });
    return {
      id: updated.id,
      tenantId: updated.tenantId,
      tenantName: updated.tenant.name,
      tenantCode: updated.tenant.code,
      tenantLogoUrl: updated.tenant.logoUrl,
      email: updated.email,
      phone: updated.phone,
      name: updated.name,
      departmentName: updated.department?.name ?? null,
      isActive: updated.isActive,
      requiresWorkReport: updated.requiresWorkReport,
      roles: updated.roles.map((item) => item.role.code),
      lastLoginAt: updated.lastLoginAt,
      createdAt: updated.createdAt,
      temporaryPassword
    };
  }

  async resetAccountPassword(actor: CurrentUser, accountId: string) {
    const existing = await this.prisma.user.findFirst({
      where: { id: accountId, ...businessAccountWhere },
      select: { id: true, tenantId: true, name: true, email: true, phone: true }
    });
    if (!existing) {
      throw new NotFoundException("Account not found");
    }
    const temporaryPassword = generateTemporaryPassword();
    const updated = await this.prisma.user.update({
      where: { id: accountId },
      data: {
        passwordHash: await bcrypt.hash(temporaryPassword, 10),
        failedLoginCount: 0,
        lockedUntil: null,
        lastPasswordChangedAt: new Date()
      },
      include: {
        tenant: { select: { id: true, name: true, code: true, logoUrl: true } },
        department: { select: { id: true, name: true } },
        roles: { where: { deletedAt: null }, include: { role: true } }
      }
    });
    await this.audit.log({
      tenantId: existing.tenantId,
      actorUserId: actor.isPlatformOps ? null : actor.id,
      action: "OPS_ACCOUNT_PASSWORD_RESET",
      targetType: "User",
      targetId: accountId,
      metadata: {
        targetTenantId: existing.tenantId,
        email: existing.email,
        phone: existing.phone
      }
    });
    return {
      id: updated.id,
      tenantId: updated.tenantId,
      tenantName: updated.tenant.name,
      tenantCode: updated.tenant.code,
      tenantLogoUrl: updated.tenant.logoUrl,
      email: updated.email,
      phone: updated.phone,
      name: updated.name,
      departmentName: updated.department?.name ?? null,
      isActive: updated.isActive,
      requiresWorkReport: updated.requiresWorkReport,
      roles: updated.roles.map((item) => item.role.code),
      lastLoginAt: updated.lastLoginAt,
      createdAt: updated.createdAt,
      temporaryPassword
    };
  }

  async restoreCompanyAdmin(actor: CurrentUser, accountId: string) {
    const existing = await this.prisma.user.findFirst({
      where: { id: accountId, ...businessAccountWhere },
      select: { id: true, tenantId: true, name: true, email: true, phone: true }
    });
    if (!existing) {
      throw new NotFoundException("Account not found");
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const adminRole = await tx.role.upsert({
        where: { tenantId_code: { tenantId: existing.tenantId, code: RoleCode.COMPANY_ADMIN } },
        update: { name: "企业管理员", deletedAt: null },
        create: { tenantId: existing.tenantId, code: RoleCode.COMPANY_ADMIN, name: "企业管理员" }
      });
      await tx.userRole.updateMany({
        where: { tenantId: existing.tenantId, userId: accountId, roleId: { not: adminRole.id }, deletedAt: null },
        data: { deletedAt: new Date() }
      });
      await tx.userRole.upsert({
        where: { userId_roleId: { userId: accountId, roleId: adminRole.id } },
        update: { tenantId: existing.tenantId, deletedAt: null },
        create: { tenantId: existing.tenantId, userId: accountId, roleId: adminRole.id }
      });
      return tx.user.update({
        where: { id: accountId },
        data: {
          isActive: true,
          failedLoginCount: 0,
          lockedUntil: null
        },
        include: {
          tenant: { select: { id: true, name: true, code: true, logoUrl: true } },
          department: { select: { id: true, name: true } },
          roles: { where: { deletedAt: null }, include: { role: true } }
        }
      });
    });
    await this.audit.log({
      tenantId: existing.tenantId,
      actorUserId: actor.isPlatformOps ? null : actor.id,
      action: "OPS_ACCOUNT_COMPANY_ADMIN_RESTORED",
      targetType: "User",
      targetId: accountId,
      metadata: {
        targetTenantId: existing.tenantId,
        email: existing.email,
        phone: existing.phone,
        name: existing.name
      }
    });
    return {
      id: updated.id,
      tenantId: updated.tenantId,
      tenantName: updated.tenant.name,
      tenantCode: updated.tenant.code,
      tenantLogoUrl: updated.tenant.logoUrl,
      email: updated.email,
      phone: updated.phone,
      name: updated.name,
      departmentName: updated.department?.name ?? null,
      isActive: updated.isActive,
      requiresWorkReport: updated.requiresWorkReport,
      roles: updated.roles.map((item) => item.role.code),
      lastLoginAt: updated.lastLoginAt,
      createdAt: updated.createdAt
    };
  }

  async deleteAccount(actor: CurrentUser, accountId: string) {
    const existing = await this.prisma.user.findFirst({
      where: { id: accountId, ...businessAccountWhere },
      select: { id: true, tenantId: true, name: true, email: true, phone: true }
    });
    if (!existing) {
      throw new NotFoundException("Account not found");
    }
    const deletedAt = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: accountId },
        data: {
          isActive: false,
          failedLoginCount: 0,
          lockedUntil: null,
          deletedAt
        }
      }),
      this.prisma.userRole.updateMany({
        where: { tenantId: existing.tenantId, userId: accountId, deletedAt: null },
        data: { deletedAt }
      }),
      this.prisma.passwordResetToken.updateMany({
        where: { tenantId: existing.tenantId, userId: accountId, usedAt: null },
        data: { usedAt: deletedAt }
      }),
      this.prisma.emailVerificationToken.updateMany({
        where: { tenantId: existing.tenantId, userId: accountId, usedAt: null },
        data: { usedAt: deletedAt }
      })
    ]);
    await this.audit.log({
      tenantId: existing.tenantId,
      actorUserId: actor.isPlatformOps ? null : actor.id,
      action: "OPS_ACCOUNT_DELETED",
      targetType: "User",
      targetId: accountId,
      metadata: {
        targetTenantId: existing.tenantId,
        email: existing.email,
        phone: existing.phone,
        name: existing.name
      }
    });
    return { ok: true };
  }

  async updateTenantLogo(actor: CurrentUser, tenantId: string, dto: UpdateOpsTenantLogoDto) {
    const logoUrl = normalizeTenantLogoUrl(dto.logoUrl);
    const existing = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: { id: true, name: true, code: true, logoUrl: true }
    });
    if (!existing) {
      throw new NotFoundException("Tenant not found");
    }
    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { logoUrl }
    });
    await this.audit.log({
      tenantId: existing.id,
      actorUserId: actor.isPlatformOps ? null : actor.id,
      action: "OPS_TENANT_LOGO_UPDATED",
      targetType: "Tenant",
      targetId: tenantId,
      metadata: {
        tenantCode: existing.code,
        hadLogo: Boolean(existing.logoUrl),
        hasLogo: Boolean(updated.logoUrl)
      }
    });
    return {
      id: updated.id,
      name: updated.name,
      code: updated.code,
      logoUrl: updated.logoUrl,
      createdAt: updated.createdAt
    };
  }
}
