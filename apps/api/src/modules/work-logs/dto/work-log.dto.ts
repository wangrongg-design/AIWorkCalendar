import { Type } from "class-transformer";
import { IsBase64, IsDateString, IsEnum, IsNumber, IsOptional, IsString, Max, Min, MinLength } from "class-validator";

export enum WorkLogKindDto {
  DAILY = "DAILY",
  PLAN = "PLAN"
}

export class WorkLogQueryDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsEnum(WorkLogKindDto)
  kind?: WorkLogKindDto;
}

export class CreateWorkLogDto {
  @IsDateString()
  date: string;

  @IsString()
  @MinLength(2)
  title: string;

  @IsString()
  @MinLength(2)
  content: string;

  @IsOptional()
  @IsDateString()
  startTime?: string;

  @IsOptional()
  @IsDateString()
  endTime?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(24)
  hours?: number | null;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  projectId?: string | null;

  @IsOptional()
  @IsEnum(WorkLogKindDto)
  kind?: WorkLogKindDto;
}

export class UpdateWorkLogDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  content?: string;

  @IsOptional()
  @IsDateString()
  startTime?: string | null;

  @IsOptional()
  @IsDateString()
  endTime?: string | null;

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
  @IsEnum(WorkLogKindDto)
  kind?: WorkLogKindDto;
}

export class CreateWorkLogAttachmentDto {
  @IsString()
  @MinLength(1)
  fileName: string;

  @IsString()
  @MinLength(1)
  mimeType: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(8 * 1024 * 1024)
  fileSize: number;

  @IsString()
  @IsBase64()
  contentBase64: string;
}
