import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { RoleCode } from "@prisma/client";
import { CurrentUserParam } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/types/current-user";
import { CreateDepartmentDto, UpdateDepartmentDto } from "./dto/department.dto";
import { CreateTenantDto } from "./dto/tenant.dto";
import { CreateUserDto, UpdateUserDto } from "./dto/user.dto";
import { OrgService } from "./org.service";

@ApiBearerAuth()
@ApiTags("Org")
@Controller("org")
export class OrgController {
  constructor(private readonly orgService: OrgService) {}

  @Get()
  getOrg(@CurrentUserParam() user: CurrentUser) {
    return this.orgService.getOrg(user);
  }

  @Roles(RoleCode.SUPER_ADMIN)
  @Post("tenants")
  createTenant(@CurrentUserParam() user: CurrentUser, @Body() dto: CreateTenantDto) {
    return this.orgService.createTenant(user, dto);
  }

  @Roles(RoleCode.COMPANY_ADMIN)
  @Post("departments")
  createDepartment(@CurrentUserParam() user: CurrentUser, @Body() dto: CreateDepartmentDto) {
    return this.orgService.createDepartment(user, dto);
  }

  @Roles(RoleCode.COMPANY_ADMIN)
  @Patch("departments/:id")
  updateDepartment(
    @CurrentUserParam() user: CurrentUser,
    @Param("id") id: string,
    @Body() dto: UpdateDepartmentDto
  ) {
    return this.orgService.updateDepartment(user, id, dto);
  }

  @Roles(RoleCode.COMPANY_ADMIN)
  @Delete("departments/:id")
  deleteDepartment(@CurrentUserParam() user: CurrentUser, @Param("id") id: string) {
    return this.orgService.deleteDepartment(user, id);
  }

  @Roles(RoleCode.COMPANY_ADMIN)
  @Post("users")
  createUser(@CurrentUserParam() user: CurrentUser, @Body() dto: CreateUserDto) {
    return this.orgService.createUser(user, dto);
  }

  @Roles(RoleCode.COMPANY_ADMIN)
  @Patch("users/:id")
  updateUser(@CurrentUserParam() user: CurrentUser, @Param("id") id: string, @Body() dto: UpdateUserDto) {
    return this.orgService.updateUser(user, id, dto);
  }
}
