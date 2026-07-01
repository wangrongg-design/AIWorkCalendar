import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { WorkLogStatus } from "@prisma/client";
import { AccessService } from "../../common/access/access.service";
import { PrismaService } from "../../common/prisma.service";
import { CurrentUser } from "../../common/types/current-user";
import { AiQueueService } from "./ai-queue.service";
import { CalendarChatDto } from "./dto/calendar-chat.dto";
import { ProjectChatDto } from "./dto/project-chat.dto";
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

  async chatProject(user: CurrentUser, dto: ProjectChatDto) {
    const project = await this.prisma.project.findFirst({
      where: { id: dto.projectId, tenantId: user.tenantId, deletedAt: null },
      include: { owner: true }
    });
    if (!project) {
      throw new NotFoundException("Project not found");
    }

    const period = this.projectChatPeriod(dto);
    const logs = await this.prisma.workLog.findMany({
      where: {
        ...this.access.workLogWhere(user),
        projectId: project.id,
        date: { gte: period.start, lte: period.end },
        status: WorkLogStatus.SUBMITTED
      },
      include: {
        user: { include: { department: true } },
        project: true,
        aiAnalysis: true
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 120
    });

    const today = dateKey(new Date());
    const answer = await this.openAi.chatWithCalendarContext(
      {
        question: this.projectChatQuestion(dto.question),
        periodLabel: period.label,
        scopeName: `${project.name}项目`,
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
        operation: "project_chat",
        targetType: "project",
        targetId: project.id
      }
    );
    const sources = this.projectChatSources(logs);

    return {
      answer: this.formatProjectChatAnswer(answer, sources, period.label),
      contextCount: logs.length,
      project: {
        id: project.id,
        name: project.name,
        code: project.code,
        ownerName: project.owner?.name ?? null
      },
      period: {
        start: dateKey(period.start),
        end: dateKey(period.end)
      },
      sources
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

  private projectChatPeriod(dto: ProjectChatDto) {
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
        throw new BadRequestException(`项目 AI 助手单次分析范围最多支持 ${maxCalendarChatRangeDays} 天`);
      }
      return {
        start,
        end,
        label: dto.startDate === dto.endDate ? dto.startDate : `${dto.startDate} 至 ${dto.endDate}`
      };
    }
    const end = parseDateOnly(dateKey(new Date()));
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 29);
    return { start, end, label: "最近 30 天" };
  }

  private projectChatQuestion(question: string) {
    return `${question.trim()}\n\n请按以下结构回答：\n结论：一句话判断当前项目状态。\n依据：列出相关来源日报，必须包含日期、人员、标题或关键证据。\n建议动作：给出 2-4 条可执行动作。\n来源：说明来源日报数量和时间范围。上下文不足时直接说明，不要编造。`;
  }

  private formatProjectChatAnswer(
    answer: string,
    sources: Array<{ date: string; userName: string; title: string; evidence: string; riskCount: number; blockerCount: number }>,
    periodLabel: string
  ) {
    if (/结论[:：]/.test(answer) && /依据[:：]/.test(answer) && /建议动作[:：]/.test(answer)) {
      return answer;
    }
    if (!sources.length) {
      return `结论：当前项目暂无可用于分析的来源日报。\n\n依据：${periodLabel} 内没有可引用的项目日报。\n\n建议动作：\n1. 先关联项目日报或扩大时间范围。\n2. 成员提交日报时确认项目归属。\n\n来源：\n- 来源日报 0 条\n- 时间范围 ${periodLabel}`;
    }
    const sourceLines = sources
      .slice(0, 4)
      .map((source) => `- ${source.date} ${source.userName}：${source.title}。${source.evidence}`)
      .join("\n");
    const riskTotal = sources.reduce((sum, source) => sum + source.riskCount + source.blockerCount, 0);
    const conclusion = answer.split("\n").find((line) => line.trim())?.trim() ?? `${periodLabel} 当前项目已有 ${sources.length} 条来源日报。`;
    const actions = riskTotal
      ? ["1. 优先确认风险/阻塞负责人和处理时间。", "2. 周会前复核相关来源日报，补齐下一步动作。", "3. 如需对外同步，可生成项目周报。"]
      : ["1. 继续保持日报按项目归属。", "2. 周会前复核关键进展。", "3. 如需对外同步，可生成项目周报。"];
    return `结论：${conclusion}\n\n依据：\n${sourceLines}\n\n建议动作：\n${actions.join("\n")}\n\n来源：\n- 来源日报 ${sources.length} 条\n- 时间范围 ${periodLabel}`;
  }

  private projectChatSources(
    logs: Array<{
      id: string;
      date: Date;
      title: string;
      content: string;
      hours: unknown;
      user: { name: string; department?: { name: string } | null };
      aiAnalysis?: { summary?: string | null; risks?: unknown; blockers?: unknown; achievements?: unknown } | null;
    }>
  ) {
    return logs.slice(0, 8).map((log) => ({
      id: log.id,
      date: dateKey(log.date),
      title: log.title,
      userName: log.user.name,
      departmentName: log.user.department?.name ?? null,
      hours: Number(log.hours ?? 0),
      evidence: log.aiAnalysis?.summary || log.content.slice(0, 120),
      riskCount: Array.isArray(log.aiAnalysis?.risks) ? log.aiAnalysis?.risks.length : 0,
      blockerCount: Array.isArray(log.aiAnalysis?.blockers) ? log.aiAnalysis?.blockers.length : 0
    }));
  }
}
