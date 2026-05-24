"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, DatePicker, Empty, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Tag, TimePicker, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { Bot, Edit2, Plus, RotateCw, Send, Trash2, WandSparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Project, WorkLog, WorkLogDraft } from "@/lib/types";

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

export default function WorkLogsPage() {
  const queryClient = useQueryClient();
  const [form] = Form.useForm<WorkLogForm>();
  const [editing, setEditing] = useState<WorkLog | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [dateFilter, setDateFilter] = useState<dayjs.Dayjs | null>(null);
  const [statusFilter, setStatusFilter] = useState<"ALL" | "DRAFT" | "SUBMITTED">("ALL");
  const [projectFilter, setProjectFilter] = useState<string | undefined>(undefined);
  const [aiInput, setAiInput] = useState("");
  const [aiMessages, setAiMessages] = useState<AiChatMessage[]>([
    {
      role: "assistant",
      content: "直接告诉我今天完成了什么、花了多久，或明天计划做什么。我会整理成可提交的日报或计划草稿。"
    }
  ]);

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

  const createLog = useMutation({
    mutationFn: (values: WorkLogForm) =>
      apiFetch<WorkLog>("/work-logs", { method: "POST", body: JSON.stringify(toPayload(values)) }),
    onSuccess: () => {
      message.success("已保存填报");
      setModalOpen(false);
      form.resetFields();
      queryClient.invalidateQueries({ queryKey: ["work-logs"] });
    }
  });

  const updateLog = useMutation({
    mutationFn: ({ id, values }: { id: string; values: WorkLogForm }) =>
      apiFetch<WorkLog>(`/work-logs/${id}`, { method: "PATCH", body: JSON.stringify(toPayload(values)) }),
    onSuccess: () => {
      message.success("已更新填报");
      setModalOpen(false);
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["work-logs"] });
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
    mutationFn: (messages: AiChatMessage[]) =>
      apiFetch<WorkLogDraft>("/ai/work-log-draft", {
        method: "POST",
        body: JSON.stringify({
          currentDate: dayjs().format("YYYY-MM-DD"),
          messages
        })
      }),
    onSuccess: (draft) => {
      form.setFieldsValue({
        date: dayjs(draft.date),
        title: draft.title,
        content: draft.content,
        hours: Number(draft.hours),
        startTime: draft.startTime ? dayjs(draft.startTime) : undefined,
        endTime: draft.endTime ? dayjs(draft.endTime) : undefined
      });
      setAiMessages((messages) => [...messages, { role: "assistant", content: draft.assistantMessage }]);
      message.success(draft.kind === "PLAN" ? "已生成计划草稿" : "已生成日报草稿");
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

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ date: dayjs(), hours: 1 });
    setAiInput("");
    setAiMessages([
      {
        role: "assistant",
        content: "直接告诉我今天完成了什么、花了多久，或明天计划做什么。我会整理成可提交的日报或计划草稿。"
      }
    ]);
    setModalOpen(true);
  };

  const openEdit = (record: WorkLog) => {
    setEditing(record);
    form.setFieldsValue({
      date: dayjs(record.date),
      title: record.title,
      content: record.content,
      startTime: record.startTime ? dayjs(record.startTime) : undefined,
      endTime: record.endTime ? dayjs(record.endTime) : undefined,
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
      title: "标题与内容",
      render: (_, record) => (
        <div>
          <div className="font-medium">{record.title}</div>
          {record.project ? <Tag className="mt-2" color="blue">{record.project.code ? `${record.project.code} · ${record.project.name}` : record.project.name}</Tag> : null}
          <div className="mt-1 max-w-3xl text-sm text-muted">{record.content}</div>
          {record.aiAnalysis ? (
            <Space className="mt-2" wrap>
              <Tag color="green">{record.aiAnalysis.category}</Tag>
              {record.aiAnalysis.tags?.map((tag) => <Tag key={tag}>{tag}</Tag>)}
              {record.aiAnalysis.risks?.map((risk) => <Tag color="red" key={risk}>{risk}</Tag>)}
            </Space>
          ) : null}
        </div>
      )
    },
    { title: "工时", dataIndex: "hours", width: 90, render: (value: string | number) => `${Number(value).toFixed(1)}h` },
    {
      title: "状态",
      dataIndex: "status",
      width: 110,
      render: (value: string) => <Tag color={value === "SUBMITTED" ? "green" : "default"}>{value === "SUBMITTED" ? "已提交" : "草稿"}</Tag>
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
            工作填报
          </Typography.Title>
          <Typography.Text className="page-subtitle">每天可填写多条工作记录，提交后自动进入 AI 分析队列。</Typography.Text>
        </div>
        <Button type="primary" icon={<Plus size={16} />} onClick={openCreate}>
          新增填报
        </Button>
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
        locale={{ emptyText: <Empty description="暂无工作填报" /> }}
        pagination={{ pageSize: 8 }}
      />

      <Modal
        title={editing ? "编辑填报" : "新增填报"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createLog.isPending || updateLog.isPending}
        width={880}
      >
        <Form
          form={form}
          layout="vertical"
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
              <Bot size={17} className="text-primary" />
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
            <div className="flex gap-2">
              <Input.TextArea
                value={aiInput}
                autoSize={{ minRows: 2, maxRows: 4 }}
                placeholder="例如：今天完成小程序语音填报，联调日历看板，花了 3 小时。明天计划优化登录页。"
                onChange={(event) => setAiInput(event.target.value)}
                onPressEnter={(event) => {
                  if (!event.shiftKey) {
                    event.preventDefault();
                    sendAiMessage();
                  }
                }}
              />
              <Button type="primary" icon={<WandSparkles size={16} />} loading={draftLog.isPending} onClick={sendAiMessage}>
                生成草稿
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Form.Item name="date" label="日期" rules={[{ required: true }]}>
              <DatePicker className="w-full" />
            </Form.Item>
            <Form.Item name="hours" label="工时" rules={[{ required: true }]}>
              <InputNumber className="w-full" min={0} max={24} step={0.5} />
            </Form.Item>
            <Form.Item name="projectId" label="关联项目">
              <Select allowClear placeholder="选择项目" loading={projects.isFetching} options={projectOptions} />
            </Form.Item>
            <Form.Item name="startTime" label="开始时间">
              <TimePicker className="w-full" format="HH:mm" />
            </Form.Item>
            <Form.Item name="endTime" label="结束时间">
              <TimePicker className="w-full" format="HH:mm" />
            </Form.Item>
          </div>
          <Form.Item name="title" label="标题" rules={[{ required: true, min: 2 }]}>
            <Input />
          </Form.Item>
          <Form.Item name="content" label="工作内容" rules={[{ required: true, min: 2 }]}>
            <Input.TextArea rows={6} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
