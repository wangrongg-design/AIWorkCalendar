"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, DatePicker, Empty, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Tag, TimePicker, Typography, Upload, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { RcFile, UploadFile } from "antd/es/upload/interface";
import dayjs from "dayjs";
import { Download, Edit2, MessageSquare, Paperclip, RotateCw, Send, Trash2, UploadCloud, WandSparkles } from "lucide-react";
import type { ClipboardEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  WorkLogDraftComposer,
  composeDraftComposerContent,
  createEmptyDraftComposerItem,
  draftComposerItemFromAi,
  projectIdFromDraftHint,
  selectedDraftComposerEntries,
  validateDraftComposerState,
  workLogDraftDateLabel,
  type WorkLogDraftComposerItem,
  type WorkLogDraftComposerState
} from "@/components/WorkLogDraftComposer";
import { WorkLogDetailTitle, WorkLogDetailView } from "@/components/WorkLogDetailView";
import { apiDownload, apiFetch } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { CommunicationInsight, Project, WorkLog, WorkLogAttachment, WorkLogDraft, WorkLogDraftItem, WorkLogKind } from "@/lib/types";
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
};

type AttachmentUploadResult = {
  uploadedCount: number;
  failedCount: number;
  error?: Error;
};

type DraftPreviewItem = WorkLogDraftComposerItem;
type DraftPreview = WorkLogDraftComposerState;

const ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024;

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

function toPayload(values: WorkLogForm) {
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
      content: "直接告诉我今天完成了什么、花了多久，或明天计划做什么；一句话里有多条日程也可以，我会先识别整理，等待完成后再写入填报。"
    }
  ]);
  const [draftPreview, setDraftPreview] = useState<DraftPreview | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);

  const logs = useQuery({
    queryKey: ["work-logs"],
    queryFn: () => apiFetch<WorkLog[]>("/work-logs")
  });

  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: () => apiFetch<Project[]>("/projects")
  });

  const communicationDrafts = useQuery({
    queryKey: ["wecom-log-drafts"],
    queryFn: () => apiFetch<CommunicationInsight[]>("/wecom/log-drafts")
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
        message.warning(`填报内容已保存，但 ${result.attachmentUpload.failedCount} 个附件上传失败。${result.attachmentUpload.error?.message ?? "请稍后重新上传。"}`);
      }
      setModalOpen(false);
      setEditing(null);
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
    onSuccess: () => {
      message.success("已删除");
      queryClient.invalidateQueries({ queryKey: ["work-logs"] });
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
        message.success(preview?.items.length ? `已生成 ${preview.items.length} 条草稿，请逐条确认。` : "已生成草稿，请确认后提交。");
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
        throw new Error("请至少选择一条日报项。");
      }
      const hasAttachments = pendingAttachments.length > 0;
      const requestedTargetIndex = Number.isInteger(preview.attachmentTargetIndex) ? preview.attachmentTargetIndex : selectedEntries[0].index;
      const uploadTargetIndex = selectedEntries.some((entry) => entry.index === requestedTargetIndex) ? requestedTargetIndex : selectedEntries[0].index;
      let attachmentUpload: AttachmentUploadResult | null = null;
      for (const { item, index } of selectedEntries) {
        const result = await createLogRecord(draftPreviewItemToForm(item), hasAttachments && index === uploadTargetIndex, submit);
        if (result.attachmentUpload) {
          attachmentUpload = result.attachmentUpload;
        }
      }
      return { ...preview, persistedCount: selectedEntries.length, hasAttachments, uploadTargetIndex, submit, attachmentUpload };
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
      setDraftPreview(null);
      setModalOpen(false);
      setPendingAttachments([]);
      form.resetFields();
      queryClient.invalidateQueries({ queryKey: ["work-logs"] });
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      queryClient.invalidateQueries({ queryKey: ["calendar-today"] });
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : "保存日报项失败，请检查后重试。");
    }
  });

  const sendAiMessage = () => {
    const text = aiInput.trim();
    if (!text) return;
    const nextMessages = [...aiMessages, { role: "user" as const, content: text }];
    setLastAiInput(text);
    setAiMessages(nextMessages);
    setAiInput("");
    draftLog.mutate(nextMessages);
  };

  const continueEditingDraftPrompt = () => {
    setAiInput((current) => current || lastAiInput);
  };

  const openCreate = (dateValue = dayjs()) => {
    const dateKey = dateValue.format("YYYY-MM-DD");
    const isFuture = dateKey > dayjs().format("YYYY-MM-DD");
    setEditing(null);
    setEntryDate(dateValue);
    setPendingAttachments([]);
    form.resetFields();
    form.setFieldsValue({
      date: dateValue,
      title: isFuture ? "工作计划" : "工作日报",
      content: "",
      hours: null,
      kind: isFuture ? "PLAN" : "DAILY"
    });
    setAiInput("");
    setLastAiInput("");
    setAiMessages([]);
    setDraftPreview({
      assistantMessage: "今日日报项",
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

  const openEdit = (record: WorkLog) => {
    setEditing(record);
    setPendingAttachments([]);
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
  const entryKindTitle = entryDate.format("YYYY-MM-DD") > dayjs().format("YYYY-MM-DD") ? "填写计划" : "填写日报";

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
      render: (_, record) => (
        <Space>
          <Button icon={<Edit2 size={15} />} onClick={() => openEdit(record)} />
          <Button icon={<Send size={15} />} disabled={record.status === "SUBMITTED"} loading={submitLog.isPending} onClick={() => submitLog.mutate(record.id)}>
            提交
          </Button>
          <Popconfirm title="确认删除这条填报？" onConfirm={() => deleteLog.mutate(record.id)}>
            <Button danger icon={<Trash2 size={15} />} />
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <Typography.Title level={3} className="page-title">
            填报记录
          </Typography.Title>
          <Typography.Text className="page-subtitle">直接开始填写，提交后系统会自动进入分析队列。</Typography.Text>
        </div>
      </div>

      <div className="surface-panel worklog-entry-panel">
        <div className="worklog-entry-copy">
          <div className="section-title">填写今日日报</div>
          <div className="section-subtitle">把今天的多个项目工作整理成独立日报项，项目、工时和附件逐条确认。</div>
        </div>
        <Button type="primary" className="ai-soft-button" icon={<WandSparkles size={16} />} onClick={() => openCreate()}>
          填写今日日报
        </Button>
      </div>

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
        {communicationDrafts.data?.length ? (
          <div className="communication-draft-list">
            {communicationDrafts.data.slice(0, 4).map((draft) => (
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
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无沟通记录候选草稿" />
        )}
      </div>

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
              <span>{workLogDraftDateLabel(entryDate)}，可一次提交多条日报或计划</span>
            </div>
          )
        }
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          setDraftPreview(null);
          setPendingAttachments([]);
          setEditing(null);
        }}
        footer={
          editing
            ? [
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
                  <p className="ant-upload-hint">单个附件最大 8MB，支持直接粘贴微信或聊天截图。</p>
                </Upload.Dragger>
              </div>
            </Form.Item>
          </Form>
        ) : (
          <WorkLogDraftComposer
            aiMessages={aiMessages}
            aiInput={aiInput}
            aiPending={draftLog.isPending}
            aiError={draftLog.error instanceof Error ? draftLog.error : null}
            onAiInputChange={setAiInput}
            onGenerateDraft={sendAiMessage}
            onContinuePrompt={continueEditingDraftPrompt}
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
            onPasteImages={handlePasteImages}
          />
        )}
      </Modal>

      <Modal
        title={detailRecord ? <WorkLogDetailTitle record={detailRecord} readOnly={detailRecord.userId !== user?.id} /> : "填报详情"}
        open={Boolean(detailRecord)}
        onCancel={() => setDetailRecord(null)}
        footer={null}
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
              message="请确认后再写入日报"
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
