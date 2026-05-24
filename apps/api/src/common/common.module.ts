import { Global, Module } from "@nestjs/common";
import { AccessService } from "./access/access.service";
import { AuditService } from "./audit/audit.service";
import { PrismaService } from "./prisma.service";
import { RateLimitService } from "./rate-limit/rate-limit.service";
import { SubscriptionService } from "./subscription/subscription.service";

@Global()
@Module({
  providers: [PrismaService, AccessService, SubscriptionService, AuditService, RateLimitService],
  exports: [PrismaService, AccessService, SubscriptionService, AuditService, RateLimitService]
})
export class CommonModule {}
