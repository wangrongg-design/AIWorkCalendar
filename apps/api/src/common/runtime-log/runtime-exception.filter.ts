import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
import { RuntimeLogLevel } from "@prisma/client";
import { CurrentUser } from "../types/current-user";
import { RuntimeLogService } from "./runtime-log.service";

type HttpRequest = {
  method?: string;
  path?: string;
  url?: string;
  originalUrl?: string;
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
  user?: CurrentUser;
  query?: Record<string, unknown>;
};

type HttpResponse = {
  headersSent?: boolean;
  status(statusCode: number): { json(body: unknown): void };
};

type ErrorResponseBody = {
  statusCode: number;
  message: string | string[];
  error?: string;
};

@Catch()
export class RuntimeExceptionFilter implements ExceptionFilter {
  constructor(private readonly runtimeLogs: RuntimeLogService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<HttpResponse>();
    const request = ctx.getRequest<HttpRequest>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const responseBody = this.responseBody(exception, status);

    void this.recordException(exception, request, status, responseBody);

    if (!response.headersSent) {
      response.status(status).json(responseBody);
    }
  }

  private responseBody(exception: unknown, status: number): ErrorResponseBody {
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      if (typeof body === "object" && body !== null) {
        return body as ErrorResponseBody;
      }
      return {
        statusCode: status,
        message: String(body || exception.message),
        error: exception.name
      };
    }
    return {
      statusCode: status,
      message: "Internal server error",
      error: "Internal Server Error"
    };
  }

  private async recordException(exception: unknown, request: HttpRequest, status: number, body: ErrorResponseBody) {
    if (status < 400 || this.shouldSkip(request)) return;
    const message = this.messageText(body.message);
    await this.runtimeLogs.record({
      level: status >= 500 ? RuntimeLogLevel.ERROR : RuntimeLogLevel.WARN,
      tenantId: request.user?.tenantId ?? null,
      userId: request.user?.isPlatformOps ? null : request.user?.id ?? null,
      method: request.method ?? null,
      path: this.cleanPath(request),
      statusCode: status,
      requestId: this.headerText(request, "x-request-id") ?? this.headerText(request, "cf-ray"),
      message,
      stack: exception instanceof Error ? exception.stack ?? null : null,
      ip: request.ip ?? this.headerText(request, "x-forwarded-for") ?? null,
      userAgent: this.headerText(request, "user-agent"),
      metadata: {
        error: body.error ?? (exception instanceof Error ? exception.name : "UnknownError"),
        queryKeys: request.query ? Object.keys(request.query).slice(0, 20) : [],
        platformOps: Boolean(request.user?.isPlatformOps)
      }
    });
  }

  private shouldSkip(request: HttpRequest) {
    const path = this.cleanPath(request);
    return path === "/health" || path === "/";
  }

  private cleanPath(request: HttpRequest) {
    return (request.path || request.originalUrl || request.url || "").split("?")[0] || null;
  }

  private headerText(request: HttpRequest, name: string) {
    const value = request.headers?.[name.toLowerCase()];
    if (Array.isArray(value)) return value[0] ?? null;
    return value ?? null;
  }

  private messageText(message: string | string[]) {
    return Array.isArray(message) ? message.join("; ") : message;
  }
}
