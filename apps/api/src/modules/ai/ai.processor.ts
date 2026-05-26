import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, Logger, forwardRef } from "@nestjs/common";
import { AiTaskStatus, NotificationType, WorkLogAttachmentKind } from "@prisma/client";
import { Job } from "bullmq";
import { readFile } from "fs/promises";
import { PrismaService } from "../../common/prisma.service";
import { ReportContentService } from "../reports/report-content.service";
import { AI_QUEUE } from "./ai-queue.service";
import { OpenAiService } from "./openai.service";

const INLINE_IMAGE_MAX_BYTES = 4 * 1024 * 1024;

@Processor(AI_QUEUE)
export class AiProcessor extends WorkerHost {
  private readonly logger = new Logger(AiProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly openAi: OpenAiService,
    @Inject(forwardRef(() => ReportContentService))
    private readonly reportContent: ReportContentService
  ) {
    super();
  }

  async process(job: Job<{ taskId: string }>) {
    const task = await this.prisma.aiTask.findUnique({ where: { id: job.data.taskId } });
    if (!task) {
      return;
    }

    await this.prisma.aiTask.update({
      where: { id: task.id },
      data: {
        status: AiTaskStatus.PROCESSING,
        attempts: { increment: 1 },
        startedAt: new Date(),
        error: null
      }
    });

    try {
      if (job.name === "work-log-analysis") {
        await this.processWorkLogAnalysis(task.id, task.tenantId, task.workLogId);
      } else if (job.name === "report-generation") {
        await this.processReportGeneration(task.id, task.tenantId, task.reportId);
      }
      await this.prisma.aiTask.update({
        where: { id: task.id },
        data: { status: AiTaskStatus.COMPLETED, finishedAt: new Date() }
      });
    } catch (error) {
      const message = (error as Error).message;
      this.logger.error(`AI task ${task.id} failed: ${message}`);
      await this.prisma.aiTask.update({
        where: { id: task.id },
        data: { status: AiTaskStatus.FAILED, error: message, finishedAt: new Date() }
      });
      throw error;
    }
  }

  private async processWorkLogAnalysis(taskId: string, tenantId: string, workLogId: string | null) {
    if (!workLogId) {
      throw new Error("AI task missing workLogId");
    }
    const workLog = await this.prisma.workLog.findFirst({
      where: { id: workLogId, tenantId, deletedAt: null },
      include: {
        user: true,
        attachments: {
          where: { deletedAt: null },
          orderBy: [{ createdAt: "asc" }]
        }
      }
    });
    if (!workLog) {
      throw new Error("Work log not found for AI analysis");
    }

    const attachments = await Promise.all(
      workLog.attachments.map(async (attachment) => {
        const canInlineImage = attachment.kind === WorkLogAttachmentKind.IMAGE && attachment.fileSize <= INLINE_IMAGE_MAX_BYTES;
        return {
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          kind: attachment.kind,
          fileSize: attachment.fileSize,
          textContent: attachment.textContent,
          aiSummary: attachment.aiSummary,
          dataUrl: canInlineImage ? await this.readAttachmentDataUrl(attachment.storagePath, attachment.mimeType) : null
        };
      })
    );

    const result = await this.openAi.analyzeWorkLog(
      {
        title: workLog.title,
        content: workLog.content,
        date: workLog.date,
        hours: Number(workLog.hours),
        startTime: workLog.startTime,
        endTime: workLog.endTime,
        attachments
      },
      {
        tenantId: workLog.tenantId,
        userId: workLog.userId,
        operation: "work_log_analysis",
        targetType: "work_log",
        targetId: workLog.id,
        containsAttachments: attachments.length > 0,
        containsImages: attachments.some((attachment) => attachment.kind === WorkLogAttachmentKind.IMAGE)
      }
    );

    await this.prisma.aiAnalysis.upsert({
      where: { workLogId },
      update: {
        tenantId: workLog.tenantId,
        userId: workLog.userId,
        category: result.category,
        achievements: result.achievements,
        risks: result.risks,
        blockers: result.blockers,
        keywords: result.keywords,
        tags: result.tags,
        timeReasonableness: result.timeReasonableness,
        summary: result.summary,
        raw: { result, taskId }
      },
      create: {
        tenantId: workLog.tenantId,
        workLogId,
        userId: workLog.userId,
        category: result.category,
        achievements: result.achievements,
        risks: result.risks,
        blockers: result.blockers,
        keywords: result.keywords,
        tags: result.tags,
        timeReasonableness: result.timeReasonableness,
        summary: result.summary,
        raw: { result, taskId }
      }
    });

    await this.prisma.notification.create({
      data: {
        tenantId: workLog.tenantId,
        userId: workLog.userId,
        type: NotificationType.AI_ANALYSIS_DONE,
        title: "AI 分析已完成",
        body: `「${workLog.title}」的 AI 分析已完成。`,
        data: { workLogId }
      }
    });
  }

  private async readAttachmentDataUrl(storagePath: string, mimeType: string) {
    try {
      const buffer = await readFile(storagePath);
      return `data:${mimeType};base64,${buffer.toString("base64")}`;
    } catch (error) {
      this.logger.warn(`Failed to read attachment for AI vision input: ${(error as Error).message}`);
      return null;
    }
  }

  private async processReportGeneration(_taskId: string, tenantId: string, reportId: string | null) {
    if (!reportId) {
      throw new Error("AI task missing reportId");
    }
    await this.reportContent.generateAndSave(reportId, tenantId);
  }
}
