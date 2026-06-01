"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, DatePicker, Empty, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Tag, TimePicker, Typography, Upload, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { RcFile, UploadFile } from "antd/es/upload/interface";
import dayjs from "dayjs";
import { Bot, Download, Edit2, Paperclip, RotateCw, Send, Trash2, UploadCloud, WandSparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { WorkLogAttachmentViewer } from "@/components/WorkLogAttachmentViewer";
import { apiDownload, apiFetch } from "@/lib/api";
import { Project, WorkLog, WorkLogAttachment, WorkLogDraft, WorkLogDraftItem } from "@/lib/types";
import { applyWorkLogTimingAutoFill, parseWorkLogTime } from "@/lib/work-log-time";

type WorkLogForm = {
  date: dayjs.Dayjs;
  title: string;
  content: string;
  startTime?: dayjs.Dayjs;
  endTime?: dayjs.Dayjs;
  hours: number;
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

const ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024;

function formatFileSize(value: number) {
  if (value >= 1024 * 1024) {
    return `${(value / 1024 / 1024).toFixed(1)}MB`;
  }
  return `${Math.max(1, Math.round(value / 1024))}KB`;
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
    hours: values.hours,
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
    hours: Number.isFinite(hours) ? hours : 1,
    startTime: parseWorkLogTime(item.startTime, safeDate),
    endTime: parseWorkLogTime(item.endTime, safeDate)
  };
}

export default function WorkLogsPage() {
  const queryClient = useQueryClient();
  const [form] = Form.useForm<WorkLogForm>();
  const [editing, setEditing] = useState<WorkLog | null>(null);
  const [detailRecord, setDetailRecord] = useState<WorkLog | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [dateFilter, setDateFilter] = useState<dayjs.Dayjs | null>(null);
  const [statusFilter, setStatusFilter] = useState<"ALL" | "DRAFT" | "SUBMITTED">("ALL");
  const [projectFilter, setProjectFilter] = useState<string | undefined>(undefined);
  const initialOpenHandled = useRef(false);
  const [aiInput, setAiInput] = useState("");
  const [aiMessages, setAiMessages] = useState<AiChatMessage[]>([
    {
      role: "assistant",
      content: "直接告诉我今天完成了什么、花了多久，或明天计划做什么；一句话里有多条日程也可以，我会先识别整理，等待完成后再写入填报。"
    }
  ]);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);

  const logs = useQuery({
    queryKey: ["work-logs"],
    queryFn: () => apiFetch<WorkLog[]>("/work-logs")
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

  const addPendingAttachment = (file: RcFile) => {
    if (file.size > ATTACHMENT_MAX_BYTES) {
      message.error("单个附件不能超过 8MB，请压缩后重新上传。");
      return Upload.LIST_IGNORE;
    }
    setPendingAttachments((items) => [...items, { uid: file.uid, file }]);
    return false;
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
      message.success("已填报，AI 将自动分析。");
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
      message.success("已提交，AI 将异步分析");
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
        return { draft, count: 0, attachedToFirst: false, filledForm: true };
      }
      const items = normalizedDraftItems(draft);
      const attachedToFirst = pendingAttachments.length > 0 && items.length > 1;
      for (const [index, item] of items.entries()) {
        await createAndSubmitLog(draftItemToForm(item), index === 0);
      }
      return { draft, count: items.length, attachedToFirst, filledForm: false };
    },
    onSuccess: ({ draft, count, attachedToFirst, filledForm }) => {
      if (filledForm) {
        const first = normalizedDraftItems(draft)[0];
        form.setFieldsValue(draftItemToForm(first));
      }
      setAiMessages((messages) => [...messages, { role: "assistant", content: draft.assistantMessage }]);
      if (filledForm) {
        message.success("已整理到表单，请确认后保存修改。");
      } else {
        message.success(count > 1 ? `已填报 ${count} 条，AI 将自动分析。` : "已填报，AI 将自动分析。");
        if (attachedToFirst) {
          message.info("检测到多条日程，附件已关联到第一条填报。");
        }
        setModalOpen(false);
        setPendingAttachments([]);
        form.resetFields();
        queryClient.invalidateQueries({ queryKey: ["work-logs"] });
        queryClient.invalidateQueries({ queryKey: ["calendar"] });
        queryClient.invalidateQueries({ queryKey: ["calendar-today"] });
      }
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : "AI 填报失败，请调整描述后重试。");
    }
  });

  const sendAiMessage = () => {
    const text = aiInput.trim();
    if (!text) return;
    const nextMessages = [...aiMessages, { role: "user" as const, content: text }];
    setAiMessages(nextMessages);
    setAiInput("");
    draftLog.mutate(nextMessages);
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
      hours: isFuture ? 0 : 1
    });
    setAiInput("");
    setAiMessages([
      {
        role: "assistant",
        content: "直接告诉我今天完成了什么、花了多久，或明天计划做什么；一句话里有多条日程也可以，我会先识别整理，等待完成后再写入填报。"
      }
    ]);
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
    setAiMessages([
      {
        role: "assistant",
        content: "可以继续用自然语言修改这条填报，例如“把日期改成明天，工时改成 2 小时，内容补充联调风险”。"
      }
    ]);
    setModalOpen(true);
  };

  const columns: ColumnsType<WorkLog> = [
    { title: "日期", dataIndex: "date", width: 110, render: (value: string) => dayjs(value).format("YYYY-MM-DD") },
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
      title: "风险",
      width: 100,
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
          <Typography.Text className="page-subtitle">每天可填写多条工作记录，提交后自动进入分析队列。</Typography.Text>
        </div>
      </div>

      <div className="toolbar-panel flex flex-wrap items-center justify-between gap-3">
        <Space wrap>
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
        </Space>
        <Button icon={<RotateCw size={16} />} onClick={() => logs.refetch()} loading={logs.isFetching}>
          刷新
        </Button>
      </div>

      <Table
        rowKey="id"
        loading={logs.isFetching}
        dataSource={filteredLogs}
        columns={columns}
        locale={{ emptyText: <Empty description="暂无填报记录" /> }}
        pagination={{ pageSize: 8 }}
      />

      <Modal
        title={editing ? "编辑填报" : "新增填报"}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          setPendingAttachments([]);
        }}
        onOk={() => form.submit()}
        okText={editing ? "保存修改" : "填报"}
        cancelText="取消"
        confirmLoading={createLog.isPending || updateLog.isPending || draftLog.isPending}
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
          <div className="mb-5 rounded-[18px] border border-line bg-surface-container-low p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-ink">
              <Bot size={17} className="text-secondary" />
              AI 对话填报
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
                  <strong>{editing ? "正在整理到表单" : "正在生成并提交填报"}</strong>
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
                onChange={(event) => setAiInput(event.target.value)}
                onPressEnter={(event) => {
                  if (!event.shiftKey) {
                    event.preventDefault();
                    sendAiMessage();
                  }
                }}
              />
              <Button className="ai-soft-button" icon={<WandSparkles size={16} />} loading={draftLog.isPending} disabled={draftLog.isPending} onClick={sendAiMessage}>
                {editing ? "整理到表单" : "生成并提交"}
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <Form.Item name="date" label="日期" rules={[{ required: true }]}>
              <DatePicker className="w-full" />
            </Form.Item>
            <Form.Item name="hours" label="工时" rules={[{ required: true }]}>
              <InputNumber className="w-full" min={0} max={24} step={0.5} />
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
              <Select allowClear placeholder="选择项目" loading={projects.isFetching} options={projectOptions} />
            </Form.Item>
          </div>
          <Form.Item name="content" label="工作内容" rules={[{ required: true, min: 2 }]}>
            <Input.TextArea rows={6} />
          </Form.Item>
          <Form.Item label="附件">
            {editing?.attachments?.length ? (
              <div className="mb-3 space-y-2">
                {editing.attachments.map((attachment) => (
                  <div key={attachment.id} className="flex items-center justify-between gap-3 rounded-[12px] border border-line px-3 py-2">
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
              <p className="ant-upload-hint">单个附件最大 8MB，提交后 AI 会结合附件摘要和图片内容分析。</p>
            </Upload.Dragger>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={detailRecord ? `${dayjs(detailRecord.date).format("YYYY-MM-DD")} · ${detailRecord.title}` : "填报详情"}
        open={Boolean(detailRecord)}
        onCancel={() => setDetailRecord(null)}
        footer={null}
        width={860}
      >
        {detailRecord ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="metric-card">
                <div className="metric-label">人员</div>
                <div className="mt-2 text-sm font-medium text-ink">{detailRecord.user?.name ?? "-"}</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">项目</div>
                <div className="mt-2 text-sm font-medium text-ink">{detailRecord.project?.name ?? "未关联"}</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">工时</div>
                <div className="metric-value">{Number(detailRecord.hours).toFixed(1)}h</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">状态</div>
                <Tag className="mt-2" color={detailRecord.status === "SUBMITTED" ? "green" : "default"}>
                  {detailRecord.status === "SUBMITTED" ? "已提交" : "草稿"}
                </Tag>
              </div>
            </div>
            <div className="rounded-[8px] border border-line p-4">
              <div className="mb-2 text-sm font-medium text-ink">工作内容 / 计划</div>
              <div className="whitespace-pre-wrap text-sm leading-6 text-muted">{detailRecord.content}</div>
            </div>
            {detailRecord.attachments?.length ? (
              <div className="rounded-[8px] border border-line p-4">
                <div className="mb-2 text-sm font-medium text-ink">附件</div>
                <WorkLogAttachmentViewer workLogId={detailRecord.id} attachments={detailRecord.attachments} />
              </div>
            ) : null}
            {detailRecord.aiAnalysis ? (
              <div className="rounded-[8px] border border-line p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-ink">
                  <Bot size={16} />
                  分析结果
                </div>
                <div className="mb-4 rounded-[12px] bg-surface-container-low p-3 text-sm leading-6 text-muted">{detailRecord.aiAnalysis.summary}</div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <div className="mb-2 text-xs font-semibold text-muted">成果</div>
                    <Space wrap>{detailRecord.aiAnalysis.achievements?.length ? detailRecord.aiAnalysis.achievements.map((item) => <Tag color="green" key={item}>{item}</Tag>) : <Tag>暂无</Tag>}</Space>
                  </div>
                  <div>
                    <div className="mb-2 text-xs font-semibold text-muted">风险</div>
                    <Space wrap>{detailRecord.aiAnalysis.risks?.length ? detailRecord.aiAnalysis.risks.map((item) => <Tag color="red" key={item}>{item}</Tag>) : <Tag>暂无</Tag>}</Space>
                  </div>
                  <div>
                    <div className="mb-2 text-xs font-semibold text-muted">阻塞</div>
                    <Space wrap>{detailRecord.aiAnalysis.blockers?.length ? detailRecord.aiAnalysis.blockers.map((item) => <Tag color="orange" key={item}>{item}</Tag>) : <Tag>暂无</Tag>}</Space>
                  </div>
                </div>
                <Space className="mt-4" wrap>
                  <Tag color="blue">{detailRecord.aiAnalysis.category}</Tag>
                  {detailRecord.aiAnalysis.tags?.map((tag) => <Tag key={tag}>{tag}</Tag>)}
                </Space>
              </div>
            ) : detailRecord.status === "SUBMITTED" ? (
              <div className="rounded-[8px] border border-line p-4">
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
