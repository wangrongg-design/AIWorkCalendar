"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, DatePicker, Drawer, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, TimePicker, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { Dayjs } from "dayjs";
import { AlertTriangle, Bot, CalendarPlus, CheckCircle2, MessageCircle, Send, Sparkles, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { CalendarDay, CalendarDayDetail, CalendarResponse, Department, Project, WorkLog } from "@/lib/types";

type OrgResponse = {
  departments: Department[];
};

type QuickFillForm = {
  title: string;
  content: string;
  hours: number;
  projectId?: string;
  startTime?: Dayjs;
  endTime?: Dayjs;
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

const quickQuestions = ["总结本月团队重点", "今天有哪些风险？", "未来计划怎么安排？"];

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

function monthSummary(days: CalendarDay[]) {
  const filled = days.reduce((sum, day) => sum + day.filledCount, 0);
  const missing = days.reduce((sum, day) => sum + day.missingCount, 0);
  const risks = days.reduce((sum, day) => sum + day.riskCount, 0);
  const denominator = filled + missing;
  return {
    filled,
    missing,
    risks,
    rate: denominator ? Number(((filled / denominator) * 100).toFixed(1)) : 0
  };
}

function dateKind(date: string) {
  const today = dayjs().format("YYYY-MM-DD");
  if (date === today) return "today";
  return date > today ? "future" : "past";
}

function toQuickFillPayload(date: string, values: QuickFillForm) {
  const baseDate = dayjs(date);
  return {
    date,
    title: values.title,
    content: values.content,
    hours: values.hours,
    startTime: values.startTime
      ? baseDate.hour(values.startTime.hour()).minute(values.startTime.minute()).second(0).millisecond(0).toISOString()
      : undefined,
    endTime: values.endTime
      ? baseDate.hour(values.endTime.hour()).minute(values.endTime.minute()).second(0).millisecond(0).toISOString()
      : undefined,
    projectId: values.projectId || undefined
  };
}

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const [quickForm] = Form.useForm<QuickFillForm>();
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
  const [quickFillOpen, setQuickFillOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "可以直接问我：本月团队重点、今天风险、未来计划、某个部门工时投入。回答只基于你当前权限可见的日报和计划。"
    }
  ]);

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

  const quickFill = useMutation({
    mutationFn: async (values: QuickFillForm) => {
      if (!selectedDate) {
        throw new Error("No selected date");
      }
      const created = await apiFetch<WorkLog>("/work-logs", {
        method: "POST",
        body: JSON.stringify(toQuickFillPayload(selectedDate, values))
      });
      return apiFetch<WorkLog>(`/work-logs/${created.id}/submit`, { method: "POST" });
    },
    onSuccess: () => {
      message.success(selectedDate && dateKind(selectedDate) === "future" ? "计划已保存" : "日报已提交");
      setQuickFillOpen(false);
      quickForm.resetFields();
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      queryClient.invalidateQueries({ queryKey: ["calendar-day"] });
      queryClient.invalidateQueries({ queryKey: ["work-logs"] });
    }
  });

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
      message.error(error instanceof Error ? error.message : "AI 问答失败");
    }
  });

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

  const openQuickFill = (date: string) => {
    const kind = dateKind(date);
    quickForm.resetFields();
    quickForm.setFieldsValue({
      title: kind === "future" ? "工作计划" : kind === "today" ? "今日工作" : "工作日报",
      content: "",
      hours: kind === "future" ? 0 : 1
    });
    setSelectedDate(date);
    setQuickFillOpen(true);
  };

  const goToday = () => {
    const today = dayjs();
    setMonth(today);
    setSelectedDate(today.format("YYYY-MM-DD"));
  };

  const filledColumns: ColumnsType<CalendarDayDetail["filledEmployees"][number]> = [
    { title: "员工", dataIndex: "name", width: 120 },
    { title: "部门", dataIndex: "departmentName", width: 120 },
    {
      title: "当天填报",
      render: (_, record) => (
        <Space direction="vertical" size={8} className="w-full">
          {record.logs.map((log) => (
            <div key={log.id} className="border-b border-line pb-2 last:border-b-0">
              <div className="font-medium">{log.title}</div>
              {log.project ? <Tag color="blue">{log.project.code ? `${log.project.code} · ${log.project.name}` : log.project.name}</Tag> : null}
              <div className="mt-1 text-sm text-muted">{log.content}</div>
              <Space className="mt-2" wrap>
                <Tag>{Number(log.hours).toFixed(1)} 小时</Tag>
                {log.aiAnalysis?.achievements?.map((item) => <Tag color="green" key={item}>{item}</Tag>)}
                {log.aiAnalysis?.risks?.map((item) => <Tag color="red" key={item}>{item}</Tag>)}
              </Space>
            </div>
          ))}
        </Space>
      )
    }
  ];

  return (
    <div className="page-stack dashboard-calendar-page">
      <div className="page-header dashboard-calendar-header">
        <div>
          <Typography.Title level={3} className="page-title">
            日历看板
          </Typography.Title>
          <Typography.Text className="page-subtitle">按月查看每日填报人数、缺失人数、填报率和风险数量。</Typography.Text>
        </div>
        <Space wrap className="toolbar-panel dashboard-calendar-toolbar">
          <DatePicker picker="month" value={month} onChange={(value) => value && setMonth(value)} allowClear={false} />
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
          <Button onClick={() => calendar.refetch()} loading={calendar.isFetching}>
            刷新
          </Button>
          <Button type="primary" icon={<MessageCircle size={16} />} onClick={() => setChatOpen(true)}>
            AI 对话
          </Button>
        </Space>
      </div>

      <div className="calendar-summary-strip">
        <div className="calendar-summary-item">
          <span className="calendar-summary-label">本月填报率</span>
          <span className="calendar-summary-value">{summary.rate}%</span>
        </div>
        <div className="calendar-summary-item">
          <span className="calendar-summary-label">累计已填报</span>
          <span className="calendar-summary-value">{summary.filled}</span>
        </div>
        <div className="calendar-summary-item">
          <span className="calendar-summary-label">累计未填报</span>
          <span className="calendar-summary-value">{summary.missing}</span>
        </div>
        <div className="calendar-summary-item">
          <span className="calendar-summary-label">风险数量</span>
          <span className="calendar-summary-value text-danger">{summary.risks}</span>
        </div>
      </div>

      <div className="surface-panel dashboard-calendar-grid grid grid-cols-7 overflow-hidden">
        {weekLabels.map((label) => (
          <div key={label} className="dashboard-week-label border-b border-line bg-surface-container px-3 py-3 text-center text-sm font-medium text-muted">
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
                {day?.riskCount ? <Tag className="calendar-risk-tag" color="red">风险 {day.riskCount}</Tag> : null}
              </div>
              <div className="calendar-cell-body mt-4 grid grid-cols-2 gap-2 text-xs">
                <div className="calendar-count flex items-center gap-1 text-ink">
                  <CheckCircle2 size={14} /> {isFuture ? "已计划" : "已填"} {day?.filledCount ?? 0}
                </div>
                <div className="calendar-count muted flex items-center gap-1 text-muted">
                  <UsersRound size={14} /> {isFuture ? "未计划" : "未填"} {day?.missingCount ?? 0}
                </div>
                <div className="calendar-rate-track col-span-2">
                  <div className="calendar-rate-fill" style={{ width: `${day?.fillRate ?? 0}%` }} />
                </div>
                <div className="calendar-rate-label col-span-2 text-muted">{isFuture ? "计划率" : "填报率"} {day?.fillRate ?? 0}%</div>
              </div>
            </button>
          );
        })}
      </div>

      <Drawer
        title={
          <Space>
            <Bot size={18} />
            <span>AI 日历问答</span>
          </Space>
        }
        extra={<Tag color="blue">{selectedDate ?? month.format("YYYY-MM")}</Tag>}
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        width={460}
        styles={{ body: { padding: 0 } }}
      >
        <div className="flex h-full flex-col">
          <div className="border-b border-line bg-surface-container-low px-4 py-3">
            <div className="mb-3 text-sm text-muted">
              当前上下文：{selectedDate ? `${selectedDate} 单日` : `${month.format("YYYY-MM")} 整月`} · {scope === "self" ? "只看自己" : scope === "department" ? "本部门" : "全公司"}
            </div>
            <Space wrap>
              {quickQuestions.map((item) => (
                <Button key={item} size="small" onClick={() => submitCalendarChat(item)} disabled={calendarChat.isPending}>
                  {item}
                </Button>
              ))}
            </Space>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {chatMessages.map((item) => (
              <div key={item.id} className={`flex ${item.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[88%] rounded-[18px] px-4 py-3 text-sm leading-6 shadow-sm ${item.role === "user" ? "bg-primary text-white" : "bg-surface-container text-ink"}`}>
                  <div className={`mb-1 flex items-center gap-2 text-xs font-medium ${item.role === "user" ? "text-white/80" : "text-muted"}`}>
                    {item.role === "assistant" ? <Bot size={14} /> : <MessageCircle size={14} />}
                    {item.role === "assistant" ? "AI 助手" : user?.name ?? "我"}
                    {typeof item.contextCount === "number" ? <span>· 参考 {item.contextCount} 条记录</span> : null}
                  </div>
                  <div className="whitespace-pre-wrap">{item.content}</div>
                </div>
              </div>
            ))}
            {calendarChat.isPending ? (
              <div className="flex justify-start">
                <div className="rounded-[18px] bg-surface-container px-4 py-3 text-sm text-muted shadow-sm">正在基于可见日报和计划生成回答...</div>
              </div>
            ) : null}
          </div>

          <div className="border-t border-line bg-white p-4">
            <Input.TextArea
              value={chatInput}
              rows={3}
              placeholder="输入问题，例如：本周有哪些风险？未来计划中有什么延期风险？"
              onChange={(event) => setChatInput(event.target.value)}
              onPressEnter={(event) => {
                if (!event.shiftKey) {
                  event.preventDefault();
                  submitCalendarChat();
                }
              }}
            />
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-muted">Enter 发送，Shift + Enter 换行</span>
              <Button type="primary" icon={<Send size={16} />} loading={calendarChat.isPending} onClick={() => submitCalendarChat()}>
                发送
              </Button>
            </div>
          </div>
        </div>
      </Drawer>

      <Modal
        title={selectedDate ? `${selectedDate} ${dateKind(selectedDate) === "future" ? "计划详情" : "填报详情"}` : "填报详情"}
        open={Boolean(selectedDate)}
        onCancel={() => setSelectedDate(null)}
        footer={null}
        width={980}
      >
        {selectedDate ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[18px] bg-surface-container px-4 py-3">
            <div className="flex items-center gap-3">
              <Typography.Text className="text-muted">
                {dateKind(selectedDate) === "future" ? "为未来日期预先填写计划。" : "为已发生日期补充或提交日报。"}
              </Typography.Text>
            </div>
            <Space>
              <Button icon={<MessageCircle size={16} />} onClick={() => setChatOpen(true)}>
                问 AI
              </Button>
              <Button type="primary" icon={<CalendarPlus size={16} />} onClick={() => openQuickFill(selectedDate)}>
                {dateKind(selectedDate) === "future" ? "填写计划" : "填写日报"}
              </Button>
            </Space>
          </div>
        ) : null}
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="metric-card">
            <div className="metric-label">{selectedDate && dateKind(selectedDate) === "future" ? "已计划" : "已填报"}</div>
            <div className="metric-value">{dayDetail.data?.stats.filledCount ?? 0}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">{selectedDate && dateKind(selectedDate) === "future" ? "未计划" : "未填报"}</div>
            <div className="metric-value">{dayDetail.data?.stats.missingCount ?? 0}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">工时合计</div>
            <div className="metric-value">{dayDetail.data?.stats.totalHours ?? 0}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">风险数量</div>
            <div className="metric-value flex items-center gap-2 text-danger">
              <AlertTriangle size={20} /> {dayDetail.data?.stats.riskCount ?? 0}
            </div>
          </div>
        </div>
        <Typography.Title level={5}>{selectedDate && dateKind(selectedDate) === "future" ? "已填写计划" : "已填报员工"}</Typography.Title>
        <Table
          rowKey="id"
          size="small"
          loading={dayDetail.isFetching}
          dataSource={dayDetail.data?.filledEmployees ?? []}
          columns={filledColumns}
          pagination={false}
        />
        <Typography.Title level={5} className="!mt-5">
          {selectedDate && dateKind(selectedDate) === "future" ? "未填写计划" : "未填报员工"}
        </Typography.Title>
        <Space wrap>
          {(dayDetail.data?.missingEmployees ?? []).map((item) => (
            <Tag key={item.id}>{item.name} · {item.departmentName ?? "未分配部门"}</Tag>
          ))}
        </Space>
      </Modal>

      <Modal
        title={selectedDate && dateKind(selectedDate) === "future" ? "填写未来计划" : "填写工作日报"}
        open={quickFillOpen}
        onCancel={() => setQuickFillOpen(false)}
        onOk={() => quickForm.submit()}
        confirmLoading={quickFill.isPending}
        width={680}
      >
        <div className="mb-4 flex items-center gap-2 rounded-[16px] bg-primary-container px-4 py-3 text-on-primary-container">
          <Sparkles size={18} />
          <span className="text-sm font-medium">
            {selectedDate} · {selectedDate && dateKind(selectedDate) === "future" ? "计划会显示在对应未来日期" : "日报会立即进入日历统计"}
          </span>
        </div>
        <Form form={quickForm} layout="vertical" onFinish={(values) => quickFill.mutate(values)}>
          <Form.Item name="title" label={selectedDate && dateKind(selectedDate) === "future" ? "计划标题" : "日报标题"} rules={[{ required: true, min: 2 }]}>
            <Input />
          </Form.Item>
          <Form.Item name="content" label={selectedDate && dateKind(selectedDate) === "future" ? "计划内容" : "工作内容"} rules={[{ required: true, min: 2 }]}>
            <Input.TextArea rows={5} placeholder={selectedDate && dateKind(selectedDate) === "future" ? "写下计划完成的事项、预期产出或潜在风险。" : "写下已经完成的事项、进展、风险或阻塞。"} />
          </Form.Item>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <Form.Item name="hours" label="预计/实际工时" rules={[{ required: true }]}>
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
        </Form>
      </Modal>
    </div>
  );
}
