import { IsEmail, IsOptional, IsString, MinLength, ValidateIf } from "class-validator";

export class CreateOpsCompanyAdminDto {
  @IsString()
  tenantId: string;

  @IsString()
  @MinLength(2)
  name: string;

  @ValidateIf((_, value) => value !== undefined && value !== null && value !== "")
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}
