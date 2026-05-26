"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, DatePicker, Drawer, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, TimePicker, Typography, Upload, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { RcFile, UploadFile } from "antd/es/upload/interface";
import dayjs, { Dayjs } from "dayjs";
import { Bot, CalendarPlus, CheckCircle2, Paperclip, Send, Sparkles, UploadCloud, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";
import { WorkLogAttachmentViewer } from "@/components/WorkLogAttachmentViewer";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { CalendarDay, CalendarDayDetail, CalendarResponse, Department, Project, WorkLog, WorkLogAttachment } from "@/lib/types";
import { applyWorkLogTimingAutoFill } from "@/lib/work-log-time";

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

type PendingAttachment = {
  uid: string;
  file: File;
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

const quickQuestions = ["本周风险", "项目进度", "人员负载", "异常工时"];
const copilotActions = [
  { label: "提醒未填报员工", prompt: "帮我整理今天未填报员工，并给出提醒话术。" },
  { label: "生成本周总结", prompt: "基于当前可见日报和计划，生成本周管理总结。" },
  { label: "查看风险项目", prompt: "列出当前范围内存在风险或阻塞的项目，并说明原因。" }
];
const ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024;

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

function chineseDateLabel(date: string) {
  const value = dayjs(date);
  return `${value.format("YYYY年M月D日")} · ${weekdayLabels[value.day()]}`;
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
  const [selectedWorkLog, setSelectedWorkLog] = useState<WorkLog | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "可以直接问我：本月团队重点、今天风险、未来计划、某个部门工时投入。回答只基于你当前权限可见的日报和计划。"
    }
  ]);
  const [quickAttachments, setQuickAttachments] = useState<PendingAttachment[]>([]);

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
  const detailStats = dayDetail.data?.stats;
  const selectedDateKind = selectedDate ? dateKind(selectedDate) : "today";
  const detailTitle = selectedDateKind === "future" ? "团队计划情况" : "今日团队填报情况";
  const aiObservations = useMemo(() => {
    if (!selectedDate) return [];
    if (dayDetail.isFetching) return ["AI 正在分析团队日报…"];
    const stats = dayDetail.data?.stats;
    if (!stats) return ["等待团队数据同步后生成洞察。"];
    if (stats.filledCount === 0) {
      return [selectedDateKind === "future" ? "这一天还没有团队成员提交计划。" : "今天还没有团队成员提交日报。"];
    }
    const observations = [
      stats.missingCount > 0
        ? `${stats.missingCount} 位成员尚未${selectedDateKind === "future" ? "提交计划" : "提交日报"}，可优先提醒。`
        : `团队${selectedDateKind === "future" ? "计划" : "日报"}已全部提交。`,
      stats.riskCount > 0 ? `发现 ${stats.riskCount} 条风险信号，建议先查看异常记录。` : "暂未发现明显风险信号。",
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
      return ["AI 正在分析当前月历数据…"];
    }
    if (!summary.filled && !summary.missing) {
      return ["当前月历暂无可分析日报或计划。"];
    }
    return [
      summary.rate < 80 ? `本月填报率为 ${summary.rate}%，建议优先关注未填报人员。` : `本月填报率为 ${summary.rate}%，团队提交节奏稳定。`,
      summary.risks > 0 ? `本月累计出现 ${summary.risks} 条风险信号，建议查看风险日期和项目。` : "本月暂未出现明显风险信号。",
      summary.filled > 0 ? `当前范围累计 ${summary.filled} 条已提交记录，可继续追问项目进展和人员投入。` : "还没有足够记录支撑深入分析。"
    ];
  }, [aiObservations, calendar.isFetching, selectedDate, summary.filled, summary.missing, summary.rate, summary.risks]);
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
  const quickUploadFiles: UploadFile[] = useMemo(
    () =>
      quickAttachments.map((item) => ({
        uid: item.uid,
        name: item.file.name,
        size: item.file.size,
        status: "done"
      })),
    [quickAttachments]
  );

  const addQuickAttachment = (file: RcFile) => {
    if (file.size > ATTACHMENT_MAX_BYTES) {
      message.error("单个附件不能超过 8MB");
      return Upload.LIST_IGNORE;
    }
    setQuickAttachments((items) => [...items, { uid: file.uid, file }]);
    return false;
  };

  const uploadQuickAttachments = async (workLogId: string) => {
    const files = [...quickAttachments];
    for (const item of files) {
      await apiFetch<WorkLogAttachment>(`/work-logs/${workLogId}/attachments`, {
        method: "POST",
        body: JSON.stringify({
          fileName: item.file.name,
          mimeType: item.file.type || "application/octet-stream",
          fileSize: item.file.size,
          contentBase64: await fileToBase64(item.file)
        })
      });
    }
    if (files.length) {
      setQuickAttachments([]);
    }
  };

  const quickFill = useMutation({
    mutationFn: async (values: QuickFillForm) => {
      if (!selectedDate) {
        throw new Error("No selected date");
      }
      const created = await apiFetch<WorkLog>("/work-logs", {
        method: "POST",
        body: JSON.stringify(toQuickFillPayload(selectedDate, values))
      });
      await uploadQuickAttachments(created.id);
      return apiFetch<WorkLog>(`/work-logs/${created.id}/submit`, { method: "POST" });
    },
    onSuccess: () => {
      message.success(selectedDate && dateKind(selectedDate) === "future" ? "计划已保存" : "日报已提交");
      setQuickFillOpen(false);
      setQuickAttachments([]);
      quickForm.resetFields();
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      queryClient.invalidateQueries({ queryKey: ["calendar-day"] });
      queryClient.invalidateQueries({ queryKey: ["work-logs"] });
    },
    onError: (error) => {
      message.error((error as Error).message || "提交失败");
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

  const runCopilotPrompt = (question: string) => {
    setChatOpen(true);
    submitCalendarChat(question);
  };

  const openQuickFill = (date: string) => {
    const kind = dateKind(date);
    quickForm.resetFields();
    setQuickAttachments([]);
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
            <button
              key={log.id}
              type="button"
              className="block w-full border-b border-line pb-2 text-left transition-colors hover:bg-surface-container-low last:border-b-0"
              onClick={() => setSelectedWorkLog(log)}
            >
              <div className="font-medium">{log.title}</div>
              {log.project ? <Tag color="blue">{log.project.code ? `${log.project.code} · ${log.project.name}` : log.project.name}</Tag> : null}
              <div className="mt-1 text-sm text-muted">{log.content}</div>
              {log.attachments?.length ? (
                <Tag className="mt-2" icon={<Paperclip size={13} />}>
                  附件 {log.attachments.length}
                </Tag>
              ) : null}
              <Space className="mt-2" wrap>
                <Tag>{Number(log.hours).toFixed(1)} 小时</Tag>
                {log.aiAnalysis?.achievements?.map((item) => <Tag color="green" key={item}>{item}</Tag>)}
                {log.aiAnalysis?.risks?.map((item) => <Tag color="red" key={item}>{item}</Tag>)}
              </Space>
            </button>
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
            AI 工作日历
          </Typography.Title>
          <Typography.Text className="page-subtitle">让 AI 基于日报、计划、风险和工时，帮你理解团队真实状态。</Typography.Text>
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
          <Button type="primary" icon={<Bot size={16} />} onClick={() => setChatOpen(true)}>
            AI 洞察
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

      <div className="surface-panel dashboard-calendar-grid overflow-hidden">
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
          <div className="copilot-title">
            <Bot size={18} />
            <span>AI 工作助手</span>
          </div>
        }
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        width="min(400px, calc(100vw - 24px))"
        zIndex={1200}
        className="ai-copilot-drawer"
        styles={{ body: { padding: 0 }, header: { borderBottom: 0, padding: "18px 18px 8px" } }}
      >
        <div className="ai-copilot">
          <div className="ai-copilot-context">
            <div className="ai-copilot-kicker">AI 正在分析</div>
            <div className="ai-copilot-context-title">当前分析范围</div>
            <div className="ai-copilot-context-list">
              {copilotContext.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </div>

          <div className="ai-copilot-section">
            <div className="ai-copilot-section-title">{selectedDate ? "AI 今日洞察" : "AI 月度洞察"}</div>
            <ul className="ai-copilot-insights">
              {copilotObservations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <div className="ai-copilot-action-bar">
            <div className="ai-copilot-section-title">AI 建议操作</div>
            <div className="ai-copilot-actions">
              {copilotActions.map((action) => (
                <button key={action.label} type="button" onClick={() => runCopilotPrompt(action.prompt)} disabled={calendarChat.isPending}>
                  {action.label}
                </button>
              ))}
            </div>
          </div>

          <div className="ai-copilot-thread">
            {chatMessages.map((item) => (
              <div key={item.id} className={`ai-copilot-message ${item.role}`}>
                <div className="ai-copilot-message-meta">
                  {item.role === "assistant" ? "AI 助手" : user?.name ?? "我"}
                  {typeof item.contextCount === "number" ? <span> · 参考 {item.contextCount} 条记录</span> : null}
                </div>
                <div>{item.content}</div>
              </div>
            ))}
            {calendarChat.isPending ? (
              <div className="ai-copilot-message assistant is-loading">AI 正在结合当前页面上下文分析…</div>
            ) : null}
          </div>

          <div className="ai-copilot-compose">
            <div className="ai-copilot-input">
              <Input.TextArea
                value={chatInput}
                rows={2}
                placeholder="询问团队风险、项目进展、人员投入情况…"
                onChange={(event) => setChatInput(event.target.value)}
                onPressEnter={(event) => {
                  if (!event.shiftKey) {
                    event.preventDefault();
                    submitCalendarChat();
                  }
                }}
              />
              <Button type="primary" icon={<Send size={16} />} loading={calendarChat.isPending} onClick={() => submitCalendarChat()} />
            </div>
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
      </Drawer>

      <Modal
        title={null}
        open={Boolean(selectedDate)}
        onCancel={() => setSelectedDate(null)}
        footer={null}
        width={1180}
        className="workday-detail-modal"
      >
        {selectedDate ? (
          <div className="workday-detail-hero">
            <div>
              <div className="workday-product">AI 工作日历</div>
              <div className="workday-date">{chineseDateLabel(selectedDate)}</div>
              <div className="workday-subtitle">{detailTitle}</div>
            </div>
            <Space>
              <Button type="primary" icon={<CalendarPlus size={16} />} onClick={() => openQuickFill(selectedDate)}>
                {dateKind(selectedDate) === "future" ? "填写计划" : "填写日报"}
              </Button>
            </Space>
          </div>
        ) : null}
        <div className="workday-metrics">
          <div className="workday-metric is-filled">
            <div className="workday-metric-label">{selectedDate && dateKind(selectedDate) === "future" ? "已计划" : "已填报"}</div>
            <div className="workday-metric-value">{detailStats?.filledCount ?? 0}</div>
          </div>
          <div className="workday-metric is-missing">
            <div className="workday-metric-label">{selectedDate && dateKind(selectedDate) === "future" ? "未计划" : "未填报"}</div>
            <div className="workday-metric-value">{detailStats?.missingCount ?? 0}</div>
          </div>
          <div className="workday-metric is-hours">
            <div className="workday-metric-label">工时合计</div>
            <div className="workday-metric-value">{detailStats?.totalHours ?? 0}h</div>
          </div>
          <div className="workday-metric is-risk">
            <div className="workday-metric-label">风险数量</div>
            <div className="workday-metric-value">{detailStats?.riskCount ?? 0}</div>
          </div>
        </div>
        <div className="workday-focus-row">
          <div className={`workday-risk-panel ${(detailStats?.riskCount ?? 0) > 0 ? "has-risk" : ""}`}>
            <div className="workday-section-kicker">异常 / 风险</div>
            <div className="workday-risk-title">
              {(detailStats?.riskCount ?? 0) > 0 ? `发现 ${detailStats?.riskCount ?? 0} 条风险信号` : "暂未发现明显风险"}
            </div>
            <div className="workday-risk-copy">
              {(detailStats?.missingCount ?? 0) > 0
                ? `${detailStats?.missingCount ?? 0} 位成员尚未${selectedDateKind === "future" ? "提交计划" : "提交日报"}，建议优先提醒。`
                : "团队提交状态正常，可以继续查看具体记录。"}
            </div>
          </div>
          <div className="workday-ai-panel">
            <div className="workday-ai-header">
              <div>
                <div className="workday-section-kicker">AI 工作洞察</div>
                <div className="workday-ai-title">AI 今日观察</div>
              </div>
              {calendarChat.isPending || dayDetail.isFetching ? <span className="ai-shimmer">AI 正在分析团队日报…</span> : null}
            </div>
            <ul className="workday-ai-list">
              {aiObservations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <div className="workday-ai-pills">
              {["本周风险", "项目进度", "人员负载", "异常工时"].map((item) => (
                <button key={item} type="button" className="workday-ai-pill" onClick={() => runCopilotPrompt(item)}>
                  {item}
                </button>
              ))}
            </div>
            <div className="workday-ai-copilot-link">
              <span>需要继续追问时，AI 会带着当前日期和团队填报上下文打开右侧助手。</span>
              <Button type="text" icon={<Bot size={15} />} onClick={() => setChatOpen(true)}>
                打开 AI 工作助手
              </Button>
            </div>
          </div>
        </div>
        {(detailStats?.filledCount ?? 0) === 0 && !dayDetail.isFetching ? (
          <div className="workday-empty-state">
            <div>
              <div className="workday-empty-title">
                {selectedDateKind === "future" ? "这一天还没有团队成员提交计划" : "今天还没有团队成员提交日报"}
              </div>
              <div className="workday-empty-copy">提醒员工填写后，AI 会自动生成团队观察和风险提示。</div>
            </div>
            <Button type="primary" onClick={() => message.success("已生成提醒动作，后续可接入通知发送。")}>
              提醒员工填写
            </Button>
          </div>
        ) : (
          <div className="workday-detail-data">
            <div className="workday-section-heading">{selectedDateKind === "future" ? "计划记录" : "日报记录"}</div>
            <Table
              rowKey="id"
              size="small"
              loading={dayDetail.isFetching}
              dataSource={dayDetail.data?.filledEmployees ?? []}
              columns={filledColumns}
              pagination={false}
            />
          </div>
        )}
        <div className="workday-missing-row">
          <div className="workday-section-heading">{selectedDateKind === "future" ? "未提交计划" : "未提交日报"}</div>
          <Space wrap>
            {(dayDetail.data?.missingEmployees ?? []).map((item) => (
              <Tag key={item.id}>{item.name} · {item.departmentName ?? "未分配部门"}</Tag>
            ))}
          </Space>
        </div>
      </Modal>

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
            <div className="rounded-[8px] border border-line p-4">
              <div className="mb-2 text-sm font-medium text-ink">内容</div>
              <div className="whitespace-pre-wrap text-sm leading-6 text-muted">{selectedWorkLog.content}</div>
            </div>
            {selectedWorkLog.attachments?.length ? (
              <div className="rounded-[8px] border border-line p-4">
                <div className="mb-2 text-sm font-medium text-ink">附件</div>
                <WorkLogAttachmentViewer workLogId={selectedWorkLog.id} attachments={selectedWorkLog.attachments} />
              </div>
            ) : null}
            {selectedWorkLog.aiAnalysis ? (
              <div className="rounded-[8px] border border-line p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-ink">
                  <Bot size={16} />
                  AI 分析
                </div>
                <div className="text-sm leading-6 text-muted">{selectedWorkLog.aiAnalysis.summary}</div>
                <Space className="mt-3" wrap>
                  <Tag color="green">{selectedWorkLog.aiAnalysis.category}</Tag>
                  {selectedWorkLog.aiAnalysis.tags?.map((tag) => <Tag key={tag}>{tag}</Tag>)}
                  {selectedWorkLog.aiAnalysis.risks?.map((risk) => <Tag color="red" key={risk}>{risk}</Tag>)}
                </Space>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        title={selectedDate && dateKind(selectedDate) === "future" ? "填写未来计划" : "填写工作日报"}
        open={quickFillOpen}
        onCancel={() => {
          setQuickFillOpen(false);
          setQuickAttachments([]);
        }}
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
        <Form
          form={quickForm}
          layout="vertical"
          onValuesChange={(changed, values) => applyWorkLogTimingAutoFill(changed, values, quickForm.setFieldsValue)}
          onFinish={(values) => quickFill.mutate(values)}
        >
          <Form.Item name="title" label={selectedDate && dateKind(selectedDate) === "future" ? "计划标题" : "日报标题"} rules={[{ required: true, min: 2 }]}>
            <Input />
          </Form.Item>
          <Form.Item name="content" label={selectedDate && dateKind(selectedDate) === "future" ? "计划内容" : "工作内容"} rules={[{ required: true, min: 2 }]}>
            <Input.TextArea rows={5} placeholder={selectedDate && dateKind(selectedDate) === "future" ? "写下计划完成的事项、预期产出或潜在风险。" : "写下已经完成的事项、进展、风险或阻塞。"} />
          </Form.Item>
          <Form.Item label="照片 / 文件">
            <Upload.Dragger
              multiple
              fileList={quickUploadFiles}
              beforeUpload={addQuickAttachment}
              onRemove={(file) => {
                setQuickAttachments((items) => items.filter((item) => item.uid !== file.uid));
                return true;
              }}
            >
              <p className="ant-upload-drag-icon">
                <UploadCloud size={28} />
              </p>
              <p className="ant-upload-text">添加附件</p>
              <p className="ant-upload-hint">支持照片和文件，单个最大 8MB，提交后 AI 自动结合附件分析。</p>
            </Upload.Dragger>
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
