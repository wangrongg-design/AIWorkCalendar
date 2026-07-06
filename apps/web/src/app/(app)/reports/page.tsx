"use client";

import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, DatePicker, Drawer, Empty, Form, Select, Space, Tag, Typography, message } from "antd";
import dayjs, { Dayjs } from "dayjs";
import { AlertTriangle, CalendarDays, ClipboardCopy, FileDown, FileText, Loader2, RotateCw, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, humanizeApiError } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { Department, Report, ReportReadiness, ReportReadinessStats, ReportType } from "@/lib/types";

type OrgResponse = {
  departments: Department[];
};

type ReportForm = {
  type: ReportType;
  range: [Dayjs, Dayjs];
  departmentId?: string;
};

type ReportRequest = {
  type: ReportType;
  range: [Dayjs, Dayjs];
  departmentId?: string;
};

type Recommendation = ReportRequest & {
  id: string;
  title: string;
  kind: string;
  copy: string;
};

const COMPANY_SCOPE = "__company__";
const MAX_REPORT_PERIOD_DAYS = 31;

const reportTypeOptions: Array<{ value: ReportType; label: string }> = [
  { value: "PERSONAL_DAILY", label: "个人日报" },
  { value: "PERSONAL_WEEKLY", label: "个人周报" },
  { value: "DEPARTMENT_DAILY", label: "团队日报" },
  { value: "DEPARTMENT_WEEKLY", label: "团队周报" }
];

const reportTypeLabels: Record<ReportType, string> = {
  PERSONAL_DAILY: "个人日报",
  PERSONAL_WEEKLY: "个人周报",
  DEPARTMENT_DAILY: "团队日报",
  DEPARTMENT_WEEKLY: "团队周报"
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function listHtml(items: string[]) {
  if (!items.length) return "<p>暂无</p>";
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function dateText(value: string | Dayjs) {
  return dayjs(value).format("YYYY-MM-DD");
}

function dateTimeText(value?: string | null) {
  return value ? dayjs(value).format("YYYY-MM-DD HH:mm") : "-";
}

function periodText(start: string | Dayjs, end: string | Dayjs) {
  const startText = dateText(start);
  const endText = dateText(end);
  return startText === endText ? startText : `${startText} 至 ${endText}`;
}

function startOfWorkWeek(value: Dayjs) {
  const offset = (value.day() + 6) % 7;
  return value.subtract(offset, "day").startOf("day");
}

function quickRanges(now = dayjs()) {
  const thisWeekStart = startOfWorkWeek(now);
  const lastWeekStart = thisWeekStart.subtract(7, "day");
  return {
    today: [now.startOf("day"), now.startOf("day")] as [Dayjs, Dayjs],
    thisWeek: [thisWeekStart, now.startOf("day")] as [Dayjs, Dayjs],
    lastWeek: [lastWeekStart, lastWeekStart.add(6, "day")] as [Dayjs, Dayjs],
    thisMonth: [now.startOf("month"), now.startOf("day")] as [Dayjs, Dayjs]
  };
}

function rangeDays(range?: [Dayjs, Dayjs] | null) {
  if (!range?.[0] || !range?.[1]) return 0;
  return range[1].startOf("day").diff(range[0].startOf("day"), "day") + 1;
}

function isDepartmentReport(type?: ReportType) {
  return type === "DEPARTMENT_DAILY" || type === "DEPARTMENT_WEEKLY";
}

function requestParams(request: ReportRequest) {
  const params = new URLSearchParams({
    type: request.type,
    periodStart: request.range[0].format("YYYY-MM-DD"),
    periodEnd: request.range[1].format("YYYY-MM-DD")
  });
  if (request.departmentId && request.departmentId !== COMPANY_SCOPE) {
    params.set("departmentId", request.departmentId);
  }
  return params;
}

function readinessSummary(readiness?: ReportReadiness | null) {
  if (!readiness) return "正在读取工作记录、项目和风险/阻塞数据";
  const stats = readiness.stats;
  if (!stats.workLogCount) return "当前周期暂无可用工作记录";
  return `${stats.workLogCount} 条工作记录，覆盖 ${stats.coveredMemberCount} 人，${stats.projectCount} 个项目`;
}

function readinessMetricItems(stats?: ReportReadinessStats | null) {
  return [
    { label: "来源记录", value: stats?.workLogCount ?? 0, suffix: "条" },
    { label: "覆盖成员", value: stats?.coveredMemberCount ?? 0, suffix: "人" },
    { label: "未填报", value: stats?.missingMemberCount ?? 0, suffix: "人" },
    { label: "风险/阻塞", value: (stats?.riskCount ?? 0) + (stats?.blockerCount ?? 0), suffix: "条" },
    { label: "关联项目", value: stats?.projectCount ?? 0, suffix: "个" },
    { label: "总工时", value: stats?.totalHours ?? 0, suffix: "h" }
  ];
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function numberValue(value: unknown) {
  const next = Number(value ?? 0);
  return Number.isFinite(next) ? next : 0;
}

function recordValue(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function normalizeReadinessStats(value: unknown): ReportReadinessStats {
  const stats = recordValue(value) ?? {};
  return {
    workLogCount: numberValue(stats.workLogCount),
    targetMemberCount: numberValue(stats.targetMemberCount),
    coveredMemberCount: numberValue(stats.coveredMemberCount),
    missingMemberCount: numberValue(stats.missingMemberCount),
    riskCount: numberValue(stats.riskCount),
    blockerCount: numberValue(stats.blockerCount),
    projectCount: numberValue(stats.projectCount),
    totalHours: numberValue(stats.totalHours)
  };
}

function normalizeReportContent(report: Report): NonNullable<Report["content"]> | null {
  const content = recordValue(report.content);
  if (!content) return null;
  const hours = recordValue(content.hours) ?? {};
  const byUser = Array.isArray(hours.byUser)
    ? hours.byUser.map((item, index) => {
        const record = recordValue(item) ?? {};
        return {
          userName: typeof record.userName === "string" && record.userName.trim() ? record.userName : `成员 ${index + 1}`,
          hours: numberValue(record.hours)
        };
      })
    : [];
  const evidenceRecord = recordValue(content.evidence);
  const sources = Array.isArray(evidenceRecord?.sources)
    ? evidenceRecord.sources.map((item, index) => {
        const source = recordValue(item) ?? {};
        return {
          id: typeof source.id === "string" ? source.id : `source-${index}`,
          date: typeof source.date === "string" ? source.date : "-",
          title: typeof source.title === "string" ? source.title : "未命名记录",
          userName: typeof source.userName === "string" ? source.userName : "未知成员",
          projectName: typeof source.projectName === "string" ? source.projectName : null,
          summary: typeof source.summary === "string" ? source.summary : "",
          risks: stringArray(source.risks),
          blockers: stringArray(source.blockers),
          hours: numberValue(source.hours)
        };
      })
    : [];
  return {
    completed: stringArray(content.completed),
    progress: stringArray(content.progress),
    risks: stringArray(content.risks),
    nextPlan: stringArray(content.nextPlan),
    summary: typeof content.summary === "string" && content.summary.trim() ? content.summary : "暂无摘要。",
    hours: {
      total: numberValue(hours.total),
      byUser
    },
    evidence: evidenceRecord
      ? {
          stats: normalizeReadinessStats(evidenceRecord.stats),
          sources
        }
      : undefined
  };
}

function reportMatchesRequest(report: Report, request: ReportRequest) {
  const requestDepartmentId = request.departmentId && request.departmentId !== COMPANY_SCOPE ? request.departmentId : null;
  const reportDepartmentId = report.departmentId ?? null;
  return (
    report.status !== "FAILED" &&
    report.type === request.type &&
    report.periodStart === request.range[0].format("YYYY-MM-DD") &&
    report.periodEnd === request.range[1].format("YYYY-MM-DD") &&
    reportDepartmentId === requestDepartmentId
  );
}

function requestMatchesRequest(left: ReportRequest, right: ReportRequest) {
  const leftDepartmentId = left.departmentId && left.departmentId !== COMPANY_SCOPE ? left.departmentId : null;
  const rightDepartmentId = right.departmentId && right.departmentId !== COMPANY_SCOPE ? right.departmentId : null;
  return (
    left.type === right.type &&
    left.range[0].format("YYYY-MM-DD") === right.range[0].format("YYYY-MM-DD") &&
    left.range[1].format("YYYY-MM-DD") === right.range[1].format("YYYY-MM-DD") &&
    leftDepartmentId === rightDepartmentId
  );
}

function statsFromReport(report: Report): ReportReadinessStats | null {
  const content = normalizeReportContent(report);
  if (content?.evidence?.stats) return content.evidence.stats;
  if (!content) return null;
  return {
    workLogCount: content.completed.length,
    targetMemberCount: content.hours.byUser.length,
    coveredMemberCount: content.hours.byUser.length,
    missingMemberCount: 0,
    riskCount: content.risks.length,
    blockerCount: 0,
    projectCount: 0,
    totalHours: content.hours.total
  };
}

function statusTag(report: Report) {
  if (report.status === "COMPLETED") return <Tag color="green">已生成</Tag>;
  if (report.status === "FAILED") return <Tag color="red">生成失败</Tag>;
  return <Tag color="processing">生成中</Tag>;
}

function reportErrorText(value?: string | null) {
  return humanizeApiError(value || "汇报生成失败，请调整时间范围后重试。");
}

function downloadReportWord(report: Report) {
  const content = normalizeReportContent(report);
  if (!content) return;
  const title = report.title || "周期汇报";
  const period = periodText(report.periodStart, report.periodEnd);
  const evidence = content.evidence;
  const hoursRows = content.hours.byUser
    .map((item) => `<tr><td>${escapeHtml(item.userName)}</td><td>${item.hours}h</td></tr>`)
    .join("");
  const sourceRows = evidence?.sources
    ?.map((item) => `<tr><td>${escapeHtml(item.date)}</td><td>${escapeHtml(item.userName)}</td><td>${escapeHtml(item.projectName ?? "未关联")}</td><td>${escapeHtml(item.title)}</td></tr>`)
    .join("");
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: "Microsoft YaHei", Arial, sans-serif; color: #424242; line-height: 1.7; }
    h1 { color: #1A1A1A; font-size: 24px; margin: 0 0 8px; }
    h2 { color: #1A1A1A; font-size: 16px; margin: 24px 0 8px; border-bottom: 1px solid #E6E6E6; padding-bottom: 6px; }
    .meta, .note { color: #737373; margin-bottom: 20px; }
    table { border-collapse: collapse; width: 100%; margin-top: 8px; }
    th, td { border: 1px solid #E6E6E6; padding: 8px 10px; text-align: left; vertical-align: top; }
    th { background: #F6F6F6; color: #737373; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">汇报周期：${escapeHtml(period)} · 生成时间：${dateTimeText(report.createdAt)}</div>
  ${evidence ? `<div class="note">基于 ${evidence.stats.workLogCount} 条工作记录、${evidence.stats.coveredMemberCount} 名成员、${evidence.stats.projectCount} 个项目生成。请结合实际业务确认。</div>` : ""}
  <h2>汇报摘要</h2>
  <p>${escapeHtml(content.summary)}</p>
  <h2>关键进展</h2>
  ${listHtml([...content.completed, ...content.progress].slice(0, 12))}
  <h2>风险与阻塞</h2>
  ${listHtml(content.risks)}
  <h2>下一步动作</h2>
  ${listHtml(content.nextPlan)}
  <h2>工时统计</h2>
  <p>合计：${content.hours.total}h</p>
  <table>
    <thead><tr><th>成员</th><th>工时</th></tr></thead>
    <tbody>${hoursRows || '<tr><td colspan="2">暂无</td></tr>'}</tbody>
  </table>
  <h2>来源记录依据</h2>
  <table>
    <thead><tr><th>日期</th><th>成员</th><th>项目</th><th>标题</th></tr></thead>
    <tbody>${sourceRows || '<tr><td colspan="4">暂无来源记录</td></tr>'}</tbody>
  </table>
</body>
</html>`;
  const blob = new Blob(["\ufeff", html], { type: "application/msword;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${title.replace(/[\\/:*?"<>|]/g, "_")}.doc`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function copyText(label: string, value?: string) {
  if (!value?.trim()) {
    message.warning(`${label}暂无可复制内容`);
    return;
  }
  await navigator.clipboard.writeText(value.trim());
  message.success(`${label}已复制`);
}

export default function ReportsPage() {
  const [form] = Form.useForm<ReportForm>();
  const queryClient = useQueryClient();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [generateError, setGenerateError] = useState<Error | null>(null);
  const canCompanyScope = Boolean(user?.roles.includes("COMPANY_ADMIN") || user?.roles.includes("SUPER_ADMIN"));
  const canDepartmentReport = Boolean(canCompanyScope || user?.roles.includes("DEPARTMENT_MANAGER"));
  const defaultDepartmentId = canCompanyScope ? COMPANY_SCOPE : user?.departmentId ?? undefined;
  const ranges = useMemo(() => quickRanges(), []);

  const org = useQuery({
    queryKey: ["org"],
    queryFn: () => apiFetch<OrgResponse>("/org")
  });

  const reports = useQuery({
    queryKey: ["reports"],
    queryFn: () => apiFetch<Report[]>("/reports"),
    refetchInterval: 10000
  });
  const visibleReports = useMemo(() => (reports.data ?? []).slice(0, 50), [reports.data]);
  const hiddenReportCount = Math.max((reports.data?.length ?? 0) - visibleReports.length, 0);
  const selectedContent = selectedReport ? normalizeReportContent(selectedReport) : null;

  useEffect(() => {
    if (!selectedReport || !reports.data?.length) return;
    const latest = reports.data.find((report) => report.id === selectedReport.id);
    if (!latest) return;
    if (latest === selectedReport) return;
    setSelectedReport(latest);
  }, [reports.data, selectedReport]);

  const reportType = Form.useWatch("type", form) ?? "PERSONAL_DAILY";
  const range = Form.useWatch("range", form) ?? ranges.today;
  const departmentId = Form.useWatch("departmentId", form) ?? defaultDepartmentId;
  const periodTooLong = rangeDays(range) > MAX_REPORT_PERIOD_DAYS;
  const activeRequest: ReportRequest = { type: reportType, range, departmentId: isDepartmentReport(reportType) ? departmentId : undefined };
  const findExistingReport = (request: ReportRequest) => (reports.data ?? []).find((report) => reportMatchesRequest(report, request));
  const activeExistingReport = findExistingReport(activeRequest);

  const readiness = useQuery({
    queryKey: ["report-readiness", reportType, range?.[0]?.format("YYYY-MM-DD"), range?.[1]?.format("YYYY-MM-DD"), departmentId],
    queryFn: () => apiFetch<ReportReadiness>(`/reports/readiness?${requestParams(activeRequest).toString()}`),
    enabled: Boolean(reportType && range?.[0] && range?.[1] && !periodTooLong && (!isDepartmentReport(reportType) || Boolean(departmentId))),
    staleTime: 15000
  });

  const recommendations = useMemo<Recommendation[]>(() => {
    if (canDepartmentReport) {
      return [
        {
          id: "today-team",
          title: canCompanyScope ? "今日团队简报" : "今日部门简报",
          kind: "团队日报",
          copy: "适合晨会、晚会快速同步。",
          type: "DEPARTMENT_DAILY",
          range: ranges.today,
          departmentId: defaultDepartmentId
        },
        {
          id: "this-week-team",
          title: canCompanyScope ? "本周团队周报" : "本周部门周报",
          kind: "团队周报",
          copy: "适合周会前整理进展、风险和工时。",
          type: "DEPARTMENT_WEEKLY",
          range: ranges.thisWeek,
          departmentId: defaultDepartmentId
        },
        {
          id: "last-week-team",
          title: canCompanyScope ? "上周团队复盘" : "上周部门复盘",
          kind: "复盘周报",
          copy: "适合复盘问题和安排下周计划。",
          type: "DEPARTMENT_WEEKLY",
          range: ranges.lastWeek,
          departmentId: defaultDepartmentId
        }
      ];
    }
    return [
      {
        id: "today-personal",
        title: "我的今日汇报",
        kind: "个人日报",
        copy: "把今天的日报整理成可转发摘要。",
        type: "PERSONAL_DAILY",
        range: ranges.today
      },
      {
        id: "this-week-personal",
        title: "我的本周汇报",
        kind: "个人周报",
        copy: "汇总本周完成、风险/阻塞和下一步。",
        type: "PERSONAL_WEEKLY",
        range: ranges.thisWeek
      }
    ];
  }, [canCompanyScope, canDepartmentReport, defaultDepartmentId, ranges.lastWeek, ranges.thisWeek, ranges.today]);

  const recommendationReadiness = useQueries({
    queries: recommendations.map((item) => ({
      queryKey: ["report-recommendation-readiness", item.id, item.range[0].format("YYYY-MM-DD"), item.range[1].format("YYYY-MM-DD"), item.departmentId],
      queryFn: () => apiFetch<ReportReadiness>(`/reports/readiness?${requestParams(item).toString()}`),
      staleTime: 30000
    }))
  });

  const generate = useMutation({
    mutationFn: (values: ReportRequest) =>
      apiFetch<Report>("/reports/generate", {
        method: "POST",
        body: JSON.stringify({
          type: values.type,
          periodStart: values.range[0].format("YYYY-MM-DD"),
          periodEnd: values.range[1].format("YYYY-MM-DD"),
          departmentId: values.departmentId === COMPANY_SCOPE ? undefined : values.departmentId
        })
      }),
    onMutate: () => {
      setGenerateError(null);
    },
    onSuccess: (report) => {
      setSelectedReport(report);
      message.success(report.status === "COMPLETED" ? "已打开已有汇报" : "已提交汇报生成任务");
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      queryClient.invalidateQueries({ queryKey: ["report-readiness"] });
    },
    onError: (error) => {
      const nextError = error instanceof Error ? error : new Error("汇报生成失败，请调整后重试。");
      setGenerateError(nextError);
      message.error(nextError.message);
    }
  });

  const departmentOptions = [
    ...(canCompanyScope ? [{ value: COMPANY_SCOPE, label: "全公司" }] : []),
    ...(org.data?.departments.map((item) => ({ value: item.id, label: item.name })) ?? [])
  ];
  const visibleTypeOptions = reportTypeOptions.filter((item) => canDepartmentReport || item.value.startsWith("PERSONAL"));
  const activeStats = readiness.data?.stats;
  const hasPendingReport = reports.data?.some((item) => item.status === "PENDING") ?? false;
  const activeRangeText = range?.[0] && range?.[1] ? periodText(range[0], range[1]) : "未选择时间";
  const activeScopeLabel = isDepartmentReport(reportType)
    ? departmentId === COMPANY_SCOPE || !departmentId
      ? "全公司"
      : org.data?.departments.find((item) => item.id === departmentId)?.name ?? "已选部门"
    : user?.name ?? "我";
  const activeRiskCount = (activeStats?.riskCount ?? 0) + (activeStats?.blockerCount ?? 0);
  const readinessTitle = periodTooLong
    ? "时间范围过长"
    : activeExistingReport
      ? activeExistingReport.status === "PENDING"
        ? "这个范围已有汇报正在生成"
        : "这个范围已有汇报"
      : readiness.isError
        ? "检查失败，可重试"
      : readiness.isFetching
        ? "正在检查可用数据"
      : readiness.data?.canGenerate
          ? "数据足够，可以生成"
          : readiness.data
            ? "数据不足，建议调整范围"
            : "先确认汇报范围";
  const readinessDescription = periodTooLong
    ? `单次最多分析 ${MAX_REPORT_PERIOD_DAYS} 天，请缩短时间范围。`
    : activeExistingReport
      ? activeExistingReport.status === "PENDING"
        ? "系统正在整理这份汇报，完成后会自动进入历史汇报。"
        : "同一类型、范围和部门已经生成过汇报，可以直接查看。"
      : readiness.isError
        ? readiness.error instanceof Error ? readiness.error.message : "数据检查失败，请重试。"
      : readiness.data?.canGenerate
        ? `${readiness.data.stats.workLogCount} 条工作记录，覆盖 ${readiness.data.stats.coveredMemberCount} 人，${activeRiskCount} 条风险/阻塞。`
        : "当前范围内没有足够工作记录，无法生成有效汇报。";
  const readinessTone = periodTooLong || readiness.isError
    ? "error"
    : activeExistingReport
      ? "existing"
      : readiness.isFetching
        ? "checking"
        : readiness.data?.canGenerate
          ? "ready"
          : readiness.data
            ? "insufficient"
            : "idle";
  const canGenerateReport = Boolean(readiness.data?.canGenerate && !readiness.isFetching && !readiness.isError && !periodTooLong && !activeExistingReport && !generate.isPending);

  const applyQuickRange = (value: [Dayjs, Dayjs]) => {
    form.setFieldsValue({ range: value });
  };

  const applyRecommendation = (item: Recommendation) => {
    form.setFieldsValue({ type: item.type, range: item.range, departmentId: item.departmentId });
    setGenerateError(null);
    message.success("已选择汇报，请确认统计范围和数据覆盖。");
  };

  const submitForm = (values: ReportForm) => {
    if (rangeDays(values.range) > MAX_REPORT_PERIOD_DAYS) {
      message.warning("汇报周期不能超过 31 天");
      return;
    }
    if (isDepartmentReport(values.type) && !values.departmentId) {
      message.warning("请选择部门或全公司");
      return;
    }
    if (readiness.data && !readiness.data.canGenerate) {
      message.warning(readiness.data.emptyReason ?? "当前周期暂无可用工作记录");
      return;
    }
    const request = { ...values, departmentId: isDepartmentReport(values.type) ? values.departmentId : undefined };
    const existingReport = findExistingReport(request);
    if (existingReport) {
      setSelectedReport(existingReport);
      message.info(existingReport.status === "PENDING" ? "同范围汇报正在生成，已打开已有记录。" : "同范围已有汇报，已打开。");
      return;
    }
    generate.mutate(request);
  };

  const retryReport = (report: Report) => {
    generate.mutate({
      type: report.type,
      range: [dayjs(report.periodStart), dayjs(report.periodEnd)],
      departmentId: report.departmentId ?? COMPANY_SCOPE
    });
  };

  const copySummary = selectedContent?.summary;
  const copyRisks = selectedContent?.risks.join("\n");
  const copyNextPlan = selectedContent?.nextPlan.join("\n");

  return (
    <div className="page-stack report-workbench">
      <div className="page-header">
        <div>
          <Typography.Title level={3} className="page-title">
            周期汇报
          </Typography.Title>
          <Typography.Text className="page-subtitle">选择要生成的汇报，确认统计范围和数据覆盖后生成可复用的管理内容。</Typography.Text>
        </div>
        <Button icon={<RotateCw size={16} />} onClick={() => reports.refetch()} loading={reports.isFetching}>
          刷新列表
        </Button>
      </div>

      <section className="surface-panel report-guide-panel">
        <div className="report-guide-head">
          <div>
            <div className="section-title">汇报生成向导</div>
            <div className="section-subtitle">选择常用汇报类型，也可以手动调整类型、周期和范围。</div>
          </div>
        </div>

        <div className="report-guide-steps">
          <section className="report-guide-step">
            <div className="report-step-head">
              <span>步骤 1</span>
              <div>
                <strong>选择要生成的汇报</strong>
                <p>推荐卡只会更新下面的统计范围和数据检查，不会直接生成汇报。</p>
              </div>
            </div>

            <div className="report-scenario-grid">
              {recommendations.map((item, index) => {
                const current = recommendationReadiness[index];
                const data = current.data;
                const existingReport = findExistingReport(item);
                const selected = requestMatchesRequest(item, activeRequest);
                const statusText = existingReport
                  ? existingReport.status === "PENDING"
                    ? "生成中"
                    : "已有汇报"
                  : current.isLoading
                    ? "读取中"
                    : data?.canGenerate
                      ? readinessSummary(data)
                      : data?.emptyReason ?? "暂无可用数据";
                return (
                  <article
                    key={item.id}
                    className={`report-scenario-card${selected ? " is-selected" : ""}`}
                  >
                    <div className="report-scenario-top">
                      <Tag color={selected ? "blue" : "default"}>{item.kind}</Tag>
                    </div>
                    <h3>{item.title}</h3>
                    <p>{item.copy}</p>
                    <div className="report-scenario-meta">
                      <span>{periodText(item.range[0], item.range[1])}</span>
                      <span>{item.departmentId === COMPANY_SCOPE ? "全公司" : item.departmentId ? org.data?.departments.find((department) => department.id === item.departmentId)?.name ?? "已选部门" : user?.name ?? "我"}</span>
                    </div>
                    <div className="report-scenario-coverage">{statusText}</div>
                    <div className="report-scenario-actions">
                      <Button size="small" onClick={() => applyRecommendation(item)}>
                        {selected ? "已选择" : "选择"}
                      </Button>
                      {existingReport ? (
                        <Button size="small" type="link" onClick={() => setSelectedReport(existingReport)}>
                          查看已有
                        </Button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="report-guide-step">
            <div className="report-step-head">
              <span>步骤 2</span>
              <div>
                <strong>确认统计范围</strong>
                <p>修改任意字段后，系统会自动重新检查可用数据。</p>
              </div>
            </div>
            <Form
              form={form}
              layout="vertical"
              className="report-scope-form"
              initialValues={{
                type: canDepartmentReport ? "DEPARTMENT_DAILY" : "PERSONAL_DAILY",
                range: ranges.today,
                departmentId: defaultDepartmentId
              }}
              onFinish={submitForm}
            >
              <Form.Item name="type" label="汇报类型" rules={[{ required: true }]}>
                <Select options={visibleTypeOptions} />
              </Form.Item>
              <Form.Item name="range" label="时间范围" rules={[{ required: true }]}>
                <DatePicker.RangePicker className="w-full" />
              </Form.Item>
              {isDepartmentReport(reportType) ? (
                <Form.Item name="departmentId" label="汇报范围" rules={[{ required: true, message: "请选择部门或全公司" }]}>
                  <Select
                    disabled={!canCompanyScope && Boolean(user?.departmentId)}
                    placeholder="选择部门或全公司"
                    loading={org.isFetching}
                    options={departmentOptions}
                  />
                </Form.Item>
              ) : (
                <Form.Item label="汇报范围">
                  <div className="report-scope-static">{user?.name ?? "我"}</div>
                </Form.Item>
              )}
            </Form>
            <div className="report-quick-ranges">
              <span>快捷范围</span>
              <Button size="small" onClick={() => applyQuickRange(ranges.today)}>今天</Button>
              <Button size="small" onClick={() => applyQuickRange(ranges.thisWeek)}>本周</Button>
              <Button size="small" onClick={() => applyQuickRange(ranges.lastWeek)}>上周</Button>
              <Button size="small" onClick={() => applyQuickRange(ranges.thisMonth)}>本月</Button>
            </div>
            <div className="report-current-summary" aria-label="当前选择">
              <span>{reportTypeLabels[reportType]}</span>
              <span>{activeRangeText}</span>
              <span>{activeScopeLabel}</span>
            </div>
          </section>

          <section className="report-guide-step">
            <div className="report-step-head">
              <span>步骤 3</span>
              <div>
                <strong>检查可用数据</strong>
                <p>生成前先确认工作记录、成员、项目、风险/阻塞和工时覆盖。</p>
              </div>
            </div>

            <div className={`report-readiness-card is-${readinessTone}`}>
              <div className="report-readiness-head">
                <div>
                  <strong>{readinessTitle}</strong>
                  <p>{readinessDescription}</p>
                </div>
                {readiness.isFetching ? <Loader2 className="report-spin" size={20} /> : readinessTone === "insufficient" || readinessTone === "error" ? <AlertTriangle size={20} /> : <FileText size={20} />}
              </div>
              <div className="report-readiness-grid">
                {readinessMetricItems(activeStats).map((item) => (
                  <div key={item.label} className="report-readiness-item">
                    <span>{item.label}</span>
                    <strong>{item.value}{item.suffix}</strong>
                  </div>
                ))}
              </div>
              <div className="report-guide-actions">
                {activeExistingReport ? (
                  <Button icon={<FileText size={16} />} onClick={() => setSelectedReport(activeExistingReport)}>
                    查看已有汇报
                  </Button>
                ) : (
                  <Button type="primary" icon={<FileText size={16} />} loading={generate.isPending} disabled={!canGenerateReport} onClick={() => form.submit()}>
                    生成这份汇报
                  </Button>
                )}
                {readiness.data && !readiness.data.canGenerate ? (
                  <>
                    <Button onClick={() => readiness.refetch()} loading={readiness.isFetching}>重新检查</Button>
                    <Button onClick={() => applyQuickRange(ranges.thisWeek)}>调整时间范围</Button>
                    <Button onClick={() => router.push("/calendar")}>查看缺失人员</Button>
                  </>
                ) : null}
                {(readiness.isError || (!readiness.data || readiness.data.canGenerate) || periodTooLong) && !activeExistingReport ? (
                  <Button onClick={() => readiness.refetch()} loading={readiness.isFetching}>重新检查</Button>
                ) : null}
              </div>
            </div>
          </section>

          {generate.isPending || hasPendingReport ? (
            <section className="report-guide-step">
              <div className="report-step-head">
                <span>步骤 4</span>
                <div>
                  <strong>生成状态</strong>
                  <p>汇报任务会在本页自动刷新，完成后进入已生成汇报。</p>
                </div>
              </div>
              <div className="report-generate-status">
                <Loader2 className="report-spin" size={18} />
                <div>
                  <strong>{generate.isPending ? "正在生成汇报" : "还有汇报在生成"}</strong>
                  <p>通常需要几十秒。你可以留在本页等待，也可以稍后回来查看。{reports.isFetching ? "正在自动刷新状态。" : "列表会定时刷新。"}</p>
                </div>
              </div>
            </section>
          ) : null}

          {generateError ? (
            <section className="report-guide-step">
              <div className="report-step-head">
                <span>失败</span>
                <div>
                  <strong>汇报生成失败</strong>
                  <p>错误原因已保留在当前向导内，可以调整范围后重试。</p>
                </div>
              </div>
              <div className="report-generate-error">
                <AlertTriangle size={18} />
                <div>
                  <strong>{generateError.message}</strong>
                  <div className="report-guide-actions">
                    <Button onClick={() => form.submit()} loading={generate.isPending}>重试</Button>
                    <Button onClick={() => readiness.refetch()} loading={readiness.isFetching}>重新检查</Button>
                  </div>
                </div>
              </div>
            </section>
          ) : null}
        </div>
      </section>

      <section className="history-section">
        <div className="history-section-head">
          <div>
            <div className="section-title">已生成汇报</div>
            <div className="section-subtitle">点击汇报查看摘要、依据、风险/阻塞和复用动作。{hiddenReportCount ? `已限制显示最近 50 条，另有 ${hiddenReportCount} 条历史记录未展开。` : ""}</div>
          </div>
        </div>

        <div className="report-history-list">
          {visibleReports.length ? visibleReports.map((report) => {
            const stats = statsFromReport(report);
            const content = normalizeReportContent(report);
            return (
              <article key={report.id} className="report-history-item">
                <div className="report-history-main">
                  <div className="report-history-title">
                    <FileText size={17} />
                    <button type="button" onClick={() => setSelectedReport(report)}>{report.title}</button>
                    {statusTag(report)}
                  </div>
                  <div className="report-history-meta">
                    <span><CalendarDays size={14} />{periodText(report.periodStart, report.periodEnd)}</span>
                    <span><Users size={14} />{stats ? `${stats.coveredMemberCount} 人` : "等待生成"}</span>
                    <span><FileText size={14} />{stats ? `${stats.workLogCount} 条来源记录` : "来源整理中"}</span>
                    {stats ? <span><AlertTriangle size={14} />{stats.riskCount + stats.blockerCount} 条风险/阻塞</span> : null}
                  </div>
                  <p>{report.status === "FAILED" ? reportErrorText(report.error) : content?.summary ?? "正在生成汇报，系统会自动刷新状态。"}</p>
                </div>
                <div className="report-history-actions">
                  <Button onClick={() => setSelectedReport(report)}>查看</Button>
                  <Button icon={<ClipboardCopy size={15} />} disabled={!content} onClick={() => copyText("摘要", content?.summary)}>
                    复制
                  </Button>
                  <Button icon={<FileDown size={15} />} disabled={report.status !== "COMPLETED" || !content} onClick={() => downloadReportWord(report)}>
                    下载
                  </Button>
                  {report.status === "FAILED" ? <Button onClick={() => retryReport(report)}>重新生成</Button> : null}
                </div>
              </article>
            );
          }) : (
            <div className="surface-panel report-empty">
              <Empty description="暂无已生成汇报，先在汇报生成向导里生成一份" />
            </div>
          )}
        </div>
      </section>

      <Drawer
        title={selectedReport?.title ?? "汇报详情"}
        open={Boolean(selectedReport)}
        onClose={() => setSelectedReport(null)}
        width={720}
        destroyOnHidden
        extra={selectedContent ? (
          <Space>
            <Button icon={<ClipboardCopy size={15} />} onClick={() => copyText("摘要", copySummary)}>复制摘要</Button>
            <Button icon={<FileDown size={15} />} onClick={() => selectedReport && downloadReportWord(selectedReport)}>下载 Word</Button>
          </Space>
        ) : null}
      >
        {selectedReport ? (
          <div className="report-detail-stack">
            {selectedReport.status === "FAILED" ? (
              <Alert
                type="error"
                showIcon
                message="汇报生成失败"
                description={reportErrorText(selectedReport.error)}
                action={
                  <Space wrap>
                    <Button size="small" onClick={() => retryReport(selectedReport)}>重试</Button>
                    <Button size="small" onClick={() => form.setFieldsValue({ type: selectedReport.type, range: [dayjs(selectedReport.periodStart), dayjs(selectedReport.periodEnd)], departmentId: selectedReport.departmentId ?? COMPANY_SCOPE })}>调整时间范围</Button>
                    <Button size="small" onClick={() => router.push("/work-logs")}>去补充记录</Button>
                    <Button size="small" onClick={() => reports.refetch()}>刷新列表</Button>
                  </Space>
                }
              />
            ) : null}
            {selectedContent ? (
              <>
                <Alert
                  type="info"
                  showIcon
                  message="生成内容请结合实际业务确认"
                  description={
                    selectedContent.evidence
                      ? `基于 ${selectedContent.evidence.stats.workLogCount} 条工作记录、${selectedContent.evidence.stats.coveredMemberCount} 名成员、${selectedContent.evidence.stats.projectCount} 个项目生成。`
                      : "这份汇报基于已提交工作记录生成。"
                  }
                />

                <section className="report-detail-section">
                  <h3>汇报摘要</h3>
                  <p>{selectedContent.summary}</p>
                </section>

                <section className="report-detail-section">
                  <h3>关键进展</h3>
                  <ul>
                    {[...selectedContent.completed, ...selectedContent.progress].slice(0, 12).map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </section>

                <section className="report-detail-section">
                  <div className="report-detail-title-row">
                    <h3>风险与阻塞</h3>
                    <Button size="small" icon={<ClipboardCopy size={14} />} onClick={() => copyText("风险清单", copyRisks)}>复制风险清单</Button>
                  </div>
                  {selectedContent.risks.length ? (
                    <ul className="report-risk-list">
                      {selectedContent.risks.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  ) : (
                    <div className="report-muted-box">当前汇报未识别到明确风险或阻塞。</div>
                  )}
                </section>

                <section className="report-detail-section">
                  <div className="report-detail-title-row">
                    <h3>下一步动作</h3>
                    <Button size="small" icon={<ClipboardCopy size={14} />} onClick={() => copyText("下一步动作", copyNextPlan)}>复制下一步动作</Button>
                  </div>
                  <ul>
                    {selectedContent.nextPlan.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </section>

                <section className="report-detail-section">
                  <h3>工时统计</h3>
                  <div className="report-hours-summary">
                    <strong>{selectedContent.hours.total}h</strong>
                    <span>合计工时</span>
                  </div>
                  <Space wrap>
                    {selectedContent.hours.byUser.map((item) => <Tag key={item.userName}>{item.userName}: {item.hours}h</Tag>)}
                  </Space>
                </section>

                <section className="report-detail-section">
                  <h3>来源记录依据</h3>
                  {selectedContent.evidence?.sources.length ? (
                    <div className="report-source-list">
                      {selectedContent.evidence.sources.map((item) => (
                        <div key={item.id} className="report-source-item">
                          <div className="report-source-meta">
                            <Tag>{item.date}</Tag>
                            <span>{item.userName}</span>
                            {item.projectName ? <span>{item.projectName}</span> : null}
                          </div>
                          <strong>{item.title}</strong>
                          <p>{item.summary}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="report-muted-box">旧汇报暂无来源摘要。新生成汇报会自动记录来源依据。</div>
                  )}
                </section>
              </>
            ) : selectedReport.status === "PENDING" ? (
              <Alert
                type="info"
                showIcon
                icon={<Loader2 className="report-spin" size={18} />}
                message="正在生成"
                description="系统正在生成汇报并自动刷新列表，通常需要几十秒。"
                action={<Button size="small" onClick={() => reports.refetch()} loading={reports.isFetching}>刷新状态</Button>}
              />
            ) : null}
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
