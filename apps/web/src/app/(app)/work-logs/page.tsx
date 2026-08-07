"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, DatePicker, Empty, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Tag, TimePicker, Typography, Upload, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { RcFile, UploadFile } from "antd/es/upload/interface";
import dayjs from "dayjs";
import { Download, Edit2, MessageSquare, Paperclip, RotateCw, Send, Trash2, UploadCloud, WandSparkles } from "lucide-react";
import type { ClipboardEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  WorkLogDraftComposer,
  clarificationQuestionForWorkLog,
  composeDraftComposerContent,
  createDraftComposerPreviewFromSuggestion,
  createDraftComposerPreviewFromText,
  createEmptyDraftComposerItem,
  draftComposerItemFromAi,
  projectIdFromDraftHint,
  selectedDraftComposerEntries,
  validateDraftComposerState,
  workLogQualityCheck,
  workLogDraftDateLabel,
  workLogComposerIntroText,
  workLogComposerModalSubtitle,
  type WorkLogDraftComposerIntent,
  type WorkLogDraftComposerItem,
  type WorkLogDraftComposerState,
  type WorkLogSmartSuggestion,
  type WorkLogSuggestionAnalysis
} from "@/components/WorkLogDraftComposer";
import { WorkLogDetailTitle, WorkLogDetailView } from "@/components/WorkLogDetailView";
import { apiDownload, apiFetch } from "@/lib/api";
import { hasAnyRole, useAuthStore } from "@/lib/auth-store";
import { CommunicationInsight, Project, WecomOverview, WorkLog, WorkLogAttachment, WorkLogDraft, WorkLogDraftItem, WorkLogKind } from "@/lib/types";
import { applyWorkLogTimingAutoFill, parseWorkLogTime } from "@/lib/work-log-time";

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

type CommunicationDraftForm = {
  date: dayjs.Dayjs;
  title: string;
  content: string;
  hours?: number | null;
  projectId?: string;
};

type AiChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type PendingAttachment = {
  uid: string;
  file: File;
  status: "ready" | "uploading" | "failed";
  errorMessage?: string;
};

type AttachmentUploadResult = {
  uploadedCount: number;
  failedCount: number;
  uploadedUids: string[];
  failedUids: string[];
  error?: Error;
};

type DraftPreviewItem = WorkLogDraftComposerItem;
type DraftPreview = WorkLogDraftComposerState;

const ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;

function formatFileSize(value: number) {
  if (value >= 1024 * 1024) {
    return `${(value / 1024 / 1024).toFixed(1)}MB`;
  }
  return `${Math.max(1, Math.round(value / 1024))}KB`;
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

function dateTimeText(value?: string | null) {
  if (!value) return "-";
  const date = dayjs(value);
  return date.isValid() ? date.format("YYYY-MM-DD HH:mm") : "-";
}

function workLogTimeInfo(record: WorkLog) {
  if (record.submittedAt && dayjs(record.submittedAt).isValid()) {
    return { label: "提交", value: dateTimeText(record.submittedAt) };
  }
  if (record.createdAt && dayjs(record.createdAt).isValid()) {
    return { label: record.status === "DRAFT" ? "草稿创建" : "创建", value: dateTimeText(record.createdAt) };
  }
  return { label: "未记录", value: "-" };
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

function attachmentUploadErrorMessage(error: unknown, file?: File) {
  if (file && file.size > ATTACHMENT_MAX_BYTES) {
    return "文件过大，请上传 20MB 以内的文件。";
  }
  const raw = error instanceof Error ? error.message : String(error ?? "");
  if (/20MB|file size|文件过大|too large|payload too large|413/i.test(raw)) {
    return "文件过大，请上传 20MB 以内的文件。";
  }
  if (/mime|type|类型|unsupported/i.test(raw)) {
    return "暂不支持该文件类型。";
  }
  if (/network|fetch|failed to fetch|timeout|网络/i.test(raw)) {
    return "网络异常，日报内容不会丢失。";
  }
  if (/附件内容无效|base64|invalid/i.test(raw)) {
    return "附件内容无效，请重新选择文件。";
  }
  return raw || "附件上传失败，请重试。";
}

function toPayload(values: WorkLogForm) {
  const date = values.date;
  const hours = typeof values.hours === "number" && Number.isFinite(values.hours) && values.hours > 0 ? values.hours : null;
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
    title: item.title || "工作记录",
    content: item.content || item.title || "工作记录",
    hours: Number.isFinite(hours) && hours > 0 ? hours : null,
    kind: item.kind,
    startTime: parseWorkLogTime(item.startTime, safeDate),
    endTime: parseWorkLogTime(item.endTime, safeDate)
  };
}

function draftPreviewItemToForm(item: DraftPreviewItem): WorkLogForm {
  return {
    ...draftItemToForm(item),
    content: composeDraftComposerContent(item),
    projectId: item.projectId
  };
}

function workLogKindForDate(date: dayjs.Dayjs) {
  return date.format("YYYY-MM-DD") > dayjs().format("YYYY-MM-DD") ? "PLAN" : "DAILY";
}

export default function WorkLogsPage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const [form] = Form.useForm<WorkLogForm>();
  const [communicationDraftForm] = Form.useForm<CommunicationDraftForm>();
  const [editing, setEditing] = useState<WorkLog | null>(null);
  const [detailRecord, setDetailRecord] = useState<WorkLog | null>(null);
  const [communicationDraft, setCommunicationDraft] = useState<CommunicationInsight | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [entryDate, setEntryDate] = useState(dayjs());
  const [dateFilter, setDateFilter] = useState<dayjs.Dayjs | null>(null);
  const [statusFilter, setStatusFilter] = useState<"ALL" | "DRAFT" | "SUBMITTED">("ALL");
  const [kindFilter, setKindFilter] = useState<"ALL" | WorkLogKind>("ALL");
  const [projectFilter, setProjectFilter] = useState<string | undefined>(undefined);
  const initialOpenHandled = useRef(false);
  const [aiInput, setAiInput] = useState("");
  const [lastAiInput, setLastAiInput] = useState("");
  const [aiMessages, setAiMessages] = useState<AiChatMessage[]>([
    {
      role: "assistant",
      content: workLogComposerIntroText
    }
  ]);
  const [draftPreview, setDraftPreview] = useState<DraftPreview | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [attachmentRetryTargetId, setAttachmentRetryTargetId] = useState<string | null>(null);
  const [suggestionAnalysis, setSuggestionAnalysis] = useState<WorkLogSuggestionAnalysis | null>(null);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionSubmitting, setSuggestionSubmitting] = useState(false);
  const [suggestionsUnavailable, setSuggestionsUnavailable] = useState(false);
  const suggestionRequestSeq = useRef(0);
  const canManageWorkLogs = hasAnyRole(user, ["SUPER_ADMIN", "COMPANY_ADMIN"]);
  const canModifyWorkLog = (record: WorkLog) => Boolean(record.userId === user?.id || canManageWorkLogs);

  const logs = useQuery({
    queryKey: ["work-logs"],
    queryFn: () => apiFetch<WorkLog[]>("/work-logs")
  });

  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: () => apiFetch<Project[]>("/projects")
  });

  const wecomOverview = useQuery({
    queryKey: ["wecom-overview"],
    queryFn: () => apiFetch<WecomOverview>("/wecom/overview")
  });

  const wecomLogDraftsEnabled = Boolean(wecomOverview.data?.features?.logDraftsEnabled);

  const communicationDrafts = useQuery({
    queryKey: ["wecom-log-drafts"],
    queryFn: () => apiFetch<CommunicationInsight[]>("/wecom/log-drafts"),
    enabled: wecomLogDraftsEnabled
  });

  const visibleCommunicationDrafts = communicationDrafts.data ?? wecomOverview.data?.drafts ?? [];
  const showCommunicationDrafts = wecomLogDraftsEnabled && visibleCommunicationDrafts.length > 0;

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

  const filteredLogs = useMemo(() => {
    return (logs.data ?? []).filter((item) => {
      const dateMatched = dateFilter ? dayjs(item.date).format("YYYY-MM-DD") === dateFilter.format("YYYY-MM-DD") : true;
      const statusMatched = statusFilter === "ALL" ? true : item.status === statusFilter;
      const kindMatched = kindFilter === "ALL" ? true : (item.kind ?? "DAILY") === kindFilter;
      const projectMatched = projectFilter ? item.projectId === projectFilter : true;
      return dateMatched && statusMatched && kindMatched && projectMatched;
    });
  }, [dateFilter, kindFilter, logs.data, projectFilter, statusFilter]);

  const pendingUploadFiles: UploadFile[] = useMemo(
    () =>
      pendingAttachments.map((item) => ({
        uid: item.uid,
        name: item.file.name,
        size: item.file.size,
        status: item.status === "uploading" ? "uploading" : item.status === "failed" ? "error" : "done",
        response: item.errorMessage
      })),
    [pendingAttachments]
  );

  const suggestionAttachmentMetadata = useMemo(
    () =>
      pendingAttachments.map((item) => ({
        fileName: item.file.name,
        mimeType: item.file.type || "application/octet-stream",
        status: item.status
      })),
    [pendingAttachments]
  );

  const uploadPendingAttachments = async (workLogId: string): Promise<AttachmentUploadResult> => {
    const files = [...pendingAttachments];
    let uploadedCount = 0;
    const uploadedUids: string[] = [];
    const failedUids: string[] = [];
    let lastError: Error | undefined;
    for (const item of files) {
      setPendingAttachments((current) => current.map((attachment) => (attachment.uid === item.uid ? { ...attachment, status: "uploading", errorMessage: undefined } : attachment)));
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
        uploadedUids.push(item.uid);
      } catch (error) {
        const messageText = attachmentUploadErrorMessage(error, item.file);
        failedUids.push(item.uid);
        lastError = new Error(messageText);
        setPendingAttachments((current) =>
          current.map((attachment) => (attachment.uid === item.uid ? { ...attachment, status: "failed", errorMessage: messageText } : attachment))
        );
      }
    }
    if (uploadedUids.length) {
      setPendingAttachments((current) => current.filter((item) => !uploadedUids.includes(item.uid)));
    }
    return { uploadedCount, failedCount: failedUids.length, uploadedUids, failedUids, error: lastError };
  };

  const communicationDraftPayload = (values: CommunicationDraftForm, submit: boolean) => ({
    date: values.date.format("YYYY-MM-DD"),
    title: values.title,
    content: values.content,
    hours: typeof values.hours === "number" && Number.isFinite(values.hours) ? values.hours : null,
    projectId: values.projectId || null,
    submit
  });

  const addPendingFiles = (files: File[], source: "upload" | "paste") => {
    const accepted = files.reduce<PendingAttachment[]>((result, file, index) => {
      if (file.size > ATTACHMENT_MAX_BYTES) {
        message.error("文件过大，请上传 20MB 以内的文件。");
        return result;
      }
      const uploadFile = file as RcFile;
      result.push({
        uid: uploadFile.uid || `${source}-${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`,
        file,
        status: "ready"
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

  const requestWorkLogSuggestion = useCallback(
    async ({
      text,
      messages,
      status,
      mode = "silent"
    }: {
      text: string;
      messages: AiChatMessage[];
      status?: string;
      mode?: "silent" | "submit";
    }) => {
      const requestId = ++suggestionRequestSeq.current;
      if (mode === "submit") {
        setSuggestionSubmitting(true);
      } else {
        setSuggestionsLoading(true);
      }
      try {
        const result = await apiFetch<WorkLogSuggestionAnalysis>("/ai/work-log-suggestions", {
          method: "POST",
          body: JSON.stringify({
            userInput: text,
            currentDate: entryDate.format("YYYY-MM-DD"),
            conversationStatus: status ?? suggestionAnalysis?.status ?? "idle",
            messages: messages.slice(-8),
            attachments: suggestionAttachmentMetadata
          })
        });
        if (requestId === suggestionRequestSeq.current) {
          setSuggestionAnalysis(result);
          setSuggestionsUnavailable(false);
        }
        return result;
      } catch (error) {
        if (requestId === suggestionRequestSeq.current) {
          setSuggestionsUnavailable(true);
          setSuggestionAnalysis(null);
        }
        throw error;
      } finally {
        if (requestId === suggestionRequestSeq.current) {
          if (mode === "submit") {
            setSuggestionSubmitting(false);
          } else {
            setSuggestionsLoading(false);
          }
        }
      }
    },
    [entryDate, suggestionAnalysis?.status, suggestionAttachmentMetadata]
  );

  const previewFromSuggestionAnalysis = (analysis: WorkLogSuggestionAnalysis, projectId?: string | null) => {
    const nextAnalysis =
      typeof projectId === "undefined"
        ? analysis
        : {
            ...analysis,
            draftItems: analysis.draftItems.map((item, index) => (index === 0 ? { ...item, projectId } : item))
          };
    return createDraftComposerPreviewFromSuggestion({
      analysis: nextAnalysis,
      date: entryDate,
      projects: projects.data,
      attachedToFirst: pendingAttachments.length > 0 && nextAnalysis.draftItems.length > 1
    });
  };

  const downloadAttachment = async (workLogId: string, attachment: WorkLogAttachment) => {
    const download = await apiDownload(`/work-logs/${workLogId}/attachments/${attachment.id}/download`);
    const url = URL.createObjectURL(download.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = download.filename || attachment.fileName;
    link.click();
    URL.revokeObjectURL(url);
  };

  const createLogRecord = async (values: WorkLogForm, withAttachments: boolean, submit: boolean) => {
    const workLog = await apiFetch<WorkLog>("/work-logs", { method: "POST", body: JSON.stringify(toPayload(values)) });
    let attachmentUpload: AttachmentUploadResult | null = null;
    if (withAttachments) {
      attachmentUpload = await uploadPendingAttachments(workLog.id);
    }
    const savedWorkLog = submit ? await apiFetch<WorkLog>(`/work-logs/${workLog.id}/submit`, { method: "POST" }) : workLog;
    return { workLog: savedWorkLog, attachmentUpload };
  };

  const updateLog = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: WorkLogForm }) => {
      const workLog = await apiFetch<WorkLog>(`/work-logs/${id}`, { method: "PATCH", body: JSON.stringify(toPayload(values)) });
      const attachmentUpload = pendingAttachments.length ? await uploadPendingAttachments(id) : null;
      return { workLog, attachmentUpload };
    },
    onSuccess: (result) => {
      message.success("已更新填报");
      if (result.attachmentUpload?.failedCount) {
        message.warning(`填报内容已保存，但 ${result.attachmentUpload.failedCount} 个附件上传失败。${result.attachmentUpload.error?.message ?? "请重试附件上传。"}`);
        setAttachmentRetryTargetId(result.workLog.id);
      } else {
        setAttachmentRetryTargetId(null);
        setModalOpen(false);
        setEditing(null);
      }
      queryClient.invalidateQueries({ queryKey: ["work-logs"] });
    },
    onError: (error) => {
      message.error((error as Error).message || "更新失败，请刷新页面后重试。");
    }
  });

  const deleteAttachment = useMutation({
    mutationFn: ({ workLogId, attachmentId }: { workLogId: string; attachmentId: string }) =>
      apiFetch<{ ok: boolean }>(`/work-logs/${workLogId}/attachments/${attachmentId}`, { method: "DELETE" }),
    onSuccess: (_, variables) => {
      message.success("已删除附件");
      setEditing((current) =>
        current?.id === variables.workLogId
          ? { ...current, attachments: current.attachments?.filter((attachment) => attachment.id !== variables.attachmentId) }
          : current
      );
      queryClient.invalidateQueries({ queryKey: ["work-logs"] });
    },
    onError: (error) => {
      message.error((error as Error).message || "删除附件失败，请刷新页面后重试。");
    }
  });

  const submitLog = useMutation({
    mutationFn: (id: string) => apiFetch<WorkLog>(`/work-logs/${id}/submit`, { method: "POST" }),
    onSuccess: () => {
      message.success("已提交，将进入分析队列");
      queryClient.invalidateQueries({ queryKey: ["work-logs"] });
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
    }
  });

  const deleteLog = useMutation({
    mutationFn: (id: string) => apiFetch<{ ok: boolean }>(`/work-logs/${id}`, { method: "DELETE" }),
    onSuccess: (_, id) => {
      message.success("已删除");
      if (editing?.id === id) {
        setModalOpen(false);
        setEditing(null);
        setPendingAttachments([]);
        setAttachmentRetryTargetId(null);
      }
      setDetailRecord((current) => (current?.id === id ? null : current));
      queryClient.invalidateQueries({ queryKey: ["work-logs"] });
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      queryClient.invalidateQueries({ queryKey: ["calendar-today"] });
      queryClient.invalidateQueries({ queryKey: ["project-work-logs"] });
    },
    onError: (error) => {
      message.error((error as Error).message || "删除失败，请刷新页面后重试。");
    }
  });

  const confirmCommunicationDraft = useMutation({
    mutationFn: ({ draft, values, submit }: { draft: CommunicationInsight; values: CommunicationDraftForm; submit: boolean }) =>
      apiFetch<WorkLog>(`/wecom/log-drafts/${draft.id}/confirm`, {
        method: "POST",
        body: JSON.stringify(communicationDraftPayload(values, submit))
      }),
    onSuccess: (_, variables) => {
      message.success(variables.submit ? "已确认提交沟通记录草稿。" : "已保存为日报草稿。");
      setCommunicationDraft(null);
      communicationDraftForm.resetFields();
      queryClient.invalidateQueries({ queryKey: ["wecom-log-drafts"] });
      queryClient.invalidateQueries({ queryKey: ["wecom-overview"] });
      queryClient.invalidateQueries({ queryKey: ["work-logs"] });
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      queryClient.invalidateQueries({ queryKey: ["calendar-today"] });
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : "候选草稿确认失败");
    }
  });

  const ignoreCommunicationDraft = useMutation({
    mutationFn: (draft: CommunicationInsight) => apiFetch<{ ok: boolean }>(`/wecom/log-drafts/${draft.id}/ignore`, { method: "POST" }),
    onSuccess: () => {
      message.success("已忽略该候选草稿");
      setCommunicationDraft(null);
      communicationDraftForm.resetFields();
      queryClient.invalidateQueries({ queryKey: ["wecom-log-drafts"] });
      queryClient.invalidateQueries({ queryKey: ["wecom-overview"] });
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : "忽略候选草稿失败");
    }
  });

  const draftLog = useMutation({
    mutationFn: async (messages: AiChatMessage[]) => {
      const draft = await apiFetch<WorkLogDraft>("/ai/work-log-draft", {
        method: "POST",
        body: JSON.stringify({
          currentDate: dayjs().format("YYYY-MM-DD"),
          messages
        })
      });
      if (editing) {
        return { draft, preview: null, filledForm: true };
      }
      const items = normalizedDraftItems(draft);
      const attachedToFirst = pendingAttachments.length > 0 && items.length > 1;
      return {
        draft,
        preview: {
          assistantMessage: draft.assistantMessage,
          items: items.map((item, index) => draftComposerItemFromAi(item, index, projectIdFromDraftHint(projects.data, item.projectHint))),
          attachedToFirst,
          attachmentTargetIndex: 0
        } satisfies DraftPreview,
        filledForm: false
      };
    },
    onSuccess: ({ draft, preview, filledForm }) => {
      if (filledForm) {
        const first = normalizedDraftItems(draft)[0];
        form.setFieldsValue(draftItemToForm(first));
      }
      setAiMessages((messages) => [...messages, { role: "assistant", content: draft.assistantMessage }]);
      if (filledForm) {
        message.success("已整理到表单，请确认后保存修改。");
      } else {
        setDraftPreview(preview);
        message.success(preview?.items.length ? `已整理 ${preview.items.length} 条提交摘要。` : "已整理提交摘要，请确认后提交。");
      }
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : "草稿生成失败，请调整描述后重试。");
    }
  });

  const persistDraftLog = useMutation({
    mutationFn: async ({ preview, submit }: { preview: DraftPreview; submit: boolean }) => {
      const selectedEntries = selectedDraftComposerEntries(preview);
      if (!selectedEntries.length) {
        throw new Error("请至少选择一条工作记录。");
      }
      const hasAttachments = pendingAttachments.length > 0;
      const requestedTargetIndex = Number.isInteger(preview.attachmentTargetIndex) ? preview.attachmentTargetIndex : selectedEntries[0].index;
      const uploadTargetIndex = selectedEntries.some((entry) => entry.index === requestedTargetIndex) ? requestedTargetIndex : selectedEntries[0].index;
      let attachmentUpload: AttachmentUploadResult | null = null;
      let uploadTargetWorkLogId: string | null = null;
      const persistedItems: Array<{ localId: string; workLog: WorkLog; index: number }> = [];
      for (const { item, index } of selectedEntries) {
        const result = await createLogRecord(draftPreviewItemToForm(item), hasAttachments && index === uploadTargetIndex, submit);
        persistedItems.push({ localId: item.localId, workLog: result.workLog, index });
        if (hasAttachments && index === uploadTargetIndex) {
          uploadTargetWorkLogId = result.workLog.id;
        }
        if (result.attachmentUpload) {
          attachmentUpload = result.attachmentUpload;
        }
      }
      return { ...preview, persistedCount: selectedEntries.length, persistedItems, hasAttachments, uploadTargetIndex, uploadTargetWorkLogId, submit, attachmentUpload };
    },
    onSuccess: (preview) => {
      message.success(preview.submit ? `已提交 ${preview.persistedCount} 条工作记录。` : `已保存 ${preview.persistedCount} 条草稿。`);
      if (preview.attachmentUpload?.failedCount) {
        message.warning(
          `${preview.submit ? "工作记录已提交" : "草稿已保存"}，但 ${preview.attachmentUpload.failedCount} 个附件上传失败。${preview.attachmentUpload.error?.message ?? "请稍后在填报记录中重新上传。"}`
        );
      } else if (preview.hasAttachments && preview.persistedCount > 1) {
        message.info(`附件已关联到第 ${preview.uploadTargetIndex + 1} 条已确认草稿。`);
      }
      const persistedByLocalId = new Map(preview.persistedItems.map((item) => [item.localId, item.workLog]));
      if (preview.attachmentUpload?.failedCount) {
        setAttachmentRetryTargetId(preview.uploadTargetWorkLogId);
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
      } else {
        setAttachmentRetryTargetId(null);
        setDraftPreview(null);
        setModalOpen(false);
        setPendingAttachments([]);
        setSuggestionAnalysis(null);
        setSuggestionsUnavailable(false);
        form.resetFields();
      }
      queryClient.invalidateQueries({ queryKey: ["work-logs"] });
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      queryClient.invalidateQueries({ queryKey: ["calendar-today"] });
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : "保存工作记录失败，请检查后重试。");
    }
  });

  const retryFailedAttachments = useMutation({
    mutationFn: async () => {
      const targetId = attachmentRetryTargetId ?? editing?.id;
      if (!targetId) {
        throw new Error("请先保存日报内容，再重试附件上传。");
      }
      return uploadPendingAttachments(targetId);
    },
    onSuccess: (result) => {
      if (result.failedCount) {
        message.warning(`仍有 ${result.failedCount} 个附件上传失败。${result.error?.message ?? "请检查网络后重试。"}`);
        return;
      }
      message.success("失败附件已上传。");
      setAttachmentRetryTargetId(null);
      queryClient.invalidateQueries({ queryKey: ["work-logs"] });
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      queryClient.invalidateQueries({ queryKey: ["calendar-today"] });
      if (!editing) {
        setDraftPreview(null);
        setModalOpen(false);
        form.resetFields();
      }
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : "附件上传失败，请重试。");
    }
  });

  const sendAiMessage = async (textOverride?: string, intent: WorkLogDraftComposerIntent = "analyze", projectId?: string | null) => {
    const text = (textOverride ?? aiInput).trim();
    if (!text && intent === "split" && aiMessages.some((item) => item.role === "user")) {
      draftLog.mutate(aiMessages);
      return;
    }
    if (!text) return;
    const lastUserMessage = [...aiMessages].reverse().find((item) => item.role === "user");
    const nextMessages = lastUserMessage?.content.trim() === text ? aiMessages : [...aiMessages, { role: "user" as const, content: text }];
    setLastAiInput(text);
    setAiInput("");
    if (intent === "split") {
      setAiMessages(nextMessages);
      draftLog.mutate(nextMessages);
      return;
    }
    try {
      const analysis = await requestWorkLogSuggestion({
        text,
        messages: nextMessages,
        status: intent,
        mode: "submit"
      });
      const nextPreview = analysis.canSubmit ? previewFromSuggestionAnalysis(analysis, projectId) : null;
      setDraftPreview(nextPreview);
      setAiMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: analysis.assistantMessage || (nextPreview ? "内容已整理为提交摘要，请确认后提交。" : "请补充这项工作的结果或下一步。")
        }
      ]);
      return;
    } catch {
      const quality = workLogQualityCheck(text);
      if (intent !== "force_single" && !quality.ok) {
        setAiMessages([...nextMessages, { role: "assistant", content: clarificationQuestionForWorkLog(text) }]);
        setDraftPreview(null);
        return;
      }
      setDraftPreview(createDraftComposerPreviewFromText({ text, date: entryDate, projects: projects.data, projectId }));
      setAiMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: "智能建议暂时不可用，已根据当前内容整理提交摘要，请确认后提交。"
        }
      ]);
    }
  };

  const continueEditingDraftPrompt = () => {
    setAiInput((current) => current || lastAiInput);
  };

  const latestUserInput = () => aiInput.trim() || lastAiInput || [...aiMessages].reverse().find((item) => item.role === "user")?.content.trim() || "";

  const handleSmartSuggestionClick = (suggestion: WorkLogSmartSuggestion) => {
    const text = latestUserInput();
    if (suggestion.action === "select_project") {
      const projectId = suggestion.projectId ?? null;
      if (draftPreview?.items.length) {
        const targetIndex = draftPreview.items.findIndex((item) => item.selected && item.status !== "submitted" && item.status !== "ignored");
        updateDraftPreviewItem(targetIndex >= 0 ? targetIndex : 0, {
          projectId: projectId ?? undefined,
          projectConfirmed: true
        });
        return;
      }
      if (suggestionAnalysis?.draftItems.length) {
        const preview = previewFromSuggestionAnalysis(suggestionAnalysis, projectId);
        if (preview) {
          setDraftPreview(preview);
          setAiMessages((messages) => [...messages, { role: "assistant", content: "已更新项目归属，请确认摘要后提交。" }]);
          return;
        }
      }
      if (text) {
        void sendAiMessage(text, "force_single", projectId);
      }
      return;
    }
    if (suggestion.action === "confirm_split") {
      void sendAiMessage(text, "split");
      return;
    }
    if (suggestion.action === "confirm_single") {
      void sendAiMessage(text, "force_single");
      return;
    }
    const value = (suggestion.value || suggestion.label).trim();
    const nextText = text ? `${text}；${value}` : value;
    void sendAiMessage(nextText, "analyze");
  };

  const openCreate = (dateValue = dayjs()) => {
    const dateKey = dateValue.format("YYYY-MM-DD");
    const isFuture = dateKey > dayjs().format("YYYY-MM-DD");
    setEditing(null);
    setEntryDate(dateValue);
    setPendingAttachments([]);
    setAttachmentRetryTargetId(null);
    setSuggestionAnalysis(null);
    setSuggestionsUnavailable(false);
    form.resetFields();
    form.setFieldsValue({
      date: dateValue,
      title: isFuture ? "工作计划" : "工作记录",
      content: "",
      hours: null,
      kind: isFuture ? "PLAN" : "DAILY"
    });
    setAiInput("");
    setLastAiInput("");
    setAiMessages([]);
    setDraftPreview({
      assistantMessage: "今日工作记录",
      items: [],
      attachedToFirst: false,
      attachmentTargetIndex: 0
    });
    setModalOpen(true);
  };

  useEffect(() => {
    if (initialOpenHandled.current || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") !== "1") return;
    initialOpenHandled.current = true;
    const dateParam = params.get("date");
    const parsedDate = dateParam && dayjs(dateParam).isValid() ? dayjs(dateParam) : dayjs();
    openCreate(parsedDate);
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  useEffect(() => {
    if (!modalOpen || editing) return;
    const text = aiInput.trim();
    if (!text) {
      setSuggestionAnalysis(null);
      setSuggestionsUnavailable(false);
      return;
    }
    const timer = window.setTimeout(() => {
      requestWorkLogSuggestion({ text, messages: aiMessages, status: "typing", mode: "silent" }).catch(() => undefined);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [aiInput, aiMessages, editing, modalOpen, requestWorkLogSuggestion]);

  const openEdit = (record: WorkLog) => {
    setEditing(record);
    setPendingAttachments([]);
    setAttachmentRetryTargetId(null);
    setSuggestionAnalysis(null);
    setSuggestionsUnavailable(false);
    form.setFieldsValue({
      date: dayjs(record.date),
      title: record.title,
      content: record.content,
      startTime: parseWorkLogTime(record.startTime, record.date),
      endTime: parseWorkLogTime(record.endTime, record.date),
      hours: Number(record.hours),
      projectId: record.projectId ?? undefined,
      kind: record.kind ?? "DAILY"
    });
    setAiInput("");
    setLastAiInput("");
    setAiMessages([
      {
        role: "assistant",
        content: "可以继续用自然语言修改这条填报，例如“把日期改成明天，工时改成 2 小时，内容补充联调风险”。"
      }
    ]);
    setDraftPreview(null);
    setModalOpen(true);
  };

  const openCommunicationDraft = (draft: CommunicationInsight) => {
    const date = dayjs(draft.date);
    communicationDraftForm.setFieldsValue({
      date: date.isValid() ? date : dayjs(),
      title: draft.title,
      content: draft.content,
      hours: typeof draft.hours === "number" ? draft.hours : null,
      projectId: draft.projectId ?? undefined
    });
    setCommunicationDraft(draft);
  };

  const submitCommunicationDraft = (submit: boolean) => {
    if (!communicationDraft) return;
    communicationDraftForm
      .validateFields()
      .then((values) => confirmCommunicationDraft.mutate({ draft: communicationDraft, values, submit }))
      .catch(() => message.warning("请先补全候选草稿"));
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
      const nextItem = createEmptyDraftComposerItem(entryDate);
      if (!current) {
        return {
          assistantMessage: "手动新增工作记录。",
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

  const markDraftItemExpanded = (index: number) => {
    if (index < 0) return;
    updateDraftPreviewItem(index, { expanded: true });
  };

  const persistDraftPreview = (submit: boolean) => {
    const validation = validateDraftComposerState(draftPreview);
    if (!validation.ok) {
      markDraftItemExpanded(validation.index);
      message.warning(validation.message);
      return;
    }
    persistDraftLog.mutate({ preview: draftPreview as DraftPreview, submit });
  };
  const entryKindTitle = workLogKindForDate(entryDate) === "PLAN" ? "填写计划" : "填写日报";

  const columns: ColumnsType<WorkLog> = [
    { title: "日期", dataIndex: "date", width: 110, render: (value: string) => dayjs(value).format("YYYY-MM-DD") },
    {
      title: "类型",
      dataIndex: "kind",
      width: 90,
      render: (value?: WorkLogKind) => <Tag color={(value ?? "DAILY") === "PLAN" ? "blue" : "green"}>{(value ?? "DAILY") === "PLAN" ? "计划" : "日报"}</Tag>
    },
    {
      title: "填报时间",
      width: 170,
      render: (_, record) => {
        const time = workLogTimeInfo(record);
        return (
          <div>
            <div className="font-medium text-ink">{time.value}</div>
            <div className="mt-1 text-xs text-muted">{time.label}</div>
          </div>
        );
      }
    },
    {
      title: "标题",
      width: 260,
      render: (_, record) => (
        <div className="min-w-0">
          <Button type="link" className="!h-auto !p-0 !text-left font-medium" onClick={() => setDetailRecord(record)}>
            {record.title}
          </Button>
          <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted">{record.content}</div>
          {record.attachments?.length ? (
            <Tag className="mt-2" icon={<Paperclip size={13} />}>
              附件 {record.attachments.length}
            </Tag>
          ) : null}
          {record.sourceLinks?.length ? (
            <Tag className="mt-2" color="cyan" icon={<MessageSquare size={13} />}>
              沟通来源 {record.sourceLinks.length}
            </Tag>
          ) : null}
        </div>
      )
    },
    {
      title: "项目",
      width: 180,
      render: (_, record) => record.project ? <Tag color="blue">{record.project.code ? `${record.project.code} · ${record.project.name}` : record.project.name}</Tag> : "未关联"
    },
    { title: "人员", width: 120, render: (_, record) => record.user?.name ?? "-" },
    { title: "工时", dataIndex: "hours", width: 90, render: (value: string | number) => `${Number(value).toFixed(1)}h` },
    {
      title: "状态",
      dataIndex: "status",
      width: 110,
      render: (value: string) => <Tag color={value === "SUBMITTED" ? "green" : "default"}>{value === "SUBMITTED" ? "已提交" : "草稿"}</Tag>
    },
    {
      title: "风险/阻塞",
      width: 120,
      render: (_, record) => {
        const count = (record.aiAnalysis?.risks?.length ?? 0) + (record.aiAnalysis?.blockers?.length ?? 0);
        return <Tag color={count ? "red" : "default"}>{count ? `${count} 条` : "无"}</Tag>;
      }
    },
    {
      title: "操作",
      width: 210,
      render: (_, record) => {
        if (!canModifyWorkLog(record)) {
          return (
            <Button onClick={() => setDetailRecord(record)}>
              查看
            </Button>
          );
        }
        return (
          <Space>
            <Button icon={<Edit2 size={15} />} onClick={() => openEdit(record)} />
            <Button icon={<Send size={15} />} disabled={record.status === "SUBMITTED"} loading={submitLog.isPending} onClick={() => submitLog.mutate(record.id)}>
              提交
            </Button>
            <Popconfirm title="确认删除这条填报？删除后不会进入统计和汇报。" onConfirm={() => deleteLog.mutate(record.id)}>
              <Button danger icon={<Trash2 size={15} />} loading={deleteLog.isPending && deleteLog.variables === record.id} />
            </Popconfirm>
          </Space>
        );
      }
    }
  ];

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <Typography.Title level={3} className="page-title">
            填报记录
          </Typography.Title>
          <Typography.Text className="page-subtitle">填写日报和计划，提交后系统会自动进入分析队列。</Typography.Text>
        </div>
      </div>

      <div className="surface-panel worklog-entry-panel">
        <div className="worklog-entry-copy">
          <div className="section-title">填写今日记录</div>
          <div className="section-subtitle">请描述今日工作内容，系统会追问缺失信息，并在提交前展示摘要。</div>
        </div>
        <Button type="primary" className="ai-soft-button" icon={<WandSparkles size={16} />} onClick={() => openCreate()}>
          填写今日记录
        </Button>
      </div>

      {showCommunicationDrafts ? (
        <div className="surface-panel communication-draft-panel">
          <div className="section-head">
            <div>
              <div className="section-title">沟通记录候选草稿</div>
              <div className="section-subtitle">来自企业微信群的候选内容，确认后才会进入正式填报。</div>
            </div>
            <Button icon={<RotateCw size={16} />} onClick={() => communicationDrafts.refetch()} loading={communicationDrafts.isFetching}>
              刷新候选
            </Button>
          </div>
          <div className="communication-draft-list">
            {visibleCommunicationDrafts.slice(0, 4).map((draft) => (
              <button key={draft.id} type="button" className="communication-draft-item" onClick={() => openCommunicationDraft(draft)}>
                <span>
                  <strong>{draft.title}</strong>
                  <em>{draft.suggestedUser?.name ?? "未映射成员"} · {dayjs(draft.date).format("YYYY-MM-DD")} · {draft.source?.name ?? "未知来源"}</em>
                </span>
                <span className="communication-draft-tags">
                  <Tag color={draft.confidence >= 0.8 ? "green" : "orange"}>{Math.round(draft.confidence * 100)}%</Tag>
                  {draft.missingFields?.length ? <Tag color="orange">需确认</Tag> : null}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <section className="history-section">
        <div className="history-section-head">
          <div>
            <div className="section-title">历史记录</div>
            <div className="section-subtitle">用于回看、补交和修改已填写的记录。</div>
          </div>
          <Button icon={<RotateCw size={16} />} onClick={() => logs.refetch()} loading={logs.isFetching}>
            刷新记录
          </Button>
        </div>

        <div className="toolbar-panel flex flex-wrap items-center gap-3">
          <DatePicker value={dateFilter} onChange={setDateFilter} placeholder="按日期筛选" />
          <Select
            value={statusFilter}
            style={{ width: 132 }}
            onChange={setStatusFilter}
            options={[
              { value: "ALL", label: "全部状态" },
              { value: "DRAFT", label: "草稿" },
              { value: "SUBMITTED", label: "已提交" }
            ]}
          />
          <Select
            value={kindFilter}
            style={{ width: 132 }}
            onChange={setKindFilter}
            options={[
              { value: "ALL", label: "全部类型" },
              { value: "DAILY", label: "日报" },
              { value: "PLAN", label: "计划" }
            ]}
          />
          <Select
            allowClear
            value={projectFilter}
            placeholder="按项目筛选"
            style={{ width: 220 }}
            loading={projects.isFetching}
            options={projectOptions}
            onChange={setProjectFilter}
          />
        </div>

        <Table
          rowKey="id"
          loading={logs.isFetching}
          dataSource={filteredLogs}
          columns={columns}
          locale={{ emptyText: <Empty description="暂无填报记录，先写一条日报或计划" /> }}
          pagination={{ pageSize: 8 }}
          scroll={{ x: 1360 }}
        />
      </section>

      <Modal
        title={
          editing ? (
            "编辑填报"
          ) : (
            <div className="today-log-modal-title">
              <strong>{entryKindTitle}</strong>
              <span>{workLogDraftDateLabel(entryDate)}，{workLogComposerModalSubtitle}</span>
            </div>
          )
        }
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          setDraftPreview(null);
          setPendingAttachments([]);
          setAttachmentRetryTargetId(null);
          setSuggestionAnalysis(null);
          setSuggestionsUnavailable(false);
          setEditing(null);
        }}
        footer={
          editing
            ? [
                <Popconfirm key="delete" title="确认删除这条填报？删除后不会进入统计和汇报。" onConfirm={() => deleteLog.mutate(editing.id)}>
                  <Button danger icon={<Trash2 size={15} />} loading={deleteLog.isPending && deleteLog.variables === editing.id}>
                    删除记录
                  </Button>
                </Popconfirm>,
                <Button key="cancel" onClick={() => setModalOpen(false)}>
                  取消
                </Button>,
                <Button key="save" type="primary" loading={updateLog.isPending} onClick={() => form.submit()}>
                  保存修改
                </Button>
              ]
            : null
        }
        width={editing ? 760 : 920}
        className={editing ? undefined : "today-log-modal"}
      >
        {editing ? (
          <Form
            form={form}
            layout="vertical"
            onValuesChange={(changed, values) => applyWorkLogTimingAutoFill(changed, values, form.setFieldsValue)}
            onFinish={(values) => updateLog.mutate({ id: editing.id, values })}
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <Form.Item name="date" label="日期" rules={[{ required: true }]}>
                <DatePicker className="w-full" />
              </Form.Item>
              <Form.Item name="hours" label="工时">
                <InputNumber className="w-full" min={0} max={24} step={0.5} placeholder="可不填" />
              </Form.Item>
              <Form.Item name="kind" label="类型" rules={[{ required: true }]}>
                <Select
                  options={[
                    { value: "DAILY", label: "日报" },
                    { value: "PLAN", label: "计划" }
                  ]}
                />
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
                <Select allowClear showSearch optionFilterProp="label" placeholder="选择项目" loading={projects.isFetching} listHeight={280} dropdownStyle={{ zIndex: 1800 }} options={projectOptions} />
              </Form.Item>
            </div>
            <Form.Item name="content" label="工作内容" rules={[{ required: true, min: 2 }]}>
              <Input.TextArea rows={6} onPaste={handlePasteImages} />
            </Form.Item>
            <Form.Item label="附件">
              {editing.attachments?.length ? (
                <div className="mb-3 space-y-2">
                  {editing.attachments.map((attachment) => (
                    <div key={attachment.id} className="flex items-center justify-between gap-3 rounded-[12px] bg-surface-container-low px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-ink">{attachment.fileName}</div>
                        <div className="text-xs text-muted">
                          {attachment.kind === "IMAGE" ? "图片" : "文件"} · {formatFileSize(attachment.fileSize)}
                        </div>
                      </div>
                      <Space>
                        <Button
                          size="small"
                          icon={<Download size={14} />}
                          onClick={() =>
                            downloadAttachment(editing.id, attachment).catch((error) => message.error((error as Error).message || "下载失败，请刷新页面后重试。"))
                          }
                        />
                        <Popconfirm title="确认删除这个附件？" onConfirm={() => deleteAttachment.mutate({ workLogId: editing.id, attachmentId: attachment.id })}>
                          <Button size="small" danger icon={<Trash2 size={14} />} loading={deleteAttachment.isPending} />
                        </Popconfirm>
                      </Space>
                    </div>
                  ))}
                </div>
              ) : null}
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
                  <p className="ant-upload-hint">单个附件最大 20MB，支持直接粘贴聊天截图。</p>
                </Upload.Dragger>
                {pendingAttachments.some((item) => item.status === "failed") ? (
                  <div className="mt-3">
                    <Button loading={retryFailedAttachments.isPending} onClick={() => retryFailedAttachments.mutate()}>
                      重试失败附件
                    </Button>
                  </div>
                ) : null}
              </div>
            </Form.Item>
          </Form>
        ) : (
          <WorkLogDraftComposer
            aiMessages={aiMessages}
            aiInput={aiInput}
            aiPending={draftLog.isPending || suggestionSubmitting}
            aiError={draftLog.error instanceof Error ? draftLog.error : null}
            onAiInputChange={setAiInput}
            onGenerateDraft={sendAiMessage}
            onContinuePrompt={continueEditingDraftPrompt}
            smartSuggestions={suggestionAnalysis?.suggestions ?? []}
            suggestionsLoading={suggestionsLoading}
            suggestionsUnavailable={suggestionsUnavailable}
            onSmartSuggestionClick={handleSmartSuggestionClick}
            draftPreview={draftPreview}
            onUpdateItem={updateDraftPreviewItem}
            onDeleteItem={deleteDraftPreviewItem}
            onAddManualItem={addManualDraftItem}
            onAttachmentTargetChange={(value) => setDraftPreview((current) => (current ? { ...current, attachmentTargetIndex: value } : current))}
            onSaveDrafts={() => persistDraftPreview(false)}
            onSubmitDrafts={() => persistDraftPreview(true)}
            saving={persistDraftLog.isPending && persistDraftLog.variables?.submit === false}
            submitting={persistDraftLog.isPending && persistDraftLog.variables?.submit === true}
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
            onRetryFailedAttachments={() => retryFailedAttachments.mutate()}
            attachmentRetrying={retryFailedAttachments.isPending}
            onPasteImages={handlePasteImages}
          />
        )}
      </Modal>

      <Modal
        title={detailRecord ? <WorkLogDetailTitle record={detailRecord} currentUserId={user?.id} readOnly={!canModifyWorkLog(detailRecord)} /> : "填报详情"}
        open={Boolean(detailRecord)}
        onCancel={() => setDetailRecord(null)}
        footer={
          detailRecord && canModifyWorkLog(detailRecord)
            ? [
                <Popconfirm key="delete" title="确认删除这条填报？删除后不会进入统计和汇报。" onConfirm={() => deleteLog.mutate(detailRecord.id)}>
                  <Button danger icon={<Trash2 size={15} />} loading={deleteLog.isPending && deleteLog.variables === detailRecord.id}>
                    删除记录
                  </Button>
                </Popconfirm>,
                <Button
                  key="edit"
                  icon={<Edit2 size={15} />}
                  onClick={() => {
                    const record = detailRecord;
                    setDetailRecord(null);
                    openEdit(record);
                  }}
                >
                  编辑记录
                </Button>
              ]
            : null
        }
        width={860}
        zIndex={1500}
        className="work-log-detail-modal"
      >
        {detailRecord ? <WorkLogDetailView record={detailRecord} /> : null}
      </Modal>

      <Modal
        title="确认沟通记录草稿"
        open={Boolean(communicationDraft)}
        onCancel={() => setCommunicationDraft(null)}
        width={780}
        footer={
          communicationDraft
            ? [
                <Button key="ignore" danger loading={ignoreCommunicationDraft.isPending} onClick={() => ignoreCommunicationDraft.mutate(communicationDraft)}>
                  忽略候选
                </Button>,
                <Button key="draft" loading={confirmCommunicationDraft.isPending} onClick={() => submitCommunicationDraft(false)}>
                  保存为草稿
                </Button>,
                <Button key="submit" type="primary" loading={confirmCommunicationDraft.isPending} onClick={() => submitCommunicationDraft(true)}>
                  确认提交
                </Button>
              ]
            : null
        }
      >
        {communicationDraft ? (
          <div className="space-y-4">
            <Alert
              type={communicationDraft.missingFields?.length || communicationDraft.confidence < 0.8 ? "warning" : "info"}
              showIcon
              message="请确认后再写入工作记录"
              description="来源内容只会生成候选草稿。你可以修改日期、项目、工时、标题和内容，再选择保存草稿或确认提交。"
            />
            <div className="communication-draft-evidence">
              <span>归属人：{communicationDraft.suggestedUser?.name ?? "未映射"}</span>
              <span>来源群：{communicationDraft.source?.name ?? "未知来源"}</span>
              <span>来源消息：{communicationDraft.sourceMessageIds?.length ?? 0} 条</span>
              <span>来源文件：{communicationDraft.sourceFiles?.length ?? communicationDraft.sourceFileIds?.length ?? 0} 个</span>
              <span>置信度：{Math.round(communicationDraft.confidence * 100)}%</span>
            </div>
            <Form form={communicationDraftForm} layout="vertical">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <Form.Item name="date" label="日期" rules={[{ required: true }]}>
                  <DatePicker className="w-full" />
                </Form.Item>
                <Form.Item name="hours" label="工时">
                  <InputNumber className="w-full" min={0} max={24} step={0.5} placeholder="补充工时" />
                </Form.Item>
                <Form.Item className="md:col-span-2" name="projectId" label="关联项目">
                  <Select allowClear showSearch optionFilterProp="label" placeholder="选择项目" listHeight={280} loading={projects.isFetching} dropdownStyle={{ zIndex: 1800 }} options={projectOptions} />
                </Form.Item>
              </div>
              <Form.Item name="title" label="标题" rules={[{ required: true, min: 2 }]}>
                <Input />
              </Form.Item>
              <Form.Item name="content" label="工作内容" rules={[{ required: true, min: 2 }]}>
                <Input.TextArea rows={6} />
              </Form.Item>
            </Form>
            <div className="communication-draft-ai">
              <div>
                <strong>结论</strong>
                <span>{communicationDraft.title}</span>
              </div>
              <div>
                <strong>依据</strong>
                <span>
                  {[
                    communicationDraft.sourceMessages?.map((item) => item.content).join("；"),
                    communicationDraft.sourceFiles?.map((item) => item.aiSummary ?? item.fileName).join("；")
                  ].filter(Boolean).join("；") || communicationDraft.source?.name || "来源消息已记录"}
                </span>
              </div>
              <div>
                <strong>下一步动作</strong>
                <span>{communicationDraft.nextActions?.join("；") || "补充工时并确认项目归属。"}</span>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
