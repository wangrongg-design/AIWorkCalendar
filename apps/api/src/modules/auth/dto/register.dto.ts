import { Transform } from "class-transformer";
import { IsEmail, IsOptional, IsString, Matches, MinLength } from "class-validator";
import { normalizeOptionalUnifiedSocialCreditCode, unifiedSocialCreditCodePattern } from "../../../common/unified-social-credit-code";

export class RegisterTenantDto {
  @IsString()
  @MinLength(2)
  companyName: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => normalizeOptionalUnifiedSocialCreditCode(value))
  @Matches(unifiedSocialCreditCodePattern, { message: "请输入 18 位营业执照统一社会信用代码" })
  tenantCode?: string;

  @IsString()
  @MinLength(2)
  adminName: string;

  @IsEmail()
  adminEmail: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;
}
