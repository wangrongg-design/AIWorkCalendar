import { Controller, Get, Header, Param, Post, Query, Res, StreamableFile } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUserParam } from "../../common/decorators/current-user.decorator";
import { attachmentDisposition } from "../../common/http/content-disposition";
import { CurrentUser } from "../../common/types/current-user";
import { ExportQueryDto } from "./dto/export-query.dto";
import { ExportsService } from "./exports.service";

@ApiBearerAuth()
@ApiTags("Exports")
@Controller("exports")
export class ExportsController {
  constructor(private readonly exportsService: ExportsService) {}

  @Get("data")
  @Header("Content-Type", "application/json; charset=utf-8")
  exportData(@CurrentUserParam() user: CurrentUser, @Query() query: ExportQueryDto) {
    return this.exportsService.exportData(user, query);
  }

  @Post("data-tasks")
  createExportTask(@CurrentUserParam() user: CurrentUser, @Query() query: ExportQueryDto) {
    return this.exportsService.createExportTask(user, query);
  }

  @Get("data-tasks")
  listExportTasks(@CurrentUserParam() user: CurrentUser) {
    return this.exportsService.listExportTasks(user);
  }

  @Get("data-tasks/:id/download")
  async downloadExportTask(
    @CurrentUserParam() user: CurrentUser,
    @Param("id") id: string,
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string | number): void }
  ) {
    const download = await this.exportsService.openDownload(user, id);
    response.setHeader("Content-Type", download.contentType);
    response.setHeader("Content-Length", download.fileSize);
    response.setHeader("Content-Disposition", attachmentDisposition(download.fileName));
    return new StreamableFile(download.stream);
  }
}
