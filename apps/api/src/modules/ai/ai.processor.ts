import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, Logger, forwardRef } from "@nestjs/common";
import { AiTaskStatus, NotificationType } from "@prisma/client";
import { Job } from "bullmq";
import { PrismaService } from "../../common/prisma.service";
import { ReportContentService } from "../reports/report-content.service";
import { AI_QUEUE } from "./ai-queue.service";
import { OpenAiService } from "./openai.service";

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
        await this.processWorkLogAnalysis(task.id, task.workLogId);
      } else if (job.name === "report-generation") {
        await this.processReportGeneration(task.id, task.reportId);
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

  private async processWorkLogAnalysis(taskId: string, workLogId: string | null) {
    if (!workLogId) {
      throw new Error("AI task missing workLogId");
    }
    const workLog = await this.prisma.workLog.findFirst({
      where: { id: workLogId, deletedAt: null },
      include: { user: true }
    });
    if (!workLog) {
      throw new Error("Work log not found for AI analysis");
    }

    const result = await this.openAi.analyzeWorkLog({
      title: workLog.title,
      content: workLog.content,
      date: workLog.date,
      hours: Number(workLog.hours),
      startTime: workLog.startTime,
      endTime: workLog.endTime
    });

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

  private async processReportGeneration(_taskId: string, reportId: string | null) {
    if (!reportId) {
      throw new Error("AI task missing reportId");
    }
    await this.reportContent.generateAndSave(reportId);
  }
}

