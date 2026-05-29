import { FeedbackCategory, FeedbackPriority, FeedbackStatus } from "@prisma/client";
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateFeedbackDto {
  @IsIn(Object.values(FeedbackCategory))
  category: FeedbackCategory;

  @IsOptional()
  @IsIn(Object.values(FeedbackPriority))
  priority?: FeedbackPriority;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title: string;

  @IsString()
  @MinLength(5)
  @MaxLength(3000)
  content: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  contact?: string;
}

export class UpdateFeedbackStatusDto {
  @IsIn(Object.values(FeedbackStatus))
  status: FeedbackStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  resolution?: string;
}
