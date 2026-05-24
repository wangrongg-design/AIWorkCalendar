import { Module, forwardRef } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { ReportContentService } from "./report-content.service";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";

@Module({
  imports: [forwardRef(() => AiModule)],
  controllers: [ReportsController],
  providers: [ReportsService, ReportContentService],
  exports: [ReportContentService]
})
export class ReportsModule {}

