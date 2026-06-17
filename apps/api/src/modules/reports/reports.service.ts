import { BadRequestException, Inject, Injectable, forwardRef } from "@nestjs/common";
import { ReportType, WorkLogStatus } from "@prisma/client";
import { AccessService } from "../../common/access/access.service";
import { PrismaService } from "../../common/prisma.service";
import { CurrentUser } from "../../common/types/current-user";
import { AiQueueService } from "../ai/ai-queue.service";
import { GenerateReportDto, ReportReadinessQueryDto } from "./dto/report.dto";

function parseDateOnly(value: string) {
  const date = new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function reportTitle(type: ReportType, start: string, end: string) {
  const label: Record<ReportType, string> = {
    PERSONAL_DAILY: "个人日报",
    PERSONAL_WEEKLY: "个人周报",
    DEPARTMENT_DAILY: "部门日报",
    DEPARTMENT_WEEKLY: "部门周报"
  };
  return `${label[type]} ${start === end ? start : `${start} 至 ${end}`}`;
}

const MAX_REPORT_PERIOD_DAYS = 31;

function daysBetween(start: Date, end: Date) {
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

function arrayCount(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

function normalizedDepartmentId(value?: string | null) {
  return value && value !== "__company__" ? value : null;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    @Inject(forwardRef(() => AiQueueService))
    private readonly aiQueue: AiQueueService
  ) {}

  private validatePeriod(dto: { periodStart: string; periodEnd: string }) {
    const periodStart = parseDateOnly(dto.periodStart);
    const periodEnd = parseDateOnly(dto.periodEnd);
    if (periodEnd < periodStart) {
      throw new BadRequestException("Report periodEnd must be after periodStart");
    }
    if (daysBetween(periodStart, periodEnd) > MAX_REPORT_PERIOD_DAYS) {
      throw new BadRequestException(`Report period cannot exceed ${MAX_REPORT_PERIOD_DAYS} days`);
    }
    return { periodStart, periodEnd };
  }

  private async resolveReportScope(user: CurrentUser, type: ReportType, requestedDepartmentId?: string | null) {
    const isPersonal = type === ReportType.PERSONAL_DAILY || type === ReportType.PERSONAL_WEEKLY;
    if (isPersonal) {
      return {
        isPersonal: true,
        departmentId: null,
        scopeName: user.name
      };
    }

    const isDepartmentReport = type === ReportType.DEPARTMENT_DAILY || type === ReportType.DEPARTMENT_WEEKLY;
    let departmentId = normalizedDepartmentId(requestedDepartmentId);
    if (isDepartmentReport) {
      if (this.access.isDepartmentManager(user)) {
        departmentId = user.departmentId;
      }
      if (!departmentId && !this.access.isCompanyAdmin(user)) {
        throw new BadRequestException("Department report requires departmentId");
      }
      if (!this.access.isCompanyAdmin(user) && departmentId !== user.departmentId) {
        throw new BadRequestException("Cannot generate report for another department");
      }
      if (departmentId) {
        const department = await this.prisma.department.findFirst({
          where: { id: departmentId, tenantId: user.tenantId, deletedAt: null },
          select: { id: true, name: true }
        });
        if (!department) {
          throw new BadRequestException("Department not found");
        }
        return {
          isPersonal: false,
          departmentId,
          scopeName: department.name
        };
      }
      return {
        isPersonal: false,
        departmentId: null,
        scopeName: "全公司"
      };
    }

    throw new BadRequestException("Unsupported report type");
  }

  private async buildReadiness(user: CurrentUser, type: ReportType, periodStart: Date, periodEnd: Date, scope: { isPersonal: boolean; departmentId: string | null; scopeName: string }) {
    const memberWhere = scope.isPersonal
      ? { tenantId: user.tenantId, id: user.id, deletedAt: null }
      : {
          tenantId: user.tenantId,
          deletedAt: null,
          isActive: true,
          requiresWorkReport: true,
          ...(scope.departmentId ? { departmentId: scope.departmentId } : {})
        };
    const [members, workLogs] = await Promise.all([
      this.prisma.user.findMany({
        where: memberWhere,
        select: { id: true, name: true }
      }),
      this.prisma.workLog.findMany({
        where: {
          tenantId: user.tenantId,
          status: WorkLogStatus.SUBMITTED,
          deletedAt: null,
          date: { gte: periodStart, lte: periodEnd },
          userId: scope.isPersonal ? user.id : undefined,
          user: scope.isPersonal
            ? undefined
            : {
                requiresWorkReport: true,
                isActive: true,
                deletedAt: null,
                ...(scope.departmentId ? { departmentId: scope.departmentId } : {})
              }
        },
        include: {
          user: { select: { id: true, name: true } },
          project: { select: { id: true, name: true, code: true } },
          aiAnalysis: { select: { summary: true, risks: true, blockers: true, achievements: true } }
        },
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
        take: 200
      })
    ]);

    const coveredUserIds = new Set(workLogs.map((item) => item.userId));
    const projectIds = new Set(workLogs.map((item) => item.projectId).filter(Boolean));
    const riskCount = workLogs.reduce((sum, item) => sum + arrayCount(item.aiAnalysis?.risks), 0);
    const blockerCount = workLogs.reduce((sum, item) => sum + arrayCount(item.aiAnalysis?.blockers), 0);
    const totalHours = workLogs.reduce((sum, item) => sum + Number(item.hours ?? 0), 0);
    const stats = {
      workLogCount: workLogs.length,
      targetMemberCount: members.length,
      coveredMemberCount: coveredUserIds.size,
      missingMemberCount: Math.max(members.length - coveredUserIds.size, 0),
      riskCount,
      blockerCount,
      projectCount: projectIds.size,
      totalHours: Number(totalHours.toFixed(2))
    };
    return {
      type,
      periodStart: dateKey(periodStart),
      periodEnd: dateKey(periodEnd),
      departmentId: scope.departmentId,
      scopeName: scope.scopeName,
      canGenerate: stats.workLogCount > 0,
      emptyReason: stats.workLogCount > 0 ? null : "当前周期暂无可用日报，建议先填写日报或切换时间范围。",
      stats,
      sources: workLogs.slice(0, 12).map((item) => ({
        id: item.id,
        date: dateKey(item.date),
        title: item.title,
        userName: item.user.name,
        projectName: item.project?.name ?? null,
        summary: item.aiAnalysis?.summary ?? item.content,
        risks: Array.isArray(item.aiAnalysis?.risks) ? item.aiAnalysis.risks.map(String) : [],
        blockers: Array.isArray(item.aiAnalysis?.blockers) ? item.aiAnalysis.blockers.map(String) : [],
        hours: Number(item.hours ?? 0)
      }))
    };
  }

  async readiness(user: CurrentUser, dto: ReportReadinessQueryDto) {
    const { periodStart, periodEnd } = this.validatePeriod(dto);
    const scope = await this.resolveReportScope(user, dto.type, dto.departmentId);
    return this.buildReadiness(user, dto.type, periodStart, periodEnd, scope);
  }

  async generate(user: CurrentUser, dto: GenerateReportDto) {
    const { periodStart, periodEnd } = this.validatePeriod(dto);
    const scope = await this.resolveReportScope(user, dto.type, dto.departmentId);
    const existing = await this.prisma.report.findFirst({
      where: {
        tenantId: user.tenantId,
        requesterId: user.id,
        type: dto.type,
        periodStart,
        periodEnd,
        departmentId: scope.departmentId,
        status: {
          in: ["PENDING", "COMPLETED"]
        },
        deletedAt: null
      },
      include: {
        department: true
      },
      orderBy: [{ createdAt: "desc" }]
    });
    if (existing) {
      return existing;
    }

    const readiness = await this.buildReadiness(user, dto.type, periodStart, periodEnd, scope);
    if (!readiness.canGenerate) {
      throw new BadRequestException(readiness.emptyReason ?? "当前周期暂无可用日报，建议先填写日报或切换时间范围。");
    }

    const report = await this.prisma.report.create({
      data: {
        tenantId: user.tenantId,
        requesterId: user.id,
        departmentId: scope.departmentId,
        type: dto.type,
        title: reportTitle(dto.type, dto.periodStart, dto.periodEnd),
        periodStart,
        periodEnd
      }
    });
    await this.aiQueue.enqueueReportGeneration(user.tenantId, report.id, user.id);
    return report;
  }

  async list(user: CurrentUser) {
    return this.prisma.report.findMany({
      where: {
        tenantId: user.tenantId,
        requesterId: user.id,
        deletedAt: null
      },
      include: {
        department: true
      },
      orderBy: [{ createdAt: "desc" }],
      take: 50
    });
  }
}
