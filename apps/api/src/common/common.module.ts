import { Global, Module } from "@nestjs/common";
import { AccessService } from "./access/access.service";
import { AuditService } from "./audit/audit.service";
import { PrismaService } from "./prisma.service";
import { RateLimitService } from "./rate-limit/rate-limit.service";
import { RuntimeLogService } from "./runtime-log/runtime-log.service";
import { SubscriptionService } from "./subscription/subscription.service";

@Global()
@Module({
  providers: [PrismaService, AccessService, SubscriptionService, AuditService, RateLimitService, RuntimeLogService],
  exports: [PrismaService, AccessService, SubscriptionService, AuditService, RateLimitService, RuntimeLogService]
})
export class CommonModule {}
