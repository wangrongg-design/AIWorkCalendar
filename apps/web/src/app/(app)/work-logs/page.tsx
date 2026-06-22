"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Checkbox, DatePicker, Empty, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Tag, TimePicker, Typography, Upload, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { RcFile, UploadFile } from "antd/es/upload/interface";
import dayjs from "dayjs";
import { Download, Edit2, MessageSquare, Paperclip, RotateCw, Send, Trash2, UploadCloud, WandSparkles } from "lucide-react";
import type { ClipboardEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { WorkLogDetailTitle, WorkLogDetailView } from "@/components/WorkLogDetailView";
import { apiDownload, apiFetch } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { CommunicationInsight, Project, WorkLog, WorkLogAttachment, WorkLogDraft, WorkLogDraftItem } from "@/lib/types";
import { applyWorkLogTimingAutoFill, parseWorkLogTime } from "@/lib/work-log-time";

type WorkLogForm = {
  date: dayjs.Dayjs;
  title: string;
  content: string;
  startTime?: dayjs.Dayjs;
  endTime?: dayjs.Dayjs;
  hours?: number | null;
  projectId?: string;
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

export default function WorkLogsPage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const [form] = Form.useForm<WorkLogForm>();
  const [communicationDraftForm] = Form.useForm<CommunicationDraftForm>();
  const [editing, setEditing] = useState<WorkLog | null>(null);
  const [detailRecord, setDetailRecord] = useState<WorkLog | null>(null);
  const [communicationDraft, setCommunicationDraft] = useState<CommunicationInsight | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [dateFilter, setDateFilter] = useState<dayjs.Dayjs | null>(null);
  const [statusFilter, setStatusFilter] = useState<"ALL" | "DRAFT" | "SUBMITTED">("ALL");
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
      const projectMatched = projectFilter ? item.projectId === projectFilter : true;
      return dateMatched && statusMatched && projectMatched;
    });
  }, [dateFilter, logs.data, projectFilter, statusFilter]);

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

  const createAndSubmitLog = async (values: WorkLogForm, withAttachments: boolean) => {
    const workLog = await apiFetch<WorkLog>("/work-logs", { method: "POST", body: JSON.stringify(toPayload(values)) });
    if (withAttachments) {
      await uploadPendingAttachments(workLog.id);
    }
    return apiFetch<WorkLog>(`/work-logs/${workLog.id}/submit`, { method: "POST" });
  };

  const createLog = useMutation({
    mutationFn: (values: WorkLogForm) => createAndSubmitLog(values, true),
    onSuccess: () => {
      message.success("已提交，将自动分析。");
      setModalOpen(false);
      setPendingAttachments([]);
      form.resetFields();
      queryClient.invalidateQueries({ queryKey: ["work-logs"] });
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      queryClient.invalidateQueries({ queryKey: ["calendar-today"] });
    },
    onError: (error) => {
      message.error((error as Error).message || "填报失败，请检查内容后重试。");
    }
  });

  const updateLog = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: WorkLogForm }) => {
      const workLog = await apiFetch<WorkLog>(`/work-logs/${id}`, { method: "PATCH", body: JSON.stringify(toPayload(values)) });
      await uploadPendingAttachments(id);
      return workLog;
    },
    onSuccess: () => {
      message.success("已更新填报");
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
          items: items.map((item) => ({ ...item, projectId: form.getFieldValue("projectId"), selected: true })),
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
        if (preview?.items.length === 1) {
          form.setFieldsValue(draftPreviewItemToForm(preview.items[0]));
        }
        message.success("已生成草稿，请确认后提交。");
      }
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : "草稿生成失败，请调整描述后重试。");
    }
  });

  const confirmDraftLog = useMutation({
    mutationFn: async (preview: DraftPreview) => {
      const selectedEntries = preview.items.map((item, index) => ({ item, index })).filter((entry) => entry.item.selected);
      if (!selectedEntries.length) {
        throw new Error("请至少确认一条草稿。");
      }
      const hasAttachments = pendingAttachments.length > 0;
      const requestedTargetIndex = Number.isInteger(preview.attachmentTargetIndex) ? preview.attachmentTargetIndex : selectedEntries[0].index;
      const uploadTargetIndex = selectedEntries.some((entry) => entry.index === requestedTargetIndex) ? requestedTargetIndex : selectedEntries[0].index;
      for (const { item, index } of selectedEntries) {
        await createAndSubmitLog(draftPreviewItemToForm(item), hasAttachments && index === uploadTargetIndex);
      }
      return { ...preview, submittedCount: selectedEntries.length, hasAttachments, uploadTargetIndex };
    },
    onSuccess: (preview) => {
      message.success(preview.submittedCount > 1 ? `已提交 ${preview.submittedCount} 条填报。` : "已提交填报。");
      if (preview.hasAttachments && preview.submittedCount > 1) {
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
      message.error(error instanceof Error ? error.message : "提交草稿失败，请检查后重试。");
    }
  });

  const sendAiMessage = () => {
    const text = aiInput.trim();
    if (!text) return;
    const nextMessages = [...aiMessages, { role: "user" as const, content: text }];
    setLastAiInput(text);
    setAiMessages(nextMessages);
    setAiInput("");
    setDraftPreview(null);
    draftLog.mutate(nextMessages);
  };

  const continueEditingDraftPrompt = () => {
    setAiInput((current) => current || lastAiInput);
    setDraftPreview(null);
  };

  const openCreate = (dateValue = dayjs()) => {
    const dateKey = dateValue.format("YYYY-MM-DD");
    const isFuture = dateKey > dayjs().format("YYYY-MM-DD");
    setEditing(null);
    setPendingAttachments([]);
    form.resetFields();
    form.setFieldsValue({
      date: dateValue,
      title: isFuture ? "工作计划" : "工作日报",
      content: "",
      hours: null
    });
    setAiInput("");
    setLastAiInput("");
    setAiMessages([
      {
        role: "assistant",
        content: "直接告诉我今天完成了什么、花了多久，或明天计划做什么；一句话里有多条日程也可以，我会先识别整理，等待完成后再写入填报。"
      }
    ]);
    setDraftPreview(null);
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
      projectId: record.projectId ?? undefined
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

  const columns: ColumnsType<WorkLog> = [
    { title: "日期", dataIndex: "date", width: 110, render: (value: string) => dayjs(value).format("YYYY-MM-DD") },
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
          <div className="section-title">写日报/计划</div>
          <div className="section-subtitle">直接写一句话，系统会识别日期、工时和工作内容，多条日程也可以一次填报。</div>
        </div>
        <Button type="primary" className="ai-soft-button" icon={<WandSparkles size={16} />} onClick={() => openCreate()}>
          写日报/计划
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
        title={editing ? "编辑填报" : "新增填报"}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          setDraftPreview(null);
          setPendingAttachments([]);
        }}
        onOk={() => form.submit()}
        okText={editing ? "保存修改" : "提交表单"}
        cancelText="取消"
        confirmLoading={createLog.isPending || updateLog.isPending || draftLog.isPending || confirmDraftLog.isPending}
        width={880}
      >
        <Form
          form={form}
          layout="vertical"
          onValuesChange={(changed, values) => applyWorkLogTimingAutoFill(changed, values, form.setFieldsValue)}
          onFinish={(values) => {
            if (editing) {
              updateLog.mutate({ id: editing.id, values });
            } else {
              createLog.mutate(values);
            }
          }}
        >
          <div className="mb-5 rounded-[18px] bg-surface-container-low p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-ink">
              <WandSparkles size={17} className="text-secondary" />
              智能草稿
            </div>
            <div className="mb-3 max-h-48 space-y-2 overflow-auto">
              {aiMessages.map((item, index) => (
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
            {draftLog.error ? <Alert className="mb-3" type="error" showIcon message={(draftLog.error as Error).message} /> : null}
            {draftLog.isPending ? (
              <div className="quickfill-draft-waiting" role="status" aria-live="polite">
                <span className="quickfill-draft-spinner" />
                <div>
                  <strong>{editing ? "正在整理到表单" : "正在生成草稿"}</strong>
                  <p>正在调用模型识别日期、工时和工作内容，正式环境可能需要 5-20 秒，请稍候。</p>
                </div>
              </div>
            ) : null}
            <div className="flex gap-2">
              <Input.TextArea
                value={aiInput}
                autoSize={{ minRows: 2, maxRows: 4 }}
                placeholder="例如：今天完成小程序语音填报，联调日历看板，花了 3 小时。明天计划优化登录页。"
                disabled={draftLog.isPending}
                onPaste={handlePasteImages}
                onChange={(event) => setAiInput(event.target.value)}
                onPressEnter={(event) => {
                  if (!event.shiftKey) {
                    event.preventDefault();
                    sendAiMessage();
                  }
                }}
              />
              <Button className="ai-soft-button" icon={<WandSparkles size={16} />} loading={draftLog.isPending} disabled={draftLog.isPending} onClick={sendAiMessage}>
                {editing ? "整理到表单" : "生成草稿"}
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
                            showSearch
                            optionFilterProp="label"
                            value={item.projectId}
                            placeholder="未关联"
                            loading={projects.isFetching}
                            listHeight={280}
                            dropdownStyle={{ zIndex: 1800 }}
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
                  <Button onClick={continueEditingDraftPrompt}>继续修改描述</Button>
                  <Button
                    type="primary"
                    loading={confirmDraftLog.isPending}
                    disabled={!draftPreview.items.some((item) => item.selected)}
                    onClick={() => confirmDraftLog.mutate(draftPreview)}
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
              <Select allowClear showSearch optionFilterProp="label" placeholder="选择项目" loading={projects.isFetching} listHeight={280} dropdownStyle={{ zIndex: 1800 }} options={projectOptions} />
            </Form.Item>
          </div>
          <Form.Item name="content" label="工作内容" rules={[{ required: true, min: 2 }]}>
            <Input.TextArea rows={6} onPaste={handlePasteImages} />
          </Form.Item>
          <Form.Item label="附件">
            {editing?.attachments?.length ? (
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
