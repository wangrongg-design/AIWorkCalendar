"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Checkbox, DatePicker, Drawer, Form, Input, InputNumber, Modal, Progress, Select, Space, Tag, TimePicker, Tooltip, Typography, Upload, message } from "antd";
import type { RcFile, UploadFile } from "antd/es/upload/interface";
import dayjs, { Dayjs } from "dayjs";
import { AlertTriangle, Bot, CalendarPlus, CheckCircle2, Paperclip, RefreshCw, Send, UploadCloud, UsersRound, WandSparkles } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ClipboardEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { TextAreaRef } from "antd/es/input/TextArea";
import { WorkLogAttachmentViewer } from "@/components/WorkLogAttachmentViewer";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { CalendarDay, CalendarDayDetail, CalendarResponse, Department, Project, WorkLog, WorkLogAttachment, WorkLogDraft, WorkLogDraftItem } from "@/lib/types";
import { applyWorkLogTimingAutoFill, parseWorkLogTime } from "@/lib/work-log-time";

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
};

type AiDraftMessage = {
  role: "user" | "assistant";
  content: string;
};

type PendingAttachment = {
  uid: string;
  file: File;
};

type DraftPreviewItem = WorkLogDraftItem & {
  projectId?: string;
  selected: boolean;
};

type DraftPreview = {
  assistantMessage: string;
  items: DraftPreviewItem[];
  attachedToFirst: boolean;
  attachmentTargetIndex: number;
};

const attachmentMaxBytes = 8 * 1024 * 1024;
const quickQuestions = ["本周风险/阻塞", "项目进度", "人员负载", "异常工时"];
const copilotActions = [
  { label: "提醒未填报员工", prompt: "帮我整理今天未填报员工，并给出提醒话术。" },
  { label: "生成本周总结", prompt: "基于当前可见日报和计划，生成本周管理总结。" },
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

function dateKind(date: string) {
  const today = dayjs().format("YYYY-MM-DD");
  if (date === today) return "today";
  return date > today ? "future" : "past";
}

function chineseDateLabel(date: string) {
  const value = dayjs(date);
  return `${value.format("YYYY年M月D日")} · ${weekdayLabels[value.day()]}`;
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
    projectId: values.projectId || undefined
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
    startTime: parseWorkLogTime(item.startTime, safeDate),
    endTime: parseWorkLogTime(item.endTime, safeDate)
  };
}

function draftPreviewItemToForm(item: DraftPreviewItem): WorkLogForm {
  return {
    ...draftItemToForm(item),
    projectId: item.projectId
  };
}

function formDateKey(value: Dayjs | Date | string | number | null | undefined, fallback = dayjs().format("YYYY-MM-DD")) {
  if (dayjs.isDayjs(value)) {
    return value.isValid() ? value.format("YYYY-MM-DD") : fallback;
  }
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format("YYYY-MM-DD") : fallback;
}

export default function CalendarPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const [quickFillForm] = Form.useForm<WorkLogForm>();
  const today = dayjs().format("YYYY-MM-DD");
  const [month, setMonth] = useState(dayjs());
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
      content: "可以直接问我：本月团队重点、今天风险/阻塞、未来计划、某个部门工时投入。回答只基于你当前权限可见的日报和计划。"
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

  const uploadPendingAttachments = async (workLogId: string) => {
    const files = [...pendingAttachments];
    for (const item of files) {
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
    }
    if (files.length) {
      setPendingAttachments([]);
    }
  };

  const createAndSubmitWorkLog = async (values: WorkLogForm, withAttachments: boolean) => {
    const workLog = await apiFetch<WorkLog>("/work-logs", { method: "POST", body: JSON.stringify(toWorkLogPayload(values)) });
    if (withAttachments) {
      await uploadPendingAttachments(workLog.id);
    }
    return apiFetch<WorkLog>(`/work-logs/${workLog.id}/submit`, { method: "POST" });
  };

  const createWorkLog = useMutation({
    mutationFn: (values: WorkLogForm) => createAndSubmitWorkLog(values, true),
    onSuccess: () => {
      message.success("已提交，将自动分析。");
      setQuickFillOpen(false);
      setDraftPreview(null);
      setPendingAttachments([]);
      quickFillForm.resetFields();
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      queryClient.invalidateQueries({ queryKey: ["calendar-today"] });
      queryClient.invalidateQueries({ queryKey: ["calendar-day"] });
      queryClient.invalidateQueries({ queryKey: ["work-logs"] });
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : "填报失败，请检查内容后重试。");
    }
  });

  const draftWorkLog = useMutation({
    mutationFn: async (messages: AiDraftMessage[]) => {
      const currentDate = formDateKey(quickFillForm.getFieldValue("date"));
      const draft = await apiFetch<WorkLogDraft>("/ai/work-log-draft", {
        method: "POST",
        body: JSON.stringify({
          currentDate,
          messages
        })
      });
      const items = normalizedDraftItems(draft);
      const attachedToFirst = pendingAttachments.length > 0 && items.length > 1;
      return {
        assistantMessage: draft.assistantMessage,
        items: items.map((item) => ({ ...item, projectId: quickFillForm.getFieldValue("projectId"), selected: true })),
        attachedToFirst,
        attachmentTargetIndex: 0
      };
    },
    onSuccess: (preview) => {
      setDraftPreview(preview);
      setQuickFillAiMessages((messages) => [...messages, { role: "assistant", content: `${preview.assistantMessage} 请确认草稿内容后提交。` }]);
      if (preview.items.length === 1) {
        quickFillForm.setFieldsValue(draftItemToForm(preview.items[0]));
      }
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : "草稿生成失败，请调整描述后重试。");
    }
  });

  const confirmDraftWorkLog = useMutation({
    mutationFn: async (preview: DraftPreview) => {
      const selectedEntries = preview.items.map((item, index) => ({ item, index })).filter((entry) => entry.item.selected);
      if (!selectedEntries.length) {
        throw new Error("请至少确认一条草稿。");
      }
      const hasAttachments = pendingAttachments.length > 0;
      const requestedTargetIndex = Number.isInteger(preview.attachmentTargetIndex) ? preview.attachmentTargetIndex : selectedEntries[0].index;
      const uploadTargetIndex = selectedEntries.some((entry) => entry.index === requestedTargetIndex) ? requestedTargetIndex : selectedEntries[0].index;
      for (const { item, index } of selectedEntries) {
        await createAndSubmitWorkLog(draftPreviewItemToForm(item), hasAttachments && index === uploadTargetIndex);
      }
      return { ...preview, submittedCount: selectedEntries.length, hasAttachments, uploadTargetIndex };
    },
    onSuccess: (preview) => {
      message.success(preview.submittedCount > 1 ? `已提交 ${preview.submittedCount} 条填报。` : "已提交填报。");
      if (preview.hasAttachments && preview.submittedCount > 1) {
        message.info(`附件已关联到第 ${preview.uploadTargetIndex + 1} 条已确认草稿。`);
      }
      setDraftPreview(null);
      setQuickFillOpen(false);
      setPendingAttachments([]);
      quickFillForm.resetFields();
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      queryClient.invalidateQueries({ queryKey: ["calendar-today"] });
      queryClient.invalidateQueries({ queryKey: ["calendar-day"] });
      queryClient.invalidateQueries({ queryKey: ["work-logs"] });
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : "提交草稿失败，请检查后重试。");
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
  const todayReferenceCount = useMemo(
    () => todayDetail.data?.filledEmployees.flatMap((employee) => employee.logs).length ?? 0,
    [todayDetail.data?.filledEmployees]
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
  const detailFilledEmployees = dayDetail.data?.filledEmployees ?? [];
  const detailMissingEmployees = dayDetail.data?.missingEmployees ?? [];
  const detailLogCount = detailFilledEmployees.reduce((sum, employee) => sum + employee.logs.length, 0);
  const selectedDateKind = selectedDate ? dateKind(selectedDate) : "today";
  const detailTitle = selectedDateKind === "future" ? "团队计划情况" : "今日团队填报情况";
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
    if (stats.filledCount === 0) {
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
    const firstProject = dayDetail.data?.filledEmployees.flatMap((employee) => employee.logs).find((log) => log.project)?.project?.name;
    if (firstProject) {
      observations.push(`${firstProject} 已出现在今日记录中，可进一步询问项目进展。`);
    }
    return observations;
  }, [dayDetail.data, dayDetail.isFetching, selectedDate, selectedDateKind]);
  const copilotObservations = useMemo(() => {
    if (selectedDate) {
      return aiObservations;
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
  }, [aiObservations, calendar.isFetching, selectedDate, summary.filled, summary.missing, summary.rate, summary.remind, summary.riskBlockers]);
  const copilotContext = useMemo(
    () => [
      selectedDate ? chineseDateLabel(selectedDate) : month.format("YYYY年M月"),
      scope === "self" ? user?.name ?? "我" : scope === "department" ? "本部门" : "全公司",
      "日历看板",
      "日报数据",
      "工作计划"
    ],
    [month, scope, selectedDate, user?.name]
  );
  const calendarChat = useMutation({
    mutationFn: (question: string) =>
      apiFetch<CalendarChatResponse>("/ai/chat/calendar", {
        method: "POST",
        body: JSON.stringify({
          question,
          month: month.format("YYYY-MM"),
          date: selectedDate ?? undefined,
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
    const isFuture = date > today;
    setSelectedDate(null);
    setPendingAttachments([]);
    quickFillForm.resetFields();
    quickFillForm.setFieldsValue({
      date: dateValue,
      title: isFuture ? "工作计划" : "工作日报",
      content: "",
      hours: null
    });
    setQuickFillAiInput("");
    setQuickFillAiMessages([
      {
        role: "assistant",
        content: `当前填报日期是 ${dateValue.format("YYYY年M月D日")}。如果不写日期，我会按这一天生成草稿。`
      }
    ]);
    setDraftPreview(null);
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
    setQuickFillAiMessages(nextMessages);
    setQuickFillAiInput("");
    setDraftPreview(null);
    draftWorkLog.mutate(nextMessages);
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

  const goToday = () => {
    const today = dayjs();
    setMonth(today);
    setSelectedDate(today.format("YYYY-MM-DD"));
  };

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
          <DatePicker picker="month" value={month} format="YYYY年M月" onChange={(value) => value && setMonth(value)} allowClear={false} />
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
        title="新增填报"
        open={quickFillOpen}
        onCancel={() => {
          setQuickFillOpen(false);
          setDraftPreview(null);
          setPendingAttachments([]);
        }}
        onOk={() => quickFillForm.submit()}
        okText="提交表单"
        cancelText="取消"
        confirmLoading={createWorkLog.isPending || draftWorkLog.isPending || confirmDraftWorkLog.isPending}
        width={880}
      >
        <Form
          form={quickFillForm}
          layout="vertical"
          onValuesChange={(changed, values) => applyWorkLogTimingAutoFill(changed, values, quickFillForm.setFieldsValue)}
          onFinish={(values) => createWorkLog.mutate(values)}
        >
          <div className="mb-5 rounded-[18px] bg-surface-container-low p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-ink">
              <Bot size={17} className="text-secondary" />
              智能草稿
            </div>
            <div className="mb-3 max-h-48 space-y-2 overflow-auto">
              {quickFillAiMessages.map((item, index) => (
                <div
                  key={`${item.role}-${index}`}
                  className={`rounded-[14px] px-3 py-2 text-sm leading-6 ${
                    item.role === "user" ? "ml-8 bg-primary text-white" : "mr-8 bg-white text-muted"
                  }`}
                >
                  {item.content}
                </div>
              ))}
            </div>
            {draftWorkLog.error ? <Alert className="mb-3" type="error" showIcon message={(draftWorkLog.error as Error).message} /> : null}
            {draftWorkLog.isPending ? (
              <div className="quickfill-draft-waiting" role="status" aria-live="polite">
                <span className="quickfill-draft-spinner" />
                <div>
                  <strong>正在生成草稿</strong>
                  <p>正在调用模型识别日期、工时和工作内容，正式环境可能需要 5-20 秒，请稍候。</p>
                </div>
              </div>
            ) : null}
            <div className="flex gap-2">
              <Input.TextArea
                value={quickFillAiInput}
                autoSize={{ minRows: 2, maxRows: 4 }}
                placeholder="例如：今天完成小程序语音填报，联调日历看板，花了 3 小时。明天计划优化登录页。"
                disabled={draftWorkLog.isPending}
                onPaste={handlePasteImages}
                onChange={(event) => setQuickFillAiInput(event.target.value)}
                onPressEnter={(event) => {
                  if (!event.shiftKey) {
                    event.preventDefault();
                    sendQuickFillAiMessage();
                  }
                }}
              />
              <Button className="ai-soft-button" icon={<WandSparkles size={16} />} loading={draftWorkLog.isPending} disabled={draftWorkLog.isPending} onClick={sendQuickFillAiMessage}>
                生成草稿
              </Button>
            </div>
            {draftPreview ? (
              <div className="quickfill-draft-preview">
                <Alert
                  type={draftPreview.items.some((item) => item.selected && (item.missingFields.length > 0 || item.confidence < 0.8)) ? "warning" : "info"}
                  showIcon
                  message="请确认草稿后再提交"
                  description="系统不会自动提交。你可以逐条确认、跳过或修改日期、标题、工时、项目和内容。"
                />
                {pendingAttachments.length > 0 && draftPreview.items.length > 1 ? (
                  <div className="quickfill-attachment-target">
                    <span>附件归属</span>
                    <Select
                      value={draftPreview.attachmentTargetIndex}
                      listHeight={280}
                      options={draftPreview.items.map((item, index) => ({
                        value: index,
                        disabled: !item.selected,
                        label: `第 ${index + 1} 条 · ${item.title || "未命名草稿"}`
                      }))}
                      onChange={(value) =>
                        setDraftPreview((current) => (current ? { ...current, attachmentTargetIndex: value } : current))
                      }
                    />
                    <em>未选择或跳过目标时，自动关联到第一条已确认草稿。</em>
                  </div>
                ) : null}
                <div className="quickfill-draft-list">
                  {draftPreview.items.map((item, index) => (
                    <div key={`${item.date}-${item.title}-${index}`} className={`quickfill-draft-item ${item.selected ? "" : "is-muted"}`}>
                      <div className="quickfill-draft-head">
                        <Checkbox checked={item.selected} onChange={(event) => updateDraftPreviewItem(index, { selected: event.target.checked })}>
                          确认第 {index + 1} 条
                        </Checkbox>
                        <span>{item.kind === "PLAN" ? "计划" : "日报"}</span>
                      </div>
                      <div className="quickfill-draft-edit-grid">
                        <label>
                          <span>日期</span>
                          <DatePicker
                            className="w-full"
                            value={dayjs(item.date).isValid() ? dayjs(item.date) : dayjs()}
                            onChange={(value) => value && updateDraftPreviewItem(index, { date: value.format("YYYY-MM-DD") })}
                          />
                        </label>
                        <label>
                          <span>工时</span>
                          <InputNumber
                            className="w-full"
                            min={0}
                            max={24}
                            step={0.5}
                            value={item.hours}
                            onChange={(value) => updateDraftPreviewItem(index, { hours: Number(value ?? 0) })}
                          />
                        </label>
                        <label className="quickfill-draft-title-field">
                          <span>标题</span>
                          <Input value={item.title} onChange={(event) => updateDraftPreviewItem(index, { title: event.target.value })} />
                        </label>
                        <label className="quickfill-draft-project-field">
                          <span>项目</span>
                          <Select
                            allowClear
                            value={item.projectId}
                            placeholder="未关联"
                            loading={projects.isFetching}
                            listHeight={280}
                            options={projectOptions}
                            onChange={(value) => updateDraftPreviewItem(index, { projectId: value })}
                          />
                        </label>
                      </div>
                      <label className="quickfill-draft-content-field">
                        <span>内容</span>
                        <Input.TextArea
                          autoSize={{ minRows: 2, maxRows: 5 }}
                          value={item.content}
                          onPaste={handlePasteImages}
                          onChange={(event) => updateDraftPreviewItem(index, { content: event.target.value })}
                        />
                      </label>
                      <div className="quickfill-draft-meta">
                        <span>附件：{pendingAttachments.length ? (draftPreview.attachmentTargetIndex === index ? "关联到本条" : "未关联到本条") : "无"}</span>
                        <span>项目：{item.projectId ? projectNameById.get(item.projectId) ?? "已选择项目" : "未关联"}</span>
                        <span>置信度：{Math.round(item.confidence * 100)}%</span>
                      </div>
                      {item.missingFields.length ? <div className="quickfill-draft-warning">需确认：{item.missingFields.join("、")}</div> : null}
                    </div>
                  ))}
                </div>
                <div className="quickfill-draft-actions">
                  <Button onClick={() => setDraftPreview(null)}>继续编辑</Button>
                  <Button
                    type="primary"
                    loading={confirmDraftWorkLog.isPending}
                    disabled={!draftPreview.items.some((item) => item.selected)}
                    onClick={() => confirmDraftWorkLog.mutate(draftPreview)}
                  >
                    确认并提交{draftPreview.items.filter((item) => item.selected).length > 1 ? ` ${draftPreview.items.filter((item) => item.selected).length} 条` : ""}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <Form.Item name="date" label="日期" rules={[{ required: true }]}>
              <DatePicker className="w-full" />
            </Form.Item>
            <Form.Item name="hours" label="工时">
              <InputNumber className="w-full" min={0} max={24} step={0.5} placeholder="可不填" />
            </Form.Item>
            <Form.Item name="startTime" label="开始时间">
              <TimePicker className="w-full" format="HH:mm" />
            </Form.Item>
            <Form.Item name="endTime" label="结束时间">
              <TimePicker className="w-full" format="HH:mm" />
            </Form.Item>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            <Form.Item className="md:col-span-3" name="title" label="标题" rules={[{ required: true, min: 2 }]}>
              <Input />
            </Form.Item>
            <Form.Item className="md:col-span-2" name="projectId" label="关联项目">
              <Select allowClear placeholder="选择项目" loading={projects.isFetching} listHeight={280} options={projectOptions} />
            </Form.Item>
          </div>
          <Form.Item name="content" label="工作内容" rules={[{ required: true, min: 2 }]}>
            <Input.TextArea rows={6} onPaste={handlePasteImages} />
          </Form.Item>
          <Form.Item label="附件">
            <div className="paste-upload-zone" tabIndex={0} onPaste={handlePasteImages}>
              <Upload.Dragger
                multiple
                fileList={pendingUploadFiles}
                beforeUpload={addPendingAttachment}
                onRemove={(file) => {
                  setPendingAttachments((items) => items.filter((item) => item.uid !== file.uid));
                  return true;
                }}
              >
                <p className="ant-upload-drag-icon">
                  <UploadCloud size={28} />
                </p>
                <p className="ant-upload-text">添加照片或文件</p>
                <p className="ant-upload-hint">单个附件最大 8MB，支持直接粘贴微信或聊天截图。</p>
              </Upload.Dragger>
            </div>
          </Form.Item>
        </Form>
      </Modal>

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
            <div className="ai-copilot-context-title">当前分析范围</div>
            <div className="ai-copilot-context-list">
              {copilotContext.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </div>

          <div className="ai-copilot-section">
            <div className="ai-copilot-section-title">{selectedDate ? "今日判断" : "当月判断"}</div>
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

      <Drawer
        title={null}
        open={Boolean(selectedDate)}
        onClose={() => setSelectedDate(null)}
        width="min(1240px, calc(100vw - 32px))"
        className="workday-detail-modal workday-detail-drawer"
        destroyOnHidden
      >
        {selectedDate ? (
          <div className="workday-detail-hero">
            <div>
              <div className="workday-product">工作日历</div>
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
        <div className="workday-content-grid">
          <div className="workday-records-column">
            {(detailStats?.filledCount ?? 0) === 0 && !dayDetail.isFetching ? (
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
                    <div className="workday-section-heading">{selectedDateKind === "future" ? "计划记录" : "日报记录"}</div>
                    <div className="workday-records-subtitle">{detailLogCount} 条记录 · {detailFilledEmployees.length} 位成员</div>
                  </div>
                  {dayDetail.isFetching ? <span className="ai-shimmer">正在同步记录…</span> : null}
                </div>
                <div className="workday-records-list">
                  {detailFilledEmployees.map((employee) => (
                    <div key={employee.id} className="workday-employee-record">
                      <div className="workday-employee-meta">
                        <div className="workday-employee-name">{employee.name}</div>
                        <div className="workday-employee-dept">{employee.departmentName ?? "未分配部门"}</div>
                        <div className="workday-employee-count">{employee.logs.length} 条</div>
                      </div>
                      <div className="workday-log-stack">
                        {employee.logs.map((log) => (
                          <button key={log.id} type="button" className="workday-log-card" onClick={() => setSelectedWorkLog(log)}>
                            <div className="workday-log-main">
                              <div className="workday-log-title-row">
                                <div className="workday-log-title">{log.title}</div>
                                <div className="workday-log-meta">
                                  <span>{Number(log.hours).toFixed(1)} 小时</span>
                                  {log.attachments?.length ? (
                                    <span className="workday-log-attachment"><Paperclip size={13} /> 附件 {log.attachments.length}</span>
                                  ) : null}
                                </div>
                              </div>
                              <div className="workday-log-content">{log.content}</div>
                              <div className="workday-log-tags">
                                {log.project ? (
                                  <span className="workday-log-project">{log.project.code ? `${log.project.code} · ${log.project.name}` : log.project.name}</span>
                                ) : null}
                                {log.aiAnalysis?.achievements?.slice(0, 3).map((item) => (
                                  <span className="workday-log-achievement" key={item}>{item}</span>
                                ))}
                                {log.aiAnalysis?.risks?.slice(0, 3).map((item) => (
                                  <span className="workday-log-risk" key={item}>{item}</span>
                                ))}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="workday-insight-column">
            <div className="workday-ai-panel workday-ai-panel-complete">
              <div className="workday-ai-header">
                <div>
                  <div className="workday-section-kicker">工作判断</div>
                  <div className="workday-ai-title-line">
                    <div className="workday-ai-title">今日观察</div>
                    <Button className="ai-soft-button workday-ai-title-action" icon={<Bot size={15} />} onClick={() => setChatOpen(true)}>
                      打开助手
                    </Button>
                  </div>
                </div>
                {calendarChat.isPending || dayDetail.isFetching ? <span className="ai-shimmer">正在分析团队日报…</span> : null}
              </div>
              <div className="workday-ai-stat-grid">
                <div className="workday-ai-stat is-filled">
                  <span>{selectedDate && dateKind(selectedDate) === "future" ? "已计划" : "已填报"}</span>
                  <strong>{detailStats?.filledCount ?? 0}</strong>
                </div>
                <div className="workday-ai-stat is-missing">
                  <span>{selectedDate && dateKind(selectedDate) === "future" ? "未计划" : "未填报"}</span>
                  <strong>{detailStats?.missingCount ?? 0}</strong>
                </div>
                <div className="workday-ai-stat is-hours">
                  <span>工时合计</span>
                  <strong>{detailStats?.totalHours ?? 0}h</strong>
                </div>
                <div className="workday-ai-stat is-risk">
                  <span>风险/阻塞</span>
                  <strong>{detailRiskBlockerCount(detailStats)}</strong>
                </div>
              </div>
              <div className={`workday-ai-risk-summary ${detailRiskBlockerCount(detailStats) > 0 ? "has-risk" : ""}`}>
                <div className="workday-ai-subheading">异常 / 风险/阻塞</div>
                <strong>{detailRiskBlockerCount(detailStats) > 0 ? `发现 ${detailRiskBlockerCount(detailStats)} 条风险/阻塞信号` : "暂未发现明显风险/阻塞"}</strong>
                <p>
                  {detailReminderActionCount > 0
                    ? `${detailReminderActionCount} 位成员尚未${selectedDateKind === "future" ? "提交计划" : "提交日报"}，建议优先提醒。`
                    : "团队提交状态正常，可以继续查看具体记录。"}
                </p>
              </div>
              <div className="workday-ai-missing-summary">
                <div className="workday-ai-subheading">{selectedDateKind === "future" ? "未提交计划" : "未提交日报"}</div>
                <div className="workday-ai-missing-list">
                  {detailMissingEmployees.length ? (
                    detailMissingEmployees.map((item) => (
                      <Tag key={item.id}>{item.name} · {item.departmentName ?? "未分配部门"}</Tag>
                    ))
                  ) : (
                    <span className="workday-ai-empty-tag">全部已提交</span>
                  )}
                </div>
              </div>
              <div className="workday-ai-observation-block">
                <div className="workday-ai-subheading">关键证据</div>
                <ul className="workday-ai-list">
                  {aiObservations.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="workday-ai-pills">
                {["本周风险/阻塞", "项目进度", "人员负载", "异常工时"].map((item) => (
                  <button key={item} type="button" className="workday-ai-pill" onClick={() => runCopilotPrompt(item)}>
                    {item}
                  </button>
                ))}
              </div>
              <div className="workday-ai-context-note">助手会带着当前日期、记录、缺填和风险/阻塞上下文继续分析。</div>
            </div>
          </div>
        </div>
      </Drawer>

      <Modal
        title={selectedWorkLog ? `${dayjs(selectedWorkLog.date).format("YYYY-MM-DD")} · ${selectedWorkLog.title}` : "填报详情"}
        open={Boolean(selectedWorkLog)}
        onCancel={() => setSelectedWorkLog(null)}
        footer={null}
        width={860}
      >
        {selectedWorkLog ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="metric-card">
                <div className="metric-label">人员</div>
                <div className="mt-2 text-sm font-medium text-ink">{selectedWorkLog.user?.name ?? "-"}</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">项目</div>
                <div className="mt-2 text-sm font-medium text-ink">{selectedWorkLog.project?.name ?? "未关联"}</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">工时</div>
                <div className="metric-value">{Number(selectedWorkLog.hours).toFixed(1)}h</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">时间</div>
                <div className="mt-2 text-sm font-medium text-ink">
                  {selectedWorkLog.startTime ? dayjs(selectedWorkLog.startTime).format("HH:mm") : "--"}
                  {" - "}
                  {selectedWorkLog.endTime ? dayjs(selectedWorkLog.endTime).format("HH:mm") : "--"}
                </div>
              </div>
            </div>
            <div className="rounded-[8px] bg-surface-container-low p-4">
              <div className="mb-2 text-sm font-medium text-ink">内容</div>
              <div className="whitespace-pre-wrap text-sm leading-6 text-muted">{selectedWorkLog.content}</div>
            </div>
            {selectedWorkLog.attachments?.length ? (
              <div className="rounded-[8px] bg-surface-container-low p-4">
                <div className="mb-2 text-sm font-medium text-ink">附件</div>
                <WorkLogAttachmentViewer workLogId={selectedWorkLog.id} attachments={selectedWorkLog.attachments} />
              </div>
            ) : null}
            {selectedWorkLog.aiAnalysis ? (
              <div className="rounded-[8px] bg-surface-container-low p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-ink">
                  <Bot size={16} />
                  智能分析
                </div>
                <div className="text-sm leading-6 text-muted">{selectedWorkLog.aiAnalysis.summary}</div>
                <Space className="mt-3" wrap>
                  <Tag color="green">{selectedWorkLog.aiAnalysis.category}</Tag>
                  {selectedWorkLog.aiAnalysis.tags?.map((tag) => <Tag key={tag}>{tag}</Tag>)}
                  {selectedWorkLog.aiAnalysis.risks?.map((risk) => <Tag color="red" key={risk}>{risk}</Tag>)}
                </Space>
              </div>
            ) : selectedWorkLog.status === "SUBMITTED" ? (
              <div className="rounded-[8px] bg-surface-container-low p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-ink">
                  <Bot size={16} />
                  分析生成中
                </div>
                <div className="quickfill-draft-waiting mb-0" role="status" aria-live="polite">
                  <span className="quickfill-draft-spinner" />
                  <div>
                    <strong>正在分析这条填报</strong>
                    <p>系统已提交分析任务，真实模型可能需要几十秒；稍后刷新或返回列表查看结果。</p>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

    </div>
  );
}
