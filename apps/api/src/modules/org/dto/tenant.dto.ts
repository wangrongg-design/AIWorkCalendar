import { Transform } from "class-transformer";
import { IsEmail, IsOptional, IsString, Matches, MinLength } from "class-validator";
import { normalizeUnifiedSocialCreditCode, unifiedSocialCreditCodePattern } from "../../../common/unified-social-credit-code";

export class CreateTenantDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @Transform(({ value }) => normalizeUnifiedSocialCreditCode(value))
  @Matches(unifiedSocialCreditCodePattern, { message: "请输入 18 位营业执照统一社会信用代码" })
  code: string;

  @IsEmail()
  adminEmail: string;

  @IsString()
  @MinLength(2)
  adminName: string;

  @IsString()
  @MinLength(6)
  adminPassword: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;
}
