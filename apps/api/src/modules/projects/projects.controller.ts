import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { RoleCode } from "@prisma/client";
import { CurrentUserParam } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/types/current-user";
import { CreateProjectDto, ProjectQueryDto, UpdateProjectDto } from "./dto/project.dto";
import { ProjectsService } from "./projects.service";

@ApiBearerAuth()
@ApiTags("Projects")
@Controller("projects")
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  list(@CurrentUserParam() user: CurrentUser, @Query() query: ProjectQueryDto) {
    return this.projectsService.list(user, query);
  }

  @Roles(RoleCode.COMPANY_ADMIN)
  @Post()
  create(@CurrentUserParam() user: CurrentUser, @Body() dto: CreateProjectDto) {
    return this.projectsService.create(user, dto);
  }

  @Roles(RoleCode.COMPANY_ADMIN)
  @Patch(":id")
  update(@CurrentUserParam() user: CurrentUser, @Param("id") id: string, @Body() dto: UpdateProjectDto) {
    return this.projectsService.update(user, id, dto);
  }

  @Roles(RoleCode.COMPANY_ADMIN)
  @Delete(":id")
  remove(@CurrentUserParam() user: CurrentUser, @Param("id") id: string) {
    return this.projectsService.remove(user, id);
  }
}
