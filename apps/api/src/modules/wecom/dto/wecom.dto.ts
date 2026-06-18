import {
  CommunicationFileKind,
  CommunicationFileDownloadStatus,
  CommunicationProjectSuggestionStatus,
  CommunicationSourceType,
  WecomIntegrationMode,
  WecomExternalConsentStatus,
  WecomUserMappingStatus
} from "@prisma/client";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength
} from "class-validator";
import { Type } from "class-transformer";

export class SaveWecomIntegrationDto {
  @IsString()
  @MinLength(4)
  corpId: string;

  @IsString()
  @MinLength(4)
  msgAuditSecretRef: string;

  @IsString()
  @MinLength(8)
  rsaPrivateKeyRef: string;

  @IsBoolean()
  rsaPublicKeyConfigured: boolean;

  @IsOptional()
  @IsString()
  trustedIpNote?: string;

  @IsEnum(WecomIntegrationMode)
  mode: WecomIntegrationMode;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(200)
  syncDepartmentIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(1000)
  syncUserIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(1000)
  syncChatIds?: string[];

  @IsBoolean()
  syncFiles: boolean;

  @IsBoolean()
  generateLogDrafts: boolean;

  @IsBoolean()
  generateProjectRisks: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(30)
  @Max(1095)
  retentionDays: number;
}

export class SaveCommunicationSourceDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @MinLength(3)
  chatId: string;

  @IsEnum(CommunicationSourceType)
  sourceType: CommunicationSourceType;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  projectIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  departmentIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  memberScopeUserIds?: string[];

  @IsBoolean()
  generateLogDrafts: boolean;

  @IsBoolean()
  generateProjectRisks: boolean;

  @IsBoolean()
  syncFiles: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(30)
  @Max(1095)
  retentionDays: number;
}

export class ConfirmWecomBindingDto {
  @IsOptional()
  @IsString()
  userId?: string | null;

  @IsEnum(WecomUserMappingStatus)
  mappingStatus: WecomUserMappingStatus;
}

export class SyncWecomTextMessageDto {
  @IsOptional()
  @IsString()
  sourceId?: string;

  @IsOptional()
  @IsArray()
  items?: Array<{
    msgId?: string;
    senderWecomUserId?: string;
    senderName?: string;
    content?: string;
    sentAt?: string;
  }>;
}

export class SyncWecomArchiveDto {
  @IsOptional()
  @IsString()
  sourceId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number;

  @IsOptional()
  @IsArray()
  messages?: Array<{
    msgId?: string;
    seq?: string | number;
    chatId?: string;
    chatName?: string;
    senderWecomUserId?: string;
    senderName?: string;
    senderType?: "INTERNAL" | "EXTERNAL";
    externalUserId?: string;
    externalName?: string;
    externalConsentStatus?: WecomExternalConsentStatus;
    content?: string;
    sentAt?: string;
    msgType?: "TEXT" | "FILE" | "IMAGE" | "VOICE" | "LINK" | "OTHER";
    files?: Array<{
      sdkFileId?: string;
      fileName?: string;
      mimeType?: string;
      fileSize?: number;
      kind?: CommunicationFileKind;
      downloadStatus?: CommunicationFileDownloadStatus;
      storagePath?: string;
      textContent?: string;
      aiSummary?: string;
      error?: string;
    }>;
  }>;
}

export class UpdateProjectSuggestionDto {
  @IsEnum(CommunicationProjectSuggestionStatus)
  status: CommunicationProjectSuggestionStatus;
}

export class ConfirmCommunicationDraftDto {
  @IsDateString()
  date: string;

  @IsString()
  @MinLength(2)
  title: string;

  @IsString()
  @MinLength(2)
  content: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(24)
  hours?: number | null;

  @IsOptional()
  @IsString()
  projectId?: string | null;

  @IsOptional()
  @IsBoolean()
  submit?: boolean;
}
