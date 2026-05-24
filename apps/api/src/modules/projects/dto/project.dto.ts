import { Type } from "class-transformer";
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { ProjectStatus } from "@prisma/client";

export class ProjectQueryDto {
  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;

  @IsOptional()
  @IsString()
  search?: string;
}

export class CreateProjectDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  code?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;

  @IsOptional()
  @IsString()
  ownerUserId?: string | null;

  @IsOptional()
  @Type(() => String)
  @IsDateString()
  startDate?: string | null;

  @IsOptional()
  @Type(() => String)
  @IsDateString()
  endDate?: string | null;
}

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  code?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;

  @IsOptional()
  @IsString()
  ownerUserId?: string | null;

  @IsOptional()
  @Type(() => String)
  @IsDateString()
  startDate?: string | null;

  @IsOptional()
  @Type(() => String)
  @IsDateString()
  endDate?: string | null;
}
