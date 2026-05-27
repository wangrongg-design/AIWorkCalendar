import { Transform } from "class-transformer";
import { IsEmail, IsOptional, IsString, Matches, MinLength } from "class-validator";
import { normalizeUnifiedSocialCreditCode, unifiedSocialCreditCodePattern } from "../../../common/unified-social-credit-code";

export class RegisterTenantDto {
  @IsString()
  @MinLength(2)
  companyName: string;

  @IsString()
  @Transform(({ value }) => normalizeUnifiedSocialCreditCode(value))
  @Matches(unifiedSocialCreditCodePattern, { message: "请输入 18 位营业执照统一社会信用代码" })
  tenantCode: string;

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
