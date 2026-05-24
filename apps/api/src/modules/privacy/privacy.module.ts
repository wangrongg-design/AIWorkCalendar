import { Module } from "@nestjs/common";
import { CommonModule } from "../../common/common.module";
import { PrivacyController } from "./privacy.controller";
import { PrivacyService } from "./privacy.service";

@Module({
  imports: [CommonModule],
  controllers: [PrivacyController],
  providers: [PrivacyService]
})
export class PrivacyModule {}
