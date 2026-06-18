import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { JwtModule } from "@nestjs/jwt";
import { APP_GUARD } from "@nestjs/core";
import { CommonModule } from "./common/common.module";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { RolesGuard } from "./common/guards/roles.guard";
import { AuthModule } from "./modules/auth/auth.module";
import { OrgModule } from "./modules/org/org.module";
import { ProjectsModule } from "./modules/projects/projects.module";
import { WorkLogsModule } from "./modules/work-logs/work-logs.module";
import { AnalyticsModule } from "./modules/analytics/analytics.module";
import { AiModule } from "./modules/ai/ai.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { OpsModule } from "./modules/ops/ops.module";
import { AppController } from "./app.controller";
import { BillingModule } from "./modules/billing/billing.module";
import { ExportsModule } from "./modules/exports/exports.module";
import { AuditModule } from "./modules/audit/audit.module";
import { PrivacyModule } from "./modules/privacy/privacy.module";
import { FeedbackModule } from "./modules/feedback/feedback.module";
import { WecomModule } from "./modules/wecom/wecom.module";

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET ?? "dev-secret",
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN ?? "7d" }
    }),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST ?? "localhost",
        port: Number(process.env.REDIS_PORT ?? 6379),
        password: process.env.REDIS_PASSWORD || undefined
      }
    }),
    CommonModule,
    AuthModule,
    OrgModule,
    ProjectsModule,
    WorkLogsModule,
    AnalyticsModule,
    AiModule,
    ReportsModule,
    NotificationsModule,
    OpsModule,
    BillingModule,
    ExportsModule,
    AuditModule,
    PrivacyModule,
    FeedbackModule,
    WecomModule
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard }
  ]
})
export class AppModule {}
