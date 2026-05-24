import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUserParam } from "../../common/decorators/current-user.decorator";
import { CurrentUser } from "../../common/types/current-user";
import { AiService } from "./ai.service";
import { CalendarChatDto } from "./dto/calendar-chat.dto";
import { WorkLogDraftDto } from "./dto/work-log-draft.dto";

@ApiBearerAuth()
@ApiTags("AI")
@Controller("ai")
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Get("analyses/work-logs/:workLogId")
  getWorkLogAnalysis(@CurrentUserParam() user: CurrentUser, @Param("workLogId") workLogId: string) {
    return this.aiService.getWorkLogAnalysis(user, workLogId);
  }

  @Post("analyses/work-logs/:workLogId/retry")
  retryWorkLogAnalysis(@CurrentUserParam() user: CurrentUser, @Param("workLogId") workLogId: string) {
    return this.aiService.retryWorkLogAnalysis(user, workLogId);
  }

  @Post("chat/calendar")
  chatCalendar(@CurrentUserParam() user: CurrentUser, @Body() dto: CalendarChatDto) {
    return this.aiService.chatCalendar(user, dto);
  }

  @Post("work-log-draft")
  draftWorkLog(@CurrentUserParam() user: CurrentUser, @Body() dto: WorkLogDraftDto) {
    return this.aiService.draftWorkLog(user, dto);
  }
}
