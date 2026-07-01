import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { WorkLogStatus } from "@prisma/client";
import { AccessService } from "../../common/access/access.service";
import { PrismaService } from "../../common/prisma.service";
import { CurrentUser } from "../../common/types/current-user";
import { AiQueueService } from "./ai-queue.service";
import { CalendarChatDto } from "./dto/calendar-chat.dto";
import { WorkLogDraftDto } from "./dto/work-log-draft.dto";
import { OpenAiService } from "./openai.service";

function monthRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, monthNumber - 1, 1));
  const end = new Date(Date.UTC(year, monthNumber, 0));
  return { start, end };
}

function parseDateOnly(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

const maxCalendarChatRangeDays = 366;

function parseStrictDateOnly(value: string) {
  const date = parseDateOnly(value);
  if (Number.isNaN(date.getTime()) || dateKey(date) !== value) {
    throw new BadRequestException("日期格式不正确");
  }
  return date;
}

function calendarChatPeriod(dto: CalendarChatDto) {
  if (dto.date) {
    const date = parseStrictDateOnly(dto.date);
    return { start: date, end: date, label: dto.date };
  }
  if (dto.startDate || dto.endDate) {
    if (!dto.startDate || !dto.endDate) {
      throw new BadRequestException("请选择完整的开始日期和结束日期");
    }
    const start = parseStrictDateOnly(dto.startDate);
    const end = parseStrictDateOnly(dto.endDate);
    if (end.getTime() < start.getTime()) {
      throw new BadRequestException("结束日期不能早于开始日期");
    }
    const days = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
    if (days > maxCalendarChatRangeDays) {
      throw new BadRequestException(`AI 工作助手单次分析范围最多支持 ${maxCalendarChatRangeDays} 天`);
    }
    return {
      start,
      end,
      label: dto.startDate === dto.endDate ? dto.startDate : `${dto.startDate} 至 ${dto.endDate}`
    };
  }
  const month = dto.month ?? currentMonth();
  const range = monthRange(month);
  return { ...range, label: month };
}

@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly aiQueue: AiQueueService,
    private readonly openAi: OpenAiService
  ) {}

  async getWorkLogAnalysis(user: CurrentUser, workLogId: string) {
    const workLog = await this.prisma.workLog.findFirst({
      where: { id: workLogId, tenantId: user.tenantId, deletedAt: null },
      include: { user: true, aiAnalysis: true }
    });
    if (!workLog) {
      throw new NotFoundException("Work log not found");
    }
    this.access.assertCanAccessUser(user, workLog.user);
    if (!workLog.aiAnalysis) {
      throw new NotFoundException("AI analysis not ready");
    }
    return workLog.aiAnalysis;
  }

  async retryWorkLogAnalysis(user: CurrentUser, workLogId: string) {
    const workLog = await this.prisma.workLog.findFirst({
      where: { id: workLogId, tenantId: user.tenantId, deletedAt: null },
      include: { user: true }
    });
    if (!workLog) {
      throw new NotFoundException("Work log not found");
    }
    this.access.assertCanAccessUser(user, workLog.user);
    return this.aiQueue.enqueueWorkLogAnalysis(user.tenantId, workLogId, user.id);
  }

  async chatCalendar(user: CurrentUser, dto: CalendarChatDto) {
    const period = calendarChatPeriod(dto);
    const scope = this.access.resolveScope(user, dto.scope, dto.departmentId);
    const department = scope.departmentId
      ? await this.prisma.department.findFirst({
          where: { id: scope.departmentId, tenantId: user.tenantId, deletedAt: null },
          select: { name: true }
        })
      : null;
    const logs = await this.prisma.workLog.findMany({
      where: {
        ...this.access.workLogWhere(user, scope.scope, scope.departmentId),
        date: { gte: period.start, lte: period.end },
        status: WorkLogStatus.SUBMITTED
      },
      include: {
        user: { include: { department: true } },
        project: true,
        aiAnalysis: true
      },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      take: 240
    });
    const today = dateKey(new Date());
    const answer = await this.openAi.chatWithCalendarContext(
      {
        question: dto.question,
        periodLabel: period.label,
        scopeName: this.scopeName(scope.scope, department?.name ?? null, user.name),
        logs: logs.map((log) => {
          const logDate = dateKey(log.date);
          return {
            userName: log.user.name,
            departmentName: log.user.department?.name ?? null,
            projectName: log.project?.name ?? null,
            date: logDate,
            kind: logDate > today ? "计划" : "日报",
            title: log.title,
            content: log.content,
            hours: Number(log.hours),
            analysis: log.aiAnalysis
              ? {
                  achievements: log.aiAnalysis.achievements,
                  risks: log.aiAnalysis.risks,
                  blockers: log.aiAnalysis.blockers,
                  summary: log.aiAnalysis.summary,
                  tags: log.aiAnalysis.tags,
                  keywords: log.aiAnalysis.keywords
                }
              : null
          };
        })
      },
      {
        tenantId: user.tenantId,
        userId: user.id,
        operation: "calendar_chat",
        targetType: "calendar",
        targetId: period.label
      }
    );

    return {
      answer,
      contextCount: logs.length,
      scope,
      period: {
        start: dateKey(period.start),
        end: dateKey(period.end)
      }
    };
  }

  async draftWorkLog(user: CurrentUser, dto: WorkLogDraftDto) {
    const today = dateKey(new Date());
    return this.openAi.draftWorkLog(
      {
        currentDate: dto.currentDate ?? today,
        today,
        messages: dto.messages.slice(-12).map((message) => ({
          role: message.role,
          content: message.content
        }))
      },
      {
        tenantId: user.tenantId,
        userId: user.id,
        operation: "work_log_draft",
        targetType: "work_log"
      }
    );
  }

  private scopeName(scope: string, departmentName: string | null, userName: string) {
    if (scope === "self") return `${userName}个人`;
    if (scope === "department") return departmentName ? `${departmentName}部门` : "本部门";
    return departmentName ? `${departmentName}部门` : "全公司";
  }
}
