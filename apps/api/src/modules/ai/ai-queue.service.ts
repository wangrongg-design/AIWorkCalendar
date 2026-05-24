import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import { AiTaskStatus, AiTaskType } from "@prisma/client";
import { Queue } from "bullmq";
import { PrismaService } from "../../common/prisma.service";

export const AI_QUEUE = "ai";

@Injectable()
export class AiQueueService {
  private readonly logger = new Logger(AiQueueService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(AI_QUEUE) private readonly queue: Queue
  ) {}

  async enqueueWorkLogAnalysis(tenantId: string, workLogId: string, requestedBy: string) {
    const task = await this.prisma.aiTask.create({
      data: {
        tenantId,
        type: AiTaskType.WORK_LOG_ANALYSIS,
        status: AiTaskStatus.PENDING,
        workLogId,
        payload: { workLogId, requestedBy }
      }
    });
    await this.addQueueJob("work-log-analysis", task.id);
    return task;
  }

  async enqueueReportGeneration(tenantId: string, reportId: string, requestedBy: string) {
    const task = await this.prisma.aiTask.create({
      data: {
        tenantId,
        type: AiTaskType.REPORT_GENERATION,
        status: AiTaskStatus.PENDING,
        reportId,
        payload: { reportId, requestedBy }
      }
    });
    await this.addQueueJob("report-generation", task.id);
    return task;
  }

  private async addQueueJob(name: string, taskId: string) {
    try {
      await this.queue.add(
        name,
        { taskId },
        {
          attempts: 3,
          backoff: { type: "exponential", delay: 3000 },
          removeOnComplete: 100,
          removeOnFail: 200
        }
      );
    } catch (error) {
      this.logger.error(`Failed to enqueue AI task ${taskId}: ${(error as Error).message}`);
    }
  }
}
