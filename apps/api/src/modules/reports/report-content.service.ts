import { Inject, Injectable, NotFoundException, forwardRef } from "@nestjs/common";
import { NotificationType, ReportStatus, ReportType, WorkLogStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma.service";
import { OpenAiService } from "../ai/openai.service";

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

const MAX_REPORT_LOGS = 120;
const MAX_WORK_LOG_CONTENT_CHARS = 800;
const MAX_ATTACHMENT_TEXT_CHARS = 500;
const MAX_ATTACHMENT_PER_LOG = 3;

function truncateText(value: string | null | undefined, limit: number) {
  if (!value) return null;
  return value.length > limit ? `${value.slice(0, limit)}...` : value;
}

function arrayCount(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

@Injectable()
export class ReportContentService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => OpenAiService))
    private readonly openAi: OpenAiService
  ) {}

  async generateAndSave(reportId: string, tenantId?: string) {
    const report = await this.prisma.report.findFirst({
      where: { id: reportId, tenantId, deletedAt: null },
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
          aiAnalysis: true,
          attachments: {
            where: { deletedAt: null },
            orderBy: [{ createdAt: "asc" }],
            take: MAX_ATTACHMENT_PER_LOG
          }
        },
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
        take: MAX_REPORT_LOGS
      });

      const scopeName = isPersonal
        ? report.requester.name
        : report.department?.name ?? report.requester.department?.name ?? "部门";
      const content = await this.openAi.generateReport(
        {
          reportType: report.type,
          periodStart: dateKey(report.periodStart),
          periodEnd: dateKey(report.periodEnd),
          scopeName,
          workLogs: workLogs.map((item) => ({
            userName: item.user.name,
            projectName: item.project?.name ?? null,
            date: dateKey(item.date),
            title: item.title,
            content: truncateText(item.aiAnalysis?.summary ?? item.content, MAX_WORK_LOG_CONTENT_CHARS) ?? "",
            hours: Number(item.hours),
            attachments: item.attachments.map((attachment) => ({
              fileName: attachment.fileName,
              mimeType: attachment.mimeType,
              kind: attachment.kind,
              fileSize: attachment.fileSize,
              textContent: attachment.aiSummary ? null : truncateText(attachment.textContent, MAX_ATTACHMENT_TEXT_CHARS),
              aiSummary: truncateText(attachment.aiSummary, MAX_ATTACHMENT_TEXT_CHARS)
          })),
            analysis: item.aiAnalysis
              ? {
                  achievements: item.aiAnalysis.achievements,
                  risks: item.aiAnalysis.risks,
                  blockers: item.aiAnalysis.blockers,
                  summary: item.aiAnalysis.summary
                }
              : null
          }))
        },
        {
          tenantId: report.tenantId,
          userId: report.requesterId,
          operation: "report_generation",
          targetType: "report",
          targetId: report.id,
          containsAttachments: workLogs.some((item) => item.attachments.length > 0),
          containsImages: workLogs.some((item) => item.attachments.some((attachment) => attachment.kind === "IMAGE"))
        }
      );
      const targetMembers = isPersonal
        ? [{ id: report.requesterId }]
        : await this.prisma.user.findMany({
            where: {
              tenantId: report.tenantId,
              isActive: true,
              requiresWorkReport: true,
              deletedAt: null,
              ...(report.departmentId ? { departmentId: report.departmentId } : {})
            },
            select: { id: true }
          });
      const coveredUserIds = new Set(workLogs.map((item) => item.userId));
      const projectIds = new Set(workLogs.map((item) => item.projectId).filter(Boolean));
      const riskCount = workLogs.reduce((sum, item) => sum + arrayCount(item.aiAnalysis?.risks), 0);
      const blockerCount = workLogs.reduce((sum, item) => sum + arrayCount(item.aiAnalysis?.blockers), 0);
      const totalHours = workLogs.reduce((sum, item) => sum + Number(item.hours ?? 0), 0);
      const evidence = {
        stats: {
          workLogCount: workLogs.length,
          targetMemberCount: targetMembers.length,
          coveredMemberCount: coveredUserIds.size,
          missingMemberCount: Math.max(targetMembers.length - coveredUserIds.size, 0),
          riskCount,
          blockerCount,
          projectCount: projectIds.size,
          totalHours: Number(totalHours.toFixed(2))
        },
        sources: workLogs.slice(0, 20).map((item) => ({
          id: item.id,
          date: dateKey(item.date),
          title: item.title,
          userName: item.user.name,
          projectName: item.project?.name ?? null,
          summary: truncateText(item.aiAnalysis?.summary ?? item.content, 240),
          risks: Array.isArray(item.aiAnalysis?.risks) ? item.aiAnalysis.risks.map(String) : [],
          blockers: Array.isArray(item.aiAnalysis?.blockers) ? item.aiAnalysis.blockers.map(String) : [],
          hours: Number(item.hours ?? 0)
        }))
      };

      const updated = await this.prisma.report.update({
        where: { id: report.id },
        data: {
          status: ReportStatus.COMPLETED,
          content: { ...content, evidence },
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
