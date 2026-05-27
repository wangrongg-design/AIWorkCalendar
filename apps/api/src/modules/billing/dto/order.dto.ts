import { BillingInterval, PaymentProvider, SubscriptionPlan } from "@prisma/client";
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class CreateBillingOrderDto {
  @IsOptional()
  @IsIn([SubscriptionPlan.TEAM])
  plan?: SubscriptionPlan;

  @IsOptional()
  @IsIn([BillingInterval.MONTHLY])
  interval?: BillingInterval;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  seatLimit?: number;

  @IsIn([PaymentProvider.ALIPAY, PaymentProvider.WECHAT, PaymentProvider.MANUAL])
  provider: PaymentProvider;
}

export class ConfirmManualPaymentDto {
  @IsOptional()
  @IsString()
  transactionId?: string;
}
