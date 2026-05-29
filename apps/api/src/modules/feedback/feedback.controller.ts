import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUserParam } from "../../common/decorators/current-user.decorator";
import { CurrentUser } from "../../common/types/current-user";
import { CreateFeedbackDto, UpdateFeedbackStatusDto } from "./dto/feedback.dto";
import { FeedbackService } from "./feedback.service";

@ApiBearerAuth()
@ApiTags("Feedback")
@Controller("feedback")
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Get("requests")
  list(@CurrentUserParam() user: CurrentUser) {
    return this.feedbackService.listRequests(user);
  }

  @Post("requests")
  create(@CurrentUserParam() user: CurrentUser, @Body() dto: CreateFeedbackDto) {
    return this.feedbackService.createRequest(user, dto);
  }

  @Patch("requests/:id/status")
  updateStatus(@CurrentUserParam() user: CurrentUser, @Param("id") id: string, @Body() dto: UpdateFeedbackStatusDto) {
    return this.feedbackService.updateStatus(user, id, dto);
  }
}
