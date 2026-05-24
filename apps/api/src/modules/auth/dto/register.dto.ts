import { IsEmail, IsString, Matches, MinLength } from "class-validator";

export class RegisterTenantDto {
  @IsString()
  @MinLength(2)
  companyName: string;

  @IsString()
  @Matches(/^[a-z0-9-]{2,32}$/)
  tenantCode: string;

  @IsString()
  @MinLength(2)
  adminName: string;

  @IsEmail()
  adminEmail: string;

  @IsString()
  @MinLength(6)
  password: string;
}
