"use client";

import { useQuery } from "@tanstack/react-query";
import { Button, DatePicker, Empty, Progress, Select, Space, Tag, Typography } from "antd";
import dayjs from "dayjs";
import { AlertTriangle, Bot, CalendarDays, CheckCircle2, FileText, UsersRound, WandSparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { CalendarDay, CalendarResponse, Department } from "@/lib/types";

type OrgResponse = {
  departments: Department[];
};

type AnalysisPeriod = "week" | "month" | "quarter" | "year";

const analysisPeriods: Array<{ value: AnalysisPeriod; label: string }> = [
  { value: "week", label: "本周" },
  { value: "month", label: "本月" },
  { value: "quarter", label: "季度" },
  { value: "year", label: "年度" }
];

function summarizeDays(days: CalendarDay[]) {
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
}

export default function AIAnalysisPage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const today = dayjs().format("YYYY-MM-DD");
  const [month, setMonth] = useState(dayjs());
  const [analysisPeriod, setAnalysisPeriod] = useState<AnalysisPeriod>("week");
  const [scope, setScope] = useState<"self" | "department" | "company">(
    user?.roles.includes("COMPANY_ADMIN") || user?.roles.includes("SUPER_ADMIN")
      ? "company"
      : user?.roles.includes("DEPARTMENT_MANAGER")
        ? "department"
        : "self"
  );
  const [departmentId, setDepartmentId] = useState<string | undefined>(undefined);

  const canChooseDepartment = user?.roles.includes("COMPANY_ADMIN") || user?.roles.includes("SUPER_ADMIN");

  const org = useQuery({
    queryKey: ["org"],
    queryFn: () => apiFetch<OrgResponse>("/org")
  });

  const calendar = useQuery({
    queryKey: ["analysis-calendar", month.format("YYYY-MM"), scope, departmentId],
    queryFn: () => {
      const params = new URLSearchParams({
        month: month.format("YYYY-MM"),
        scope
      });
      if (departmentId) params.set("departmentId", departmentId);
      return apiFetch<CalendarResponse>(`/analytics/calendar?${params.toString()}`);
    }
  });

  const analysis = useMemo(() => {
    const days = calendar.data?.days ?? [];
    const weekStart = dayjs(today).startOf("week").add(1, "day");
    const weekEnd = weekStart.add(6, "day");
    const rawPeriodDays =
      analysisPeriod === "week"
        ? days.filter((day) => {
            const value = dayjs(day.date);
            return (value.isAfter(weekStart) || value.isSame(weekStart, "day")) && (value.isBefore(weekEnd) || value.isSame(weekEnd, "day"));
          })
        : days;
    const periodDays = rawPeriodDays.filter((day) => day.date <= today);
    const summary = summarizeDays(periodDays);
    const riskDays = periodDays.filter((day) => day.riskCount > 0).sort((a, b) => b.riskCount - a.riskCount);
    const missingDays = [...periodDays].filter((day) => day.missingCount > 0).sort((a, b) => b.missingCount - a.missingCount);
    const bestDay = [...periodDays].sort((a, b) => b.fillRate - a.fillRate)[0];
    const periodLabel = analysisPeriods.find((item) => item.value === analysisPeriod)?.label ?? "本周";
    const scopeLabel = scope === "company" ? "团队" : scope === "department" ? "部门" : "个人";
    const dataScopeNote =
      analysisPeriod === "week"
        ? "基于本周截至今天的可见日历数据"
        : analysisPeriod === "month"
          ? "基于本月至今的可见日历数据"
          : "当前先基于所选月份截至今天的数据估算，后续可扩展完整周期接口";

    const conclusion =
      summary.rate >= 80
        ? `${periodLabel}${scopeLabel}填报整体稳定，填报率 ${summary.rate}%。`
        : `${periodLabel}${scopeLabel}填报率 ${summary.rate}%，需要优先补齐日报。`;

    const evidence = [
      `已提交 ${summary.filled} 条，缺填 ${summary.missing} 条。`,
      riskDays.length ? `${riskDays.length} 个日期存在风险信号，累计 ${summary.risks} 条风险。` : "当前周期暂无明显风险日期。",
      summary.totalHours > 0 ? `累计记录 ${summary.totalHours}h，可继续按项目核对投入。` : "工时数据不足，建议先推动填报。"
    ];

    const recommendations = [
      missingDays[0] ? `${missingDays[0].date} 缺填 ${missingDays[0].missingCount} 人，建议优先提醒。` : "缺填压力较低，保持当前节奏。",
      riskDays[0] ? `${riskDays[0].date} 风险 ${riskDays[0].riskCount} 条，建议查看当天详情。` : "暂无需要立即升级的风险日期。",
      bestDay ? `${bestDay.date} 填报率最高，可作为团队节奏参考。` : "暂无足够样本形成节奏判断。"
    ];

    return {
      periodLabel,
      dataScopeNote,
      summary,
      conclusion,
      evidence,
      recommendations,
      riskDays,
      missingDays
    };
  }, [analysisPeriod, calendar.data?.days, scope, today]);

  return (
    <div className="page-stack ai-analysis-page">
      <div className="page-header">
        <div>
          <Typography.Title level={3} className="page-title">
            AI整体分析
          </Typography.Title>
          <Typography.Text className="page-subtitle">从周期维度理解团队填报、风险、工时和缺填压力。</Typography.Text>
        </div>
        <Space wrap className="toolbar-panel">
          <DatePicker picker="month" value={month} onChange={(value) => value && setMonth(value)} allowClear={false} />
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
        </Space>
      </div>

      <section className="ai-analysis-hero">
        <div className="ai-analysis-hero-main">
          <div className="workbench-ai-kicker">
            <Bot size={16} />
            AI 工作洞察
          </div>
          <Typography.Title level={2}>{analysis.conclusion}</Typography.Title>
          <Typography.Text>{analysis.dataScopeNote}</Typography.Text>
          <div className="calendar-period-tabs ai-analysis-tabs">
            {analysisPeriods.map((item) => (
              <button
                key={item.value}
                type="button"
                className={analysisPeriod === item.value ? "is-active" : ""}
                onClick={() => setAnalysisPeriod(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="ai-analysis-score">
          <span>周期填报率</span>
          <strong>{analysis.summary.rate}%</strong>
          <Progress percent={analysis.summary.rate} showInfo={false} strokeColor="var(--color-primary)" />
        </div>
      </section>

      <section className="ai-analysis-metrics">
        <div className="metric-card">
          <div className="metric-label">已提交</div>
          <div className="metric-value text-success">{analysis.summary.filled}</div>
          <div className="metric-hint">当前周期记录</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">缺填</div>
          <div className="metric-value text-warning">{analysis.summary.missing}</div>
          <div className="metric-hint">需要提醒补齐</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">风险</div>
          <div className="metric-value text-danger">{analysis.summary.risks}</div>
          <div className="metric-hint">风险/阻塞信号</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">工时</div>
          <div className="metric-value">{analysis.summary.totalHours}h</div>
          <div className="metric-hint">可见范围合计</div>
        </div>
      </section>

      <section className="ai-analysis-grid">
        <div className="surface-panel ai-analysis-card">
          <div className="ai-analysis-card-title">
            <WandSparkles size={18} />
            核心证据
          </div>
          <ul className="ai-analysis-list">
            {analysis.evidence.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <div className="surface-panel ai-analysis-card is-warning">
          <div className="ai-analysis-card-title">
            <AlertTriangle size={18} />
            风险提醒
          </div>
          <ul className="ai-analysis-list">
            {analysis.recommendations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <div className="surface-panel ai-analysis-card">
          <div className="ai-analysis-card-title">
            <CheckCircle2 size={18} />
            建议动作
          </div>
          <div className="ai-analysis-action-grid">
            <Button className="ai-soft-button" onClick={() => router.push("/calendar")} icon={<UsersRound size={16} />}>
              提醒未填报员工
            </Button>
            <Button className="ai-soft-button" onClick={() => router.push("/reports")} icon={<FileText size={16} />}>
              生成周期汇报
            </Button>
            <Button className="ai-soft-button" onClick={() => router.push("/calendar")} icon={<CalendarDays size={16} />}>
              查看风险日期
            </Button>
          </div>
        </div>

        <div className="surface-panel ai-analysis-card ai-analysis-table-card">
          <div className="ai-analysis-card-title">
            <AlertTriangle size={18} />
            风险日期
          </div>
          {analysis.riskDays.length ? (
            <div className="ai-analysis-day-list">
              {analysis.riskDays.slice(0, 6).map((day) => (
                <button key={day.date} type="button" onClick={() => router.push("/calendar")}>
                  <span>{dayjs(day.date).format("M月D日")}</span>
                  <Tag color="red">风险 {day.riskCount}</Tag>
                  <strong>填报率 {day.fillRate}%</strong>
                </button>
              ))}
            </div>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前周期暂无风险日期" />
          )}
        </div>
      </section>
    </div>
  );
}
