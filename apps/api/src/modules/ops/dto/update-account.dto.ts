import { IsBoolean, IsOptional, IsString, MinLength } from "class-validator";

export class UpdateOpsAccountDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;
}
