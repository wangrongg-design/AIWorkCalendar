import { ForbiddenException, Injectable } from "@nestjs/common";
import { AccessService } from "../../common/access/access.service";
import { AuditService } from "../../common/audit/audit.service";
import { PrismaService } from "../../common/prisma.service";
import { CurrentUser } from "../../common/types/current-user";
import { ExportQueryDto } from "./dto/export-query.dto";

function metadata(scope: "self" | "tenant") {
  return {
    product: "Work Calendar AI",
    version: "0.1.0",
    exportScope: scope,
    exportedAt: new Date().toISOString(),
    confidentialityNotice: "所有企业数据均按租户隔离并视为保密数据。本导出文件仅供企业或用户自行备份、迁移和留存使用。"
  };
}

@Injectable()
export class ExportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService
  ) {}

  async exportData(user: CurrentUser, query: ExportQueryDto) {
    const scope = query.scope ?? (this.access.isCompanyAdmin(user) ? "tenant" : "self");
    if (scope === "tenant") {
      if (!this.access.isCompanyAdmin(user)) {
        throw new ForbiddenException("Only company admins can export tenant data");
      }
      await this.audit.log({
        tenantId: user.tenantId,
        actorUserId: user.id,
        action: "DATA_EXPORTED",
        targetType: "Tenant",
        targetId: user.tenantId,
        metadata: { scope }
      });
      return this.exportTenant(user.tenantId);
    }
    await this.audit.log({
      tenantId: user.tenantId,
      actorUserId: user.id,
      action: "DATA_EXPORTED",
      targetType: "User",
      targetId: user.id,
      metadata: { scope }
    });
    return this.exportSelf(user);
  }

  private async exportTenant(tenantId: string) {
    const [
      tenant,
      subscription,
      departments,
      projects,
      roles,
      users,
      workLogs,
      reports,
      notifications,
      aiTasks,
      billingOrders,
      payments,
      auditLogs,
      aiUsageLogs,
      dataDeletionRequests
    ] = await Promise.all([
      this.prisma.tenant.findFirst({ where: { id: tenantId, deletedAt: null } }),
      this.prisma.subscription.findFirst({ where: { tenantId, deletedAt: null } }),
      this.prisma.department.findMany({ where: { tenantId, deletedAt: null }, orderBy: [{ name: "asc" }] }),
      this.prisma.project.findMany({
        where: { tenantId, deletedAt: null },
        include: { owner: { select: { id: true, email: true, phone: true, name: true, departmentId: true } } },
        orderBy: [{ status: "asc" }, { name: "asc" }]
      }),
      this.prisma.role.findMany({ where: { tenantId, deletedAt: null }, orderBy: [{ code: "asc" }] }),
      this.prisma.user.findMany({
        where: { tenantId, deletedAt: null },
        select: {
          id: true,
          tenantId: true,
          departmentId: true,
          email: true,
          phone: true,
          name: true,
          isActive: true,
          requiresWorkReport: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
          department: true,
          roles: { where: { deletedAt: null }, include: { role: true } }
        },
        orderBy: [{ createdAt: "asc" }]
      }),
      this.prisma.workLog.findMany({
        where: { tenantId, deletedAt: null },
        include: { user: { select: { id: true, email: true, phone: true, name: true, departmentId: true } }, project: true, aiAnalysis: true },
        orderBy: [{ date: "asc" }, { createdAt: "asc" }]
      }),
      this.prisma.report.findMany({ where: { tenantId, deletedAt: null }, orderBy: [{ createdAt: "asc" }] }),
      this.prisma.notification.findMany({ where: { tenantId, deletedAt: null }, orderBy: [{ createdAt: "asc" }] }),
      this.prisma.aiTask.findMany({ where: { tenantId, deletedAt: null }, orderBy: [{ createdAt: "asc" }] }),
      this.prisma.billingOrder.findMany({ where: { tenantId, deletedAt: null }, include: { payments: true }, orderBy: [{ createdAt: "asc" }] }),
      this.prisma.paymentRecord.findMany({ where: { tenantId, deletedAt: null }, orderBy: [{ createdAt: "asc" }] }),
      this.prisma.auditLog.findMany({ where: { tenantId }, orderBy: [{ createdAt: "asc" }] }),
      this.prisma.aiUsageLog.findMany({ where: { tenantId }, orderBy: [{ createdAt: "asc" }] }),
      this.prisma.dataDeletionRequest.findMany({ where: { tenantId, deletedAt: null }, orderBy: [{ createdAt: "asc" }] })
    ]);

    return {
      metadata: metadata("tenant"),
      tenant,
      subscription,
      departments,
      projects,
      roles,
      users,
      workLogs,
      reports,
      notifications,
      aiTasks,
      billingOrders,
      payments,
      auditLogs,
      aiUsageLogs,
      dataDeletionRequests
    };
  }

  private async exportSelf(user: CurrentUser) {
    const [tenant, account, workLogs, reports, notifications, dataDeletionRequests] = await Promise.all([
      this.prisma.tenant.findFirst({ where: { id: user.tenantId, deletedAt: null }, select: { id: true, name: true, code: true } }),
      this.prisma.user.findFirst({
        where: { id: user.id, tenantId: user.tenantId, deletedAt: null },
        select: {
          id: true,
          tenantId: true,
          departmentId: true,
          email: true,
          phone: true,
          name: true,
          isActive: true,
          requiresWorkReport: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
          department: true,
          roles: { where: { deletedAt: null }, include: { role: true } }
        }
      }),
      this.prisma.workLog.findMany({
        where: { tenantId: user.tenantId, userId: user.id, deletedAt: null },
        include: { project: true, aiAnalysis: true },
        orderBy: [{ date: "asc" }, { createdAt: "asc" }]
      }),
      this.prisma.report.findMany({
        where: { tenantId: user.tenantId, requesterId: user.id, deletedAt: null },
        orderBy: [{ createdAt: "asc" }]
      }),
      this.prisma.notification.findMany({
        where: { tenantId: user.tenantId, userId: user.id, deletedAt: null },
        orderBy: [{ createdAt: "asc" }]
      }),
      this.prisma.dataDeletionRequest.findMany({
        where: { tenantId: user.tenantId, requesterId: user.id, deletedAt: null },
        orderBy: [{ createdAt: "asc" }]
      })
    ]);

    return {
      metadata: metadata("self"),
      tenant,
      account,
      workLogs,
      reports,
      notifications,
      dataDeletionRequests
    };
  }
}
