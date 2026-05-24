import { BullModule } from "@nestjs/bullmq";
import { Module, forwardRef } from "@nestjs/common";
import { ReportsModule } from "../reports/reports.module";
import { AiQueueService, AI_QUEUE } from "./ai-queue.service";
import { AiController } from "./ai.controller";
import { AiProcessor } from "./ai.processor";
import { AiService } from "./ai.service";
import { OpenAiService } from "./openai.service";

@Module({
  imports: [BullModule.registerQueue({ name: AI_QUEUE }), forwardRef(() => ReportsModule)],
  controllers: [AiController],
  providers: [AiService, AiQueueService, AiProcessor, OpenAiService],
  exports: [AiQueueService, OpenAiService]
})
export class AiModule {}

