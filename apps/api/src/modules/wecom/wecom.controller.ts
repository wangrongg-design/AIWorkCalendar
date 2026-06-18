import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { RoleCode } from "@prisma/client";
import { CurrentUserParam } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/types/current-user";
import {
  ConfirmCommunicationDraftDto,
  ConfirmWecomBindingDto,
  SaveCommunicationSourceDto,
  SaveWecomIntegrationDto,
  SyncWecomArchiveDto,
  SyncWecomTextMessageDto,
  UpdateProjectSuggestionDto
} from "./dto/wecom.dto";
import { WecomService } from "./wecom.service";

@ApiBearerAuth()
@ApiTags("WeCom")
@Controller("wecom")
export class WecomController {
  constructor(private readonly wecomService: WecomService) {}

  @Get("overview")
  overview(@CurrentUserParam() user: CurrentUser) {
    return this.wecomService.overview(user);
  }

  @Post("integrations")
  @Roles(RoleCode.COMPANY_ADMIN)
  saveIntegration(@CurrentUserParam() user: CurrentUser, @Body() dto: SaveWecomIntegrationDto) {
    return this.wecomService.saveIntegration(user, dto);
  }

  @Post("integrations/test")
  @Roles(RoleCode.COMPANY_ADMIN)
  testIntegration(@CurrentUserParam() user: CurrentUser) {
    return this.wecomService.testIntegration(user);
  }

  @Post("mappings/auto-match")
  @Roles(RoleCode.COMPANY_ADMIN)
  autoMatchMembers(@CurrentUserParam() user: CurrentUser) {
    return this.wecomService.autoMatchMembers(user);
  }

  @Get("bindings")
  listBindings(@CurrentUserParam() user: CurrentUser) {
    return this.wecomService.listBindings(user);
  }

  @Patch("bindings/:id")
  @Roles(RoleCode.COMPANY_ADMIN)
  updateBinding(@CurrentUserParam() user: CurrentUser, @Param("id") id: string, @Body() dto: ConfirmWecomBindingDto) {
    return this.wecomService.updateBinding(user, id, dto);
  }

  @Get("sources")
  listSources(@CurrentUserParam() user: CurrentUser) {
    return this.wecomService.listSources(user);
  }

  @Post("sources")
  @Roles(RoleCode.COMPANY_ADMIN)
  saveSource(@CurrentUserParam() user: CurrentUser, @Body() dto: SaveCommunicationSourceDto) {
    return this.wecomService.saveSource(user, dto);
  }

  @Patch("sources/:id")
  @Roles(RoleCode.COMPANY_ADMIN)
  updateSource(@CurrentUserParam() user: CurrentUser, @Param("id") id: string, @Body() dto: SaveCommunicationSourceDto) {
    return this.wecomService.updateSource(user, id, dto);
  }

  @Post("sync/text")
  @Roles(RoleCode.COMPANY_ADMIN)
  syncTextMessages(@CurrentUserParam() user: CurrentUser, @Body() dto: SyncWecomTextMessageDto) {
    return this.wecomService.syncTextMessages(user, dto);
  }

  @Post("sync/archive")
  @Roles(RoleCode.COMPANY_ADMIN)
  syncArchive(@CurrentUserParam() user: CurrentUser, @Body() dto: SyncWecomArchiveDto) {
    return this.wecomService.syncArchive(user, dto);
  }

  @Get("files")
  listFiles(@CurrentUserParam() user: CurrentUser) {
    return this.wecomService.listFiles(user);
  }

  @Get("project-suggestions")
  listProjectSuggestions(@CurrentUserParam() user: CurrentUser) {
    return this.wecomService.listProjectSuggestions(user);
  }

  @Patch("project-suggestions/:id")
  @Roles(RoleCode.COMPANY_ADMIN)
  updateProjectSuggestion(@CurrentUserParam() user: CurrentUser, @Param("id") id: string, @Body() dto: UpdateProjectSuggestionDto) {
    return this.wecomService.updateProjectSuggestion(user, id, dto);
  }

  @Get("log-drafts")
  listLogDrafts(@CurrentUserParam() user: CurrentUser) {
    return this.wecomService.listLogDrafts(user);
  }

  @Post("log-drafts/:id/confirm")
  confirmDraft(@CurrentUserParam() user: CurrentUser, @Param("id") id: string, @Body() dto: ConfirmCommunicationDraftDto) {
    return this.wecomService.confirmDraft(user, id, dto);
  }

  @Post("log-drafts/:id/ignore")
  ignoreDraft(@CurrentUserParam() user: CurrentUser, @Param("id") id: string) {
    return this.wecomService.ignoreDraft(user, id);
  }
}
