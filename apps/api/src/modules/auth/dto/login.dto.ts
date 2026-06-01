import { Transform } from "class-transformer";
import { IsOptional, IsString, Matches, MinLength } from "class-validator";
import { normalizeOptionalUnifiedSocialCreditCode, unifiedSocialCreditCodePattern } from "../../../common/unified-social-credit-code";

export class LoginDto {
  @IsOptional()
  @IsString()
  account?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => normalizeOptionalUnifiedSocialCreditCode(value))
  @Matches(unifiedSocialCreditCodePattern, { message: "请输入 18 位营业执照统一社会信用代码" })
  tenantCode?: string;
}

export class OpsLoginDto {
  @IsString()
  @MinLength(6)
  password: string;
}
