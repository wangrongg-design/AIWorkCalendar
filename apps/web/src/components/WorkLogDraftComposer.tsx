"use client";

import { Alert, Button, Checkbox, DatePicker, Input, InputNumber, Select, TimePicker, Tooltip, Upload } from "antd";
import type { UploadProps } from "antd";
import type { UploadFile } from "antd/es/upload/interface";
import dayjs, { Dayjs } from "dayjs";
import { ChevronDown, ChevronUp, Send, Trash2, UploadCloud } from "lucide-react";
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
  onGenerateDraft: () => void;
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

const weekdayLabels = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

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

export function selectedDraftComposerEntries(preview: WorkLogDraftComposerState | null) {
  return (preview?.items ?? []).map((item, index) => ({ item, index })).filter((entry) => entry.item.selected);
}

export function validateDraftComposerState(preview: WorkLogDraftComposerState | null) {
  const entries = selectedDraftComposerEntries(preview);
  if (!entries.length) {
    return { ok: false as const, message: "请至少选择一条日报项。", index: -1 };
  }
  for (const { item, index } of entries) {
    if (!dayjs(item.date).isValid()) {
      return { ok: false as const, message: `第 ${index + 1} 条日期无效，请重新选择。`, index };
    }
    if (!item.title.trim() || item.title.trim().length < 2) {
      return { ok: false as const, message: `第 ${index + 1} 条缺少标题。`, index };
    }
    if (!item.content.trim() || item.content.trim().length < 2) {
      return { ok: false as const, message: `第 ${index + 1} 条缺少工作内容。`, index };
    }
    if (!Number.isFinite(Number(item.hours)) || Number(item.hours) <= 0 || Number(item.hours) > 24) {
      return { ok: false as const, message: `第 ${index + 1} 条缺少工时。选择开始和结束时间可自动计算，也可以直接填写工时。`, index };
    }
    if (!item.projectId && !item.projectConfirmed) {
      return { ok: false as const, message: `第 ${index + 1} 条项目待确认，请选择项目或确认未关联项目。`, index };
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
  return blocks.join("\n\n") || item.title || "工作填报";
}

const fieldLabels: Record<string, string> = {
  title: "标题",
  content: "内容",
  hours: "工时",
  date: "日期",
  project: "项目",
  projectId: "项目",
  projectHint: "项目"
};

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
  return selectedItems(preview).reduce((sum, item) => sum + (Number.isFinite(Number(item.hours)) ? Number(item.hours) : 0), 0);
}

function selectedKindSummary(preview: WorkLogDraftComposerState | null) {
  const selected = selectedItems(preview);
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

function updateListValue(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function listValue(items: string[]) {
  return items.join("\n");
}

function draftReady(item: WorkLogDraftComposerItem) {
  return (
    item.selected &&
    item.status !== "submitted" &&
    item.status !== "ignored" &&
    dayjs(item.date).isValid() &&
    item.title.trim().length >= 2 &&
    item.content.trim().length >= 2 &&
    Number.isFinite(Number(item.hours)) &&
    Number(item.hours) > 0 &&
    Number(item.hours) <= 24 &&
    Boolean(item.projectId || item.projectConfirmed)
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
  const selectedIndexes = new Set((draftPreview?.items ?? []).map((item, index) => (item.selected ? index : -1)).filter((index) => index >= 0));
  const items = draftPreview?.items ?? [];
  const itemCount = items.length;
  const attachmentTargetIndex = draftPreview?.attachmentTargetIndex ?? 0;
  const hasItems = itemCount > 0;
  const canGenerate = aiInput.trim().length > 0 && !aiPending;
  const hasConversation = aiMessages.some((item) => item.role === "user");
  const canAttach = hasItems && !aiPending;
  const showAttachments = canAttach && (attachmentsOpen || pendingAttachmentCount > 0);
  const canSubmitAny = hasSubmittableDraft(draftPreview);
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
            直接描述工作，我会整理成可编辑草稿。
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
              <strong>正在生成草稿</strong>
              <p>正在识别日期、项目、工时、风险和下一步，正式环境可能需要几秒。</p>
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
                <Button size="small" onClick={onRegenerateDraft ?? onGenerateDraft} disabled={!onRegenerateDraft && !canGenerate}>
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

            <div className="today-log-item-list">
              {items.map((item, index) => {
                const hasMissing = item.missingFields.length > 0;
                const projectName = item.projectId ? projectNameById.get(item.projectId) ?? item.projectName ?? "已选择项目" : null;
                const statusMeta = draftStatusMeta[item.status] ?? draftStatusMeta.generated;
                const locked = item.status === "submitted" || item.status === "ignored" || item.status === "saving" || item.status === "submitting";
                const isProjectReady = Boolean(projectName || item.projectConfirmed);
                const isHoursReady = Number(item.hours) > 0;
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
                        <span className={isProjectReady ? "" : "is-warning"}>{projectName ?? (item.projectConfirmed ? "未关联项目" : "项目待确认")}</span>
                        <span className={isHoursReady ? "" : "is-warning"}>{isHoursReady ? `${Number(item.hours).toFixed(1)}h` : "工时待补充"}</span>
                        {hasMissing ? <span className="is-warning">待补充：{missingFieldText(item.missingFields)}</span> : null}
                      </div>
                      <div className="today-log-item-state">
                        {!projectName ? (
                          <Checkbox checked={item.projectConfirmed} disabled={locked} onChange={(event) => onUpdateItem(index, { projectConfirmed: event.target.checked })}>
                            确认未关联项目
                          </Checkbox>
                        ) : null}
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
                                { value: "DAILY", label: "工作日报" },
                                { value: "PLAN", label: "工作计划" }
                              ]}
                              getPopupContainer={() => document.body}
                              onChange={(value) => onUpdateItem(index, { kind: value, status: item.status === "generated" ? "editing" : item.status })}
                            />
                          </label>
                          <label>
                            <span>项目</span>
                            <Select
                              allowClear
                              showSearch
                              optionFilterProp="label"
                              value={item.projectId}
                              placeholder="项目待确认"
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
                            <span>工时（可修改）</span>
                            <InputNumber
                              className="w-full"
                              min={0}
                              max={24}
                              step={0.5}
                              value={item.hours}
                              disabled={locked}
                              placeholder="选择时间后自动计算"
                              onChange={(value) => onUpdateItem(index, { hours: Number(value ?? 0), status: item.status === "generated" ? "editing" : item.status })}
                            />
                            <small className="today-log-field-note">开始和结束时间会自动带出工时，午休等情况可直接改。</small>
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
              <p className="ant-upload-hint">{hasItems ? "有多条日报时，附件只关联到你选择的一条。" : "先生成或新增日报项后，再选择附件归属。"}</p>
            </Upload.Dragger>
          </div>
        </section>
      ) : null}

      {hasItems ? (
      <div className="today-log-footer">
        <div>
          <strong>共 {draftPreview?.items.length ?? 0} 条记录，已选 {selectedSummary}</strong>
          <span>合计 {Number(totalHours.toFixed(1))}h</span>
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

      <section className="today-log-quick-entry worklog-chat-inputbar">
        <Input.TextArea
          className="today-log-quick-input"
          value={aiInput}
          autoSize={{ minRows: 2, maxRows: 8 }}
          placeholder="描述今天完成了什么、花了多久、明天计划或风险。"
          disabled={aiPending}
          onPaste={handleAttachmentPaste}
          onChange={(event) => onAiInputChange(event.target.value)}
          onPressEnter={(event) => {
            if (!event.shiftKey && canGenerate) {
              event.preventDefault();
              onGenerateDraft();
            }
          }}
        />
        <div className="today-log-quick-actions">
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
          <Button className="today-log-send-button" type="primary" aria-label="发送" icon={<Send size={17} />} loading={aiPending} disabled={!canGenerate} onClick={onGenerateDraft} />
          <span className="today-log-shortcut-hint">Enter 生成，Shift + Enter 换行</span>
        </div>
      </section>
    </div>
  );
}
