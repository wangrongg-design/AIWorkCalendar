import { Type } from "class-transformer";
import { IsArray, IsIn, IsOptional, IsString, Matches, MaxLength, ValidateNested } from "class-validator";

class SuggestionChatMessageDto {
  @IsIn(["user", "assistant"])
  role: "user" | "assistant";

  @IsString()
  @MaxLength(4000)
  content: string;
}

class SuggestionAttachmentDto {
  @IsString()
  @MaxLength(180)
  fileName: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  mimeType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  status?: string;
}

export class WorkLogSuggestionDto {
  @IsString()
  @MaxLength(4000)
  userInput: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  currentDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  conversationStatus?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SuggestionChatMessageDto)
  messages?: SuggestionChatMessageDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SuggestionAttachmentDto)
  attachments?: SuggestionAttachmentDto[];
}
