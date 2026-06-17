import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUserParam } from "../../common/decorators/current-user.decorator";
import { CurrentUser } from "../../common/types/current-user";
import { GenerateReportDto, ReportReadinessQueryDto } from "./dto/report.dto";
import { ReportsService } from "./reports.service";

@ApiBearerAuth()
@ApiTags("Reports")
@Controller("reports")
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post("generate")
  generate(@CurrentUserParam() user: CurrentUser, @Body() dto: GenerateReportDto) {
    return this.reportsService.generate(user, dto);
  }

  @Get("readiness")
  readiness(@CurrentUserParam() user: CurrentUser, @Query() dto: ReportReadinessQueryDto) {
    return this.reportsService.readiness(user, dto);
  }

  @Get()
  list(@CurrentUserParam() user: CurrentUser) {
    return this.reportsService.list(user);
  }
}
