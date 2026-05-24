import { ReportType } from "@prisma/client";
import { IsDateString, IsEnum, IsOptional, IsString } from "class-validator";

export class GenerateReportDto {
  @IsEnum(ReportType)
  type: ReportType;

  @IsDateString()
  periodStart: string;

  @IsDateString()
  periodEnd: string;

  @IsOptional()
  @IsString()
  departmentId?: string;
}

