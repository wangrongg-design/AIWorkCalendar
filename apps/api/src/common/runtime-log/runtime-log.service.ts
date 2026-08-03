import { Injectable, Logger } from "@nestjs/common";
import { Prisma, RuntimeLogLevel } from "@prisma/client";
import { PrismaService } from "../prisma.service";

type RuntimeLogInput = {
  level: RuntimeLogLevel;
  source?: string;
  tenantId?: string | null;
  userId?: string | null;
  method?: string | null;
  path?: string | null;
  statusCode?: number | null;
  requestId?: string | null;
  message: string;
  stack?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Prisma.InputJsonValue | null;
};

const maxTextLength = 4000;

@Injectable()
export class RuntimeLogService {
  private readonly logger = new Logger(RuntimeLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(input: RuntimeLogInput) {
    try {
      await this.prisma.runtimeLog.create({
        data: {
          level: input.level,
          source: input.source ?? "api",
          tenantId: input.tenantId ?? null,
          userId: input.userId ?? null,
          method: input.method ?? null,
          path: input.path ?? null,
          statusCode: input.statusCode ?? null,
          requestId: input.requestId ?? null,
          message: this.sanitizeText(input.message, 1000),
          stack: input.stack ? this.sanitizeText(input.stack, maxTextLength) : null,
          ip: input.ip ?? null,
          userAgent: input.userAgent ? this.sanitizeText(input.userAgent, 600) : null,
          metadata: input.metadata ?? Prisma.JsonNull
        }
      });
    } catch (error) {
      this.logger.warn(`Runtime log write failed: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  private sanitizeText(value: string, maxLength: number) {
    return value
      .replace(/bearer\s+[a-z0-9._~+/-]+=*/gi, "Bearer ***")
      .replace(/(password|token|secret|api[_-]?key|authorization)=([^&\s]+)/gi, "$1=***")
      .slice(0, maxLength);
  }
}
