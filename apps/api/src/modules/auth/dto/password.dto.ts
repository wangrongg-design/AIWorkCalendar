import { Transform } from "class-transformer";
import { IsEmail, IsOptional, IsString, Matches, MinLength } from "class-validator";
import { normalizeOptionalUnifiedSocialCreditCode, unifiedSocialCreditCodePattern } from "../../../common/unified-social-credit-code";

export class PasswordResetRequestDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => normalizeOptionalUnifiedSocialCreditCode(value))
  @Matches(unifiedSocialCreditCodePattern, { message: "请输入 18 位营业执照统一社会信用代码" })
  tenantCode?: string;
}

export class PasswordResetConfirmDto {
  @IsString()
  token: string;

  @IsString()
  @MinLength(6)
  newPassword: string;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(6)
  newPassword: string;
}

export class VerifyEmailDto {
  @IsString()
  token: string;
}
