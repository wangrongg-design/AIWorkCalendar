import { Module, forwardRef } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { WorkLogsController } from "./work-logs.controller";
import { WorkLogsService } from "./work-logs.service";

@Module({
  imports: [forwardRef(() => AiModule)],
  controllers: [WorkLogsController],
  providers: [WorkLogsService],
  exports: [WorkLogsService]
})
export class WorkLogsModule {}

