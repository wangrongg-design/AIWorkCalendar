import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUserParam } from "../../common/decorators/current-user.decorator";
import { CurrentUser } from "../../common/types/current-user";
import { CreateWorkLogDto, UpdateWorkLogDto, WorkLogQueryDto } from "./dto/work-log.dto";
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

  @Post(":id/submit")
  submit(@CurrentUserParam() user: CurrentUser, @Param("id") id: string) {
    return this.workLogsService.submit(user, id);
  }
}

