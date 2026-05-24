import { Controller, Get, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUserParam } from "../../common/decorators/current-user.decorator";
import { CurrentUser } from "../../common/types/current-user";
import { NotificationsService } from "./notifications.service";

@ApiBearerAuth()
@ApiTags("Notifications")
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(@CurrentUserParam() user: CurrentUser) {
    return this.notificationsService.list(user);
  }

  @Post(":id/read")
  read(@CurrentUserParam() user: CurrentUser, @Param("id") id: string) {
    return this.notificationsService.read(user, id);
  }

  @Post("read-all")
  readAll(@CurrentUserParam() user: CurrentUser) {
    return this.notificationsService.readAll(user);
  }
}

