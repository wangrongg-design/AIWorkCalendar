import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditService } from "../../common/audit/audit.service";
import { PrismaService } from "../../common/prisma.service";
import { CurrentUser } from "../../common/types/current-user";
import { UpdateOpsAccountDto } from "./dto/update-account.dto";

@Injectable()
export class OpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async overview() {
    const [tenants, accounts, totals] = await Promise.all([
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
        where: { deletedAt: null },
        include: {
          tenant: { select: { id: true, name: true, code: true } },
          department: { select: { id: true, name: true } },
          roles: { where: { deletedAt: null }, include: { role: true } }
        },
        orderBy: [{ createdAt: "desc" }],
        take: 300
      }),
      Promise.all([
        this.prisma.tenant.count({ where: { deletedAt: null } }),
        this.prisma.user.count({ where: { deletedAt: null } }),
        this.prisma.user.count({ where: { deletedAt: null, isActive: true } }),
        this.prisma.workLog.count({ where: { deletedAt: null } }),
        this.prisma.report.count({ where: { deletedAt: null } })
      ])
    ]);

    const [tenantCount, accountCount, activeAccountCount, workLogCount, reportCount] = totals;

    return {
      developerCompany: "北京七数智联科技有限公司",
      totals: {
        tenants: tenantCount,
        accounts: accountCount,
        activeAccounts: activeAccountCount,
        workLogs: workLogCount,
        reports: reportCount
      },
      tenants: tenants.map((tenant) => ({
        id: tenant.id,
        name: tenant.name,
        code: tenant.code,
        createdAt: tenant.createdAt,
        subscription: tenant.subscription
          ? {
              plan: tenant.subscription.plan,
              status: tenant.subscription.status,
              seatLimit: tenant.subscription.seatLimit,
              currentPeriodEnd: tenant.subscription.currentPeriodEnd,
              trialEndsAt: tenant.subscription.trialEndsAt
            }
          : null,
        counts: tenant._count
      })),
      accounts: accounts.map((account) => ({
        id: account.id,
        tenantId: account.tenantId,
        tenantName: account.tenant.name,
        tenantCode: account.tenant.code,
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
      where: { id: accountId, deletedAt: null },
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
        tenant: { select: { id: true, name: true, code: true } },
        department: { select: { id: true, name: true } },
        roles: { where: { deletedAt: null }, include: { role: true } }
      }
    });
    await this.audit.log({
      tenantId: actor.tenantId,
      actorUserId: actor.id,
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
}
