"use client";

import { useQuery } from "@tanstack/react-query";
import { Button, Progress, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { AlertTriangle, Bot, CalendarDays, CheckCircle2, ClipboardList, FileText, Send, UsersRound } from "lucide-react";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { CalendarDay, CalendarDayDetail, CalendarResponse, Report, WorkLog } from "@/lib/types";

function currentScope(userRoles: string[] | undefined) {
  if (userRoles?.includes("COMPANY_ADMIN") || userRoles?.includes("SUPER_ADMIN")) return "company";
  if (userRoles?.includes("DEPARTMENT_MANAGER")) return "department";
  return "self";
}

function riskCount(log: WorkLog) {
  return (log.aiAnalysis?.risks?.length ?? 0) + (log.aiAnalysis?.blockers?.length ?? 0);
}

function reportStatusText(status: Report["status"]) {
  const labels: Record<Report["status"], string> = {
    PENDING: "生成中",
    COMPLETED: "已完成",
    FAILED: "失败"
  };
  return labels[status];
}

function reportStatusColor(status: Report["status"]) {
  const colors: Record<Report["status"], string> = {
    PENDING: "processing",
    COMPLETED: "success",
    FAILED: "error"
  };
  return colors[status];
}

export default function DashboardPage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const today = dayjs().format("YYYY-MM-DD");
  const month = dayjs().format("YYYY-MM");
  const scope = currentScope(user?.roles);

  const dayDetail = useQuery({
    queryKey: ["dashboard-today", today, scope],
    queryFn: () => {
      const params = new URLSearchParams({ date: today, scope });
      return apiFetch<CalendarDayDetail>(`/analytics/calendar/day?${params.toString()}`);
    },
    enabled: Boolean(user)
  });

  const calendar = useQuery({
    queryKey: ["dashboard-month", month, scope],
    queryFn: () => {
      const params = new URLSearchParams({ month, scope });
      return apiFetch<CalendarResponse>(`/analytics/calendar?${params.toString()}`);
    },
    enabled: Boolean(user)
  });

  const reports = useQuery({
    queryKey: ["dashboard-reports"],
    queryFn: () => apiFetch<Report[]>("/reports"),
    enabled: Boolean(user)
  });

  const stats = dayDetail.data?.stats;
  const filledLogs = useMemo(() => dayDetail.data?.filledEmployees.flatMap((employee) => employee.logs) ?? [], [dayDetail.data]);
  const riskyLogs = useMemo(() => filledLogs.filter((log) => riskCount(log) > 0).slice(0, 5), [filledLogs]);
  const riskDays = useMemo(() => (calendar.data?.days ?? []).filter((day) => day.riskCount > 0), [calendar.data?.days]);
  const missingEmployees = dayDetail.data?.missingEmployees ?? [];
  const monthSummary = useMemo(() => {
    const days = calendar.data?.days ?? [];
    const filled = days.reduce((sum, day) => sum + day.filledCount, 0);
    const missing = days.reduce((sum, day) => sum + day.missingCount, 0);
    const risks = days.reduce((sum, day) => sum + day.riskCount, 0);
    const totalHours = days.reduce((sum, day) => sum + (day.totalHours ?? 0), 0);
    const denominator = filled + missing;
    return {
      filled,
      missing,
      risks,
      totalHours: Number(totalHours.toFixed(1)),
      rate: denominator ? Number(((filled / denominator) * 100).toFixed(1)) : 0
    };
  }, [calendar.data?.days]);

  const aiSummary = useMemo(() => {
    if (dayDetail.isFetching || calendar.isFetching) return "AI 正在汇总今日填报、风险和本月趋势。";
    if (!stats || stats.totalEmployees === 0) return "当前范围暂无可分析成员，先完成团队和部门配置。";
    if (stats.filledCount === 0) return "今天还没有提交记录，建议先提醒团队完成日报或计划。";
    if (stats.riskCount > 0) return `今日发现 ${stats.riskCount} 条风险/阻塞，建议优先查看风险记录并同步负责人。`;
    if (stats.missingCount > 0) return `今日 ${stats.missingCount} 位成员未填报，整体填报率 ${stats.fillRate}%。`;
    return `今日填报已完成，团队合计 ${stats.totalHours}h，本月填报率 ${monthSummary.rate}%。`;
  }, [calendar.isFetching, dayDetail.isFetching, monthSummary.rate, stats]);

  const riskColumns: ColumnsType<WorkLog> = [
    {
      title: "风险记录",
      dataIndex: "title",
      render: (_, record) => (
        <button type="button" className="link-row" onClick={() => router.push(`/calendar`)}>
          <span className="font-medium text-ink">{record.title}</span>
          <span className="mt-1 line-clamp-1 text-xs text-muted">{record.content}</span>
        </button>
      )
    },
    {
      title: "项目",
      width: 180,
      render: (_, record) => record.project?.name ?? "未关联"
    },
    {
      title: "风险",
      width: 90,
      render: (_, record) => <Tag color={riskCount(record) > 0 ? "red" : "default"}>{riskCount(record)}</Tag>
    }
  ];

  const reportColumns: ColumnsType<Report> = [
    {
      title: "最近汇报",
      dataIndex: "title",
      render: (_, record) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-ink">{record.title}</div>
          <div className="text-xs text-muted">{dayjs(record.createdAt).format("MM-DD HH:mm")}</div>
        </div>
      )
    },
    {
      title: "状态",
      width: 96,
      render: (_, record) => <Tag color={reportStatusColor(record.status)}>{reportStatusText(record.status)}</Tag>
    }
  ];

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <Typography.Title level={3} className="page-title">
            工作台
          </Typography.Title>
          <Typography.Text className="page-subtitle">今日待办、团队风险和 AI 摘要集中在这里，月度趋势进入 AI日历查看。</Typography.Text>
        </div>
        <Space wrap className="toolbar-panel">
          <Button icon={<ClipboardList size={16} />} onClick={() => router.push("/work-logs?new=1")}>
            新增填报
          </Button>
          <Button icon={<FileText size={16} />} onClick={() => router.push("/reports")}>
            生成汇报
          </Button>
          <Button type="primary" icon={<CalendarDays size={16} />} onClick={() => router.push("/calendar")}>
            打开AI日历
          </Button>
        </Space>
      </div>

      <div className="workbench-hero">
        <div className="workbench-ai">
          <div className="workbench-ai-kicker">
            <Bot size={16} />
            AI 今日摘要
          </div>
          <div className="workbench-ai-title">{aiSummary}</div>
          <div className="workbench-ai-evidence">
            <span>范围：{scope === "company" ? "全公司" : scope === "department" ? "本部门" : "只看自己"}</span>
            <span>日期：{today}</span>
            <span>参考：{filledLogs.length} 条记录</span>
          </div>
        </div>
        <div className="workbench-actions">
          <button type="button" onClick={() => router.push("/calendar")} className="workbench-action">
            <AlertTriangle size={18} />
            <span>查看风险日期</span>
          </button>
          <button type="button" onClick={() => router.push("/reports")} className="workbench-action">
            <Send size={18} />
            <span>生成本周总结</span>
          </button>
        </div>
      </div>

      <div className="workbench-metrics">
        <div className="metric-card">
          <div className="metric-label">今日填报率</div>
          <div className="metric-value">{stats?.fillRate ?? 0}%</div>
          <Progress percent={stats?.fillRate ?? 0} showInfo={false} strokeColor="#0B57D0" />
        </div>
        <div className="metric-card">
          <div className="metric-label">已填 / 应填</div>
          <div className="metric-value">
            {stats?.filledCount ?? 0}/{stats?.totalEmployees ?? 0}
          </div>
          <div className="metric-hint">按当前权限范围统计</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">今日风险</div>
          <div className="metric-value text-danger">{stats?.riskCount ?? 0}</div>
          <div className="metric-hint">{riskyLogs.length ? "需要优先处理" : "暂无明显风险"}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">本月趋势</div>
          <div className="metric-value">{monthSummary.rate}%</div>
          <div className="metric-hint">风险 {monthSummary.risks} · {monthSummary.totalHours}h</div>
        </div>
      </div>

      <div className="workbench-grid">
        <section className="surface-panel workbench-panel">
          <div className="section-head">
            <div>
              <div className="section-title">今日待办</div>
              <div className="section-subtitle">先处理未填报和风险记录。</div>
            </div>
            <Button size="small" onClick={() => router.push("/work-logs")}>
              查看填报
            </Button>
          </div>
          <div className="task-list">
            <div className="task-item">
              <CheckCircle2 size={17} className="text-success" />
              <div>
                <div className="task-title">已提交记录</div>
                <div className="task-copy">{filledLogs.length} 条日报/计划已进入今日统计。</div>
              </div>
            </div>
            <div className="task-item">
              <UsersRound size={17} className="text-warning" />
              <div>
                <div className="task-title">未填报提醒</div>
                <div className="task-copy">
                  {missingEmployees.length ? `${missingEmployees.slice(0, 4).map((item) => item.name).join("、")} 等 ${missingEmployees.length} 人未填报。` : "当前范围成员均已填报。"}
                </div>
              </div>
            </div>
            <div className="task-item">
              <AlertTriangle size={17} className="text-danger" />
              <div>
                <div className="task-title">风险日期</div>
                <div className="task-copy">
                  {riskDays.length ? `${riskDays.slice(0, 5).map((day: CalendarDay) => dayjs(day.date).format("M/D")).join("、")} 出现风险信号。` : "本月暂无风险日期。"}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="surface-panel workbench-panel">
          <div className="section-head">
            <div>
              <div className="section-title">今日风险</div>
              <div className="section-subtitle">AI 从日报成果、风险和阻塞中提取。</div>
            </div>
          </div>
          <Table
            rowKey="id"
            size="small"
            loading={dayDetail.isFetching}
            columns={riskColumns}
            dataSource={riskyLogs}
            pagination={false}
            locale={{ emptyText: "今日暂未发现风险记录" }}
          />
        </section>

        <section className="surface-panel workbench-panel">
          <div className="section-head">
            <div>
              <div className="section-title">最近 AI 汇报</div>
              <div className="section-subtitle">用于复盘团队进展和后续计划。</div>
            </div>
            <Button size="small" onClick={() => router.push("/reports")}>
              生成
            </Button>
          </div>
          <Table
            rowKey="id"
            size="small"
            loading={reports.isFetching}
            columns={reportColumns}
            dataSource={(reports.data ?? []).slice(0, 5)}
            pagination={false}
            locale={{ emptyText: "还没有生成汇报" }}
          />
        </section>
      </div>
    </div>
  );
}
