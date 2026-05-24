import { IsIn, IsOptional } from "class-validator";

export class ExportQueryDto {
  @IsOptional()
  @IsIn(["self", "tenant"])
  scope?: "self" | "tenant";
}
