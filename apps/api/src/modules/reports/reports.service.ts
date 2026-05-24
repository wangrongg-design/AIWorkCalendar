import { BadRequestException, Inject, Injectable, forwardRef } from "@nestjs/common";
import { ReportType, RoleCode } from "@prisma/client";
import { AccessService } from "../../common/access/access.service";
import { PrismaService } from "../../common/prisma.service";
import { CurrentUser } from "../../common/types/current-user";
import { AiQueueService } from "../ai/ai-queue.service";
import { GenerateReportDto } from "./dto/report.dto";

function parseDateOnly(value: string) {
  const date = new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
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

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    @Inject(forwardRef(() => AiQueueService))
    private readonly aiQueue: AiQueueService
  ) {}

  async generate(user: CurrentUser, dto: GenerateReportDto) {
    const isDepartmentReport = dto.type === ReportType.DEPARTMENT_DAILY || dto.type === ReportType.DEPARTMENT_WEEKLY;
    let departmentId = dto.departmentId ?? null;
    if (isDepartmentReport) {
      if (this.access.isDepartmentManager(user)) {
        departmentId = user.departmentId;
      }
      if (!departmentId) {
        throw new BadRequestException("Department report requires departmentId");
      }
      if (!this.access.isCompanyAdmin(user) && departmentId !== user.departmentId) {
        throw new BadRequestException("Cannot generate report for another department");
      }
    }
    if (!isDepartmentReport && user.roles.includes(RoleCode.EMPLOYEE)) {
      departmentId = null;
    }

    const report = await this.prisma.report.create({
      data: {
        tenantId: user.tenantId,
        requesterId: user.id,
        departmentId,
        type: dto.type,
        title: reportTitle(dto.type, dto.periodStart, dto.periodEnd),
        periodStart: parseDateOnly(dto.periodStart),
        periodEnd: parseDateOnly(dto.periodEnd)
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

