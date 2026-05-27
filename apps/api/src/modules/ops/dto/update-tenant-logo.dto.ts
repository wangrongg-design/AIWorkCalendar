import { IsOptional, IsString } from "class-validator";

export class UpdateOpsTenantLogoDto {
  @IsOptional()
  @IsString()
  logoUrl?: string | null;
}
