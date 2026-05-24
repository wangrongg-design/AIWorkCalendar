import { Controller, Get, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUserParam } from "../../common/decorators/current-user.decorator";
import { CurrentUser } from "../../common/types/current-user";
import { AuditLogService } from "./audit-log.service";

@ApiBearerAuth()
@ApiTags("Audit")
@Controller("audit-logs")
export class AuditController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  list(@CurrentUserParam() user: CurrentUser, @Query("limit") limit?: string) {
    return this.auditLogService.list(user, Number(limit ?? 50));
  }
}
