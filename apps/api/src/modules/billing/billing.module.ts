import { Module } from "@nestjs/common";
import { BillingController } from "./billing.controller";
import { BillingService } from "./billing.service";
import { WechatPayService } from "./wechat-pay.service";

@Module({
  controllers: [BillingController],
  providers: [BillingService, WechatPayService]
})
export class BillingModule {}
