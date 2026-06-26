import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Query, Res, StreamableFile } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUserParam } from "../../common/decorators/current-user.decorator";
import { attachmentDisposition } from "../../common/http/content-disposition";
import { CurrentUser } from "../../common/types/current-user";
import { CreateWorkLogAttachmentDto, CreateWorkLogDto, UpdateWorkLogDto, WorkLogQueryDto } from "./dto/work-log.dto";
import { WorkLogsService } from "./work-logs.service";

@ApiBearerAuth()
@ApiTags("Work Logs")
@Controller("work-logs")
export class WorkLogsController {
  constructor(private readonly workLogsService: WorkLogsService) {}

  @Get()
  list(@CurrentUserParam() user: CurrentUser, @Query() query: WorkLogQueryDto) {
    return this.workLogsService.list(user, query);
  }

  @Post()
  create(@CurrentUserParam() user: CurrentUser, @Body() dto: CreateWorkLogDto) {
    return this.workLogsService.create(user, dto);
  }

  @Get(":id")
  get(@CurrentUserParam() user: CurrentUser, @Param("id") id: string) {
    return this.workLogsService.get(user, id);
  }

  @Patch(":id")
  update(@CurrentUserParam() user: CurrentUser, @Param("id") id: string, @Body() dto: UpdateWorkLogDto) {
    return this.workLogsService.update(user, id, dto);
  }

  @Delete(":id")
  remove(@CurrentUserParam() user: CurrentUser, @Param("id") id: string) {
    return this.workLogsService.remove(user, id);
  }

  @Post(":id/attachments")
  createAttachment(
    @CurrentUserParam() user: CurrentUser,
    @Param("id") id: string,
    @Body() dto: CreateWorkLogAttachmentDto
  ) {
    return this.workLogsService.createAttachment(user, id, dto);
  }

  @Delete(":id/attachments/:attachmentId")
  removeAttachment(
    @CurrentUserParam() user: CurrentUser,
    @Param("id") id: string,
    @Param("attachmentId") attachmentId: string
  ) {
    return this.workLogsService.removeAttachment(user, id, attachmentId);
  }

  @Get(":id/attachments/:attachmentId/download")
  @Header("Cache-Control", "private, max-age=300")
  async downloadAttachment(
    @CurrentUserParam() user: CurrentUser,
    @Param("id") id: string,
    @Param("attachmentId") attachmentId: string,
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string | number): void }
  ) {
    const download = await this.workLogsService.openAttachmentDownload(user, id, attachmentId);
    response.setHeader("Content-Type", download.mimeType);
    response.setHeader("Content-Length", download.fileSize);
    response.setHeader("Content-Disposition", attachmentDisposition(download.fileName));
    return new StreamableFile(download.stream);
  }

  @Post(":id/submit")
  submit(@CurrentUserParam() user: CurrentUser, @Param("id") id: string) {
    return this.workLogsService.submit(user, id);
  }
}
