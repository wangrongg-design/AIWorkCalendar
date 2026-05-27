import { IsEmail, IsOptional, IsString, Matches, MinLength } from "class-validator";

export class CreateTenantDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @Matches(/^[a-z0-9-]{2,32}$/)
  code: string;

  @IsEmail()
  adminEmail: string;

  @IsString()
  @MinLength(2)
  adminName: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  adminPassword?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;
}
