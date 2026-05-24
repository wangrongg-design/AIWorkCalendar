import { BillingInterval, PaymentProvider, SubscriptionPlan } from "@prisma/client";
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class CreateBillingOrderDto {
  @IsIn([SubscriptionPlan.TEAM, SubscriptionPlan.BUSINESS, SubscriptionPlan.ENTERPRISE])
  plan: SubscriptionPlan;

  @IsIn(Object.values(BillingInterval))
  interval: BillingInterval;

  @IsInt()
  @Min(1)
  @Max(100000)
  seatLimit: number;

  @IsIn(Object.values(PaymentProvider))
  provider: PaymentProvider;
}

export class ConfirmManualPaymentDto {
  @IsOptional()
  @IsString()
  transactionId?: string;
}
