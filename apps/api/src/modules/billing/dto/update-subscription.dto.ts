import { SubscriptionPlan, SubscriptionStatus } from "@prisma/client";
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from "class-validator";

export class UpdateSubscriptionDto {
  @IsOptional()
  @IsIn(Object.values(SubscriptionPlan))
  plan?: SubscriptionPlan;

  @IsOptional()
  @IsIn(Object.values(SubscriptionStatus))
  status?: SubscriptionStatus;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  seatLimit?: number;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  currentPeriodEnd?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  trialEndsAt?: string;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  externalCustomerId?: string;

  @IsOptional()
  @IsString()
  externalSubscriptionId?: string;
}
