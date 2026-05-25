import { Inject, Injectable, NotFoundException, forwardRef } from "@nestjs/common";
import { NotificationType, ReportStatus, ReportType, WorkLogStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma.service";
import { OpenAiService } from "../ai/openai.service";

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

@Injectable()
export class ReportContentService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => OpenAiService))
    private readonly openAi: OpenAiService
  ) {}

  async generateAndSave(reportId: string) {
    const report = await this.prisma.report.findFirst({
      where: { id: reportId, deletedAt: null },
      include: {
        requester: { include: { department: true } },
        department: true
      }
    });
    if (!report) {
      throw new NotFoundException("Report not found");
    }

    try {
      const isPersonal = report.type === ReportType.PERSONAL_DAILY || report.type === ReportType.PERSONAL_WEEKLY;
      const workLogs = await this.prisma.workLog.findMany({
        where: {
          tenantId: report.tenantId,
          status: WorkLogStatus.SUBMITTED,
          deletedAt: null,
          date: { gte: report.periodStart, lte: report.periodEnd },
          userId: isPersonal ? report.requesterId : undefined,
          user: isPersonal
            ? undefined
            : {
                requiresWorkReport: true,
                isActive: true,
                deletedAt: null,
                ...(report.departmentId ? { departmentId: report.departmentId } : {})
              }
        },
        include: {
          user: { include: { department: true } },
          project: true,
          aiAnalysis: true
        },
        orderBy: [{ date: "asc" }, { createdAt: "asc" }]
      });

      const scopeName = isPersonal
        ? report.requester.name
        : report.department?.name ?? report.requester.department?.name ?? "部门";
      const content = await this.openAi.generateReport({
        reportType: report.type,
        periodStart: dateKey(report.periodStart),
        periodEnd: dateKey(report.periodEnd),
        scopeName,
        workLogs: workLogs.map((item) => ({
          userName: item.user.name,
          projectName: item.project?.name ?? null,
          date: dateKey(item.date),
          title: item.title,
          content: item.content,
          hours: Number(item.hours),
          analysis: item.aiAnalysis
            ? {
                achievements: item.aiAnalysis.achievements,
                risks: item.aiAnalysis.risks,
                blockers: item.aiAnalysis.blockers,
                summary: item.aiAnalysis.summary
              }
            : null
        }))
      });

      const updated = await this.prisma.report.update({
        where: { id: report.id },
        data: {
          status: ReportStatus.COMPLETED,
          content,
          error: null
        }
      });

      await this.prisma.notification.create({
        data: {
          tenantId: report.tenantId,
          userId: report.requesterId,
          type: NotificationType.REPORT_DONE,
          title: "报告生成完成",
          body: `「${report.title}」已生成。`,
          data: { reportId: report.id }
        }
      });
      return updated;
    } catch (error) {
      await this.prisma.report.update({
        where: { id: report.id },
        data: {
          status: ReportStatus.FAILED,
          error: (error as Error).message
        }
      });
      throw error;
    }
  }
}
