"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, DatePicker, Input, Modal, Progress, Select, Space, Tag, Tooltip, Typography, Upload, message } from "antd";
import type { RcFile, UploadFile } from "antd/es/upload/interface";
import dayjs, { Dayjs } from "dayjs";
import { AlertTriangle, Bot, CalendarPlus, CheckCircle2, Paperclip, RefreshCw, Send, UsersRound, WandSparkles } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ClipboardEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { TextAreaRef } from "antd/es/input/TextArea";
import {
  WorkLogDraftComposer,
  composeDraftComposerContent,
  createEmptyDraftComposerItem,
  draftComposerItemFromAi,
  projectIdFromDraftItem,
  projectIdFromText,
  selectedDraftComposerEntries,
  validateDraftComposerState,
  workLogDraftDateLabel,
  type WorkLogDraftComposerItem,
  type WorkLogDraftComposerState
} from "@/components/WorkLogDraftComposer";
import { WorkLogDetailTitle, WorkLogDetailView } from "@/components/WorkLogDetailView";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { CalendarDay, CalendarDayDetail, CalendarResponse, Department, Project, WorkLog, WorkLogAttachment, WorkLogDraft, WorkLogDraftItem, WorkLogKind } from "@/lib/types";

type OrgResponse = {
  departments: Department[];
};

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  contextCount?: number;
};

type CalendarChatResponse = {
  answer: string;
  contextCount: number;
  period: {
    start: string;
    end: string;
  };
};

type WorkLogForm = {
  date: dayjs.Dayjs;
  title: string;
  content: string;
  startTime?: dayjs.Dayjs;
  endTime?: dayjs.Dayjs;
  hours?: number | null;
  projectId?: string;
  kind?: WorkLogKind;
};

type AiDraftMessage = {
  role: "user" | "assistant";
  content: string;
};

type PendingAttachment = {
  uid: string;
  file: File;
};

type AttachmentUploadResult = {
  uploadedCount: number;
  failedCount: number;
  error?: Error;
};

type DetailEmployee = CalendarDayDetail["filledEmployees"][number];

type DraftPreviewItem = WorkLogDraftComposerItem;
type DraftPreview = WorkLogDraftComposerState;

const attachmentMaxBytes = 8 * 1024 * 1024;
const { RangePicker } = DatePicker;
const quickQuestions = ["范围风险/阻塞", "跨月项目进度", "人员投入", "异常工时"];
const copilotActions = [
  { label: "提醒缺填成员", prompt: "列出当前分析范围内需要补齐日报或计划的成员，并给出提醒话术。" },
  { label: "生成范围总结", prompt: "基于当前分析范围内的日报和计划，生成管理总结，区分已完成、计划、风险和下一步。" },
  { label: "查看风险/阻塞项目", prompt: "列出当前范围内存在风险或阻塞的项目，并说明原因。" }
];

function monthCells(month: Dayjs) {
  const startOfMonth = month.startOf("month");
  const endOfMonth = month.endOf("month");
  const mondayOffset = (startOfMonth.day() + 6) % 7;
  const cells: Array<Dayjs | null> = Array.from({ length: mondayOffset }, () => null);
  let cursor = startOfMonth;
  while (cursor.isBefore(endOfMonth) || cursor.isSame(endOfMonth, "day")) {
    cells.push(cursor);
    cursor = cursor.add(1, "day");
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  return cells;
}

const weekLabels = ["一", "二", "三", "四", "五", "六", "日"];
const weekdayLabels = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function monthSummary(days: CalendarDay[]) {
  const filled = days.reduce((sum, day) => sum + day.filledCount, 0);
  const missing = days.reduce((sum, day) => sum + day.missingCount, 0);
  const remind = days.reduce((sum, day) => sum + (day.remindCount ?? 0), 0);
  const risks = days.reduce((sum, day) => sum + day.riskCount, 0);
  const blockers = days.reduce((sum, day) => sum + (day.blockerCount ?? 0), 0);
  const totalHours = days.reduce((sum, day) => sum + (day.totalHours ?? 0), 0);
  const denominator = filled + missing;
  return {
    filled,
    missing,
    remind,
    risks,
    blockers,
    riskBlockers: risks + blockers,
    totalHours: Number(totalHours.toFixed(1)),
    rate: denominator ? Number(((filled / denominator) * 100).toFixed(1)) : 0
  };
}

function calendarRiskBlockerCount(day?: Pick<CalendarDay, "riskCount" | "blockerCount"> | null) {
  return (day?.riskCount ?? 0) + (day?.blockerCount ?? 0);
}

function detailRiskBlockerCount(stats?: CalendarDayDetail["stats"] | null) {
  return (stats?.riskCount ?? 0) + (stats?.blockerCount ?? 0);
}

function sortWorkLogs(logs: WorkLog[]) {
  return [...logs].sort((a, b) => {
    const aKey = a.submittedAt ?? a.createdAt ?? a.updatedAt ?? a.id;
    const bKey = b.submittedAt ?? b.createdAt ?? b.updatedAt ?? b.id;
    return aKey.localeCompare(bKey);
  });
}

function mergeDetailEmployeesById(employees: DetailEmployee[]) {
  const map = new Map<string, DetailEmployee>();
  for (const employee of employees) {
    const current = map.get(employee.id);
    if (!current) {
      map.set(employee.id, { ...employee, logs: sortWorkLogs(employee.logs) });
      continue;
    }
    current.logs = sortWorkLogs([...current.logs, ...employee.logs]);
    current.departmentName = current.departmentName ?? employee.departmentName;
  }
  return Array.from(map.values());
}

function sumLogHours(logs: WorkLog[]) {
  return Number(logs.reduce((sum, log) => sum + (Number(log.hours) || 0), 0).toFixed(1));
}

function workLogProjectLabel(log: WorkLog) {
  if (!log.project) return "未关联项目";
  return log.project.code ? `${log.project.code} · ${log.project.name}` : log.project.name;
}

function workLogRiskLabel(log: WorkLog) {
  return log.aiAnalysis?.blockers?.[0] ?? log.aiAnalysis?.risks?.[0] ?? null;
}

function dateKind(date: string) {
  const today = dayjs().format("YYYY-MM-DD");
  if (date === today) return "today";
  return date > today ? "future" : "past";
}

function chineseDateLabel(date: string) {
  const value = dayjs(date);
  return `${value.format("YYYY年M月D日")} · ${weekdayLabels[value.day()]}`;
}

function normalizeCopilotRange(range: [Dayjs, Dayjs]): [Dayjs, Dayjs] {
  const start = range[0].startOf("day");
  const end = range[1].startOf("day");
  return start.isAfter(end, "day") ? [end, start] : [start, end];
}

function copilotRangeLabel(start: Dayjs, end: Dayjs) {
  if (start.isSame(end, "day")) {
    return start.format("YYYY年M月D日");
  }
  return `${start.format("YYYY年M月D日")} 至 ${end.format("YYYY年M月D日")}`;
}

function clipboardImageFiles(event: ClipboardEvent<HTMLElement>) {
  return Array.from(event.clipboardData?.items ?? [])
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item, index) => {
      const file = item.getAsFile();
      if (!file) return null;
      const extension = file.type.split("/")[1] || "png";
      const filename = file.name || `pasted-image-${Date.now()}-${index + 1}.${extension}`;
      return new File([file], filename, { type: file.type || "image/png" });
    })
    .filter((file): file is File => Boolean(file));
}

function renderMarkdownInline(text: string) {
  const nodes: ReactNode[] = [];
  const pattern = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    nodes.push(<strong key={`${match.index}-${match[1]}`}>{match[1]}</strong>);
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes.length ? nodes : text;
}

function renderAssistantMarkdown(content: string) {
  const nodes: ReactNode[] = [];
  let list: { type: "ul" | "ol"; items: ReactNode[] } | null = null;

  const flushList = () => {
    if (!list) return;
    const ListTag = list.type;
    nodes.push(
      <ListTag key={`list-${nodes.length}`} className="ai-copilot-markdown-list">
        {list.items}
      </ListTag>
    );
    list = null;
  };

  content.replace(/\r\n/g, "\n").split("\n").forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      return;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (heading) {
      flushList();
      nodes.push(
        <strong key={`heading-${index}`} className="ai-copilot-markdown-heading">
          {renderMarkdownInline(heading[2])}
        </strong>
      );
      return;
    }
    const unordered = /^[-*]\s+(.+)$/.exec(trimmed);
    const ordered = /^\d+\.\s+(.+)$/.exec(trimmed);
    if (unordered || ordered) {
      const type = unordered ? "ul" : "ol";
      if (!list || list.type !== type) {
        flushList();
        list = { type, items: [] };
      }
      list.items.push(<li key={`item-${index}`}>{renderMarkdownInline((unordered ?? ordered)?.[1] ?? trimmed)}</li>);
      return;
    }
    flushList();
    nodes.push(<p key={`paragraph-${index}`}>{renderMarkdownInline(trimmed)}</p>);
  });
  flushList();
  return nodes;
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result ?? "");
      resolve(value.includes(",") ? value.split(",")[1] : value);
    };
    reader.onerror = () => reject(new Error("附件读取失败"));
    reader.readAsDataURL(file);
  });
}

function toWorkLogPayload(values: WorkLogForm) {
  const date = values.date;
  const hours = typeof values.hours === "number" && Number.isFinite(values.hours) ? values.hours : null;
  return {
    date: date.format("YYYY-MM-DD"),
    title: values.title,
    content: values.content,
    startTime: values.startTime
      ? date.hour(values.startTime.hour()).minute(values.startTime.minute()).second(0).millisecond(0).toISOString()
      : undefined,
    endTime: values.endTime
      ? date.hour(values.endTime.hour()).minute(values.endTime.minute()).second(0).millisecond(0).toISOString()
      : undefined,
    hours,
    projectId: values.projectId || undefined,
    kind: values.kind ?? (date.format("YYYY-MM-DD") > dayjs().format("YYYY-MM-DD") ? "PLAN" : "DAILY")
  };
}

function normalizedDraftItems(draft: WorkLogDraft): WorkLogDraftItem[] {
  return draft.items?.length ? draft.items : [draft];
}

function draftItemToForm(item: WorkLogDraftItem): WorkLogForm {
  const date = dayjs(item.date);
  const safeDate = date.isValid() ? date : dayjs();
  const hours = Number(item.hours);
  return {
    date: safeDate,
    title: item.title || "工作填报",
    content: item.content || item.title || "工作填报",
    hours: Number.isFinite(hours) ? hours : null,
    kind: item.kind,
    startTime: draftTimeToDayjs(item.startTime, safeDate),
    endTime: draftTimeToDayjs(item.endTime, safeDate)
  };
}

function draftPreviewItemToForm(item: DraftPreviewItem): WorkLogForm {
  return {
    ...draftItemToForm(item),
    content: composeDraftComposerContent(item),
    projectId: item.projectId
  };
}

function draftTimeToDayjs(value: string | null | undefined, date: Dayjs) {
  if (!value) return undefined;
  const clock = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (clock) {
    return date.hour(Number(clock[1])).minute(Number(clock[2])).second(0).millisecond(0);
  }
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed : undefined;
}

export default function CalendarPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const today = dayjs().format("YYYY-MM-DD");
  const [quickFillDate, setQuickFillDate] = useState(dayjs());
  const [month, setMonth] = useState(dayjs());
  const [copilotRange, setCopilotRange] = useState<[Dayjs, Dayjs]>(() => normalizeCopilotRange([dayjs().startOf("month"), dayjs().endOf("month")]));
  const [scope, setScope] = useState<"self" | "department" | "company">(
    user?.roles.includes("COMPANY_ADMIN") || user?.roles.includes("SUPER_ADMIN")
      ? "company"
      : user?.roles.includes("DEPARTMENT_MANAGER")
        ? "department"
        : "self"
  );
  const [departmentId, setDepartmentId] = useState<string | undefined>(undefined);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [selectedWorkLog, setSelectedWorkLog] = useState<WorkLog | null>(null);
  const [quickFillOpen, setQuickFillOpen] = useState(false);
  const [quickFillAiInput, setQuickFillAiInput] = useState("");
  const [lastQuickFillAiInput, setLastQuickFillAiInput] = useState("");
  const [quickFillAiMessages, setQuickFillAiMessages] = useState<AiDraftMessage[]>([
    {
      role: "assistant",
      content: "告诉我今天完成了什么、花了多久，或明天计划做什么；我会先生成草稿，确认后再提交。"
    }
  ]);
  const [draftPreview, setDraftPreview] = useState<DraftPreview | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [chatInput, setChatInput] = useState("");
  const chatThreadRef = useRef<HTMLDivElement | null>(null);
  const chatInputRef = useRef<TextAreaRef | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "可以直接问我：指定范围内的团队重点、跨月风险/阻塞、未来计划、某个部门工时投入。回答只基于你当前权限可见的日报和计划。"
    }
  ]);

  useEffect(() => {
    const dateParam = searchParams.get("date");
    if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) return;
    const nextDate = dayjs(dateParam);
    if (!nextDate.isValid()) return;
    setMonth(nextDate);
    setSelectedDate(dateParam);
  }, [searchParams]);

  const org = useQuery({
    queryKey: ["org"],
    queryFn: () => apiFetch<OrgResponse>("/org")
  });

  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: () => apiFetch<Project[]>("/projects")
  });

  const projectOptions = useMemo(
    () =>
      (projects.data ?? [])
        .filter((item) => item.status === "ACTIVE")
        .map((item) => ({ value: item.id, label: item.code ? `${item.code} · ${item.name}` : item.name })),
    [projects.data]
  );

  const projectNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const project of projects.data ?? []) {
      map.set(project.id, project.code ? `${project.code} · ${project.name}` : project.name);
    }
    return map;
  }, [projects.data]);

  const pendingUploadFiles: UploadFile[] = useMemo(
    () =>
      pendingAttachments.map((item) => ({
        uid: item.uid,
        name: item.file.name,
        size: item.file.size,
        status: "done"
      })),
    [pendingAttachments]
  );

  const uploadPendingAttachments = async (workLogId: string): Promise<AttachmentUploadResult> => {
    const files = [...pendingAttachments];
    let uploadedCount = 0;
    for (const item of files) {
      try {
        const contentBase64 = await fileToBase64(item.file);
        await apiFetch<WorkLogAttachment>(`/work-logs/${workLogId}/attachments`, {
          method: "POST",
          body: JSON.stringify({
            fileName: item.file.name,
            mimeType: item.file.type || "application/octet-stream",
            fileSize: item.file.size,
            contentBase64
          })
        });
        uploadedCount += 1;
      } catch (error) {
        return {
          uploadedCount,
          failedCount: files.length - uploadedCount,
          error: error instanceof Error ? error : new Error("附件上传失败")
        };
      }
    }
    if (files.length) {
      setPendingAttachments([]);
    }
    return { uploadedCount, failedCount: 0 };
  };

  const createWorkLogRecord = async (values: WorkLogForm, withAttachments: boolean, submit: boolean) => {
    const workLog = await apiFetch<WorkLog>("/work-logs", { method: "POST", body: JSON.stringify(toWorkLogPayload(values)) });
    let attachmentUpload: AttachmentUploadResult | null = null;
    if (withAttachments) {
      attachmentUpload = await uploadPendingAttachments(workLog.id);
    }
    const savedWorkLog = submit ? await apiFetch<WorkLog>(`/work-logs/${workLog.id}/submit`, { method: "POST" }) : workLog;
    return { workLog: savedWorkLog, attachmentUpload };
  };

  const draftWorkLog = useMutation({
    mutationFn: async (messages: AiDraftMessage[]) => {
      const currentDate = quickFillDate.format("YYYY-MM-DD");
      const draft = await apiFetch<WorkLogDraft>("/ai/work-log-draft", {
        method: "POST",
        body: JSON.stringify({
          currentDate,
          messages
        })
      });
      const items = normalizedDraftItems(draft);
      const attachedToFirst = pendingAttachments.length > 0 && items.length > 1;
      const conversationProjectId = projectIdFromText(projects.data, messages.filter((item) => item.role === "user").map((item) => item.content).join(" "));
      return {
        assistantMessage: draft.assistantMessage,
        items: items.map((item, index) => draftComposerItemFromAi(item, index, projectIdFromDraftItem(projects.data, item) ?? conversationProjectId)),
        attachedToFirst,
        attachmentTargetIndex: 0
      };
    },
    onSuccess: (preview) => {
      setDraftPreview(preview);
      setQuickFillAiMessages((messages) => [...messages, { role: "assistant", content: `${preview.assistantMessage} 请确认草稿内容后提交。` }]);
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : "草稿生成失败，请调整描述后重试。");
    }
  });

  const persistDraftWorkLog = useMutation({
    mutationFn: async ({ preview, submit }: { preview: DraftPreview; submit: boolean }) => {
      const selectedEntries = selectedDraftComposerEntries(preview);
      if (!selectedEntries.length) {
        throw new Error("请至少选择一条日报项。");
      }
      const hasAttachments = pendingAttachments.length > 0;
      const requestedTargetIndex = Number.isInteger(preview.attachmentTargetIndex) ? preview.attachmentTargetIndex : selectedEntries[0].index;
      const uploadTargetIndex = selectedEntries.some((entry) => entry.index === requestedTargetIndex) ? requestedTargetIndex : selectedEntries[0].index;
      let attachmentUpload: AttachmentUploadResult | null = null;
      const persistedItems: Array<{ localId: string; workLog: WorkLog; index: number }> = [];
      for (const { item, index } of selectedEntries) {
        const result = await createWorkLogRecord(draftPreviewItemToForm(item), hasAttachments && index === uploadTargetIndex, submit);
        persistedItems.push({ localId: item.localId, workLog: result.workLog, index });
        if (result.attachmentUpload) {
          attachmentUpload = result.attachmentUpload;
        }
      }
      return { ...preview, persistedCount: selectedEntries.length, persistedItems, hasAttachments, uploadTargetIndex, submit, attachmentUpload };
    },
    onSuccess: (preview) => {
      message.success(preview.submit ? `已提交 ${preview.persistedCount} 条日报。` : `已保存 ${preview.persistedCount} 条草稿。`);
      if (preview.attachmentUpload?.failedCount) {
        message.warning(
          `${preview.submit ? "日报已提交" : "草稿已保存"}，但 ${preview.attachmentUpload.failedCount} 个附件上传失败。${preview.attachmentUpload.error?.message ?? "请稍后在填报记录中重新上传。"}`
        );
      } else if (preview.hasAttachments && preview.persistedCount > 1) {
        message.info(`附件已关联到第 ${preview.uploadTargetIndex + 1} 条已确认草稿。`);
      }
      const persistedByLocalId = new Map(preview.persistedItems.map((item) => [item.localId, item.workLog]));
      setDraftPreview((current) =>
        current
          ? {
              ...current,
              items: current.items.map((item) => {
                const workLog = persistedByLocalId.get(item.localId);
                return workLog
                  ? {
                      ...item,
                      workLogId: workLog.id,
                      status: preview.submit ? ("submitted" as const) : ("saved" as const),
                      submittedAt: preview.submit ? (workLog.submittedAt ?? new Date().toISOString()) : item.submittedAt,
                      selected: false,
                      errorMessage: undefined
                    }
                  : item;
              })
            }
          : current
      );
      const firstWorkLog = preview.persistedItems[0]?.workLog;
      setQuickFillAiMessages((messages) => [
        ...messages,
        {
          role: "assistant",
          content: preview.submit
            ? `已提交到 ${firstWorkLog?.date ?? quickFillDate.format("YYYY-MM-DD")} 工作日报，稍后会进入分析队列。`
            : `已保存 ${preview.persistedCount} 条草稿，可以在填报记录中继续处理。`
        }
      ]);
      setPendingAttachments([]);
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      queryClient.invalidateQueries({ queryKey: ["calendar-today"] });
      queryClient.invalidateQueries({ queryKey: ["calendar-day"] });
      queryClient.invalidateQueries({ queryKey: ["work-logs"] });
    },
    onError: (error) => {
      setDraftPreview((current) =>
        current
          ? {
              ...current,
              items: current.items.map((item) =>
                item.selected && item.status !== "submitted" && item.status !== "ignored"
                  ? { ...item, status: "failed" as const, errorMessage: error instanceof Error ? error.message : "保存日报项失败，请检查后重试。" }
                  : item
              )
            }
          : current
      );
      message.error(error instanceof Error ? error.message : "保存日报项失败，请检查后重试。");
    }
  });

  const calendar = useQuery({
    queryKey: ["calendar", month.format("YYYY-MM"), scope, departmentId],
    queryFn: () => {
      const params = new URLSearchParams({
        month: month.format("YYYY-MM"),
        scope
      });
      if (departmentId) params.set("departmentId", departmentId);
      return apiFetch<CalendarResponse>(`/analytics/calendar?${params.toString()}`);
    }
  });

  const todayDetail = useQuery({
    queryKey: ["calendar-today", today, scope, departmentId],
    queryFn: () => {
      const params = new URLSearchParams({ date: today, scope });
      if (departmentId) params.set("departmentId", departmentId);
      return apiFetch<CalendarDayDetail>(`/analytics/calendar/day?${params.toString()}`);
    }
  });

  const dayDetail = useQuery({
    queryKey: ["calendar-day", selectedDate, scope, departmentId],
    queryFn: () => {
      if (!selectedDate) throw new Error("No selected date");
      const params = new URLSearchParams({ date: selectedDate, scope });
      if (departmentId) params.set("departmentId", departmentId);
      return apiFetch<CalendarDayDetail>(`/analytics/calendar/day?${params.toString()}`);
    },
    enabled: Boolean(selectedDate)
  });

  const dayMap = useMemo(() => {
    const map = new Map<string, CalendarDay>();
    for (const day of calendar.data?.days ?? []) {
      map.set(day.date, day);
    }
    return map;
  }, [calendar.data?.days]);

  const cells = useMemo(() => monthCells(month), [month]);
  const canChooseDepartment = user?.roles.includes("COMPANY_ADMIN") || user?.roles.includes("SUPER_ADMIN");
  const summary = useMemo(() => monthSummary(calendar.data?.days ?? []), [calendar.data?.days]);
  const currentWeekDays = useMemo(() => {
    const weekStart = dayjs().startOf("day").subtract((dayjs().day() + 6) % 7, "day");
    const weekEnd = weekStart.add(6, "day");
    return (calendar.data?.days ?? []).filter((day) => {
      const value = dayjs(day.date);
      return value.isValid() && (value.isSame(weekStart, "day") || value.isAfter(weekStart, "day")) && (value.isSame(weekEnd, "day") || value.isBefore(weekEnd, "day"));
    });
  }, [calendar.data?.days]);
  const weekBrief = useMemo(() => monthSummary(currentWeekDays), [currentWeekDays]);
  const focusDays = useMemo(() => {
    const visibleDays = calendar.data?.days ?? [];
    return visibleDays
      .filter((day) => {
        const actionableMissing = dateKind(day.date) === "future" ? day.missingCount : (day.remindCount ?? day.missingCount);
        return day.date === today || calendarRiskBlockerCount(day) > 0 || actionableMissing > 0;
      })
      .sort((a, b) => {
        if (a.date === today) return -1;
        if (b.date === today) return 1;
        const aMissing = dateKind(a.date) === "future" ? a.missingCount : (a.remindCount ?? a.missingCount);
        const bMissing = dateKind(b.date) === "future" ? b.missingCount : (b.remindCount ?? b.missingCount);
        return calendarRiskBlockerCount(b) - calendarRiskBlockerCount(a) || bMissing - aMissing || a.date.localeCompare(b.date);
      })
      .slice(0, 5);
  }, [calendar.data?.days, today]);
  const todayStats = todayDetail.data?.stats;
  const todayFilledEmployees = useMemo(() => mergeDetailEmployeesById(todayDetail.data?.filledEmployees ?? []), [todayDetail.data?.filledEmployees]);
  const todayReferenceCount = useMemo(
    () => todayFilledEmployees.flatMap((employee) => employee.logs).length,
    [todayFilledEmployees]
  );
  const isCalendarSyncing = calendar.isFetching || todayDetail.isFetching || dayDetail.isFetching;
  const calendarSyncError = calendar.error ?? todayDetail.error;
  const calendarSyncErrorMessage = calendarSyncError instanceof Error ? calendarSyncError.message : "请稍后重试。";
  const lastCalendarUpdatedAt = useMemo(() => {
    const timestamps = [calendar.dataUpdatedAt, todayDetail.dataUpdatedAt, selectedDate ? dayDetail.dataUpdatedAt : 0].filter((value) => value > 0);
    return timestamps.length ? dayjs(Math.max(...timestamps)).format("HH:mm:ss") : null;
  }, [calendar.dataUpdatedAt, dayDetail.dataUpdatedAt, selectedDate, todayDetail.dataUpdatedAt]);

  const refreshCalendarStatus = () => {
    void calendar.refetch();
    void todayDetail.refetch();
    if (selectedDate) {
      void dayDetail.refetch();
    }
  };

  const todayPriority = useMemo(() => {
    if (todayDetail.isFetching || calendar.isFetching) {
      return {
        tone: "neutral",
        title: "正在同步今日团队状态",
        copy: "稍后会给出风险/阻塞、缺填和填报覆盖情况。"
      };
    }
    if (!todayStats || todayStats.totalEmployees === 0) {
      return {
        tone: "neutral",
        title: "等待团队数据",
        copy: "当前范围暂无可分析成员，先确认团队、部门和日报要求配置。"
      };
    }
    const todayRiskBlockerCount = detailRiskBlockerCount(todayStats);
    if (todayRiskBlockerCount > 0) {
      return {
        tone: "danger",
        title: `${todayRiskBlockerCount} 条风险/阻塞待确认`,
        copy: "先确认影响项目和负责人，再决定是否提醒或升级。"
      };
    }
    const remindCount = todayStats.remindCount ?? todayStats.missingCount;
    if (remindCount > 0) {
      return {
        tone: "warning",
        title: `${remindCount} 位成员未填报`,
        copy: `当前填报率 ${todayStats.fillRate}%，先补齐团队状态，避免日报和复盘失真。`
      };
    }
    if (todayStats.filledCount === 0) {
      return {
        tone: "warning",
        title: "今天还没有提交记录",
        copy: "建议先提醒团队提交日报或计划，避免今日状态缺失。"
      };
    }
    return {
      tone: "success",
      title: "今日团队状态正常",
      copy: `团队合计 ${todayStats.totalHours}h，暂无风险/阻塞和缺填，可继续查看本周节奏。`
    };
  }, [calendar.isFetching, todayDetail.isFetching, todayStats]);

  const detailStats = dayDetail.data?.stats;
  const detailFilledEmployees = useMemo(() => mergeDetailEmployeesById(dayDetail.data?.filledEmployees ?? []), [dayDetail.data?.filledEmployees]);
  const detailMissingEmployees = dayDetail.data?.missingEmployees ?? [];
  const detailLogs = useMemo(() => detailFilledEmployees.flatMap((employee) => employee.logs), [detailFilledEmployees]);
  const detailLogCount = detailLogs.length;
  const detailDailyLogCount = detailLogs.filter((log) => (log.kind ?? "DAILY") === "DAILY").length;
  const detailPlanLogCount = detailLogs.filter((log) => (log.kind ?? "DAILY") === "PLAN").length;
  const detailRecordSections = useMemo(
    () =>
      [
        {
          key: "DAILY" as const,
          title: "日报记录",
          subtitle: "当天实际完成的工作记录",
          employees: detailFilledEmployees
            .map((employee) => ({ ...employee, logs: employee.logs.filter((log) => (log.kind ?? "DAILY") === "DAILY") }))
            .filter((employee) => employee.logs.length > 0)
        },
        {
          key: "PLAN" as const,
          title: selectedDate && dateKind(selectedDate) === "future" ? "计划记录" : "历史计划",
          subtitle: selectedDate && dateKind(selectedDate) === "future" ? "成员提前提交的工作安排" : "过去曾提前写入的计划记录",
          employees: detailFilledEmployees
            .map((employee) => ({ ...employee, logs: employee.logs.filter((log) => (log.kind ?? "DAILY") === "PLAN") }))
            .filter((employee) => employee.logs.length > 0)
        }
      ].filter((section) => section.employees.length > 0),
    [detailFilledEmployees, selectedDate]
  );
  const selectedWorkLogNavigation = useMemo(() => {
    if (!selectedWorkLog) return null;
    const selectedKind = selectedWorkLog.kind ?? "DAILY";
    const employee = detailFilledEmployees.find((item) => item.id === selectedWorkLog.userId || item.logs.some((log) => log.id === selectedWorkLog.id));
    if (!employee) return null;

    const employeeLogs = sortWorkLogs(employee.logs.filter((log) => (log.kind ?? "DAILY") === selectedKind));
    const currentIndex = employeeLogs.findIndex((log) => log.id === selectedWorkLog.id);
    if (currentIndex < 0 || employeeLogs.length <= 1) return null;

    const navigateTo = (index: number) => {
      const nextLog = employeeLogs[index];
      if (nextLog) setSelectedWorkLog(nextLog);
    };

    return {
      current: currentIndex + 1,
      total: employeeLogs.length,
      previousDisabled: currentIndex <= 0,
      nextDisabled: currentIndex >= employeeLogs.length - 1,
      onPrevious: () => navigateTo(currentIndex - 1),
      onNext: () => navigateTo(currentIndex + 1)
    };
  }, [detailFilledEmployees, selectedWorkLog]);
  const detailProjectGroups = useMemo(() => {
    const map = new Map<string, { key: string; name: string; hours: number; count: number }>();
    for (const log of detailLogs) {
      const key = log.projectId ?? "unassigned";
      const name = log.project ? (log.project.code ? `${log.project.code} · ${log.project.name}` : log.project.name) : "日常工作";
      const current = map.get(key) ?? { key, name, hours: 0, count: 0 };
      current.hours += Number(log.hours) || 0;
      current.count += 1;
      map.set(key, current);
    }
    return Array.from(map.values())
      .map((item) => ({ ...item, hours: Number(item.hours.toFixed(1)) }))
      .sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name));
  }, [detailLogs]);
  const selectedDateKind = selectedDate ? dateKind(selectedDate) : "today";
  const hasHistoricalPlans = selectedDateKind !== "future" && detailPlanLogCount > 0;
  const detailTitle = selectedDateKind === "future" ? "团队计划情况" : hasHistoricalPlans ? "团队填报与历史计划" : "团队填报情况";
  const detailRemindCount = detailStats?.remindCount ?? (selectedDateKind === "future" ? 0 : detailMissingEmployees.length);
  const detailPlanReminderCount = selectedDateKind === "future" ? detailMissingEmployees.length : 0;
  const detailReminderActionCount = selectedDateKind === "future" ? detailPlanReminderCount : detailRemindCount;
  const detailReminderNames = detailMissingEmployees
    .slice(0, 6)
    .map((item) => item.name)
    .join("、");
  const detailReminderMessage =
    detailReminderNames && detailMissingEmployees.length > 6
      ? `${detailReminderNames} 等 ${detailMissingEmployees.length} 人`
      : detailReminderNames;
  const aiObservations = useMemo(() => {
    if (!selectedDate) return [];
    if (dayDetail.isFetching) return ["正在分析团队日报…"];
    const stats = dayDetail.data?.stats;
    if (!stats) return ["等待团队数据同步后生成洞察。"];
    const planLogCount = stats.planLogCount ?? 0;
    const dailyLogCount = stats.dailyLogCount ?? 0;
    if (stats.filledCount === 0) {
      if (selectedDateKind !== "future" && planLogCount > 0) {
        return [`这一天有 ${planLogCount} 条历史计划，但暂无对应日报记录。`];
      }
      return [selectedDateKind === "future" ? "这一天还没有团队成员提交计划。" : "今天还没有团队成员提交日报。"];
    }
    const missingOrRemindCount = selectedDateKind === "future" ? stats.missingCount : stats.remindCount ?? stats.missingCount;
    const observations = [
      missingOrRemindCount > 0
        ? `${missingOrRemindCount} 位成员尚未${selectedDateKind === "future" ? "提交计划" : "提交日报"}，可优先提醒。`
        : `团队${selectedDateKind === "future" ? "计划" : "日报"}已全部提交。`,
      detailRiskBlockerCount(stats) > 0 ? `发现 ${detailRiskBlockerCount(stats)} 条风险/阻塞信号，建议先查看异常记录。` : "暂未发现明显风险/阻塞信号。",
      stats.totalHours > 0 ? `当前记录工时合计 ${stats.totalHours}h，可继续按项目核对投入。` : "当前暂无可分析工时。"
    ];
    if (selectedDateKind !== "future" && planLogCount > 0) {
      observations.push(`另有 ${planLogCount} 条历史计划${dailyLogCount > 0 ? "，可对照实际日报检查兑现情况。" : "，但暂无日报可对照。"}`);
    }
    const firstProject = detailLogs.find((log) => log.project)?.project?.name;
    if (firstProject) {
      observations.push(`${firstProject} 已出现在今日记录中，可进一步询问项目进展。`);
    }
    return observations;
  }, [dayDetail.data, dayDetail.isFetching, detailLogs, selectedDate, selectedDateKind]);
  const normalizedCopilotRange = useMemo(() => normalizeCopilotRange(copilotRange), [copilotRange]);
  const [copilotStartDate, copilotEndDate] = normalizedCopilotRange;
  const assistantRangeLabel = copilotRangeLabel(copilotStartDate, copilotEndDate);
  const copilotRangeDays = copilotEndDate.diff(copilotStartDate, "day") + 1;
  const displayedCopilotRange: [Dayjs, Dayjs] = selectedDate ? [dayjs(selectedDate), dayjs(selectedDate)] : normalizedCopilotRange;
  const displayedCopilotRangeLabel = selectedDate ? chineseDateLabel(selectedDate) : assistantRangeLabel;
  const displayedCopilotRangeDays = selectedDate ? 1 : copilotRangeDays;
  const assistantRangeIsVisibleMonth =
    copilotStartDate.isSame(month.startOf("month"), "day") && copilotEndDate.isSame(month.endOf("month").startOf("day"), "day");
  const copilotRangePresets = useMemo(() => {
    const now = dayjs().startOf("day");
    const quarterStartMonth = Math.floor(now.month() / 3) * 3;
    return [
      { label: "当前月", range: normalizeCopilotRange([month.startOf("month"), month.endOf("month")]) },
      { label: "近30天", range: normalizeCopilotRange([now.subtract(29, "day"), now]) },
      { label: "本季度", range: normalizeCopilotRange([now.month(quarterStartMonth).startOf("month"), now]) },
      { label: "近90天", range: normalizeCopilotRange([now.subtract(89, "day"), now]) }
    ];
  }, [month]);
  const updateCopilotRange = (range: [Dayjs, Dayjs]) => {
    setSelectedDate(null);
    setCopilotRange(normalizeCopilotRange(range));
  };
  const switchCopilotToRangeMode = () => {
    setSelectedDate(null);
    setCopilotRange(normalizedCopilotRange);
  };
  const copilotObservations = useMemo(() => {
    if (selectedDate) {
      return aiObservations;
    }
    if (!assistantRangeIsVisibleMonth) {
      return [
        `已选择 ${assistantRangeLabel}，助手会按 ${copilotRangeDays} 天的日期区间查询日报和计划。`,
        `当前月历仍显示 ${month.format("YYYY年M月")}，可继续切换月份查看单日详情。`,
        "适合追问跨月风险、项目投入、人员负载和范围总结。"
      ];
    }
    if (calendar.isFetching) {
      return ["正在分析当前月历数据…"];
    }
    if (!summary.filled && !summary.missing) {
      return ["当前月历暂无可分析日报或计划。"];
    }
    return [
      summary.remind > 0 ? `本月截至今天还有 ${summary.remind} 人次日报需要提醒补齐。` : `本月填报率为 ${summary.rate}%，团队提交节奏稳定。`,
      summary.riskBlockers > 0 ? `本月累计出现 ${summary.riskBlockers} 条风险/阻塞信号，建议查看重点日期和项目。` : "本月暂未出现明显风险/阻塞信号。",
      summary.filled > 0 ? `当前范围累计 ${summary.filled} 条已提交记录，可继续追问项目进展和人员投入。` : "还没有足够记录支撑深入分析。"
    ];
  }, [
    aiObservations,
    assistantRangeIsVisibleMonth,
    assistantRangeLabel,
    calendar.isFetching,
    copilotRangeDays,
    month,
    selectedDate,
    summary.filled,
    summary.missing,
    summary.rate,
    summary.remind,
    summary.riskBlockers
  ]);
  const copilotContext = useMemo(
    () => [
      displayedCopilotRangeLabel,
      `${displayedCopilotRangeDays}天范围`,
      scope === "self" ? user?.name ?? "我" : scope === "department" ? "本部门" : "全公司",
      "日历看板",
      "日报数据",
      "工作计划"
    ],
    [displayedCopilotRangeDays, displayedCopilotRangeLabel, scope, user?.name]
  );
  const calendarChat = useMutation({
    mutationFn: (question: string) =>
      apiFetch<CalendarChatResponse>("/ai/chat/calendar", {
        method: "POST",
        body: JSON.stringify({
          question,
          ...(selectedDate
            ? { date: selectedDate }
            : {
                startDate: copilotStartDate.format("YYYY-MM-DD"),
                endDate: copilotEndDate.format("YYYY-MM-DD")
              }),
          scope,
          departmentId
        })
      }),
    onSuccess: (data) => {
      setChatMessages((items) => [
        ...items,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: data.answer,
          contextCount: data.contextCount
        }
      ]);
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : "助手暂时无法回答，请稍后重试。");
    }
  });

  useEffect(() => {
    if (!chatOpen) return;
    const frame = window.requestAnimationFrame(() => {
      const thread = chatThreadRef.current;
      if (!thread) return;
      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      thread.scrollTo({ top: thread.scrollHeight, behavior: prefersReducedMotion ? "auto" : "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [calendarChat.isPending, chatMessages, chatOpen]);

  useEffect(() => {
    if (!chatOpen || calendarChat.isPending) return;
    const frame = window.requestAnimationFrame(() => {
      chatInputRef.current?.focus({ cursor: "end" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [calendarChat.isPending, chatOpen]);

  const submitCalendarChat = (question = chatInput) => {
    const normalized = question.trim();
    if (!normalized || calendarChat.isPending) return;
    setChatMessages((items) => [
      ...items,
      {
        id: `user-${Date.now()}`,
        role: "user",
        content: normalized
      }
    ]);
    setChatInput("");
    calendarChat.mutate(normalized);
  };

  const runCopilotPrompt = (question: string) => {
    setChatOpen(true);
    submitCalendarChat(question);
  };

  const openQuickFill = (date: string) => {
    const dateValue = dayjs(date);
    setSelectedDate(null);
    setQuickFillDate(dateValue);
    setPendingAttachments([]);
    setQuickFillAiInput("");
    setLastQuickFillAiInput("");
    setQuickFillAiMessages([]);
    setDraftPreview({
      assistantMessage: "今日日报项",
      items: [],
      attachedToFirst: false,
      attachmentTargetIndex: 0
    });
    setQuickFillOpen(true);
  };

  const addPendingFiles = (files: File[], source: "upload" | "paste") => {
    const accepted = files.reduce<PendingAttachment[]>((result, file, index) => {
      if (file.size > attachmentMaxBytes) {
        message.error("单个附件不能超过 8MB，请压缩后重新上传。");
        return result;
      }
      const uploadFile = file as RcFile;
      result.push({
        uid: uploadFile.uid || `${source}-${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`,
        file
      });
      return result;
    }, []);
    if (!accepted.length) {
      return false;
    }
    setPendingAttachments((items) => [...items, ...accepted]);
    if (source === "paste") {
      message.success(`已添加 ${accepted.length} 张粘贴图片。`);
    }
    return true;
  };

  const addPendingAttachment = (file: RcFile) => {
    return addPendingFiles([file], "upload") ? false : Upload.LIST_IGNORE;
  };

  const handlePasteImages = (event: ClipboardEvent<HTMLElement>) => {
    const files = clipboardImageFiles(event);
    if (!files.length) {
      return;
    }
    event.preventDefault();
    addPendingFiles(files, "paste");
  };

  const sendQuickFillAiMessage = () => {
    const text = quickFillAiInput.trim();
    if (!text) return;
    const nextMessages = [...quickFillAiMessages, { role: "user" as const, content: text }];
    setLastQuickFillAiInput(text);
    setQuickFillAiMessages(nextMessages);
    setQuickFillAiInput("");
    draftWorkLog.mutate(nextMessages);
  };

  const regenerateQuickFillDraft = () => {
    if (!quickFillAiMessages.some((item) => item.role === "user")) return;
    setDraftPreview((current) =>
      current
        ? {
            ...current,
            items: current.items.map((item) => (item.status === "submitted" ? item : { ...item, status: "ignored" as const, selected: false }))
          }
        : current
    );
    draftWorkLog.mutate(quickFillAiMessages);
  };

  const continueEditingQuickFillPrompt = () => {
    setQuickFillAiInput((current) => current || lastQuickFillAiInput);
  };

  const updateDraftPreviewItem = (index: number, patch: Partial<DraftPreviewItem>) => {
    setDraftPreview((current) =>
      current
        ? {
            ...current,
            items: current.items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item))
          }
        : current
    );
  };

  const deleteDraftPreviewItem = (index: number) => {
    setDraftPreview((current) => {
      if (!current) return current;
      const items = current.items.filter((_, itemIndex) => itemIndex !== index);
      return {
        ...current,
        items,
        attachmentTargetIndex: Math.max(0, Math.min(current.attachmentTargetIndex, Math.max(0, items.length - 1)))
      };
    });
  };

  const addManualDraftItem = () => {
    setDraftPreview((current) => {
      const nextItem = createEmptyDraftComposerItem(quickFillDate);
      if (!current) {
        return {
          assistantMessage: "手动新增项目日报项。",
          items: [nextItem],
          attachedToFirst: false,
          attachmentTargetIndex: 0
        };
      }
      return {
        ...current,
        items: [...current.items, nextItem]
      };
    });
  };

  const persistQuickFillPreview = (submit: boolean, onlyIndex?: number) => {
    const targetPreview =
      typeof onlyIndex === "number" && draftPreview
        ? {
            ...draftPreview,
            items: draftPreview.items.map((item, index) => ({ ...item, selected: index === onlyIndex }))
          }
        : draftPreview;
    const validation = validateDraftComposerState(targetPreview);
    if (!validation.ok) {
      if (validation.index >= 0) {
        updateDraftPreviewItem(typeof onlyIndex === "number" ? onlyIndex : validation.index, { expanded: true });
      }
      message.warning(validation.message);
      return;
    }
    setDraftPreview((current) =>
      current
        ? {
            ...current,
            items: current.items.map((item, index) =>
              (typeof onlyIndex === "number" ? index === onlyIndex : item.selected) && item.status !== "submitted" && item.status !== "ignored"
                ? { ...item, status: submit ? ("submitting" as const) : ("saving" as const), errorMessage: undefined }
                : item
            )
          }
        : current
    );
    persistDraftWorkLog.mutate({ preview: targetPreview as DraftPreview, submit });
  };

  const ignoreDraftPreviewItem = (index: number) => {
    updateDraftPreviewItem(index, { status: "ignored", selected: false });
  };

  const splitDraftPreviewItem = (index: number) => {
    setDraftPreview((current) => {
      if (!current) return current;
      const source = current.items[index];
      if (!source) return current;
      const nextItem: DraftPreviewItem = {
        ...source,
        localId: `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        workLogId: undefined,
        title: `${source.title || "工作项"}（补充）`,
        content: "",
        achievements: [],
        risks: [],
        blockers: [],
        nextActions: [],
        selected: true,
        expanded: true,
        status: "editing",
        errorMessage: undefined
      };
      return {
        ...current,
        items: [...current.items.slice(0, index + 1), nextItem, ...current.items.slice(index + 1)]
      };
    });
  };

  const mergeSelectedDraftItems = () => {
    setDraftPreview((current) => {
      if (!current) return current;
      const selectedItems = current.items.filter((item) => item.selected && item.status !== "submitted" && item.status !== "ignored");
      if (selectedItems.length < 2) return current;
      const [first, ...rest] = selectedItems;
      const merged: DraftPreviewItem = {
        ...first,
        title: first.title || rest.find((item) => item.title)?.title || "合并工作项",
        content: [first.content, ...rest.map((item) => item.content)].filter(Boolean).join("\n"),
        hours: selectedItems.reduce((sum, item) => sum + (Number.isFinite(Number(item.hours)) ? Number(item.hours) : 0), 0),
        achievements: selectedItems.flatMap((item) => item.achievements),
        risks: selectedItems.flatMap((item) => item.risks),
        blockers: selectedItems.flatMap((item) => item.blockers),
        nextActions: selectedItems.flatMap((item) => item.nextActions),
        missingFields: Array.from(new Set(selectedItems.flatMap((item) => item.missingFields))),
        expanded: true,
        status: "editing"
      };
      const selectedIds = new Set(selectedItems.map((item) => item.localId));
      let inserted = false;
      const items = current.items.reduce<DraftPreviewItem[]>((result, item) => {
        if (!selectedIds.has(item.localId)) {
          result.push(item);
          return result;
        }
        if (!inserted) {
          result.push(merged);
          inserted = true;
        }
        return result;
      }, []);
      return { ...current, items };
    });
  };

  const goToday = () => {
    const today = dayjs();
    setMonth(today);
    setCopilotRange(normalizeCopilotRange([today.startOf("month"), today.endOf("month")]));
    setSelectedDate(today.format("YYYY-MM-DD"));
  };
  const changeCalendarMonth = (value: Dayjs | null) => {
    if (!value) return;
    setMonth(value);
    setCopilotRange(normalizeCopilotRange([value.startOf("month"), value.endOf("month")]));
  };
  const quickFillKindTitle = quickFillDate.format("YYYY-MM-DD") > today ? "填写计划" : "填写日报";

  return (
    <div className="page-stack dashboard-calendar-page">
      <div className="page-header dashboard-calendar-header">
        <div>
          <Typography.Title level={3} className="page-title">
            工作日历
          </Typography.Title>
          <Typography.Text className="page-subtitle">当日和具体日期的团队状态入口：看今天谁填了、谁缺填、哪里有风险/阻塞。</Typography.Text>
        </div>
        <Space wrap className="toolbar-panel dashboard-calendar-toolbar">
          <DatePicker picker="month" value={month} format="YYYY年M月" onChange={changeCalendarMonth} allowClear={false} />
          <Button onClick={goToday}>今天</Button>
          <Select
            value={scope}
            style={{ width: 132 }}
            onChange={(value) => {
              setScope(value);
              if (value !== "company") setDepartmentId(undefined);
            }}
            options={[
              { value: "self", label: "只看自己" },
              { value: "department", label: "本部门" },
              ...(canChooseDepartment ? [{ value: "company", label: "全公司" }] : [])
            ]}
          />
          {canChooseDepartment ? (
            <Select
              allowClear
              placeholder="部门筛选"
              value={departmentId}
              style={{ width: 160 }}
              onChange={setDepartmentId}
              options={org.data?.departments.map((item) => ({ value: item.id, label: item.name }))}
            />
          ) : null}
          <span className="calendar-sync-status">{isCalendarSyncing ? "正在同步" : lastCalendarUpdatedAt ? `已更新 ${lastCalendarUpdatedAt}` : "等待同步"}</span>
          <Tooltip title="刷新数据">
            <Button aria-label="刷新数据" icon={<RefreshCw size={16} />} onClick={refreshCalendarStatus} loading={isCalendarSyncing} />
          </Tooltip>
        </Space>
      </div>

      {calendarSyncError ? (
        <Alert
          showIcon
          type="warning"
          message="工作日历数据同步失败"
          description={calendarSyncErrorMessage}
          action={
            <Button size="small" onClick={refreshCalendarStatus}>
              重试同步
            </Button>
          }
        />
      ) : null}

      <section className="calendar-main-panel calendar-main-panel-full">
          <div className="workbench-hero">
            <div className={`workbench-ai workbench-decision is-${todayPriority.tone}`}>
              <div className="workbench-ai-kicker">
                {todayPriority.tone === "danger" ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
                今日待处理
              </div>
              <div className="workbench-ai-title">{todayPriority.title}</div>
              <div className="workbench-decision-copy">{todayPriority.copy}</div>
              <div className="workbench-ai-evidence">
                <span>范围：{scope === "company" ? "全公司" : scope === "department" ? "本部门" : "只看自己"}</span>
                <span>今天：{today}</span>
                <span>参考：{todayReferenceCount} 条记录</span>
              </div>
            </div>
            <div className="workbench-actions is-single-action">
              <button type="button" onClick={() => setChatOpen(true)} className="workbench-action ai-action-button ai-assistant-entry-button">
                <Bot size={18} />
                <span>AI 工作助手</span>
              </button>
            </div>
          </div>

          <div className="mobile-calendar-flow">
            <section className={`mobile-today-card is-${todayPriority.tone}`}>
              <div className="mobile-card-label">
                {todayPriority.tone === "danger" ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
                今日判断
              </div>
              <h2>{todayPriority.title}</h2>
              <p>{todayPriority.copy}</p>
              <div className="mobile-stat-row" aria-label="今日统计">
                <span>
                  <strong>{todayStats?.fillRate ?? 0}%</strong>
                  填报率
                </span>
                <span>
                  <strong>{todayStats?.missingCount ?? 0}</strong>
                  未填报
                </span>
                <span>
                  <strong>{detailRiskBlockerCount(todayStats)}</strong>
                  风险/阻塞
                </span>
              </div>
              <div className="mobile-next-actions">
                <button
                  type="button"
                  className="mobile-next-action is-primary"
                  onClick={() => (scope === "self" ? openQuickFill(today) : setSelectedDate(today))}
                >
                  {scope === "self" ? "填写今日日报" : "查看今日详情"}
                </button>
                <button type="button" className="mobile-next-action" onClick={() => setChatOpen(true)}>
                  打开工作助手
                </button>
              </div>
            </section>

            <section className="mobile-week-brief">
              <div>
                <div className="mobile-card-label">本周简报</div>
                <h3>{weekBrief.riskBlockers > 0 ? `${weekBrief.riskBlockers} 条风险/阻塞需跟进` : "本周暂无明显风险/阻塞"}</h3>
                <p>
                  已提交 {weekBrief.filled} 条，未填报 {weekBrief.remind || weekBrief.missing} 人次，合计 {weekBrief.totalHours}h。
                </p>
              </div>
              <Progress type="circle" percent={weekBrief.rate} size={66} strokeColor="var(--color-primary)" trailColor="var(--color-gray-2)" />
            </section>

            <section className="mobile-focus-panel">
              <div className="mobile-card-label">重点关注</div>
              <div className="mobile-focus-list">
                {focusDays.length ? (
                  focusDays.map((day) => {
                    const kind = dateKind(day.date);
                    const missing = kind === "future" ? day.missingCount : (day.remindCount ?? day.missingCount);
                    const riskBlockerCount = calendarRiskBlockerCount(day);
                    return (
                      <button key={day.date} type="button" className="mobile-focus-item" onClick={() => setSelectedDate(day.date)}>
                        <span className="mobile-focus-date">{dayjs(day.date).format("M月D日")} · {weekdayLabels[dayjs(day.date).day()]}</span>
                        <span className="mobile-focus-copy">
                          {riskBlockerCount > 0 ? `风险/阻塞 ${riskBlockerCount} 条` : missing > 0 ? `${kind === "future" ? "未计划" : "未填报"} ${missing} 人` : "今日状态"}
                        </span>
                        <span className="mobile-focus-rate">{kind === "future" ? "计划率" : "填报率"} {day.fillRate}%</span>
                      </button>
                    );
                  })
                ) : (
                  <div className="mobile-focus-empty">当前范围暂无缺填、风险/阻塞或需要跟进的日期。</div>
                )}
              </div>
            </section>

            <div className="mobile-calendar-nav-title">月历导航</div>
          </div>

          <div className="surface-panel dashboard-calendar-grid calendar-board-scroll">
            {weekLabels.map((label) => (
              <div key={label} className="dashboard-week-label bg-surface-container px-3 py-3 text-center text-sm font-medium text-muted">
                周{label}
              </div>
            ))}
            {cells.map((cell, index) => {
              if (!cell) {
                return <div key={`empty-${index}`} className="calendar-empty-cell" />;
              }
              const key = cell.format("YYYY-MM-DD");
              const day = dayMap.get(key);
              const kind = dateKind(key);
              const isToday = kind === "today";
              const isFuture = kind === "future";
              const filledCount = day?.filledCount ?? 0;
              const missingCount = day?.missingCount ?? 0;
              const totalCount = filledCount + missingCount;
              const riskBlockerCount = calendarRiskBlockerCount(day);
              return (
                <button
                  key={key}
                  type="button"
                  className={`calendar-cell text-left ${isToday ? "is-today" : ""} ${isFuture ? "is-future" : "is-past"}`}
                  onClick={() => setSelectedDate(key)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{cell.date()}</span>
                    </div>
                    {riskBlockerCount ? <Tag className="calendar-risk-tag" color="red">风险/阻塞 {riskBlockerCount}</Tag> : null}
                  </div>
                  <div className="calendar-cell-body mt-4 text-xs">
                    <div className="calendar-count flex items-center gap-1 text-ink">
                      <CheckCircle2 size={14} /> {isFuture ? "计划" : "填报"} {filledCount}/{totalCount}
                    </div>
                    {!isFuture && (day?.planLogCount ?? 0) > 0 ? (
                      <div className="calendar-count muted flex items-center gap-1 text-muted">
                        <CalendarPlus size={14} /> 历史计划 {day?.planLogCount}
                      </div>
                    ) : null}
                    {missingCount > 0 ? (
                      <div className="calendar-count muted flex items-center gap-1 text-muted">
                        <UsersRound size={14} /> {isFuture ? "未计划" : "未填"} {missingCount}
                      </div>
                    ) : null}
                    <div className="calendar-rate-track">
                      <div className="calendar-rate-fill" style={{ transform: `scaleX(${(day?.fillRate ?? 0) / 100})` }} />
                    </div>
                    <div className="calendar-rate-label text-muted">{isFuture ? "计划率" : "填报率"} {day?.fillRate ?? 0}%</div>
                  </div>
                </button>
              );
            })}
          </div>
      </section>

      <Modal
        title={
          <div className="copilot-title">
            <Bot size={18} />
            <span>工作助手</span>
          </div>
        }
        open={chatOpen}
        onCancel={() => setChatOpen(false)}
        footer={null}
        width="min(1040px, calc(100vw - 32px))"
        zIndex={1200}
        className="ai-copilot-modal"
        styles={{ body: { padding: 0 }, header: { borderBottom: 0, padding: "18px 18px 8px" } }}
      >
        <div className="ai-copilot">
          <div className="ai-copilot-context">
            <div className="ai-copilot-kicker">正在分析</div>
            <div className="ai-copilot-context-title">{selectedDate ? "单日分析范围" : "跨月统计范围"}</div>
            <div className="ai-copilot-range-summary">
              <strong>{displayedCopilotRangeLabel}</strong>
              <span>{selectedDate ? "当前按单日查看，可直接切换为日期范围统计。" : `共 ${copilotRangeDays} 天，可跨月统计日报、计划、风险和工时。`}</span>
            </div>
            <div className="ai-copilot-context-list">
              {copilotContext.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
            <div className="ai-copilot-range-controls">
              <div className="ai-copilot-range-label">统计日期范围</div>
              <RangePicker
                className="ai-copilot-range-picker"
                value={displayedCopilotRange}
                allowClear={false}
                format="YYYY-MM-DD"
                onChange={(value) => {
                  if (!value?.[0] || !value?.[1]) return;
                  updateCopilotRange([value[0], value[1]]);
                }}
              />
              <div className="ai-copilot-range-presets">
                {selectedDate ? (
                  <button type="button" className="is-primary" onClick={switchCopilotToRangeMode}>
                    改用日期范围
                  </button>
                ) : null}
                {copilotRangePresets.map((preset) => (
                  <button key={preset.label} type="button" onClick={() => updateCopilotRange(preset.range)}>
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="ai-copilot-range-note">支持跨月选择，单次最多分析 366 天。月历只用于查看单日，不限制助手统计范围。</div>
            </div>
          </div>

          <div className="ai-copilot-section">
            <div className="ai-copilot-section-title">{selectedDate ? "今日判断" : "范围判断"}</div>
            <ul className="ai-copilot-insights">
              {copilotObservations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <div className="ai-copilot-action-bar">
            <div className="ai-copilot-section-title">下一步</div>
            <div className="ai-copilot-actions">
              {copilotActions.map((action) => (
                <button key={action.label} type="button" onClick={() => runCopilotPrompt(action.prompt)} disabled={calendarChat.isPending}>
                  {action.label}
                </button>
              ))}
            </div>
          </div>

          <div className="ai-copilot-thread" ref={chatThreadRef}>
            {chatMessages.map((item) => (
              <div key={item.id} className={`ai-copilot-message ${item.role}`}>
                <div className="ai-copilot-message-meta">
                  {item.role === "assistant" ? "助手" : user?.name ?? "我"}
                  {typeof item.contextCount === "number" ? <span> · 参考 {item.contextCount} 条记录</span> : null}
                </div>
                <div className={item.role === "assistant" ? "ai-copilot-markdown" : undefined}>
                  {item.role === "assistant" ? renderAssistantMarkdown(item.content) : item.content}
                </div>
              </div>
            ))}
            {calendarChat.isPending ? (
              <div className="ai-copilot-message assistant is-loading">正在结合当前页面上下文分析…</div>
            ) : null}
          </div>

          <div className="ai-copilot-compose">
            <div className="ai-copilot-input">
              <Input.TextArea
                ref={chatInputRef}
                value={chatInput}
                rows={4}
                placeholder="询问团队风险/阻塞、项目进展、人员投入情况…"
                disabled={calendarChat.isPending}
                onChange={(event) => setChatInput(event.target.value)}
                onPressEnter={(event) => {
                  if (!event.shiftKey) {
                    event.preventDefault();
                    submitCalendarChat();
                  }
                }}
              />
              <Button type="primary" icon={<Send size={16} />} loading={calendarChat.isPending} disabled={calendarChat.isPending} onClick={() => submitCalendarChat()} />
            </div>
            {calendarChat.isPending ? (
              <div className="ai-copilot-waiting" role="status" aria-live="polite">
                正在调用模型分析当前页面上下文，正式环境可能需要几秒，请稍候。
              </div>
            ) : null}
            <div className="ai-copilot-prompt-bar">
              <span>快速追问</span>
              <div className="ai-copilot-pills">
                {quickQuestions.map((item) => (
                  <button key={item} type="button" onClick={() => runCopilotPrompt(item)} disabled={calendarChat.isPending}>
                    {item}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        title={
          <div className="today-log-modal-title">
            <strong>{quickFillKindTitle}</strong>
            <span>{workLogDraftDateLabel(quickFillDate)}，像聊天一样描述工作，AI 只生成草稿，确认后才提交。</span>
          </div>
        }
        open={quickFillOpen}
        onCancel={() => setQuickFillOpen(false)}
        footer={null}
        width="min(1040px, calc(100vw - 32px))"
        zIndex={1600}
        className="today-log-modal"
        styles={{ body: { padding: "0 26px 24px", background: "#f5f5f7" }, header: { borderBottom: 0, padding: "24px 26px 12px", background: "#f5f5f7" } }}
      >
        <div className="today-log-modal-shell" data-worklog-chat-panel>
          <WorkLogDraftComposer
            aiMessages={quickFillAiMessages}
            aiInput={quickFillAiInput}
            aiPending={draftWorkLog.isPending}
            aiError={draftWorkLog.error instanceof Error ? draftWorkLog.error : null}
            onAiInputChange={setQuickFillAiInput}
            onGenerateDraft={sendQuickFillAiMessage}
            onContinuePrompt={continueEditingQuickFillPrompt}
            draftPreview={draftPreview}
            onUpdateItem={updateDraftPreviewItem}
            onDeleteItem={deleteDraftPreviewItem}
            onAddManualItem={addManualDraftItem}
            onAttachmentTargetChange={(value) => setDraftPreview((current) => (current ? { ...current, attachmentTargetIndex: value } : current))}
            onSaveDrafts={() => persistQuickFillPreview(false)}
            onSubmitDrafts={() => persistQuickFillPreview(true)}
            onSubmitItem={(index) => persistQuickFillPreview(true, index)}
            onIgnoreItem={ignoreDraftPreviewItem}
            onMergeSelected={mergeSelectedDraftItems}
            onSplitItem={splitDraftPreviewItem}
            onRegenerateDraft={regenerateQuickFillDraft}
            onViewSubmittedItem={() => router.push("/work-logs")}
            saving={persistDraftWorkLog.isPending && persistDraftWorkLog.variables?.submit === false}
            submitting={persistDraftWorkLog.isPending && persistDraftWorkLog.variables?.submit === true}
            projectOptions={projectOptions}
            projectNameById={projectNameById}
            projectsLoading={projects.isFetching}
            pendingAttachmentCount={pendingAttachments.length}
            pendingUploadFiles={pendingUploadFiles}
            beforeUploadAttachment={addPendingAttachment}
            onRemoveAttachment={(file) => {
              setPendingAttachments((items) => items.filter((item) => item.uid !== file.uid));
              return true;
            }}
            onPasteImages={handlePasteImages}
          />
        </div>
      </Modal>

      <Modal
        title={null}
        open={Boolean(selectedDate)}
        onCancel={() => setSelectedDate(null)}
        footer={null}
        width="min(1180px, calc(100vw - 32px))"
        zIndex={1300}
        className="workday-detail-modal"
        destroyOnHidden
      >
        {selectedDate ? (
          <div className="workday-detail-hero">
            <div>
              <div className="workday-date">{chineseDateLabel(selectedDate)}</div>
              <div className="workday-subtitle">{detailTitle}</div>
            </div>
            <div className="workday-hero-actions">
              <Button type="primary" icon={<CalendarPlus size={16} />} onClick={() => openQuickFill(selectedDate)}>
                {dateKind(selectedDate) === "future" ? "填写计划" : "填写日报"}
              </Button>
            </div>
          </div>
        ) : null}
        {selectedDate ? (
          <div className={`workday-summary-sentence ${detailRiskBlockerCount(detailStats) > 0 ? "has-risk" : ""}`}>
            <div>
              <strong>{detailStats?.totalEmployees ?? 0}</strong>
              <span>{selectedDateKind === "future" ? "需计划人数" : "需填报人数"}</span>
            </div>
            <div>
              <strong>{detailStats?.filledCount ?? 0}</strong>
              <span>{selectedDateKind === "future" ? "已计划人数" : "已填报人数"}</span>
            </div>
            <div>
              <strong>{detailStats?.missingCount ?? 0}</strong>
              <span>{selectedDateKind === "future" ? "未计划人数" : "未填报人数"}</span>
            </div>
            <div>
              <strong>{detailLogCount}</strong>
              <span>记录</span>
            </div>
            <div className={detailRiskBlockerCount(detailStats) > 0 ? "is-danger" : ""}>
              <strong>{detailRiskBlockerCount(detailStats)}</strong>
              <span>风险/阻塞</span>
            </div>
          </div>
        ) : null}
        <div className="workday-content-grid">
          <div className="workday-records-column">
            {detailLogCount === 0 && !dayDetail.isFetching ? (
              <div className="workday-empty-state">
                <div>
                  <div className="workday-empty-title">
                    {(detailStats?.totalEmployees ?? 0) === 0
                      ? "当前范围没有需要填报的成员"
                      : selectedDateKind === "future"
                        ? "这一天还没有团队成员提交计划"
                        : "今天还没有团队成员提交日报"}
                  </div>
                  <div className="workday-empty-copy">
                    {(detailStats?.totalEmployees ?? 0) === 0
                      ? "如需纳入日报统计，请到组织权限里为成员开启“需要填报”。"
                      : selectedDateKind === "future"
                        ? `当前应提醒 ${detailReminderActionCount} 人提交计划。`
                        : `当前应提醒 ${detailRemindCount} 人补交日报。`}
                  </div>
                </div>
                {detailReminderActionCount > 0 ? (
                  <Button
                    type="primary"
                    onClick={() =>
                      message.info(
                        `${selectedDateKind === "future" ? "应提醒提交计划" : "应提醒补交日报"}：${detailReminderMessage || `${detailReminderActionCount} 人`}`
                      )
                    }
                  >
                    {selectedDateKind === "future" ? "查看应提醒计划人员" : "查看应提醒日报人员"}
                  </Button>
                ) : null}
              </div>
            ) : (
              <div className="workday-detail-data">
                <div className="workday-records-heading">
                  <div>
                    <div className="workday-section-heading">今日记录</div>
                    <div className="workday-records-subtitle">
                      覆盖 {detailFilledEmployees.length} 人 · 日报 {detailDailyLogCount} 条 · 计划 {detailPlanLogCount} 条
                    </div>
                    {detailProjectGroups.length ? (
                      <div className="workday-project-inline">
                        {detailProjectGroups.slice(0, 3).map((item) => `${item.name} ${item.hours}h`).join(" / ")}
                        {detailProjectGroups.length > 3 ? ` 等 ${detailProjectGroups.length} 个项目` : ""}
                      </div>
                    ) : null}
                  </div>
                  {dayDetail.isFetching ? <span className="ai-shimmer">正在同步记录…</span> : null}
                </div>
                <div className="workday-records-list">
                  <div className="workday-record-list">
                    {detailRecordSections.map((section) => {
                      const sectionLogCount = section.employees.reduce((sum, employee) => sum + employee.logs.length, 0);
                      return (
                        <section key={section.key} className="workday-person-section">
                          <div className="workday-person-section-head">
                            <strong>{section.title}</strong>
                            <span>
                              {section.employees.length} 人 · {sectionLogCount} 条
                            </span>
                          </div>
                          <div className="workday-person-list">
                            {section.employees.map((employee) => {
                              const employeeHours = sumLogHours(employee.logs);
                              return (
                                <article key={`${section.key}-${employee.id}`} className="workday-person-row">
                                  <div className="workday-person-profile">
                                    <span className="workday-record-avatar">{employee.name.slice(0, 1)}</span>
                                    <span className="workday-person-profile-text">
                                      <strong>{employee.name}</strong>
                                      <em>{employee.departmentName ?? "未分配部门"}</em>
                                      <small>{employee.logs.length} 条记录</small>
                                    </span>
                                  </div>
                                  <div className="workday-person-log-list">
                                    {employee.logs.map((log) => {
                                      const risk = workLogRiskLabel(log);
                                      return (
                                        <button
                                          key={`${section.key}-${employee.id}-${log.id}`}
                                          type="button"
                                          className={`workday-person-log-card ${risk ? "has-risk" : ""}`}
                                          onClick={() => setSelectedWorkLog(log)}
                                        >
                                          <span className="workday-person-log-title">
                                            <strong>{log.title}</strong>
                                            <Tag color={(log.kind ?? "DAILY") === "PLAN" ? "blue" : "green"}>{(log.kind ?? "DAILY") === "PLAN" ? "计划" : "日报"}</Tag>
                                            <em>{Number(log.hours).toFixed(1)}h</em>
                                          </span>
                                          <span className="workday-person-log-content">{log.content}</span>
                                          <span className="workday-person-log-meta">
                                            <span>{workLogProjectLabel(log)}</span>
                                            {log.attachments?.length ? (
                                              <em>
                                                <Paperclip size={12} /> {log.attachments.length} 个附件
                                              </em>
                                            ) : null}
                                          </span>
                                          {risk ? <span className="workday-person-log-risk">{risk}</span> : null}
                                        </button>
                                      );
                                    })}
                                  </div>
                                  <div className="workday-person-hours">{employeeHours.toFixed(1)}h</div>
                                </article>
                              );
                            })}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        title={selectedWorkLog ? <WorkLogDetailTitle record={selectedWorkLog} readOnly navigation={selectedWorkLogNavigation} /> : "填报详情"}
        open={Boolean(selectedWorkLog)}
        onCancel={() => setSelectedWorkLog(null)}
        footer={null}
        width={860}
        zIndex={1500}
        className="work-log-detail-modal"
      >
        {selectedWorkLog ? <WorkLogDetailView record={selectedWorkLog} /> : null}
      </Modal>

    </div>
  );
}
