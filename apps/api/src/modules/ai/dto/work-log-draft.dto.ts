import { Type } from "class-transformer";
import { IsArray, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateNested } from "class-validator";

class DraftChatMessageDto {
  @IsIn(["user", "assistant"])
  role: "user" | "assistant";

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  content: string;
}

export class WorkLogDraftDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DraftChatMessageDto)
  messages: DraftChatMessageDto[];

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  currentDate?: string;
}
