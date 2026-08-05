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

type WorkLogDraftComposerProps = {
  aiMessages: DraftComposerMessage[];
  aiInput: string;
  aiPending: boolean;
  aiError?: Error | null;
  onAiInputChange: (value: string) => void;
  onGenerateDraft: (textOverride?: string, intent?: WorkLogDraftComposerIntent, projectId?: string | null) => void;
  onContinuePrompt: () => void;
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
  onPasteImages: (event: ClipboardEvent<HTMLElement>) => void;
};

export type WorkLogDraftComposerIntent = "analyze" | "split" | "force_single";

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

function projectOptionMatchScore(label: string, source: string) {
  const normalizedLabel = normalizeProjectMatchValue(label);
  const normalizedSource = normalizeProjectMatchValue(source);
  if (normalizedLabel.length < 2 || normalizedSource.length < 2) return 0;
  if (normalizedSource.includes(normalizedLabel)) return 100 + Math.min(normalizedLabel.length, 24);
  const labelCore = normalizedLabel.replace(/项目|信息化|系统|平台|建设|中心|管理|工程|服务/g, "");
  const sourceCore = normalizedSource.replace(/项目|信息化|系统|平台|建设|中心|管理|工程|服务/g, "");
  if (labelCore.length >= 2 && sourceCore.includes(labelCore)) return 92 + Math.min(labelCore.length, 18);
  const sourceChars = new Set(Array.from(sourceCore));
  const labelChars = Array.from(new Set(Array.from(labelCore)));
  const overlap = labelChars.filter((char) => sourceChars.has(char)).length;
  if (overlap < 2) return 0;
  return Math.round((overlap / Math.max(2, Math.min(labelChars.length, 8))) * 86);
}

function projectSuggestionsFromOptions(options: Array<{ value: string; label: string }>, text: string) {
  return options
    .map((option) => ({ ...option, score: projectOptionMatchScore(option.label, text) }))
    .filter((option) => option.score >= 45)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
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
  const safeDate = dayjs(date).isValid() ? dayjs(date) : dayjs();
  const dateKey = safeDate.format("YYYY-MM-DD");
  const kind = dateKey > dayjs().format("YYYY-MM-DD") ? "PLAN" : "DAILY";
  const content = text.trim();
  const matchedProjectId = projectId === null ? undefined : projectId || projectIdFromText(projects, content);
  const matchedProject = matchedProjectId ? projects?.find((project) => project.id === matchedProjectId) : undefined;
  const hours = extractDraftHours(content);
  return {
    assistantMessage: "内容足够，已整理成提交摘要。",
    items: [
      {
        localId: nextDraftLocalId(),
        date: dateKey,
        kind,
        title: quickFillTitleFromText(content),
        content,
        hours,
        startTime: null,
        endTime: null,
        projectHint: matchedProject ? matchedProject.name : null,
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
      }
    ],
    attachedToFirst: false,
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
  saved: { label: "已保存草稿", color: "green" },
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
  const vagueOnly = /^(开会|会议|沟通|对接|跟进|处理|处理问题|写代码|开发|测试|学习|整理资料|日常工作|工作|优化|修复|排查)[。.!！?？]*$/u.test(compact);
  const hasAction = /(完成|推进|沟通|对接|确认|整理|输出|提交|修复|排查|分析|设计|开发|测试|联调|评审|部署|上线|拜访|跟进|协调|制定|更新|复盘|调研|培训|支持|处理|优化|编写|汇总)/u.test(source);
  const hasObject =
    /(项目|客户|需求|方案|接口|页面|数据|报告|合同|会议|文档|工单|订单|版本|模块|流程|问题|风险|阻塞|排期|进度|功能|系统|平台|后台|前端|后端|测试|上线|交付|物料|资料|清单|记录|日报|计划|范围|错误|缺陷|证书|登录|权限)/u.test(source) ||
    /[A-Za-z0-9_-]{3,}/.test(source);
  const hasResultOrContext = /(完成|确认|输出|提交|修复|解决|发现|同步|通过|上线|交付|整理|上午|下午|今天|明天|本周|下周|风险|阻塞|待|需要|已经|继续|计划|\d+(?:\.\d+)?\s*(?:小时|工时|h|H))/u.test(source);

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
    return { ok: false as const, message: "请补充这项工作的结果、进展或风险" };
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
    return "这次会议围绕什么工作？最后确认了什么？";
  }
  if (/^(沟通|对接|跟进|处理|写代码|开发|测试|日常工作|工作)$/u.test(compact)) {
    return "这项工作对应哪个项目或客户？最后有什么进展、结果或阻塞？";
  }
  if (/沟通|对接|跟进/u.test(text)) {
    return "这次沟通确认了什么，或还有什么阻塞？";
  }
  return "请补充工作对象和结果，例如项目、客户、需求、进展或风险。";
}

function composeSuggestedText(base: string, suggestion: string) {
  const normalized = base.trim();
  if (!normalized) return suggestion;
  if (/补充说明|我补充一句/u.test(suggestion)) return normalized;
  return `${normalized}，${suggestion}`;
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

export function WorkLogDraftComposer({
  aiMessages,
  aiInput,
  aiPending,
  aiError,
  onAiInputChange,
  onGenerateDraft,
  onContinuePrompt,
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
  const detectedInputItemCount = estimateDraftItemCount(workingText);
  const inputBusy = aiPending;
  const canGenerate = aiInput.trim().length > 0 && !inputBusy && !inputLimitExceeded;
  const workingTextQuality = workLogQualityCheck(workingText);
  const shouldDraftForMultipleItems = workLogShouldDraftForMultipleItems(workingText);
  const directSubmitHint = shouldDraftForMultipleItems ? `识别到 ${detectedInputItemCount} 项工作` : workingTextQuality.message;
  const showQualityHint = !hasItems && workingText.length > 0 && (shouldDraftForMultipleItems || !workingTextQuality.ok);
  const hasConversation = aiMessages.some((item) => item.role === "user");
  const canAttach = hasItems && !aiPending;
  const showAttachments = canAttach && (attachmentsOpen || pendingAttachmentCount > 0);
  const canSubmitAny = hasSubmittableDraft(draftPreview);
  const selectedEntries = selectedDraftComposerEntries(draftPreview);
  const persistedItems = items.filter((item) => item.status === "submitted" || item.status === "saved");
  const summaryItems = selected.length ? selected : persistedItems.length ? persistedItems : items;
  const expandedIndexes = new Set(items.map((item, index) => (item.expanded ? index : -1)).filter((index) => index >= 0));
  const hasExpandedItems = expandedIndexes.size > 0;
  const firstEditableEntry = selectedEntries.find((entry) => entry.item.status !== "submitted" && entry.item.status !== "ignored") ?? selectedEntries[0];
  const firstEditableText = firstEditableEntry ? [firstEditableEntry.item.title, firstEditableEntry.item.content, firstEditableEntry.item.projectHint].filter(Boolean).join(" ") : workingText;
  const projectSuggestions = projectSuggestionsFromOptions(projectOptions, firstEditableText).filter((option) => !firstEditableEntry?.item.projectId || firstEditableEntry.item.projectId !== option.value);
  const resultSuggestions = (() => {
    if (!workingText || hasItems) return [];
    if (shouldDraftForMultipleItems) return [];
    if (/风险|阻塞|卡住|延期|无法推进|等反馈|待反馈/u.test(workingText)) {
      return ["发现阻塞", "待客户反馈", "需要负责人确认"];
    }
    if (/沟通|对接|会议|确认/u.test(workingText)) {
      return ["已确认范围", "已确认下一步", "待客户反馈", "补充说明"];
    }
    return workingTextQuality.ok ? [] : ["确认项目范围", "待对方反馈", "发现阻塞", "我补充一句"];
  })();
  const hasSmartSuggestions = Boolean((!hasItems && workingText && (shouldDraftForMultipleItems || resultSuggestions.length || projectSuggestions.length)) || (hasItems && firstEditableEntry && projectSuggestions.length));
  const expandSelectedItems = () => {
    const targetEntries = selectedEntries.length ? selectedEntries : items.map((item, index) => ({ item, index }));
    targetEntries.forEach(({ index, item }) => {
      if (item.status !== "submitted" && item.status !== "ignored") {
        onUpdateItem(index, { expanded: true, status: item.status === "generated" ? "editing" : item.status });
      }
    });
  };
  const applyProjectSuggestion = (projectId: string | null) => {
    if (firstEditableEntry) {
      onUpdateItem(firstEditableEntry.index, {
        projectId: projectId ?? undefined,
        projectConfirmed: true,
        status: firstEditableEntry.item.status === "generated" ? "editing" : firstEditableEntry.item.status
      });
      return;
    }
    if (workingText) {
      onGenerateDraft(workingText, "force_single", projectId);
    }
  };
  const requestDraftFromConversation = (intent: WorkLogDraftComposerIntent) => {
    if (workingText) {
      onGenerateDraft(workingText, intent);
      return;
    }
    onRegenerateDraft?.();
  };
  const handleAttachmentPaste = (event: ClipboardEvent<HTMLElement>) => {
    if (!canAttach) {
      return;
    }
    onPasteImages(event);
  };

  return (
    <div className="today-log-composer worklog-chat-composer">
      <section className="worklog-chat-thread" aria-label="智能填报对话">
        {!hasConversation && !hasItems ? (
          <div className="today-log-ai-message is-assistant">
            直接写今天做了什么，我会判断是否需要补充；内容足够后，先给你提交摘要。
          </div>
        ) : null}
        {aiMessages.map((message, index) => (
          <div key={`${message.role}-${index}`} className={`today-log-ai-message is-${message.role}`}>
            {message.content}
          </div>
        ))}
        {aiPending ? (
          <div className="quickfill-draft-waiting" role="status" aria-live="polite">
            <span className="quickfill-draft-spinner" />
            <div>
              <strong>正在整理内容</strong>
              <p>正在判断是否需要补充、是否需要拆分，以及可能关联的项目。</p>
            </div>
          </div>
        ) : null}
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
            {pendingAttachmentCount > 0 ? (
              <div className="quickfill-attachment-target">
                <span>附件归属</span>
                {draftPreview && selectedCount > 1 ? (
                  <Select
                    value={selectedIndexes.has(attachmentTargetIndex) ? attachmentTargetIndex : selected[0] ? items.indexOf(selected[0]) : undefined}
                    listHeight={280}
                    getPopupContainer={() => document.body}
                    options={items.map((draft, index) => ({
                      value: index,
                      disabled: !draft.selected || draft.status === "ignored",
                      label: `第 ${index + 1} 条 · ${draft.title || "未命名草稿"}`
                    }))}
                    onChange={onAttachmentTargetChange}
                  />
                ) : (
                  <strong>{selected[0]?.title ? `关联到：${selected[0].title}` : "选择草稿后关联附件"}</strong>
                )}
                <em>附件只会上传到一条记录，避免多条记录重复绑定。</em>
              </div>
            ) : null}

            <div className="worklog-final-summary" aria-live="polite">
              <div className="worklog-final-summary-head">
                <div>
                  <strong>
                    {selectedCount ? `将提交 ${selectedSummary}` : persistedItems.length ? `已处理 ${persistedItems.length} 条记录` : `已整理 ${itemCount} 条记录`}
                  </strong>
                  <span>提交前请确认摘要，项目和工时不确定也可以稍后补充。</span>
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
                <Button type="primary" loading={submitting} disabled={!canSubmitAny || saving || aiPending} onClick={onSubmitDrafts}>
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
                {pendingAttachmentCount > 0 ? `已添加 ${pendingAttachmentCount} 个附件，提交前确认归属。` : "支持上传或粘贴聊天截图，单个最大 8MB。"}
              </span>
            </div>
            <Button type="text" onClick={() => setAttachmentsOpen(false)}>
              收起
            </Button>
          </div>
          <div className="paste-upload-zone" tabIndex={0} onPaste={handleAttachmentPaste}>
            <Upload.Dragger multiple fileList={pendingUploadFiles} beforeUpload={beforeUploadAttachment} onRemove={onRemoveAttachment}>
              <p className="ant-upload-drag-icon">
                <UploadCloud size={26} />
              </p>
              <p className="ant-upload-text">拖拽文件，或粘贴图片</p>
              <p className="ant-upload-hint">{hasItems ? "有多条记录时，附件只关联到你选择的一条。" : "先生成或新增记录后，再选择附件归属。"}</p>
            </Upload.Dragger>
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
          <Button loading={saving} disabled={!selectedCount || submitting || aiPending} onClick={onSaveDrafts}>
            保存草稿
          </Button>
          <Button type="primary" loading={submitting} disabled={!canSubmitAny || saving || aiPending} onClick={onSubmitDrafts}>
            提交 {selectedSummary}
          </Button>
        </div>
      </div>
      ) : null}

      {hasSmartSuggestions ? (
        <section className="today-log-smart-suggestions" aria-label="智能建议">
          <div className="today-log-smart-suggestions-head">
            <WandSparkles size={15} />
            <strong>智能建议</strong>
          </div>
          <div className="today-log-smart-suggestion-list">
            {!hasItems && shouldDraftForMultipleItems ? (
              <>
                <Button disabled={aiPending} onClick={() => requestDraftFromConversation("split")}>
                  拆成 {detectedInputItemCount} 条
                </Button>
                <Button disabled={aiPending} onClick={() => requestDraftFromConversation("force_single")}>
                  合并为 1 条
                </Button>
                <Button disabled={aiPending} onClick={() => requestDraftFromConversation("split")}>
                  重新整理
                </Button>
              </>
            ) : null}
            {projectSuggestions.map((project) => (
              <Button key={project.value} disabled={aiPending} onClick={() => applyProjectSuggestion(project.value)}>
                关联到 {project.label}
              </Button>
            ))}
            {projectSuggestions.length ? (
              <Button disabled={aiPending} onClick={() => applyProjectSuggestion(null)}>
                不关联项目
              </Button>
            ) : null}
            {!hasItems && resultSuggestions.map((suggestion) => (
              <Button key={suggestion} disabled={aiPending} onClick={() => onGenerateDraft(composeSuggestedText(workingText, suggestion), "analyze")}>
                {suggestion}
              </Button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="today-log-quick-entry worklog-chat-inputbar">
        <Input.TextArea
          className="today-log-quick-input"
          value={aiInput}
          autoFocus
          autoSize={{ minRows: 2, maxRows: 8 }}
          placeholder="自然描述今天做了什么，例如：和供销社确认校园餐项目接口范围，已同步研发评估。"
          disabled={inputBusy}
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
          <span className={`today-log-input-meter${inputLimitExceeded ? " is-error" : ""}${showQualityHint ? " is-warning" : ""}`}>
            {showQualityHint ? `${directSubmitHint} · ` : detectedInputItemCount >= 2 ? `疑似 ${detectedInputItemCount} 项 · ` : ""}
            {inputLength}/{draftInputMaxLength}
          </span>
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
            继续
          </Button>
          <span className="today-log-shortcut-hint">Enter 继续，Shift + Enter 换行</span>
        </div>
      </section>
    </div>
  );
}
