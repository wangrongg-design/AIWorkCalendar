"use client";

import { Alert, Button, DatePicker, Input, InputNumber, Select, TimePicker, Tooltip, Upload } from "antd";
import type { UploadProps } from "antd";
import type { UploadFile } from "antd/es/upload/interface";
import dayjs, { Dayjs } from "dayjs";
import { CheckCircle2, ChevronDown, ChevronUp, Trash2, UploadCloud, WandSparkles } from "lucide-react";
import type { ClipboardEvent } from "react";
import { useState } from "react";
import type { Project, WorkLogDraftItem } from "@/lib/types";
import { workLogDurationHours } from "@/lib/work-log-time";

export type DraftComposerMessage = {
  role: "user" | "assistant";
  content: string;
};

export type WorkLogDraftComposerItem = WorkLogDraftItem & {
  localId: string;
  workLogId?: string;
  projectId?: string;
  projectName?: string;
  achievements: string[];
  risks: string[];
  blockers: string[];
  nextActions: string[];
  sourceNote?: string;
  status: "generated" | "editing" | "saving" | "saved" | "submitting" | "submitted" | "failed" | "ignored";
  errorMessage?: string;
  submittedAt?: string;
  projectConfirmed?: boolean;
  selected: boolean;
  expanded?: boolean;
  source?: "AI" | "MANUAL";
};

export type WorkLogDraftComposerState = {
  assistantMessage: string;
  items: WorkLogDraftComposerItem[];
  attachedToFirst: boolean;
  attachmentTargetIndex: number;
};

export type WorkLogSmartSuggestion = {
  type: "quick_reply" | "project" | "split" | "risk" | "none_project";
  label: string;
  value: string | null;
  action: "append_reply" | "select_project" | "confirm_split" | "confirm_single" | "mark_blocker" | "add_next_plan";
  projectId: string | null;
};

export type WorkLogSuggestionAnalysis = {
  status: "idle" | "need_clarification" | "need_split_confirmation" | "ready_to_submit";
  assistantMessage: string;
  qualityScore: number;
  canSubmit: boolean;
  suggestions: WorkLogSmartSuggestion[];
  draftItems: Array<{
    title: string;
    content: string;
    projectId: string | null;
    projectHint: string | null;
    risk: string;
    nextPlan: string;
    hours: number | null;
  }>;
};

type WorkLogDraftComposerProps = {
  aiMessages: DraftComposerMessage[];
  aiInput: string;
  aiPending: boolean;
  aiError?: Error | null;
  onAiInputChange: (value: string) => void;
  onGenerateDraft: (textOverride?: string, intent?: WorkLogDraftComposerIntent, projectId?: string | null) => void;
  onContinuePrompt: () => void;
  smartSuggestions?: WorkLogSmartSuggestion[];
  suggestionsLoading?: boolean;
  suggestionsSlow?: boolean;
  suggestionsUnavailable?: boolean;
  suggestionAnalysis?: WorkLogSuggestionAnalysis | null;
  onSmartSuggestionClick?: (suggestion: WorkLogSmartSuggestion) => void;
  autoSaveStatus?: string;
  restoredNotice?: boolean;
  onResetRestoredDraft?: () => void;
  onAbandonDraft?: () => void;
  draftPreview: WorkLogDraftComposerState | null;
  onUpdateItem: (index: number, patch: Partial<WorkLogDraftComposerItem>) => void;
  onDeleteItem: (index: number) => void;
  onAddManualItem: () => void;
  onAttachmentTargetChange: (index: number) => void;
  onSaveDrafts: () => void;
  onSubmitDrafts: () => void;
  onSubmitItem?: (index: number) => void;
  onIgnoreItem?: (index: number) => void;
  onMergeSelected?: () => void;
  onSplitItem?: (index: number) => void;
  onRegenerateDraft?: () => void;
  onViewSubmittedItem?: (workLogId: string) => void;
  saving: boolean;
  submitting: boolean;
  projectOptions: Array<{ value: string; label: string }>;
  projectNameById: Map<string, string>;
  projectsLoading?: boolean;
  pendingAttachmentCount: number;
  pendingUploadFiles: UploadFile[];
  beforeUploadAttachment: UploadProps["beforeUpload"];
  onRemoveAttachment: NonNullable<UploadProps["onRemove"]>;
  onRetryFailedAttachments?: () => void;
  attachmentRetrying?: boolean;
  onPasteImages: (event: ClipboardEvent<HTMLElement>) => void;
};

export type WorkLogDraftComposerIntent = "analyze" | "split" | "force_single";

export const workLogComposerIntroText = "请描述今日工作内容。系统会判断信息是否完整，并在提交前生成确认摘要。";
export const workLogComposerModalSubtitle = "请描述工作内容，确认摘要后再提交。";
export const workLogComposerPlaceholder = "请描述今日工作内容，例如：完成项目接口联调，并同步研发评估。";

const weekdayLabels = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const draftInputMaxLength = 4000;

function nextDraftLocalId() {
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function workLogDraftDateLabel(value: Dayjs | string | Date | null | undefined) {
  const date = dayjs(value);
  const safeDate = date.isValid() ? date : dayjs();
  return `${safeDate.format("YYYY-MM-DD")} ${weekdayLabels[safeDate.day()]}`;
}

export function createEmptyDraftComposerItem(dateValue: Dayjs | string | Date = dayjs()): WorkLogDraftComposerItem {
  const date = dayjs(dateValue);
  const safeDate = date.isValid() ? date : dayjs();
  const dateKey = safeDate.format("YYYY-MM-DD");
  const kind = dateKey > dayjs().format("YYYY-MM-DD") ? "PLAN" : "DAILY";
  return {
    localId: nextDraftLocalId(),
    date: dateKey,
    kind,
    title: "",
    content: "",
    hours: 0,
    startTime: null,
    endTime: null,
    projectHint: null,
    confidence: 1,
    missingFields: ["title", "content"],
    achievements: [],
    risks: [],
    blockers: [],
    nextActions: [],
    sourceNote: "手动新增",
    status: "editing",
    projectConfirmed: false,
    selected: true,
    expanded: true,
    source: "MANUAL"
  };
}

function normalizeProjectMatchValue(value?: string | null) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

export function projectIdFromDraftHint(projects: Project[] | undefined, hint?: string | null) {
  const normalizedHint = normalizeProjectMatchValue(hint);
  if (normalizedHint.length < 2) return undefined;
  const matched = (projects ?? []).find((project) => {
    const values = [project.code, project.name, project.code ? `${project.code}${project.name}` : project.name].map(normalizeProjectMatchValue);
    return values.some((value) => value && (value === normalizedHint || value.includes(normalizedHint) || normalizedHint.includes(value)));
  });
  return matched?.id;
}

function projectMatchScore(project: Project, source: string) {
  const candidates = [
    { value: project.code, baseScore: 90, minLength: 3 },
    { value: project.name, baseScore: 95, minLength: 4 },
    { value: project.code ? `${project.code}${project.name}` : project.name, baseScore: 100, minLength: 4 }
  ];
  return candidates.reduce((best, candidate) => {
    const normalized = normalizeProjectMatchValue(candidate.value);
    if (normalized.length < candidate.minLength) return best;
    const score = source.includes(normalized)
      ? candidate.baseScore + Math.min(normalized.length, 24)
      : normalized.includes(source) && source.length >= 6
        ? candidate.baseScore - 8 + Math.min(source.length, 20)
        : 0;
    return Math.max(best, score);
  }, 0);
}

export function projectIdFromText(projects: Project[] | undefined, text?: string | null) {
  const source = normalizeProjectMatchValue(text);
  if (source.length < 4) return undefined;
  const matches = (projects ?? [])
    .map((project) => ({ id: project.id, score: projectMatchScore(project, source) }))
    .filter((match) => match.score >= 95)
    .sort((a, b) => b.score - a.score);
  return matches.length === 1 ? matches[0].id : undefined;
}

export function projectIdFromDraftItem(projects: Project[] | undefined, item: WorkLogDraftItem) {
  const hintMatch = projectIdFromDraftHint(projects, item.projectHint);
  if (hintMatch) return hintMatch;
  return projectIdFromText(projects, [item.title, item.content].filter(Boolean).join(" "));
}

export function draftComposerItemFromAi(item: WorkLogDraftItem, index: number, projectId?: string): WorkLogDraftComposerItem {
  const content = item.content || item.title || "请补充工作内容。";
  const missingFields = new Set(item.missingFields ?? []);
  const hours = Number(item.hours);
  if (Number.isFinite(hours) && hours > 0) {
    missingFields.delete("hours");
  } else {
    missingFields.add("hours");
  }
  if (projectId) {
    missingFields.delete("project");
    missingFields.delete("projectId");
    missingFields.delete("projectHint");
  } else {
    missingFields.add("project");
  }
  if (dayjs(item.date).isValid()) missingFields.delete("date");
  if ((item.title || "").trim()) missingFields.delete("title");
  if (content.trim()) missingFields.delete("content");
  return {
    ...item,
    localId: nextDraftLocalId(),
    projectId,
    selected: true,
    expanded: false,
    source: "AI",
    missingFields: Array.from(missingFields),
    projectHint: item.projectHint ?? null,
    title: item.title || `工作项 ${index + 1}`,
    content,
    achievements: item.kind === "PLAN" ? [] : [content],
    risks: [],
    blockers: [],
    nextActions: item.kind === "PLAN" ? [content] : [],
    sourceNote: "由对话内容生成",
    status: "generated",
    projectConfirmed: Boolean(projectId)
  };
}

export function quickFillTitleFromText(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const firstClause = normalized.split(/[。；;，,\n]/)[0]?.trim() || normalized;
  const source = firstClause.length >= 2 ? firstClause : normalized;
  if (!source) return "今日工作记录";
  return source.length > 28 ? `${source.slice(0, 28)}...` : source;
}

function extractDraftHours(text: string) {
  const match = /(\d+(?:\.\d+)?)\s*(?:小时|工时|h|H)/u.exec(text);
  if (!match) return 0;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 && value <= 24 ? value : 0;
}

function inferProjectHintFromText(text: string) {
  const match = /([^\s，,。；;、]{2,48}(?:项目|系统|平台|需求|方案|模块|工程))/u.exec(text);
  const raw = match?.[1]?.trim();
  if (!raw) return null;
  const withoutTime = raw.replace(/^(上午|中午|下午|晚上|晚间|早上|今天|昨天|明天)/u, "");
  const actionParts = withoutTime.split(/沟通|交流|会谈|洽谈|讨论|对接|推进|确认|拜访|跟进|处理/u);
  const candidate = (actionParts[actionParts.length - 1] || withoutTime).replace(/^(与|和|同)/u, "").trim();
  return candidate.length >= 2 ? candidate : raw;
}

function hasWorkSignal(text: string) {
  return /(项目|客户|需求|方案|会议|沟通|交流|对接|确认|推进|讨论|评审|合同|报价|工程|系统|平台|实施|交付|风险|阻塞)/u.test(text);
}

function isNonWorkSocialSegment(text: string) {
  return /(吃饭|用餐|午餐|晚餐|聚餐|喝茶|咖啡|茶歇)/u.test(text) && !hasWorkSignal(text);
}

function splitDraftComposerText(text: string) {
  const content = text.trim();
  if (!content) return [];
  const marked = content
    .replace(/(上午|中午|下午|晚上|晚间|早上)/gu, "\n$1")
    .replace(/[。；;]\s*/g, "\n")
    .replace(/[，,]\s*(?=(上午|中午|下午|晚上|晚间|早上))/gu, "\n")
    .replace(/^\n+/, "");
  const segments = marked
    .split(/\n+/)
    .map((item) => item.replace(/^[，,、。；;\s]+|[，,、。；;\s]+$/g, "").trim())
    .filter(Boolean)
    .filter((item) => !isNonWorkSocialSegment(item));
  const meaningful = segments.filter((item) => item.replace(/\s+/g, "").length >= 6 && hasWorkSignal(item));
  return meaningful.length >= 2 ? meaningful : [content];
}

function createDraftComposerItemFromText({
  content,
  date,
  projects,
  projectId,
  index
}: {
  content: string;
  date: Dayjs | string | Date;
  projects?: Project[];
  projectId?: string | null;
  index: number;
}): WorkLogDraftComposerItem {
  const safeDate = dayjs(date).isValid() ? dayjs(date) : dayjs();
  const dateKey = safeDate.format("YYYY-MM-DD");
  const kind = dateKey > dayjs().format("YYYY-MM-DD") ? "PLAN" : "DAILY";
  const matchedProjectId = projectId === null ? undefined : projectId || projectIdFromText(projects, content);
  const matchedProject = matchedProjectId ? projects?.find((project) => project.id === matchedProjectId) : undefined;
  const projectHint = projectId === null ? null : matchedProject?.name ?? inferProjectHintFromText(content);
  const hours = extractDraftHours(content);
  return {
    localId: nextDraftLocalId(),
    date: dateKey,
    kind,
    title: quickFillTitleFromText(content) || `工作项 ${index + 1}`,
    content,
    hours,
    startTime: null,
    endTime: null,
    projectHint,
    confidence: matchedProject ? 0.86 : 0.78,
    missingFields: [],
    achievements: [],
    risks: /风险|阻塞|卡住|延期|无法推进|等反馈|待反馈/u.test(content) ? [content] : [],
    blockers: /阻塞|卡住|无法推进/u.test(content) ? [content] : [],
    nextActions: /待|需要|继续|下一步|计划/u.test(content) ? [content] : [],
    sourceNote: "由对话内容整理",
    status: "generated",
    projectId: matchedProjectId,
    projectName: matchedProject?.name,
    projectConfirmed: Boolean(matchedProjectId || projectId === null),
    selected: true,
    expanded: false,
    source: "AI"
  };
}

export function createDraftComposerPreviewFromText({
  text,
  date,
  projects,
  projectId
}: {
  text: string;
  date: Dayjs | string | Date;
  projects?: Project[];
  projectId?: string | null;
}): WorkLogDraftComposerState {
  const content = text.trim();
  const segments = splitDraftComposerText(content).slice(0, 6);
  return {
    assistantMessage: segments.length > 1 ? `已按 ${segments.length} 条工作整理为提交摘要。` : "内容已整理为提交摘要。",
    items: segments.map((segment, index) => createDraftComposerItemFromText({ content: segment, date, projects, projectId, index })),
    attachedToFirst: false,
    attachmentTargetIndex: 0
  };
}

export function createDraftComposerPreviewFromSuggestion({
  analysis,
  date,
  projects,
  attachedToFirst
}: {
  analysis: WorkLogSuggestionAnalysis;
  date: Dayjs | string | Date;
  projects?: Project[];
  attachedToFirst?: boolean;
}): WorkLogDraftComposerState | null {
  if (!analysis.draftItems.length) return null;
  const safeDate = dayjs(date).isValid() ? dayjs(date) : dayjs();
  const dateKey = safeDate.format("YYYY-MM-DD");
  const kind = dateKey > dayjs().format("YYYY-MM-DD") ? "PLAN" : "DAILY";
  return {
    assistantMessage: analysis.assistantMessage || "内容已整理为提交摘要。",
    items: analysis.draftItems.slice(0, 8).map((item, index) => {
      const project = item.projectId ? projects?.find((candidate) => candidate.id === item.projectId) : undefined;
      const content = item.content?.trim() || item.title?.trim() || "请补充工作内容。";
      const title = item.title?.trim() || quickFillTitleFromText(content) || `工作项 ${index + 1}`;
      const hours = Number(item.hours);
      const missingFields = new Set<string>();
      if (!title.trim()) missingFields.add("title");
      if (!content.trim()) missingFields.add("content");
      return {
        localId: nextDraftLocalId(),
        date: dateKey,
        kind,
        title,
        content,
        hours: Number.isFinite(hours) && hours > 0 ? hours : 0,
        startTime: null,
        endTime: null,
        projectId: item.projectId ?? undefined,
        projectName: project ? (project.code ? `${project.code} · ${project.name}` : project.name) : undefined,
        projectHint: project ? project.name : item.projectHint,
        confidence: Math.max(0.4, Math.min(1, analysis.qualityScore / 100 || 0.78)),
        missingFields: Array.from(missingFields),
        achievements: [],
        risks: item.risk?.trim() ? [item.risk.trim()] : [],
        blockers: /阻塞|卡住|无法推进/u.test(item.risk ?? "") ? [item.risk.trim()] : [],
        nextActions: item.nextPlan?.trim() ? [item.nextPlan.trim()] : [],
        sourceNote: "由智能建议整理",
        status: "generated",
        projectConfirmed: Boolean(item.projectId),
        selected: true,
        expanded: false,
        source: "AI"
      };
    }),
    attachedToFirst: Boolean(attachedToFirst),
    attachmentTargetIndex: 0
  };
}

export function selectedDraftComposerEntries(preview: WorkLogDraftComposerState | null) {
  return (preview?.items ?? []).map((item, index) => ({ item, index })).filter((entry) => entry.item.selected);
}

export function validateDraftComposerState(preview: WorkLogDraftComposerState | null) {
  const entries = selectedDraftComposerEntries(preview);
  if (!entries.length) {
    return { ok: false as const, message: "请至少选择一条工作记录。", index: -1 };
  }
  for (const { item, index } of entries) {
    const hours = Number(item.hours);
    const quality = workLogQualityCheck(`${item.title}\n${item.content}`);
    if (!dayjs(item.date).isValid()) {
      return { ok: false as const, message: `第 ${index + 1} 条日期无效，请重新选择。`, index };
    }
    if (!item.title.trim() || item.title.trim().length < 2) {
      return { ok: false as const, message: `第 ${index + 1} 条缺少标题。`, index };
    }
    if (!item.content.trim() || item.content.trim().length < 2) {
      return { ok: false as const, message: `第 ${index + 1} 条缺少工作内容。`, index };
    }
    if (!quality.ok) {
      return { ok: false as const, message: `第 ${index + 1} 条${quality.message}`, index };
    }
    if (Number.isFinite(hours) && (hours < 0 || hours > 24)) {
      return { ok: false as const, message: `第 ${index + 1} 条工时需在 0 到 24 小时之间。`, index };
    }
    if (item.status === "submitted" || item.status === "ignored") {
      return { ok: false as const, message: `第 ${index + 1} 条已经${item.status === "submitted" ? "提交" : "忽略"}，不能重复提交。`, index };
    }
  }
  return { ok: true as const, entries };
}

export function composeDraftComposerContent(item: WorkLogDraftComposerItem) {
  const blocks = [item.content.trim()].filter(Boolean);
  const sections: Array<[string, string[]]> = [
    ["成果", item.achievements],
    ["风险", item.risks],
    ["阻塞", item.blockers],
    ["下一步", item.nextActions]
  ];
  for (const [label, values] of sections) {
    const cleaned = values.map((value) => value.trim()).filter(Boolean);
    if (cleaned.length) {
      blocks.push(`${label}：\n${cleaned.map((value) => `- ${value}`).join("\n")}`);
    }
  }
  return blocks.join("\n\n") || item.title || "工作记录";
}

const fieldLabels: Record<string, string> = {
  title: "标题",
  content: "内容",
  hours: "工时",
  startTime: "开始时间",
  endTime: "结束时间",
  date: "日期",
  project: "项目",
  projectId: "项目",
  projectHint: "项目"
};

const optionalDraftFieldNames = new Set(["hours", "startTime", "endTime", "project", "projectId", "projectHint"]);

const draftStatusMeta: Record<WorkLogDraftComposerItem["status"], { label: string; color: string }> = {
  generated: { label: "待确认", color: "processing" },
  editing: { label: "编辑中", color: "blue" },
  saving: { label: "保存中", color: "processing" },
  saved: { label: "已保存", color: "green" },
  submitting: { label: "提交中", color: "processing" },
  submitted: { label: "已提交", color: "green" },
  failed: { label: "失败", color: "red" },
  ignored: { label: "已忽略", color: "default" }
};

function selectedItems(preview: WorkLogDraftComposerState | null) {
  return preview?.items.filter((item) => item.selected) ?? [];
}

function selectedHours(preview: WorkLogDraftComposerState | null) {
  return selectedItems(preview).reduce((sum, item) => {
    const hours = Number(item.hours);
    return sum + (Number.isFinite(hours) && hours > 0 ? hours : 0);
  }, 0);
}

function selectedKindSummary(preview: WorkLogDraftComposerState | null) {
  const selected = selectedItems(preview);
  if (!selected.length) return "0 条记录";
  const dailyCount = selected.filter((item) => item.kind !== "PLAN").length;
  const planCount = selected.filter((item) => item.kind === "PLAN").length;
  if (dailyCount && planCount) return `${dailyCount} 条日报、${planCount} 条计划`;
  if (planCount) return `${planCount} 条计划`;
  return `${dailyCount} 条日报`;
}

function draftKindLabel(kind: WorkLogDraftItem["kind"]) {
  return kind === "PLAN" ? "计划" : "日报";
}

function timePickerValue(value?: string | null) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value ?? "");
  if (!match) return null;
  return dayjs().hour(Number(match[1])).minute(Number(match[2])).second(0).millisecond(0);
}

function itemTimingPatch(item: WorkLogDraftComposerItem, patch: Partial<Pick<WorkLogDraftComposerItem, "startTime" | "endTime">>) {
  const nextStartTime = Object.prototype.hasOwnProperty.call(patch, "startTime") ? patch.startTime : item.startTime;
  const nextEndTime = Object.prototype.hasOwnProperty.call(patch, "endTime") ? patch.endTime : item.endTime;
  const startValue = timePickerValue(nextStartTime);
  const endValue = timePickerValue(nextEndTime);
  if (!startValue || !endValue) {
    return patch;
  }
  return {
    ...patch,
    hours: workLogDurationHours(startValue, endValue)
  };
}

function missingFieldText(fields: string[]) {
  return fields.map((field) => fieldLabels[field] ?? field).join("、");
}

export function workLogQualityCheck(text: string) {
  const source = text.trim();
  const compact = source.replace(/\s+/g, "");
  const meaningfulLength = compact.replace(/[^\p{L}\p{N}]/gu, "").length;
  const vagueOnly = /^(开会|会议|沟通|交流|对接|跟进|处理|处理问题|写代码|开发|测试|学习|整理资料|日常工作|工作|优化|修复|排查)[。.!！?？]*$/u.test(compact);
  const hasAction = /(完成|推进|沟通|交流|会谈|洽谈|讨论|对接|确认|整理|输出|提交|修复|排查|分析|设计|开发|测试|联调|评审|部署|上线|拜访|跟进|协调|制定|更新|复盘|调研|培训|支持|处理|优化|编写|汇总)/u.test(source);
  const hasObject =
    /(项目|客户|需求|方案|接口|页面|数据|报告|合同|会议|文档|工单|订单|版本|模块|流程|问题|风险|阻塞|排期|进度|功能|系统|平台|后台|前端|后端|测试|上线|交付|物料|资料|清单|记录|日报|计划|范围|错误|缺陷|证书|登录|权限)/u.test(source) ||
    /[A-Za-z0-9_-]{3,}/.test(source);
  const hasResultOrContext = /(完成|确认|输出|提交|修复|解决|发现|同步|通过|上线|交付|整理|上午|中午|下午|晚上|今天|明天|本周|下周|风险|阻塞|待|需要|已经|继续|计划|\d+(?:\.\d+)?\s*(?:小时|工时|h|H))/u.test(source);

  if (meaningfulLength < 8 || vagueOnly) {
    return { ok: false as const, message: "内容太简略，请写清做了什么和对象/结果" };
  }
  if (!hasAction) {
    return { ok: false as const, message: "请补充具体动作，例如沟通、修复、输出、确认" };
  }
  if (!hasObject) {
    return { ok: false as const, message: "请补充工作对象，例如项目、客户、需求或问题" };
  }
  if (!hasResultOrContext) {
    return { ok: false as const, message: "请补充工作结果、进展或风险" };
  }
  return { ok: true as const };
}

export function workLogShouldDraftForMultipleItems(text: string) {
  const normalized = text.trim();
  if (!normalized) return false;
  if (countLikelyDraftSections(normalized) >= 2) return true;
  if (/上午[\s\S]{4,}下午|下午[\s\S]{4,}晚上|一是[\s\S]{4,}二是|第一[\s\S]{4,}第二/u.test(normalized)) return true;
  const chunks = normalized
    .split(/[\n；;]/)
    .map((item) => item.trim())
    .filter((item) => item.replace(/\s+/g, "").length >= 8);
  return chunks.length >= 2;
}

function updateListValue(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function listValue(items: string[]) {
  return items.join("\n");
}

function countLikelyDraftSections(text: string) {
  const normalized = text.trim();
  if (!normalized) return 0;
  const explicitMarkers = normalized.match(/(^|[\s\n\r。；;])(?:第?\s*(?:\d{1,2}|[一二三四五六七八九十])\s*[、.．)]|[（(]\s*(?:\d{1,2}|[一二三四五六七八九十])\s*[）)])(?=\s|[\u4e00-\u9fa5A-Za-z])/g);
  if (explicitMarkers && explicitMarkers.length >= 2) return explicitMarkers.length;
  const looseNumberMarkers = normalized.match(/(^|[\n\r。；;]|\s)\d{1,2}\s+(?=[\u4e00-\u9fa5A-Za-z])/g);
  if (looseNumberMarkers && looseNumberMarkers.length >= 2) return looseNumberMarkers.length;
  const lineItems = normalized
    .split(/\n+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 8 && !/^(今天|昨天|明天|后天)$/.test(item));
  return lineItems.length >= 2 ? lineItems.length : 0;
}

export function estimateDraftItemCount(text: string) {
  const explicitCount = countLikelyDraftSections(text);
  if (explicitCount >= 2) return explicitCount;
  const normalized = text.trim();
  const dayPartCount = [/(上午)/u, /(下午)/u, /(晚上|晚间)/u].filter((pattern) => pattern.test(normalized)).length;
  if (dayPartCount >= 2) return dayPartCount;
  const chunks = normalized
    .split(/[\n；;]/)
    .map((item) => item.trim())
    .filter((item) => item.replace(/\s+/g, "").length >= 8);
  return Math.max(1, chunks.length);
}

export function clarificationQuestionForWorkLog(text: string) {
  const compact = text.replace(/\s+/g, "");
  if (/^(开会|会议)$/u.test(compact)) {
    return "请补充会议主题，以及本次会议确认的结论或后续事项。";
  }
  if (/^(沟通|对接|跟进|处理|写代码|开发|测试|日常工作|工作)$/u.test(compact)) {
    return "请补充对应项目、客户或需求，以及当前进展、结果或阻塞。";
  }
  if (/沟通|交流|对接|跟进/u.test(text)) {
    return "请补充本次沟通确认的结果，或说明当前阻塞。";
  }
  return "请补充工作对象和结果，例如项目、客户、需求、进展或风险。";
}

export function isWorkLogSubmitCommand(text: string) {
  const compact = text.replace(/\s+/g, "");
  return /^(直接)?提交(日报|记录|这条|本条|就行|即可|吧|行)?[。.!！?？]*$/u.test(compact);
}

function draftReady(item: WorkLogDraftComposerItem) {
  const hours = Number(item.hours);
  const quality = workLogQualityCheck(`${item.title}\n${item.content}`);
  return (
    item.selected &&
    item.status !== "submitted" &&
    item.status !== "ignored" &&
    dayjs(item.date).isValid() &&
    item.title.trim().length >= 2 &&
    item.content.trim().length >= 2 &&
    quality.ok &&
    (!Number.isFinite(hours) || (hours >= 0 && hours <= 24))
  );
}

function hasSubmittableDraft(preview: WorkLogDraftComposerState | null) {
  return Boolean(preview?.items.some(draftReady));
}

function uploadFileSizeLabel(value?: number) {
  if (!value) return "未知大小";
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(value / 1024))}KB`;
}

function uploadFileStatusLabel(file: UploadFile) {
  if (file.status === "error") return String(file.response || "上传失败");
  if (file.status === "uploading") return "上传中";
  return "待随日报提交";
}

export function WorkLogDraftComposer({
  aiMessages,
  aiInput,
  aiPending,
  aiError,
  onAiInputChange,
  onGenerateDraft,
  onContinuePrompt,
  smartSuggestions = [],
  suggestionsLoading,
  suggestionsSlow,
  suggestionsUnavailable,
  suggestionAnalysis,
  onSmartSuggestionClick,
  autoSaveStatus,
  restoredNotice,
  onResetRestoredDraft,
  onAbandonDraft,
  draftPreview,
  onUpdateItem,
  onDeleteItem,
  onAttachmentTargetChange,
  onSaveDrafts,
  onSubmitDrafts,
  onRegenerateDraft,
  saving,
  submitting,
  projectOptions,
  projectNameById,
  projectsLoading,
  pendingAttachmentCount,
  pendingUploadFiles,
  beforeUploadAttachment,
  onRemoveAttachment,
  onRetryFailedAttachments,
  attachmentRetrying,
  onPasteImages
}: WorkLogDraftComposerProps) {
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const selected = selectedItems(draftPreview);
  const selectedCount = selected.length;
  const selectedSummary = selectedKindSummary(draftPreview);
  const totalHours = selectedHours(draftPreview);
  const selectedHasEmptyHours = selected.some((item) => !(Number(item.hours) > 0));
  const selectedHoursSummary =
    totalHours > 0
      ? `${selectedHasEmptyHours ? "已填工时" : "合计"} ${Number(totalHours.toFixed(1))}h${selectedHasEmptyHours ? "，其余可补" : ""}`
      : "工时可稍后补充";
  const selectedIndexes = new Set((draftPreview?.items ?? []).map((item, index) => (item.selected ? index : -1)).filter((index) => index >= 0));
  const items = draftPreview?.items ?? [];
  const itemCount = items.length;
  const attachmentTargetIndex = draftPreview?.attachmentTargetIndex ?? 0;
  const hasItems = itemCount > 0;
  const inputLength = aiInput.length;
  const inputLimitExceeded = inputLength > draftInputMaxLength;
  const latestUserText = [...aiMessages].reverse().find((message) => message.role === "user")?.content.trim() ?? "";
  const workingText = aiInput.trim() || latestUserText;
  const inputLocked = submitting;
  const canGenerate = aiInput.trim().length > 0 && !inputLocked && !inputLimitExceeded;
  const hasConversation = aiMessages.some((item) => item.role === "user");
  const canAttach = !inputLocked;
  const showAttachments = canAttach && (attachmentsOpen || pendingAttachmentCount > 0);
  const canSubmitAny = hasSubmittableDraft(draftPreview);
  const selectedEntries = selectedDraftComposerEntries(draftPreview);
  const persistedItems = items.filter((item) => item.status === "submitted" || item.status === "saved");
  const summaryItems = selected.length ? selected : persistedItems.length ? persistedItems : items;
  const expandedIndexes = new Set(items.map((item, index) => (item.expanded ? index : -1)).filter((index) => index >= 0));
  const hasExpandedItems = expandedIndexes.size > 0;
  const hasSmartSuggestions = smartSuggestions.length > 0 || Boolean(suggestionsUnavailable);
  const hasFailedAttachments = pendingUploadFiles.some((file) => file.status === "error");
  const recognizedProjects = Array.from(
    new Set(
      [
        ...smartSuggestions.filter((suggestion) => suggestion.type === "project").map((suggestion) => suggestion.label.replace(/^关联到/u, "").trim()),
        ...(suggestionAnalysis?.draftItems ?? []).map((item) =>
          item.projectId ? projectNameById.get(item.projectId) : item.projectHint?.trim() ? `疑似 ${item.projectHint.trim()}` : ""
        ),
        ...summaryItems.map((item) => (item.projectId ? projectNameById.get(item.projectId) ?? item.projectName ?? "" : item.projectHint?.trim() ? `疑似 ${item.projectHint.trim()}` : ""))
      ].filter((value): value is string => Boolean(value))
    )
  ).slice(0, 3);
  const analysisSummaryItems = (suggestionAnalysis?.draftItems?.length ? suggestionAnalysis.draftItems : summaryItems).slice(0, 3);
  const hasSplitSuggestion = suggestionAnalysis?.status === "need_split_confirmation" || smartSuggestions.some((suggestion) => suggestion.type === "split");
  const hasRequiredMissingFields = selectedEntries.some((entry) => entry.item.missingFields.some((field) => !optionalDraftFieldNames.has(field)));
  const missingInfoText = hasRequiredMissingFields
    ? "摘要中仍有必填内容待确认。"
    : suggestionAnalysis && !suggestionAnalysis.canSubmit && !hasItems
      ? suggestionAnalysis.assistantMessage
      : "";
  const isAnalyzing = aiPending || suggestionsLoading;
  const statusTone = suggestionsUnavailable ? "failed" : hasItems ? "ready" : isAnalyzing ? "working" : suggestionAnalysis ? "ready" : workingText ? "received" : "idle";
  const statusLabel =
    statusTone === "failed"
      ? "智能建议暂不可用"
      : hasItems && isAnalyzing
        ? "摘要可提交，智能建议更新中"
        : statusTone === "working"
          ? suggestionsSlow
            ? "正在分析，可继续补充"
            : "正在分析"
        : statusTone === "ready"
          ? canSubmitAny
            ? "摘要可提交"
            : "已生成整理结果"
          : statusTone === "received"
            ? "已读取你的描述"
            : "等待输入";
  const generateButtonLabel = hasItems ? "补充到摘要" : "整理摘要";
  const expandSelectedItems = () => {
    const targetEntries = selectedEntries.length ? selectedEntries : items.map((item, index) => ({ item, index }));
    targetEntries.forEach(({ index, item }) => {
      if (item.status !== "submitted" && item.status !== "ignored") {
        onUpdateItem(index, { expanded: true, status: item.status === "generated" ? "editing" : item.status });
      }
    });
  };
  const handleAttachmentPaste = (event: ClipboardEvent<HTMLElement>) => {
    if (!canAttach) {
      return;
    }
    onPasteImages(event);
  };

  return (
    <div className="today-log-composer worklog-chat-composer">
      <div className="worklog-chat-layout">
        <div className="worklog-chat-left">
          {restoredNotice ? (
            <div className="today-log-restore-notice">
              <span>已恢复上次未提交的内容。</span>
              {onResetRestoredDraft ? (
                <Button size="small" onClick={onResetRestoredDraft}>
                  重新填写
                </Button>
              ) : null}
            </div>
          ) : null}
      <section className="worklog-chat-thread" aria-label="智能填报对话">
        {!hasConversation && !hasItems ? (
          <div className="today-log-ai-message is-assistant">
            {workLogComposerIntroText}
          </div>
        ) : null}
        {aiMessages.map((message, index) => (
          <div key={`${message.role}-${index}`} className={`today-log-ai-message is-${message.role}`}>
            {message.content}
          </div>
        ))}
        {aiError ? (
          <div className="today-log-error-message">
            <Alert
              type="error"
              showIcon
              message={aiError.message}
              action={
                <Button size="small" onClick={() => (onRegenerateDraft ? onRegenerateDraft() : onGenerateDraft())} disabled={!onRegenerateDraft && !canGenerate}>
                  重试
                </Button>
              }
            />
          </div>
        ) : null}

        {hasItems ? (
          <div className="worklog-draft-message">
            <div className="worklog-final-summary" aria-live="polite">
              <div className="worklog-final-summary-head">
                <div>
                  <strong>
                    {selectedCount ? `将提交 ${selectedSummary}` : persistedItems.length ? `已处理 ${persistedItems.length} 条记录` : `已整理 ${itemCount} 条记录`}
                  </strong>
                  <span>提交前请核对摘要。项目和工时可稍后补充。</span>
                </div>
                <CheckCircle2 size={20} />
              </div>
              <ol className="worklog-final-list">
                {summaryItems.map((item, index) => {
                  const projectName = item.projectId ? projectNameById.get(item.projectId) ?? item.projectName ?? "已选择项目" : null;
                  const hours = Number(item.hours);
                  return (
                    <li key={`${item.localId}-summary`}>
                      <strong>{summaryItems.length > 1 ? `${index + 1}. ` : ""}{item.title || "今日工作记录"}</strong>
                      <p>{item.content || "补充内容后才能提交。"}</p>
                      <div>
                        <span>项目：{projectName ?? (item.projectHint?.trim() ? `疑似 ${item.projectHint.trim()}` : "不关联项目")}</span>
                        <span>工时：{Number.isFinite(hours) && hours > 0 ? `${Number(hours.toFixed(1))}h` : "未填写，可稍后补充"}</span>
                      </div>
                    </li>
                  );
                })}
              </ol>
              <div className="worklog-final-actions">
                <Button onClick={onContinuePrompt}>继续补充</Button>
                <Button onClick={expandSelectedItems}>展开编辑</Button>
                {onAbandonDraft ? <Button onClick={onAbandonDraft}>放弃本次填写</Button> : null}
                <Button type="primary" loading={submitting} disabled={!canSubmitAny || saving || submitting} onClick={onSubmitDrafts}>
                  提交 {selectedSummary}
                </Button>
              </div>
            </div>

            {hasExpandedItems ? (
            <div className="today-log-item-list">
              {items.map((item, index) => {
                if (!item.expanded) return null;
                const requiredMissingFields = item.missingFields.filter((field) => !optionalDraftFieldNames.has(field));
                const projectName = item.projectId ? projectNameById.get(item.projectId) ?? item.projectName ?? "已选择项目" : null;
                const statusMeta = draftStatusMeta[item.status] ?? draftStatusMeta.generated;
                const locked = item.status === "submitted" || item.status === "ignored" || item.status === "saving" || item.status === "submitting";
                const isHoursReady = Number(item.hours) > 0;
                const projectSummary = projectName ?? (item.projectHint?.trim() ? `疑似项目：${item.projectHint.trim()}` : "未关联项目");
                const detailLists = [
                  { key: "achievements", label: "成果", items: item.achievements, tone: "success" },
                  { key: "risks", label: "风险", items: item.risks, tone: "risk" },
                  { key: "blockers", label: "阻塞", items: item.blockers, tone: "blocker" },
                  { key: "nextActions", label: "下一步", items: item.nextActions, tone: "next" }
                ];
                return (
                  <article key={item.localId} className={`today-log-item is-${item.status} ${item.selected ? "" : "is-muted"}`}>
                    <div className="today-log-item-main">
                      <div className="today-log-item-copy">
                        <div className="today-log-item-title-row">
                          <strong>{item.title || "未命名草稿"}</strong>
                          <span>{item.kind === "PLAN" ? "计划" : "日报"}</span>
                          {item.status !== "generated" ? <span>{statusMeta.label}</span> : null}
                        </div>
                        <p>{item.content || "补充内容后才能提交。"}</p>
                      </div>
                      <Button type="text" danger icon={<Trash2 size={15} />} disabled={locked} onClick={() => onDeleteItem(index)} />
                    </div>

                    {item.errorMessage ? <Alert type="error" showIcon message={item.errorMessage} /> : null}

                    <div className="today-log-item-fields">
                      <div className="today-log-item-summary">
                        <span>{dayjs(item.date).isValid() ? dayjs(item.date).format("MM月DD日") : "日期待确认"}</span>
                        <span className={projectName ? "" : "is-optional"}>{projectSummary}</span>
                        <span className={isHoursReady ? "" : "is-optional"}>{isHoursReady ? `${Number(item.hours).toFixed(1)}h` : "未填工时"}</span>
                        {requiredMissingFields.length ? <span className="is-warning">需补：{missingFieldText(requiredMissingFields)}</span> : null}
                      </div>
                      <Button
                        type="text"
                        icon={item.expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                        onClick={() => onUpdateItem(index, { expanded: !item.expanded })}
                      >
                        {item.expanded ? "收起详情" : "编辑详情"}
                      </Button>
                    </div>

                    {item.expanded ? (
                      <div className="today-log-detail-editor">
                        <div className="today-log-item-editor">
                          <label>
                            <span>日期</span>
                            <DatePicker
                              className="w-full"
                              value={dayjs(item.date).isValid() ? dayjs(item.date) : dayjs()}
                              disabled={locked}
                              onChange={(value) => value && onUpdateItem(index, { date: value.format("YYYY-MM-DD"), status: item.status === "generated" ? "editing" : item.status })}
                            />
                          </label>
                          <label>
                            <span>类型</span>
                            <Select
                              value={item.kind}
                              disabled={locked}
                              options={[
                                { value: "DAILY", label: "日报" },
                                { value: "PLAN", label: "计划" }
                              ]}
                              getPopupContainer={() => document.body}
                              onChange={(value) => onUpdateItem(index, { kind: value, status: item.status === "generated" ? "editing" : item.status })}
                            />
                          </label>
                          <label>
                            <span>项目</span>
                            <Select
                              className="today-log-project-select"
                              popupClassName="today-log-project-dropdown"
                              allowClear
                              showSearch
                              optionFilterProp="label"
                              value={item.projectId}
                              placeholder="可选择项目"
                              loading={projectsLoading}
                              disabled={locked}
                              listHeight={280}
                              getPopupContainer={() => document.body}
                              dropdownStyle={{ zIndex: 1800 }}
                              options={projectOptions}
                              onChange={(value) => onUpdateItem(index, { projectId: value, projectConfirmed: Boolean(value), status: item.status === "generated" ? "editing" : item.status })}
                            />
                          </label>
                          <label>
                            <span>工时（可选）</span>
                            <InputNumber
                              className="w-full"
                              min={0}
                              max={24}
                              step={0.5}
                              value={Number(item.hours) > 0 ? item.hours : null}
                              disabled={locked}
                              placeholder="可不填"
                              onChange={(value) => onUpdateItem(index, { hours: Number(value ?? 0), status: item.status === "generated" ? "editing" : item.status })}
                            />
                            <small className="today-log-field-note">开始和结束时间会自动带出工时，也可以稍后补。</small>
                          </label>
                          <label>
                            <span>开始时间</span>
                            <TimePicker
                              className="w-full"
                              format="HH:mm"
                              value={timePickerValue(item.startTime)}
                              disabled={locked}
                              onChange={(value: Dayjs | null) =>
                                onUpdateItem(index, {
                                  ...itemTimingPatch(item, { startTime: value ? value.format("HH:mm") : null }),
                                  status: item.status === "generated" ? "editing" : item.status
                                })
                              }
                            />
                          </label>
                          <label>
                            <span>结束时间</span>
                            <TimePicker
                              className="w-full"
                              format="HH:mm"
                              value={timePickerValue(item.endTime)}
                              disabled={locked}
                              onChange={(value: Dayjs | null) =>
                                onUpdateItem(index, {
                                  ...itemTimingPatch(item, { endTime: value ? value.format("HH:mm") : null }),
                                  status: item.status === "generated" ? "editing" : item.status
                                })
                              }
                            />
                          </label>
                          <label className="today-log-title-field">
                            <span>标题</span>
                            <Input disabled={locked} value={item.title} onChange={(event) => onUpdateItem(index, { title: event.target.value, status: item.status === "generated" ? "editing" : item.status })} />
                          </label>
                          <label className="today-log-content-field">
                            <span>工作内容</span>
                            <Input.TextArea
                              autoSize={{ minRows: 3, maxRows: 7 }}
                              value={item.content}
                              disabled={locked}
                              onPaste={handleAttachmentPaste}
                              onChange={(event) => onUpdateItem(index, { content: event.target.value, status: item.status === "generated" ? "editing" : item.status })}
                            />
                          </label>
                          <label className="today-log-list-field">
                            <span>成果，每行一条</span>
                            <Input.TextArea disabled={locked} autoSize={{ minRows: 2, maxRows: 5 }} value={listValue(item.achievements)} onChange={(event) => onUpdateItem(index, { achievements: updateListValue(event.target.value) })} />
                          </label>
                          <label className="today-log-list-field">
                            <span>风险，每行一条</span>
                            <Input.TextArea disabled={locked} autoSize={{ minRows: 2, maxRows: 5 }} value={listValue(item.risks)} onChange={(event) => onUpdateItem(index, { risks: updateListValue(event.target.value) })} />
                          </label>
                          <label className="today-log-list-field">
                            <span>阻塞，每行一条</span>
                            <Input.TextArea disabled={locked} autoSize={{ minRows: 2, maxRows: 5 }} value={listValue(item.blockers)} onChange={(event) => onUpdateItem(index, { blockers: updateListValue(event.target.value) })} />
                          </label>
                          <label className="today-log-list-field">
                            <span>下一步，每行一条</span>
                            <Input.TextArea disabled={locked} autoSize={{ minRows: 2, maxRows: 5 }} value={listValue(item.nextActions)} onChange={(event) => onUpdateItem(index, { nextActions: updateListValue(event.target.value) })} />
                          </label>
                        </div>
                        <div className="today-log-structured-lists">
                          {detailLists.map((section) => (
                            <div key={section.key} className={`today-log-structured-list is-${section.tone}`}>
                              <strong>{section.label}</strong>
                              {section.items.length ? (
                                <ul>
                                  {section.items.map((value, valueIndex) => <li key={`${section.key}-${valueIndex}`}>{value}</li>)}
                                </ul>
                              ) : (
                                <span>暂无</span>
                              )}
                            </div>
                          ))}
                        </div>
                        <div className="today-log-item-meta">
                          <span>来源：{item.sourceNote ?? (item.source === "AI" ? "由对话生成" : "手动新增")}</span>
                          <span>置信度 {Math.round(item.confidence * 100)}%</span>
                          <span>附件：{pendingAttachmentCount ? (attachmentTargetIndex === index ? "关联到本条" : "未关联到本条") : "无"}</span>
                          {item.submittedAt ? <span>提交时间：{dayjs(item.submittedAt).format("MM-DD HH:mm")}</span> : null}
                          {item.workLogId ? <span>记录 ID：{item.workLogId}</span> : null}
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
            ) : null}
          </div>
        ) : null}
      </section>

      {showAttachments ? (
        <section className="today-log-attachments">
          <div className="today-log-attachments-head">
            <div>
              <strong>附件</strong>
              <span>
                {pendingAttachmentCount > 0 ? `已添加 ${pendingAttachmentCount} 个附件，提交日报时一并上传。` : "附件为可选补充，不影响日报正文提交。"}
              </span>
            </div>
            <Upload multiple showUploadList={false} beforeUpload={beforeUploadAttachment}>
              <Button icon={<UploadCloud size={15} />}>选择文件</Button>
            </Upload>
          </div>
          {draftPreview && selectedCount > 1 && pendingAttachmentCount > 0 ? (
            <div className="quickfill-attachment-target">
              <span>附件默认归属</span>
              <Select
                value={selectedIndexes.has(attachmentTargetIndex) ? attachmentTargetIndex : selected[0] ? items.indexOf(selected[0]) : undefined}
                listHeight={280}
                getPopupContainer={() => document.body}
                options={items.map((draft, index) => ({
                  value: index,
                  disabled: !draft.selected || draft.status === "ignored",
                  label: `第 ${index + 1} 条 · ${draft.title || "未命名记录"}`
                }))}
                onChange={onAttachmentTargetChange}
              />
              <em>不调整时，附件默认随选中的第一条记录提交。</em>
            </div>
          ) : null}
          <div className="today-log-attachment-list" tabIndex={0} onPaste={handleAttachmentPaste}>
            {pendingUploadFiles.length ? (
              pendingUploadFiles.map((file) => (
                <div key={file.uid} className={`today-log-attachment-row is-${file.status ?? "ready"}`}>
                  <div>
                    <strong>{file.name}</strong>
                    <span>{uploadFileSizeLabel(file.size)} · {uploadFileStatusLabel(file)}</span>
                  </div>
                  <Button type="text" danger icon={<Trash2 size={15} />} onClick={() => onRemoveAttachment(file)} />
                </div>
              ))
            ) : (
              <span className="today-log-attachment-empty">可点击上传图标选择文件，也可以在输入框粘贴图片。</span>
            )}
            {hasFailedAttachments && onRetryFailedAttachments ? (
              <Button loading={attachmentRetrying} onClick={onRetryFailedAttachments}>
                重试失败附件
              </Button>
            ) : null}
          </div>
        </section>
      ) : null}

      {hasItems && hasExpandedItems ? (
      <div className="today-log-footer">
        <div>
          <strong>共 {draftPreview?.items.length ?? 0} 条记录</strong>
          <span>{selectedHoursSummary}</span>
        </div>
        <div className="today-log-footer-actions">
          {onAbandonDraft ? <Button onClick={onAbandonDraft}>放弃本次填写</Button> : null}
          <Button type="primary" loading={submitting} disabled={!canSubmitAny || saving || submitting} onClick={onSubmitDrafts}>
            提交 {selectedSummary}
          </Button>
        </div>
      </div>
      ) : null}

      <section className="today-log-quick-entry worklog-chat-inputbar">
        <Input.TextArea
          className="today-log-quick-input"
          value={aiInput}
          autoFocus
          autoSize={{ minRows: 2, maxRows: 8 }}
          placeholder={workLogComposerPlaceholder}
          disabled={inputLocked}
          onPaste={handleAttachmentPaste}
          onChange={(event) => onAiInputChange(event.target.value)}
          onPressEnter={(event) => {
            if (!event.shiftKey && canGenerate) {
              event.preventDefault();
              onGenerateDraft();
            }
          }}
        />
        <div className={`today-log-quick-actions ${hasItems ? "has-drafts" : "is-empty"}`}>
          <span className={`today-log-input-meter${inputLimitExceeded ? " is-error" : ""}`}>{inputLength}/{draftInputMaxLength}</span>
          {canAttach ? (
            <Tooltip title={pendingAttachmentCount > 0 ? `已添加 ${pendingAttachmentCount} 个附件` : "添加附件"}>
              <Button
                className="today-log-icon-button"
                aria-label={pendingAttachmentCount > 0 ? `已添加 ${pendingAttachmentCount} 个附件` : "添加附件"}
                icon={<UploadCloud size={17} />}
                onClick={() => setAttachmentsOpen((value) => !value)}
              >
                {pendingAttachmentCount > 0 ? pendingAttachmentCount : null}
              </Button>
            </Tooltip>
          ) : null}
          <Button className="today-log-generate-button" type="primary" icon={<WandSparkles size={16} />} loading={aiPending} disabled={!canGenerate} onClick={() => onGenerateDraft()}>
            {generateButtonLabel}
          </Button>
          <span className="today-log-shortcut-hint">Enter 继续，Shift + Enter 换行</span>
        </div>
      </section>
        </div>
        <aside className={`worklog-ai-status-panel is-${statusTone}`} aria-label="AI 整理状态">
          <div className="worklog-ai-status-head">
            <div>
              <strong>AI 整理状态</strong>
              <span>{statusLabel}</span>
            </div>
            <WandSparkles size={18} />
          </div>
          <ul className="worklog-ai-status-steps">
            <li className={workingText ? "is-done" : ""}>已读取你的描述</li>
            <li className={recognizedProjects.length ? "is-done" : isAnalyzing ? "is-current" : ""}>匹配相关项目</li>
            <li className={hasSplitSuggestion || hasItems ? "is-done" : isAnalyzing ? "is-current" : ""}>拆分或合并工作项</li>
            <li className={hasItems ? "is-done" : isAnalyzing ? "is-current" : ""}>生成提交摘要</li>
            <li className={canSubmitAny ? "is-done" : "is-current"}>{canSubmitAny ? "请在左侧确认提交" : "你可以继续补充内容"}</li>
          </ul>
          {suggestionsUnavailable ? <div className="worklog-ai-status-fallback">智能建议暂不可用，日报内容不会丢失。</div> : null}
          {hasSmartSuggestions ? (
            <section className="today-log-smart-suggestions" aria-label="智能建议">
              <div className="today-log-smart-suggestions-head">
                <strong>智能建议</strong>
              </div>
              <div className="today-log-smart-suggestion-list">
                {suggestionsUnavailable ? <span className="today-log-suggestion-status">请补充这项工作的结果或下一步。</span> : null}
                {smartSuggestions.slice(0, 5).map((suggestion, index) => (
                  <Button key={`${suggestion.action}-${suggestion.projectId ?? suggestion.value ?? index}`} disabled={inputLocked} onClick={() => onSmartSuggestionClick?.(suggestion)}>
                    {suggestion.label}
                  </Button>
                ))}
              </div>
            </section>
          ) : null}
          <div className="worklog-ai-status-block">
            <strong>已识别项目</strong>
            {recognizedProjects.length ? (
              <div className="worklog-ai-status-tags">
                {recognizedProjects.map((project) => <span key={project}>{project}</span>)}
              </div>
            ) : (
              <p>暂未识别，可不关联项目。</p>
            )}
          </div>
          <div className="worklog-ai-status-block">
            <strong>拆分建议</strong>
            <p>{hasItems && itemCount > 1 ? `已整理为 ${itemCount} 条记录。` : hasSplitSuggestion ? "建议拆成多条日报，请按提示确认。" : "当前可按一条日报整理。"}</p>
          </div>
          <div className="worklog-ai-status-block">
            <strong>初步摘要</strong>
            {analysisSummaryItems.length ? (
              <ul>
                {analysisSummaryItems.map((item, index) => (
                  <li key={`${item.title || item.content}-${index}`}>{item.title || item.content}</li>
                ))}
              </ul>
            ) : (
              <p>输入工作内容后显示摘要。</p>
            )}
          </div>
          <div className="worklog-ai-status-block">
            <strong>缺失信息</strong>
            <p>{missingInfoText || "暂无必须补充项。项目和工时可稍后补充。"}</p>
          </div>
          <div className="worklog-ai-status-foot">
            <span>{autoSaveStatus || "内容会自动暂存，提交后清除。"}</span>
            {pendingAttachmentCount ? <span>附件 {pendingAttachmentCount} 个</span> : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
