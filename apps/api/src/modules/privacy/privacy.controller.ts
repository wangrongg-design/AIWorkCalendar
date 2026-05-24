import { Body, Controller, Get, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUserParam } from "../../common/decorators/current-user.decorator";
import { CurrentUser } from "../../common/types/current-user";
import { RequestDataDeletionDto } from "./dto/data-deletion.dto";
import { PrivacyService } from "./privacy.service";

@ApiBearerAuth()
@ApiTags("Privacy")
@Controller("privacy")
export class PrivacyController {
  constructor(private readonly privacyService: PrivacyService) {}

  @Get("data-deletion-requests")
  list(@CurrentUserParam() user: CurrentUser) {
    return this.privacyService.listRequests(user);
  }

  @Post("data-deletion-requests")
  requestDeletion(@CurrentUserParam() user: CurrentUser, @Body() dto: RequestDataDeletionDto) {
    return this.privacyService.requestDeletion(user, dto);
  }
}
