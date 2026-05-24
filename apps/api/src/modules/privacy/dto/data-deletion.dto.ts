import { DataDeletionScope } from "@prisma/client";
import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class RequestDataDeletionDto {
  @IsIn(Object.values(DataDeletionScope))
  scope: DataDeletionScope;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
