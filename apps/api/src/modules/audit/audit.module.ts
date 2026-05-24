import { Module } from "@nestjs/common";
import { AuditController } from "./audit.controller";
import { AuditLogService } from "./audit-log.service";

@Module({
  controllers: [AuditController],
  providers: [AuditLogService]
})
export class AuditModule {}
