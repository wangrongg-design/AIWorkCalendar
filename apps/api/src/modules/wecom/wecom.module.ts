import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { WecomController } from "./wecom.controller";
import { WecomMsgAuditWorker } from "./wecom-msgaudit.worker";
import { WecomService } from "./wecom.service";

@Module({
  imports: [AiModule],
  controllers: [WecomController],
  providers: [WecomService, WecomMsgAuditWorker],
  exports: [WecomService]
})
export class WecomModule {}
