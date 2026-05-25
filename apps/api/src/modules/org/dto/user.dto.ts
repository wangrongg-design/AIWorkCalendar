import { RoleCode } from "@prisma/client";
import { IsArray, IsBoolean, IsEmail, IsEnum, IsOptional, IsString, MinLength, ValidateIf } from "class-validator";

export class CreateUserDto {
  @ValidateIf((_, value) => value !== undefined && value !== null && value !== "")
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsString()
  departmentId?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @IsArray()
  @IsEnum(RoleCode, { each: true })
  roles: RoleCode[];

  @IsOptional()
  @IsBoolean()
  requiresWorkReport?: boolean;
}

export class UpdateUserDto {
  @ValidateIf((_, value) => value !== undefined && value !== null && value !== "")
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @IsString()
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  departmentId?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @IsEnum(RoleCode, { each: true })
  roles?: RoleCode[];

  @IsOptional()
  @IsBoolean()
  requiresWorkReport?: boolean;
}
