import { Controller, Get, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUserParam } from "../../common/decorators/current-user.decorator";
import { CurrentUser } from "../../common/types/current-user";
import { AnalyticsService } from "./analytics.service";
import { CalendarDayQueryDto, CalendarQueryDto } from "./dto/calendar-query.dto";

@ApiBearerAuth()
@ApiTags("Calendar Dashboard")
@Controller("analytics")
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get("calendar")
  calendar(@CurrentUserParam() user: CurrentUser, @Query() query: CalendarQueryDto) {
    return this.analyticsService.calendar(user, query);
  }

  @Get("calendar/day")
  calendarDay(@CurrentUserParam() user: CurrentUser, @Query() query: CalendarDayQueryDto) {
    return this.analyticsService.calendarDay(user, query);
  }
}

