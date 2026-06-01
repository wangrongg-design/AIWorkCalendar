import { Injectable, Logger } from "@nestjs/common";
import OpenAI from "openai";
import { AuditService } from "../../common/audit/audit.service";
import { PrismaService } from "../../common/prisma.service";
import { AiRedactionService, AiRedactionStats } from "./ai-redaction.service";
import { CALENDAR_CHAT_SYSTEM_PROMPT, REPORT_GENERATION_SYSTEM_PROMPT, WORK_LOG_ANALYSIS_SYSTEM_PROMPT, WORK_LOG_DRAFT_SYSTEM_PROMPT } from "./prompts";
import {
  reportJsonSchema,
  ReportResult,
  workLogAnalysisJsonSchema,
  WorkLogAnalysisResult,
  workLogDraftJsonSchema,
  WorkLogDraftItem,
  WorkLogDraftResult
} from "./schemas/analysis.schema";

type AiProvider = "mock" | "openai" | "deepseek";

type AiCallContext = {
  tenantId: string;
  userId?: string | null;
  operation: "work_log_analysis" | "report_generation" | "calendar_chat" | "work_log_draft";
  targetType?: string;
  targetId?: string | null;
  containsAttachments?: boolean;
  containsImages?: boolean;
};

type ReportInput = {
  reportType: string;
  periodStart: string;
  periodEnd: string;
  scopeName: string;
  workLogs: Array<{
    userName: string;
    projectName?: string | null;
    date: string;
    title: string;
    content: string;
    hours: number;
    attachments?: WorkLogAttachmentInput[];
    analysis?: {
      achievements?: unknown;
      risks?: unknown;
      blockers?: unknown;
      summary?: string;
    } | null;
  }>;
};

type CalendarChatInput = {
  question: string;
  periodLabel: string;
  scopeName: string;
  logs: Array<{
    userName: string;
    departmentName?: string | null;
    projectName?: string | null;
    date: string;
    kind: "日报" | "计划";
    title: string;
    content: string;
    hours: number;
    analysis?: {
      achievements?: unknown;
      risks?: unknown;
      blockers?: unknown;
      summary?: string;
      tags?: unknown;
      keywords?: unknown;
    } | null;
  }>;
};

type DraftWorkLogInput = {
  currentDate: string;
  messages: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
};

type DraftTiming = {
  startTime: string;
  endTime: string;
  hours: number;
};

type WorkLogAttachmentInput = {
  fileName: string;
  mimeType: string;
  kind: "IMAGE" | "FILE";
  fileSize: number;
  textContent?: string | null;
  aiSummary?: string | null;
  dataUrl?: string | null;
};

type WorkLogAnalysisInput = {
  title: string;
  content: string;
  date: Date;
  hours: number;
  startTime?: Date | null;
  endTime?: Date | null;
  attachments?: WorkLogAttachmentInput[];
};

type OpenAiWorkLogContent =
  | string
  | Array<
      | { type: "input_text"; text: string }
      | { type: "input_image"; image_url: string; detail: "low" | "high" | "auto" }
    >;

@Injectable()
export class OpenAiService {
  private readonly logger = new Logger(OpenAiService.name);
  private readonly provider: AiProvider;
  private readonly openAiClient: OpenAI | null;
  private readonly deepSeekClient: OpenAI | null;

  constructor(
    private readonly redaction: AiRedactionService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {
    this.provider = this.resolveProvider();
    this.openAiClient = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
    this.deepSeekClient = process.env.DEEPSEEK_API_KEY
      ? new OpenAI({
          apiKey: process.env.DEEPSEEK_API_KEY,
          baseURL: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com"
        })
      : null;
  }

  async analyzeWorkLog(input: WorkLogAnalysisInput, context?: AiCallContext): Promise<WorkLogAnalysisResult> {
    const safe = this.redaction.buildSafeAiPayload(input);
    const activeProvider = this.activeProvider();
    let result: WorkLogAnalysisResult;
    if (this.provider === "deepseek" && this.deepSeekClient) {
      result = await this.analyzeWorkLogWithDeepSeek(safe.payload);
    } else if (this.provider === "openai" && this.openAiClient) {
      result = await this.analyzeWorkLogWithOpenAi(safe.payload);
    } else {
      if (this.provider !== "mock") {
        this.logger.warn(`${this.provider} provider is selected but API key is missing. Falling back to mock AI.`);
      }
      result = this.localWorkLogAnalysis(input);
    }
    await this.logAiCall(context, activeProvider, safe.stats);
    return safe.restore(result);
  }

  async generateReport(input: ReportInput, context?: AiCallContext): Promise<ReportResult> {
    const safe = this.redaction.buildSafeAiPayload(input);
    const activeProvider = this.activeProvider();
    let result: ReportResult;
    if (this.provider === "deepseek" && this.deepSeekClient) {
      result = await this.generateReportWithDeepSeek(safe.payload);
    } else if (this.provider === "openai" && this.openAiClient) {
      result = await this.generateReportWithOpenAi(safe.payload);
    } else {
      if (this.provider !== "mock") {
        this.logger.warn(`${this.provider} provider is selected but API key is missing. Falling back to mock AI.`);
      }
      result = this.localReport(input);
    }
    await this.logAiCall(context, activeProvider, safe.stats);
    return safe.restore(result);
  }

  async chatWithCalendarContext(input: CalendarChatInput, context?: AiCallContext): Promise<string> {
    const safe = this.redaction.buildSafeAiPayload(this.compactCalendarChatInput(input));
    const activeProvider = this.activeProvider();
    let result: string;
    if (this.provider === "deepseek" && this.deepSeekClient) {
      result = await this.chatWithCalendarContextDeepSeek(safe.payload);
    } else if (this.provider === "openai" && this.openAiClient) {
      result = await this.chatWithCalendarContextOpenAi(safe.payload);
    } else {
      if (this.provider !== "mock") {
        this.logger.warn(`${this.provider} provider is selected but API key is missing. Falling back to mock AI.`);
      }
      result = this.localCalendarChat(input);
    }
    await this.logAiCall(context, activeProvider, safe.stats);
    return safe.restore(result);
  }

  async draftWorkLog(input: DraftWorkLogInput, context?: AiCallContext): Promise<WorkLogDraftResult> {
    const safe = this.redaction.buildSafeAiPayload(input);
    const activeProvider = this.activeProvider();
    let result: WorkLogDraftResult;
    if (this.provider === "deepseek" && this.deepSeekClient) {
      result = this.normalizeDraft(await this.draftWorkLogWithDeepSeek(safe.payload), input);
    } else if (this.provider === "openai" && this.openAiClient) {
      result = this.normalizeDraft(await this.draftWorkLogWithOpenAi(safe.payload), input);
    } else {
      if (this.provider !== "mock") {
        this.logger.warn(`${this.provider} provider is selected but API key is missing. Falling back to mock AI.`);
      }
      result = this.localWorkLogDraft(input);
    }
    await this.logAiCall(context, activeProvider, safe.stats);
    return safe.restore(result);
  }

  private resolveProvider(): AiProvider {
    const requested = process.env.AI_PROVIDER?.toLowerCase();
    if (requested === "openai" || requested === "deepseek" || requested === "mock") {
      return requested;
    }
    if (process.env.DEEPSEEK_API_KEY) {
      return "deepseek";
    }
    if (process.env.OPENAI_API_KEY) {
      return "openai";
    }
    return "mock";
  }

  private activeProvider(): AiProvider {
    if (this.provider === "deepseek" && this.deepSeekClient) return "deepseek";
    if (this.provider === "openai" && this.openAiClient) return "openai";
    return "mock";
  }

  private modelName(provider: AiProvider) {
    if (provider === "openai") return process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
    if (provider === "deepseek") return process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash";
    return "local-mock";
  }

  private async logAiCall(context: AiCallContext | undefined, provider: AiProvider, redaction: AiRedactionStats) {
    if (!context?.tenantId) return;
    const metadata = {
      targetType: context.targetType ?? null,
      targetId: context.targetId ?? null,
      redaction,
      containsAttachments: Boolean(context.containsAttachments),
      containsImages: Boolean(context.containsImages),
      zeroDataRetentionRequired: process.env.AI_ZDR_REQUIRED === "true"
    };
    try {
      await this.prisma.aiUsageLog.create({
        data: {
          tenantId: context.tenantId,
          userId: context.userId ?? null,
          provider,
          model: this.modelName(provider),
          operation: context.operation,
          metadata
        }
      });
      await this.audit.log({
        tenantId: context.tenantId,
        actorUserId: context.userId ?? null,
        action: "AI_CALL",
        targetType: context.targetType ?? null,
        targetId: context.targetId ?? null,
        metadata: {
          operation: context.operation,
          provider,
          model: this.modelName(provider),
          redactedFields: redaction.total,
          redactionByKind: redaction.byKind,
          containsAttachments: Boolean(context.containsAttachments),
          containsImages: Boolean(context.containsImages),
          removedImages: redaction.removedImages
        }
      });
    } catch (error) {
      this.logger.warn(`AI usage log write failed: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  private async analyzeWorkLogWithOpenAi(input: WorkLogAnalysisInput): Promise<WorkLogAnalysisResult> {
    if (!this.openAiClient) {
      return this.localWorkLogAnalysis(input);
    }

    const response = await this.openAiClient.responses.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content: WORK_LOG_ANALYSIS_SYSTEM_PROMPT
        },
        {
          role: "user",
          content: this.workLogAnalysisContent(input)
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "work_log_analysis",
          strict: true,
          schema: workLogAnalysisJsonSchema as Record<string, unknown>
        }
      }
    });

    return this.parseStructuredOutput<WorkLogAnalysisResult>(response);
  }

  private async generateReportWithOpenAi(input: ReportInput): Promise<ReportResult> {
    if (!this.openAiClient) {
      return this.localReport(input);
    }

    const response = await this.openAiClient.responses.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content: REPORT_GENERATION_SYSTEM_PROMPT
        },
        {
          role: "user",
          content: JSON.stringify(input)
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "work_report",
          strict: true,
          schema: reportJsonSchema as Record<string, unknown>
        }
      }
    });

    return this.parseStructuredOutput<ReportResult>(response);
  }

  private async chatWithCalendarContextOpenAi(input: CalendarChatInput): Promise<string> {
    if (!this.openAiClient) {
      return this.localCalendarChat(input);
    }

    const response = await this.openAiClient.responses.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content: CALENDAR_CHAT_SYSTEM_PROMPT
        },
        {
          role: "user",
          content: JSON.stringify(this.compactCalendarChatInput(input))
        }
      ]
    });

    return this.extractTextOutput(response);
  }

  private async draftWorkLogWithOpenAi(input: DraftWorkLogInput): Promise<WorkLogDraftResult> {
    if (!this.openAiClient) {
      return this.localWorkLogDraft(input);
    }
    const response = await this.openAiClient.responses.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content: WORK_LOG_DRAFT_SYSTEM_PROMPT
        },
        {
          role: "user",
          content: JSON.stringify(input)
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "work_log_draft",
          strict: true,
          schema: workLogDraftJsonSchema as Record<string, unknown>
        }
      }
    });
    return this.parseStructuredOutput<WorkLogDraftResult>(response);
  }

  private async analyzeWorkLogWithDeepSeek(input: WorkLogAnalysisInput): Promise<WorkLogAnalysisResult> {
    if (!this.deepSeekClient) {
      return this.localWorkLogAnalysis(input);
    }
    const completion = await this.deepSeekClient.chat.completions.create({
      model: process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash",
      messages: [
        {
          role: "system",
          content: this.deepSeekJsonPrompt("work_log_analysis", WORK_LOG_ANALYSIS_SYSTEM_PROMPT, workLogAnalysisJsonSchema)
        },
        {
          role: "user",
          content: JSON.stringify(this.compactWorkLogAnalysisInput(input))
        }
      ],
      response_format: { type: "json_object" },
      stream: false
    });
    return this.parseJsonText<WorkLogAnalysisResult>(completion.choices[0]?.message?.content);
  }

  private async generateReportWithDeepSeek(input: ReportInput): Promise<ReportResult> {
    if (!this.deepSeekClient) {
      return this.localReport(input);
    }
    const completion = await this.deepSeekClient.chat.completions.create({
      model: process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash",
      messages: [
        {
          role: "system",
          content: this.deepSeekJsonPrompt("work_report", REPORT_GENERATION_SYSTEM_PROMPT, reportJsonSchema)
        },
        {
          role: "user",
          content: JSON.stringify(input)
        }
      ],
      response_format: { type: "json_object" },
      stream: false
    });
    return this.parseJsonText<ReportResult>(completion.choices[0]?.message?.content);
  }

  private async chatWithCalendarContextDeepSeek(input: CalendarChatInput): Promise<string> {
    if (!this.deepSeekClient) {
      return this.localCalendarChat(input);
    }
    const completion = await this.deepSeekClient.chat.completions.create({
      model: process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash",
      messages: [
        {
          role: "system",
          content: CALENDAR_CHAT_SYSTEM_PROMPT
        },
        {
          role: "user",
          content: JSON.stringify(this.compactCalendarChatInput(input))
        }
      ],
      stream: false
    });
    return completion.choices[0]?.message?.content?.trim() || "没有生成可用回答。";
  }

  private async draftWorkLogWithDeepSeek(input: DraftWorkLogInput): Promise<WorkLogDraftResult> {
    if (!this.deepSeekClient) {
      return this.localWorkLogDraft(input);
    }
    const completion = await this.deepSeekClient.chat.completions.create({
      model: process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash",
      messages: [
        {
          role: "system",
          content: this.deepSeekJsonPrompt("work_log_draft", WORK_LOG_DRAFT_SYSTEM_PROMPT, workLogDraftJsonSchema)
        },
        {
          role: "user",
          content: JSON.stringify(input)
        }
      ],
      response_format: { type: "json_object" },
      stream: false
    });
    return this.parseJsonText<WorkLogDraftResult>(completion.choices[0]?.message?.content);
  }

  private compactCalendarChatInput(input: CalendarChatInput): CalendarChatInput {
    return {
      ...input,
      logs: input.logs.slice(0, 120).map((log) => ({
        ...log,
        content: log.content.length > 800 ? `${log.content.slice(0, 800)}...` : log.content
      }))
    };
  }

  private deepSeekJsonPrompt(name: string, prompt: string, schema: unknown) {
    return [
      prompt,
      "你必须只输出一个合法 JSON 对象，不要输出 Markdown、代码块、解释文字或额外字段。",
      `JSON 对象名称：${name}`,
      `JSON 字段结构必须符合：${JSON.stringify(schema)}`
    ].join("\n");
  }

  private parseStructuredOutput<T>(response: unknown): T {
    const typed = response as { output_parsed?: T; output_text?: string };
    if (typed.output_parsed) {
      return typed.output_parsed;
    }
    if (typed.output_text) {
      return JSON.parse(typed.output_text) as T;
    }
    this.logger.warn("OpenAI response did not expose output_text; falling back to JSON scan.");
    const serialized = JSON.stringify(response);
    const firstBrace = serialized.indexOf("{");
    const lastBrace = serialized.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(serialized.slice(firstBrace, lastBrace + 1)) as T;
    }
    throw new Error("Unable to parse OpenAI structured output");
  }

  private parseJsonText<T>(content: string | null | undefined): T {
    if (!content?.trim()) {
      throw new Error("AI provider returned empty JSON content");
    }
    try {
      return JSON.parse(content) as T;
    } catch {
      const firstBrace = content.indexOf("{");
      const lastBrace = content.lastIndexOf("}");
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        return JSON.parse(content.slice(firstBrace, lastBrace + 1)) as T;
      }
      throw new Error("Unable to parse AI JSON output");
    }
  }

  private extractTextOutput(response: unknown): string {
    const typed = response as { output_text?: string };
    if (typed.output_text?.trim()) {
      return typed.output_text.trim();
    }
    const serialized = JSON.stringify(response);
    return serialized.length > 0 ? serialized.slice(0, 1200) : "没有生成可用回答。";
  }

  private workLogAnalysisContent(input: WorkLogAnalysisInput): OpenAiWorkLogContent {
    const payload = this.compactWorkLogAnalysisInput(input);
    const images = (input.attachments ?? []).filter((attachment) => attachment.kind === "IMAGE" && attachment.dataUrl).slice(0, 6);
    if (!images.length) {
      return JSON.stringify(payload);
    }
    return [
      { type: "input_text", text: JSON.stringify(payload) },
      ...images.map((attachment) => ({
        type: "input_image" as const,
        image_url: attachment.dataUrl as string,
        detail: "low" as const
      }))
    ];
  }

  private compactWorkLogAnalysisInput(input: WorkLogAnalysisInput) {
    return {
      title: input.title,
      content: input.content,
      date: input.date.toISOString().slice(0, 10),
      hours: input.hours,
      startTime: input.startTime?.toISOString() ?? null,
      endTime: input.endTime?.toISOString() ?? null,
      attachments: (input.attachments ?? []).map((attachment, index) => ({
        imageRef: attachment.kind === "IMAGE" && attachment.dataUrl ? `image-${index + 1}` : null,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        kind: attachment.kind,
        fileSize: attachment.fileSize,
        textContent: attachment.textContent ?? null,
        aiSummary: attachment.aiSummary ?? null
      }))
    };
  }

  private localWorkLogAnalysis(input: WorkLogAnalysisInput): WorkLogAnalysisResult {
    const attachmentText = (input.attachments ?? [])
      .map((attachment) => [attachment.fileName, attachment.aiSummary, attachment.textContent].filter(Boolean).join(" "))
      .join(" ");
    const text = `${input.title} ${input.content} ${attachmentText}`;
    const hasRisk = /风险|延迟|问题|阻塞|blocked|risk/i.test(text);
    const hasBlocker = /阻塞|卡住|依赖|blocked/i.test(text);
    const hasAttachments = Boolean(input.attachments?.length);
    const hasImages = Boolean(input.attachments?.some((attachment) => attachment.kind === "IMAGE"));
    const keywords = Array.from(
      new Set(
        text
          .replace(/[，。！？、,.!?]/g, " ")
          .split(/\s+/)
          .filter((item) => item.length >= 2)
          .slice(0, 6)
      )
    );
    return {
      category: /客户|销售|合同/.test(text) ? "客户与销售" : /设计|需求|产品/.test(text) ? "产品规划" : "研发交付",
      achievements: [input.title],
      risks: hasRisk ? ["填报内容中提到风险、延迟或问题，需要管理者关注。"] : [],
      blockers: hasBlocker ? ["填报内容中提到阻塞或外部依赖。"] : [],
      keywords,
      tags: ["自动分析", input.hours > 8 ? "工时偏高" : "常规工时", hasAttachments ? "含附件" : null, hasImages ? "含图片" : null].filter(
        Boolean
      ) as string[],
      timeReasonableness: input.hours > 10 ? "工时偏高，建议确认是否拆分记录。" : "工时与填报内容基本匹配。",
      summary: `${input.content.length > 80 ? `${input.content.slice(0, 80)}...` : input.content}${
        hasAttachments ? `（含 ${input.attachments?.length ?? 0} 个附件）` : ""
      }`
    };
  }

  private localWorkLogDraft(input: DraftWorkLogInput): WorkLogDraftResult {
    const userText = input.messages
      .filter((message) => message.role === "user")
      .map((message) => message.content)
      .join("\n")
      .trim();
    const items = this.inferDraftItems(userText, input.currentDate);
    const first = items[0];
    return {
      ...first,
      assistantMessage:
        items.length > 1
          ? `已识别 ${items.length} 条可填报日程。`
          : `${first.kind === "PLAN" ? "已整理为计划" : "已整理为日报"}：${first.date}，${first.hours} 小时。`,
      items
    };
  }

  private inferDraftItems(text: string, currentDate: string): WorkLogDraftItem[] {
    const content = text.trim();
    if (!content) {
      return [this.buildDraftItem("请补充工作内容。", currentDate, undefined, true)];
    }
    const globalDate = this.inferDraftDate(content, currentDate);

    const ranges = Array.from(content.matchAll(this.timeRangePattern()));
    if (ranges.length) {
      const items = this.splitDraftClauses(content, true).flatMap((clause) => {
        const clauseRanges = Array.from(clause.matchAll(this.timeRangePattern()));
        if (!clauseRanges.length) {
          return [this.applyGlobalDraftDate(this.buildDraftItem(clause, currentDate), clause, globalDate, currentDate)];
        }
        return clauseRanges.map((match, index) => {
          const start = match.index ?? 0;
          const end = start + match[0].length;
          const nextStart = clauseRanges[index + 1]?.index;
          const segment = this.rangeSegment(clause, start, end, nextStart);
          return this.applyGlobalDraftDate(this.buildDraftItem(segment, currentDate, this.parseDraftTimeRange(match)), segment, globalDate, currentDate);
        });
      });
      return items.length ? items : [this.buildDraftItem(content, currentDate)];
    }

    const clauses = this.splitDraftClauses(content);
    const hourClauses = clauses.filter((item) => /(\d+(?:\.\d+)?)\s*(?:小时|个?工时|h|H)/.test(item));
    if (hourClauses.length > 1) {
      return hourClauses.map((item) => this.applyGlobalDraftDate(this.buildDraftItem(item, currentDate), item, globalDate, currentDate));
    }
    if (clauses.length > 1) {
      return clauses.map((item) => this.applyGlobalDraftDate(this.buildDraftItem(item, currentDate), item, globalDate, currentDate));
    }

    return [this.buildDraftItem(content, currentDate)];
  }

  private splitDraftClauses(text: string, includeSoftSeparators = false) {
    const separator = includeSoftSeparators ? /[，,。；;\n]+/ : /[。；;\n]+/;
    return text
      .split(separator)
      .map((item) => item.trim())
      .filter((item) => item && this.hasDraftClauseContent(item));
  }

  private hasDraftClauseContent(text: string) {
    const cleaned = text
      .replace(this.timeRangePattern(), " ")
      .replace(/(\d+(?:\.\d+)?)\s*(?:小时|个?工时|h|H)/g, " ")
      .replace(/今天|昨天|明天|后天|计划|日报|工时|小时|上午|下午|晚上|中午|凌晨|早上/g, "")
      .replace(/[，。！？、,.!?]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return cleaned.length > 0;
  }

  private buildDraftItem(text: string, currentDate: string, timing?: DraftTiming, missingContent = false): WorkLogDraftItem {
    const date = this.inferDraftDate(text, currentDate);
    const hoursMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:小时|个?工时|h|H)/);
    const hours = timing?.hours ?? (hoursMatch ? Math.min(Math.max(Number(hoursMatch[1]), 0), 24) : 1);
    const title = this.inferDraftTitle(text);
    const missingFields = [
      missingContent ? "content" : null,
      timing || hoursMatch ? null : "hours"
    ].filter(Boolean) as string[];
    const kind = date > currentDate || /计划|明天|后天|下周|下个月|安排/.test(text) ? "PLAN" : "DAILY";
    return {
      date,
      kind,
      title,
      content: this.inferDraftContent(text) || text || "请补充工作内容。",
      hours,
      startTime: timing?.startTime ?? null,
      endTime: timing?.endTime ?? null,
      confidence: missingFields.length ? 0.72 : 0.9,
      missingFields
    };
  }

  private timeRangePattern() {
    return /(?:(上午|下午|晚上|中午|凌晨|早上)\s*)?(\d{1,2})(?:(?:[:：])(\d{1,2})|[点时](\d{0,2})?)\s*(?:到|至|-|—|~)\s*(?:(上午|下午|晚上|中午|凌晨|早上)\s*)?(\d{1,2})(?:(?:[:：])(\d{1,2})|[点时](\d{0,2})?)/g;
  }

  private rangeSegment(text: string, start: number, end: number, nextStart?: number) {
    const separators = "，,。；;\n";
    let left = 0;
    for (let index = start - 1; index >= 0; index -= 1) {
      if (separators.includes(text[index])) {
        left = index + 1;
        break;
      }
    }
    let right = nextStart ?? text.length;
    for (let index = end; index < right; index += 1) {
      if (separators.includes(text[index])) {
        right = index;
        break;
      }
    }
    return text.slice(left, right).trim() || text;
  }

  private parseDraftTimeRange(match: RegExpMatchArray): DraftTiming {
    const start = this.normalizeDraftClock(match[1], Number(match[2]), Number(match[3] || match[4] || 0));
    const end = this.normalizeDraftClock(match[5] || match[1], Number(match[6]), Number(match[7] || match[8] || 0));
    let minutes = end.hour * 60 + end.minute - (start.hour * 60 + start.minute);
    if (minutes <= 0) minutes += 24 * 60;
    return {
      startTime: this.formatDraftClock(start.hour, start.minute),
      endTime: this.formatDraftClock(end.hour, end.minute),
      hours: Number((minutes / 60).toFixed(2))
    };
  }

  private normalizeDraftClock(period: string | undefined, hourValue: number, minuteValue: number) {
    let hour = hourValue;
    const minute = minuteValue;
    if ((period === "下午" || period === "晚上") && hour < 12) hour += 12;
    if (period === "中午" && hour < 11) hour += 12;
    if (period === "凌晨" && hour === 12) hour = 0;
    return { hour: Math.min(Math.max(hour, 0), 23), minute: Math.min(Math.max(minute, 0), 59) };
  }

  private formatDraftClock(hour: number, minute: number) {
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  private applyGlobalDraftDate(item: WorkLogDraftItem, text: string, globalDate: string, currentDate: string): WorkLogDraftItem {
    if (globalDate === currentDate || this.hasDraftDateHint(text)) return item;
    return {
      ...item,
      date: globalDate,
      kind: globalDate > currentDate ? "PLAN" : "DAILY"
    };
  }

  private hasDraftDateHint(text: string) {
    return /今天|昨天|明天|后天|20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}|\d{1,2}月\d{1,2}[日号]?/.test(text);
  }

  private inferDraftDate(text: string, currentDate: string) {
    const current = new Date(`${currentDate}T00:00:00.000Z`);
    if (/后天/.test(text)) return this.offsetDateKey(current, 2);
    if (/明天/.test(text)) return this.offsetDateKey(current, 1);
    if (/昨天/.test(text)) return this.offsetDateKey(current, -1);
    const iso = text.match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
    if (iso) {
      return `${iso[1]}-${String(Number(iso[2])).padStart(2, "0")}-${String(Number(iso[3])).padStart(2, "0")}`;
    }
    const monthDay = text.match(/(\d{1,2})月(\d{1,2})[日号]?/);
    if (monthDay) {
      const year = current.getUTCFullYear();
      return `${year}-${String(Number(monthDay[1])).padStart(2, "0")}-${String(Number(monthDay[2])).padStart(2, "0")}`;
    }
    return currentDate;
  }

  private offsetDateKey(date: Date, days: number) {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next.toISOString().slice(0, 10);
  }

  private inferDraftTitle(text: string) {
    const cleaned = text
      .replace(this.timeRangePattern(), " ")
      .replace(/(\d+(?:\.\d+)?)\s*(?:小时|个?工时|h|H)/g, " ")
      .replace(/今天|昨天|明天|后天|计划|日报|工时|小时|上午|下午|晚上|中午|凌晨|早上/g, "")
      .replace(/[，。！？、,.!?]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned) return "工作填报";
    return cleaned.length > 24 ? `${cleaned.slice(0, 24)}...` : cleaned;
  }

  private inferDraftContent(text: string) {
    const cleaned = text
      .replace(this.timeRangePattern(), " ")
      .replace(/(\d+(?:\.\d+)?)\s*(?:小时|个?工时|h|H)/g, " ")
      .replace(/今天|昨天|明天|后天|计划|日报|工时/g, " ")
      .replace(/[，。！？、,.!?]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return cleaned ? `${cleaned.replace(/[。.]$/, "")}。` : "";
  }

  private normalizeDraft(result: WorkLogDraftResult, input: DraftWorkLogInput): WorkLogDraftResult {
    const fallback = this.localWorkLogDraft(input);
    const sourceItems = Array.isArray(result.items) && result.items.length ? result.items : [result];
    const items = sourceItems.map((item, index) => this.normalizeDraftItem(item, fallback.items[index] ?? fallback.items[0]));
    const first = items[0] ?? fallback.items[0];
    return {
      ...first,
      assistantMessage: result.assistantMessage?.trim() || fallback.assistantMessage,
      items
    };
  }

  private normalizeDraftItem(result: Partial<WorkLogDraftItem>, fallback: WorkLogDraftItem): WorkLogDraftItem {
    const date = result.date && /^\d{4}-\d{2}-\d{2}$/.test(result.date) ? result.date : fallback.date;
    const hours = Number.isFinite(Number(result.hours)) ? Math.min(Math.max(Number(result.hours), 0), 24) : fallback.hours;
    return {
      date,
      kind: result.kind === "PLAN" ? "PLAN" : "DAILY",
      title: result.title?.trim() || fallback.title,
      content: result.content?.trim() || fallback.content,
      hours,
      startTime: result.startTime ?? fallback.startTime ?? null,
      endTime: result.endTime ?? fallback.endTime ?? null,
      confidence: Number.isFinite(Number(result.confidence)) ? Math.min(Math.max(Number(result.confidence), 0), 1) : fallback.confidence,
      missingFields: Array.isArray(result.missingFields) ? result.missingFields.map(String) : fallback.missingFields
    };
  }

  private localReport(input: ReportInput): ReportResult {
    const totalHours = input.workLogs.reduce((sum, item) => sum + item.hours, 0);
    const byUserMap = new Map<string, number>();
    for (const item of input.workLogs) {
      byUserMap.set(item.userName, (byUserMap.get(item.userName) ?? 0) + item.hours);
    }
    const risks = input.workLogs.flatMap((item) => {
      const value = item.analysis?.risks;
      return Array.isArray(value) ? value.map(String) : [];
    });
    return {
      completed: input.workLogs.map((item) => `${item.userName}: ${item.title}`).slice(0, 20),
      progress: input.workLogs
        .map((item) => {
          const attachmentSummary = item.attachments?.length
            ? ` 附件：${item.attachments.map((attachment) => attachment.aiSummary ?? attachment.fileName).join("；")}`
            : "";
          return `${item.analysis?.summary ?? item.content}${attachmentSummary}`;
        })
        .slice(0, 10),
      risks,
      nextPlan: ["继续推进已提交工作中的后续事项。"],
      hours: {
        total: Number(totalHours.toFixed(2)),
        byUser: Array.from(byUserMap.entries()).map(([userName, hours]) => ({ userName, hours: Number(hours.toFixed(2)) }))
      },
      summary: `${input.scopeName} 在 ${input.periodStart} 至 ${input.periodEnd} 共提交 ${input.workLogs.length} 条工作记录。`
    };
  }

  private localCalendarChat(input: CalendarChatInput): string {
    if (input.logs.length === 0) {
      return `${input.periodLabel} 暂无可用于回答的日报或计划。`;
    }
    const lowerQuestion = input.question.toLowerCase();
    const wantsRisk = /风险|问题|阻塞|block|risk/.test(lowerQuestion);
    const wantsPlan = /计划|明天|下周|未来|安排/.test(lowerQuestion);
    const wantsHours = /工时|小时|投入|耗时/.test(lowerQuestion);
    const risks = input.logs.flatMap((log) => (Array.isArray(log.analysis?.risks) ? log.analysis?.risks.map(String) : []));
    const blockers = input.logs.flatMap((log) => (Array.isArray(log.analysis?.blockers) ? log.analysis?.blockers.map(String) : []));
    const plans = input.logs.filter((log) => log.kind === "计划");
    const totalHours = input.logs.reduce((sum, log) => sum + log.hours, 0);
    const highlights = input.logs
      .slice(0, 8)
      .map((log) => `${log.date} ${log.userName}${log.projectName ? ` [${log.projectName}]` : ""}: ${log.title}`);

    if (wantsRisk) {
      const items = [...risks, ...blockers];
      return items.length
        ? `${input.periodLabel} 发现 ${items.length} 条风险/阻塞：\n${items.map((item, index) => `${index + 1}. ${item}`).join("\n")}`
        : `${input.periodLabel} 当前上下文中没有明确风险或阻塞。`;
    }
    if (wantsPlan) {
      return plans.length
        ? `${input.periodLabel} 未来计划主要包括：\n${plans.slice(0, 10).map((log, index) => `${index + 1}. ${log.userName}: ${log.title}`).join("\n")}`
        : `${input.periodLabel} 暂无未来计划记录。`;
    }
    if (wantsHours) {
      return `${input.periodLabel} 共 ${input.logs.length} 条记录，合计 ${Number(totalHours.toFixed(2))} 小时。`;
    }
    return [
      `${input.periodLabel} ${input.scopeName} 共 ${input.logs.length} 条日报/计划，合计 ${Number(totalHours.toFixed(2))} 小时。`,
      highlights.length ? `重点记录：\n${highlights.map((item, index) => `${index + 1}. ${item}`).join("\n")}` : "",
      risks.length ? `需要关注的风险：${risks.slice(0, 5).join("；")}` : "暂未看到明确风险。"
    ]
      .filter(Boolean)
      .join("\n");
  }
}
