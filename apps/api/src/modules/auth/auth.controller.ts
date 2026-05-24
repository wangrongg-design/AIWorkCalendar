import { Body, Controller, Get, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUserParam } from "../../common/decorators/current-user.decorator";
import { Public } from "../../common/decorators/public.decorator";
import { CurrentUser } from "../../common/types/current-user";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { ChangePasswordDto, PasswordResetConfirmDto, PasswordResetRequestDto, VerifyEmailDto } from "./dto/password.dto";
import { RegisterTenantDto } from "./dto/register.dto";

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Post("register")
  register(@Body() dto: RegisterTenantDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post("password-reset/request")
  requestPasswordReset(@Body() dto: PasswordResetRequestDto) {
    return this.authService.requestPasswordReset(dto);
  }

  @Public()
  @Post("password-reset/confirm")
  confirmPasswordReset(@Body() dto: PasswordResetConfirmDto) {
    return this.authService.confirmPasswordReset(dto);
  }

  @Public()
  @Post("verify-email")
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto);
  }

  @ApiBearerAuth()
  @Get("me")
  me(@CurrentUserParam() user: CurrentUser) {
    return this.authService.me(user);
  }

  @ApiBearerAuth()
  @Post("change-password")
  changePassword(@CurrentUserParam() user: CurrentUser, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user, dto);
  }
}
