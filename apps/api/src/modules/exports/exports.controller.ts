import { Controller, Get, Header, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUserParam } from "../../common/decorators/current-user.decorator";
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
}
