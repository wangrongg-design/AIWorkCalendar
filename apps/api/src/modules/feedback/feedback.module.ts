import { Module } from "@nestjs/common";
import { CommonModule } from "../../common/common.module";
import { FeedbackController } from "./feedback.controller";
import { FeedbackService } from "./feedback.service";

@Module({
  imports: [CommonModule],
  controllers: [FeedbackController],
  providers: [FeedbackService]
})
export class FeedbackModule {}
