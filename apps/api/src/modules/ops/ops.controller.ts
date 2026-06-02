import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { RoleCode } from "@prisma/client";
import { CurrentUserParam } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/types/current-user";
import { UpdateOpsAccountDto } from "./dto/update-account.dto";
import { UpdateOpsTenantLogoDto } from "./dto/update-tenant-logo.dto";
import { OpsService } from "./ops.service";

@ApiBearerAuth()
@ApiTags("Ops")
@Roles(RoleCode.SUPER_ADMIN)
@Controller("ops")
export class OpsController {
  constructor(private readonly opsService: OpsService) {}

  @Get("overview")
  overview() {
    return this.opsService.overview();
  }

  @Patch("accounts/:id")
  updateAccount(@CurrentUserParam() user: CurrentUser, @Param("id") id: string, @Body() dto: UpdateOpsAccountDto) {
    return this.opsService.updateAccount(user, id, dto);
  }

  @Post("accounts/:id/reset-password")
  resetAccountPassword(@CurrentUserParam() user: CurrentUser, @Param("id") id: string) {
    return this.opsService.resetAccountPassword(user, id);
  }

  @Delete("accounts/:id")
  deleteAccount(@CurrentUserParam() user: CurrentUser, @Param("id") id: string) {
    return this.opsService.deleteAccount(user, id);
  }

  @Patch("tenants/:id/logo")
  updateTenantLogo(@CurrentUserParam() user: CurrentUser, @Param("id") id: string, @Body() dto: UpdateOpsTenantLogoDto) {
    return this.opsService.updateTenantLogo(user, id, dto);
  }
}
