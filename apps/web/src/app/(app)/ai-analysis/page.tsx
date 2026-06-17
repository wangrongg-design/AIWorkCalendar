"use client";

import { useQueries, useQuery } from "@tanstack/react-query";
import { Alert, Button, DatePicker, Empty, Progress, Select, Space, Tag, Typography } from "antd";
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
type AnalysisScope = "self" | "department" | "company";

const analysisPeriods: Array<{ value: AnalysisPeriod; label: string }> = [
  { value: "week", label: "所选周" },
  { value: "month", label: "所选月" },
  { value: "quarter", label: "所选季度" },
  { value: "year", label: "所选年度" }
];

function startOfBusinessWeek(value: dayjs.Dayjs) {
  const weekday = value.day();
  return value.startOf("day").add(weekday === 0 ? -6 : 1 - weekday, "day");
}

function quarterStart(value: dayjs.Dayjs) {
  return value.month(Math.floor(value.month() / 3) * 3).startOf("month");
}

function periodRange(anchor: dayjs.Dayjs, period: AnalysisPeriod) {
  const today = dayjs().startOf("day");
  const start =
    period === "week"
      ? startOfBusinessWeek(anchor)
      : period === "month"
        ? anchor.startOf("month")
        : period === "quarter"
          ? quarterStart(anchor)
          : anchor.startOf("year");
  const end =
    period === "week"
      ? start.add(6, "day")
      : period === "month"
        ? start.endOf("month").startOf("day")
        : period === "quarter"
          ? start.add(2, "month").endOf("month").startOf("day")
          : start.endOf("year").startOf("day");
  const effectiveEnd = end.isAfter(today, "day") ? today : end;
  const dayCount = effectiveEnd.isBefore(start, "day") ? 0 : effectiveEnd.diff(start, "day") + 1;
  const previousEnd = start.subtract(1, "day");
  const previousStart = dayCount > 0 ? previousEnd.subtract(dayCount - 1, "day") : previousEnd;

  return {
    start,
    end,
    effectiveEnd,
    dayCount,
    previousStart,
    previousEnd
  };
}

function monthsBetween(start: dayjs.Dayjs, end: dayjs.Dayjs) {
  if (end.isBefore(start, "day")) return [];
  const months: string[] = [];
  let cursor = start.startOf("month");
  const last = end.startOf("month");
  while (cursor.isBefore(last, "month") || cursor.isSame(last, "month")) {
    months.push(cursor.format("YYYY-MM"));
    cursor = cursor.add(1, "month");
  }
  return months;
}

function dateRangeText(start: dayjs.Dayjs, end: dayjs.Dayjs) {
  if (end.isBefore(start, "day")) return "暂无可分析日期";
  if (start.isSame(end, "day")) return start.format("YYYY-MM-DD");
  return `${start.format("YYYY-MM-DD")} 至 ${end.format("YYYY-MM-DD")}`;
}

function daysInRange(days: CalendarDay[], start: dayjs.Dayjs, end: dayjs.Dayjs) {
  if (end.isBefore(start, "day")) return [];
  const startKey = start.format("YYYY-MM-DD");
  const endKey = end.format("YYYY-MM-DD");
  return days.filter((day) => day.date >= startKey && day.date <= endKey).sort((a, b) => a.date.localeCompare(b.date));
}

function summarizeDays(days: CalendarDay[]) {
  const filled = days.reduce((sum, day) => sum + day.filledCount, 0);
  const missing = days.reduce((sum, day) => sum + day.missingCount, 0);
  const risks = days.reduce((sum, day) => sum + day.riskCount, 0);
  const blockers = days.reduce((sum, day) => sum + (day.blockerCount ?? 0), 0);
  const totalHours = days.reduce((sum, day) => sum + (day.totalHours ?? 0), 0);
  const denominator = filled + missing;
  return {
    filled,
    missing,
    risks,
    blockers,
    riskBlockers: risks + blockers,
    totalHours: Number(totalHours.toFixed(1)),
    rate: denominator ? Number(((filled / denominator) * 100).toFixed(1)) : 0
  };
}

function dayRiskBlockerCount(day: Pick<CalendarDay, "riskCount" | "blockerCount">) {
  return (day.riskCount ?? 0) + (day.blockerCount ?? 0);
}

function buildPeriodBuckets(days: CalendarDay[], period: AnalysisPeriod) {
  const groups = new Map<string, { label: string; startDate: string; days: CalendarDay[] }>();
  for (const day of days) {
    const value = dayjs(day.date);
    const bucket =
      period === "year" || period === "quarter"
        ? { key: value.format("YYYY-MM"), label: value.format("M月") }
        : period === "month"
          ? {
              key: `${value.format("YYYY-MM")}-w${Math.floor((value.date() - 1) / 7) + 1}`,
              label: `第${Math.floor((value.date() - 1) / 7) + 1}周`
            }
          : { key: day.date, label: value.format("M/D") };
    const current = groups.get(bucket.key);
    if (current) {
      current.days.push(day);
    } else {
      groups.set(bucket.key, { label: bucket.label, startDate: day.date, days: [day] });
    }
  }
  return [...groups.entries()]
    .map(([key, value]) => ({
      key,
      label: value.label,
      startDate: value.startDate,
      summary: summarizeDays(value.days)
    }))
    .sort((left, right) => left.startDate.localeCompare(right.startDate));
}

function deltaText(value: number | null, suffix = "") {
  if (value === null) return "暂无对比";
  if (value === 0) return `持平${suffix}`;
  return `${value > 0 ? "+" : ""}${value}${suffix}`;
}

export default function AIAnalysisPage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const [anchorDate, setAnchorDate] = useState(dayjs());
  const [analysisPeriod, setAnalysisPeriod] = useState<AnalysisPeriod>("week");
  const [scope, setScope] = useState<AnalysisScope>(
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

  const selectedDepartmentName = org.data?.departments.find((item) => item.id === departmentId)?.name;
  const range = useMemo(() => periodRange(anchorDate, analysisPeriod), [anchorDate, analysisPeriod]);
  const calendarMonthKeys = useMemo(() => {
    const currentMonths = range.dayCount > 0 ? monthsBetween(range.start, range.effectiveEnd) : [];
    const previousMonths = range.dayCount > 0 ? monthsBetween(range.previousStart, range.previousEnd) : [];
    return [...new Set([...currentMonths, ...previousMonths])];
  }, [range]);

  const calendarQueries = useQueries({
    queries: calendarMonthKeys.map((monthKey) => ({
      queryKey: ["analysis-calendar", monthKey, scope, departmentId ?? "all"],
      queryFn: () => {
        const params = new URLSearchParams({ month: monthKey, scope });
        if (departmentId) params.set("departmentId", departmentId);
        return apiFetch<CalendarResponse>(`/analytics/calendar?${params.toString()}`);
      }
    }))
  });

  const allDays = calendarQueries.flatMap((query) => query.data?.days ?? []);
  const isCalendarFetching = calendarQueries.some((query) => query.isFetching);
  const calendarError = calendarQueries.find((query) => query.error)?.error;
  const currentDays = useMemo(() => daysInRange(allDays, range.start, range.effectiveEnd), [allDays, range]);
  const previousDays = useMemo(() => daysInRange(allDays, range.previousStart, range.previousEnd), [allDays, range]);

  const analysis = useMemo(() => {
    const summary = summarizeDays(currentDays);
    const previousSummary = summarizeDays(previousDays);
    const previousHasComparableData = previousDays.length > 0;
    const rateDelta = previousHasComparableData ? Number((summary.rate - previousSummary.rate).toFixed(1)) : null;
    const riskDelta = previousHasComparableData ? summary.riskBlockers - previousSummary.riskBlockers : null;
    const hoursDelta = previousHasComparableData ? Number((summary.totalHours - previousSummary.totalHours).toFixed(1)) : null;
    const riskDays = [...currentDays].filter((day) => dayRiskBlockerCount(day) > 0).sort((a, b) => dayRiskBlockerCount(b) - dayRiskBlockerCount(a) || a.date.localeCompare(b.date));
    const missingDays = [...currentDays].filter((day) => day.missingCount > 0).sort((a, b) => b.missingCount - a.missingCount || a.date.localeCompare(b.date));
    const bestDay = [...currentDays].filter((day) => day.filledCount + day.missingCount > 0).sort((a, b) => b.fillRate - a.fillRate)[0];
    const weakestDay = [...currentDays].filter((day) => day.filledCount + day.missingCount > 0).sort((a, b) => a.fillRate - b.fillRate)[0];
    const focusDays = [...currentDays]
      .filter((day) => dayRiskBlockerCount(day) > 0 || day.missingCount > 0)
      .sort((a, b) => dayRiskBlockerCount(b) * 3 + b.missingCount - (dayRiskBlockerCount(a) * 3 + a.missingCount) || a.date.localeCompare(b.date));
    const buckets = buildPeriodBuckets(currentDays, analysisPeriod);
    const periodLabel = analysisPeriods.find((item) => item.value === analysisPeriod)?.label ?? "本周";
    const scopeLabel =
      departmentId && selectedDepartmentName
        ? selectedDepartmentName
        : scope === "company"
          ? "全公司"
          : scope === "department"
            ? "本部门"
            : user?.name ?? "个人";
    const currentRangeText = dateRangeText(range.start, range.effectiveEnd);
    const previousRangeText = previousHasComparableData ? dateRangeText(range.previousStart, range.previousEnd) : "暂无可比周期";
    const dataScopeNote = `${currentRangeText} · ${scopeLabel} · 已聚合 ${calendarMonthKeys.length} 个月份数据`;
    const subjectLabel = `${scopeLabel}在${periodLabel}内`;

    const conclusion =
      range.dayCount === 0
        ? `${periodLabel}尚未进入可分析日期，暂不形成结论。`
        : summary.filled + summary.missing === 0
          ? `${subjectLabel}暂无可分析成员或填报要求。`
          : summary.rate >= 90 && summary.riskBlockers === 0
            ? `${subjectLabel}执行节奏稳定，填报率 ${summary.rate}%。`
            : summary.riskBlockers > 0
              ? `${subjectLabel}发现 ${summary.riskBlockers} 条风险/阻塞信号，需要优先跟进。`
              : `${subjectLabel}填报率 ${summary.rate}%，建议补齐关键日期日报。`;

    const evidence = [
      `当前周期覆盖 ${range.dayCount} 天，已提交 ${summary.filled} 条，缺填 ${summary.missing} 条。`,
      previousHasComparableData
        ? `填报率较前一可比周期 ${previousRangeText} ${deltaText(rateDelta, " 个百分点")}。`
        : "暂无前一可比周期数据，先以当前周期建立基线。",
      riskDays.length ? `${riskDays.length} 个日期存在风险/阻塞信号，累计 ${summary.riskBlockers} 条风险/阻塞。` : "当前周期暂无明显风险/阻塞日期。",
      summary.totalHours > 0 ? `累计记录 ${summary.totalHours}h，较前期 ${deltaText(hoursDelta, "h")}。` : "工时数据不足，建议先推动填报。"
    ];

    const recommendations = [
      missingDays[0] ? `${missingDays[0].date} 缺填 ${missingDays[0].missingCount} 人，建议优先提醒并确认是否为休息日。` : "缺填压力较低，保持当前节奏。",
      riskDays[0] ? `${riskDays[0].date} 风险/阻塞 ${dayRiskBlockerCount(riskDays[0])} 条，建议打开当天详情定位项目和负责人。` : "暂无需要立即升级的风险/阻塞日期。",
      rateDelta !== null && rateDelta < -5 ? `填报率环比下降 ${Math.abs(rateDelta)} 个百分点，建议在团队例会同步填报要求。` : "填报趋势未出现明显下滑。",
      weakestDay && bestDay && weakestDay.date !== bestDay.date ? `${weakestDay.date} 是周期低点，${bestDay.date} 是节奏最好日期，可对比复盘。` : "暂无足够样本形成节奏高低点判断。"
    ];

    return {
      periodLabel,
      currentRangeText,
      previousRangeText,
      dataScopeNote,
      summary,
      previousSummary,
      trend: {
        rateDelta,
        riskDelta,
        hoursDelta
      },
      conclusion,
      evidence,
      recommendations,
      riskDays,
      missingDays,
      focusDays,
      buckets
    };
  }, [analysisPeriod, calendarMonthKeys.length, currentDays, departmentId, previousDays, range, scope, selectedDepartmentName, user?.name]);

  return (
    <div className="page-stack ai-analysis-page">
      <div className="page-header">
        <div>
          <Typography.Title level={3} className="page-title">
            周期判断
          </Typography.Title>
          <Typography.Text className="page-subtitle">周期复盘入口：按周、月、季度和年度分析团队节奏、风险/阻塞趋势和投入变化。</Typography.Text>
        </div>
        <Space wrap className="toolbar-panel">
          <DatePicker
            picker={analysisPeriod}
            value={anchorDate}
            onChange={(value) => value && setAnchorDate(value)}
            disabledDate={(value) => Boolean(value?.startOf("day").isAfter(dayjs(), "day"))}
            allowClear={false}
          />
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
          <Button onClick={() => calendarQueries.forEach((query) => query.refetch())} loading={isCalendarFetching}>
            刷新
          </Button>
        </Space>
      </div>

      {calendarError ? <Alert type="error" showIcon message={(calendarError as Error).message} /> : null}

      <section className="ai-analysis-hero">
        <div className="ai-analysis-hero-main">
          <div className="workbench-ai-kicker">
            <Bot size={16} />
            工作洞察
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
          <div className="ai-analysis-score-foot">
            <span>前期 {analysis.previousSummary.rate}%</span>
            <span>{deltaText(analysis.trend.rateDelta, " 个百分点")}</span>
          </div>
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
          <div className="metric-label">风险/阻塞</div>
          <div className="metric-value text-danger">{analysis.summary.riskBlockers}</div>
          <div className="metric-hint">较前期 {deltaText(analysis.trend.riskDelta, " 条")}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">工时</div>
          <div className="metric-value">{analysis.summary.totalHours}h</div>
          <div className="metric-hint">较前期 {deltaText(analysis.trend.hoursDelta, "h")}</div>
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
            行动建议
          </div>
          <ul className="ai-analysis-list">
            {analysis.recommendations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <div className="surface-panel ai-analysis-card ai-analysis-trend-card">
          <div className="ai-analysis-card-title">
            <WandSparkles size={18} />
            趋势拆解
          </div>
          {analysis.buckets.length ? (
            <div className="ai-analysis-bucket-list">
              {analysis.buckets.map((bucket) => (
                <div key={bucket.key} className="ai-analysis-bucket">
                  <div>
                    <span>{bucket.label}</span>
                    <strong>{bucket.summary.rate}%</strong>
                  </div>
                  <Progress percent={bucket.summary.rate} showInfo={false} strokeColor="var(--color-primary)" />
                  <p>
                    提交 {bucket.summary.filled} · 缺填 {bucket.summary.missing} · 风险/阻塞 {bucket.summary.riskBlockers}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前周期暂无可拆解数据" />
          )}
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
            <Button
              className="ai-soft-button"
              onClick={() => router.push(analysis.focusDays[0] ? `/calendar?date=${analysis.focusDays[0].date}` : "/calendar")}
              icon={<CalendarDays size={16} />}
            >
              查看重点日期
            </Button>
          </div>
        </div>

        <div className="surface-panel ai-analysis-card ai-analysis-table-card">
          <div className="ai-analysis-card-title">
            <AlertTriangle size={18} />
            重点日期
          </div>
          {analysis.focusDays.length ? (
            <div className="ai-analysis-day-list">
              {analysis.focusDays.slice(0, 8).map((day) => (
                <button key={day.date} type="button" onClick={() => router.push(`/calendar?date=${day.date}`)}>
                  <span>{dayjs(day.date).format("M月D日")}</span>
                  <Tag color={dayRiskBlockerCount(day) ? "red" : "orange"}>{dayRiskBlockerCount(day) ? `风险/阻塞 ${dayRiskBlockerCount(day)}` : `缺填 ${day.missingCount}`}</Tag>
                  <strong>填报率 {day.fillRate}%</strong>
                </button>
              ))}
            </div>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前周期暂无重点关注日期" />
          )}
        </div>
      </section>
    </div>
  );
}
