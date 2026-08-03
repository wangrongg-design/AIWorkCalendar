import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, StreamableFile } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { RoleCode } from "@prisma/client";
import { CurrentUserParam } from "../../common/decorators/current-user.decorator";
import { attachmentDisposition } from "../../common/http/content-disposition";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/types/current-user";
import { CreateOpsCompanyAdminDto } from "./dto/create-company-admin.dto";
import { RuntimeLogQueryDto } from "./dto/runtime-log-query.dto";
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

  @Get("runtime-logs")
  runtimeLogs(@Query() query: RuntimeLogQueryDto) {
    return this.opsService.runtimeLogs(query);
  }

  @Get("runtime-logs/download")
  async downloadRuntimeLogs(
    @Query() query: RuntimeLogQueryDto,
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string | number): void }
  ) {
    const download = await this.opsService.downloadRuntimeLogs(query);
    response.setHeader("Content-Type", download.contentType);
    response.setHeader("Content-Length", download.buffer.byteLength);
    response.setHeader("Content-Disposition", attachmentDisposition(download.fileName));
    return new StreamableFile(download.buffer);
  }

  @Patch("accounts/:id")
  updateAccount(@CurrentUserParam() user: CurrentUser, @Param("id") id: string, @Body() dto: UpdateOpsAccountDto) {
    return this.opsService.updateAccount(user, id, dto);
  }

  @Post("accounts/company-admin")
  createCompanyAdmin(@CurrentUserParam() user: CurrentUser, @Body() dto: CreateOpsCompanyAdminDto) {
    return this.opsService.createCompanyAdmin(user, dto);
  }

  @Post("accounts/:id/reset-password")
  resetAccountPassword(@CurrentUserParam() user: CurrentUser, @Param("id") id: string) {
    return this.opsService.resetAccountPassword(user, id);
  }

  @Post("accounts/:id/company-admin")
  restoreCompanyAdmin(@CurrentUserParam() user: CurrentUser, @Param("id") id: string) {
    return this.opsService.restoreCompanyAdmin(user, id);
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
