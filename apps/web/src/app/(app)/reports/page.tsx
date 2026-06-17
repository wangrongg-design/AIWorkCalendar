"use client";

import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, DatePicker, Drawer, Empty, Form, Select, Space, Tag, Typography, message } from "antd";
import dayjs, { Dayjs } from "dayjs";
import { AlertTriangle, CalendarDays, CheckCircle2, ClipboardCopy, FileDown, FileText, Loader2, RotateCw, Sparkles, Users, WandSparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
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
  if (!readiness) return "正在读取日报、项目和风险/阻塞数据";
  const stats = readiness.stats;
  if (!stats.workLogCount) return "当前周期暂无可用日报";
  return `${stats.workLogCount} 条日报/计划，覆盖 ${stats.coveredMemberCount} 人，${stats.projectCount} 个项目`;
}

function readinessMetricItems(stats?: ReportReadinessStats | null) {
  return [
    { label: "日报/计划", value: stats?.workLogCount ?? 0, suffix: "条" },
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
  if (report.status === "COMPLETED") return <Tag color="green">已完成</Tag>;
  if (report.status === "FAILED") return <Tag color="red">失败</Tag>;
  return <Tag color="processing">生成中</Tag>;
}

function reportErrorText(value?: string | null) {
  return humanizeApiError(value || "报告生成失败，请调整时间范围后重试。");
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
  <div class="meta">报告周期：${escapeHtml(period)} · 生成时间：${dateTimeText(report.createdAt)}</div>
  ${evidence ? `<div class="note">基于 ${evidence.stats.workLogCount} 条日报/计划、${evidence.stats.coveredMemberCount} 名成员、${evidence.stats.projectCount} 个项目生成。请结合实际业务确认。</div>` : ""}
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
  <h2>来源日报/计划依据</h2>
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

  const reportType = Form.useWatch("type", form) ?? "PERSONAL_DAILY";
  const range = Form.useWatch("range", form) ?? ranges.today;
  const departmentId = Form.useWatch("departmentId", form) ?? defaultDepartmentId;
  const periodTooLong = rangeDays(range) > MAX_REPORT_PERIOD_DAYS;
  const activeRequest: ReportRequest = { type: reportType, range, departmentId };
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
          title: canCompanyScope ? "生成今日团队简报" : "生成今日部门简报",
          kind: "团队日报",
          copy: "适合晨会、晚会快速同步。",
          type: "DEPARTMENT_DAILY",
          range: ranges.today,
          departmentId: defaultDepartmentId
        },
        {
          id: "this-week-team",
          title: canCompanyScope ? "生成本周团队周报" : "生成本周部门周报",
          kind: "团队周报",
          copy: "汇总本周进展、风险/阻塞和工时。",
          type: "DEPARTMENT_WEEKLY",
          range: ranges.thisWeek,
          departmentId: defaultDepartmentId
        },
        {
          id: "last-week-team",
          title: canCompanyScope ? "生成上周团队复盘" : "生成上周部门复盘",
          kind: "复盘周报",
          copy: "用于周会复盘和下周计划。",
          type: "DEPARTMENT_WEEKLY",
          range: ranges.lastWeek,
          departmentId: defaultDepartmentId
        }
      ];
    }
    return [
      {
        id: "today-personal",
        title: "生成我的今日汇报",
        kind: "个人日报",
        copy: "把今天的日报整理成可转发摘要。",
        type: "PERSONAL_DAILY",
        range: ranges.today
      },
      {
        id: "this-week-personal",
        title: "生成我的本周汇报",
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
    onSuccess: (report) => {
      setSelectedReport(report);
      message.success(report.status === "COMPLETED" ? "已打开已有汇报" : "已提交汇报生成任务");
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      queryClient.invalidateQueries({ queryKey: ["report-readiness"] });
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : "报告生成失败，请调整后重试。");
    }
  });

  const departmentOptions = [
    ...(canCompanyScope ? [{ value: COMPANY_SCOPE, label: "全公司" }] : []),
    ...(org.data?.departments.map((item) => ({ value: item.id, label: item.name })) ?? [])
  ];
  const visibleTypeOptions = reportTypeOptions.filter((item) => canDepartmentReport || item.value.startsWith("PERSONAL"));
  const activeStats = readiness.data?.stats;
  const hasPendingReport = reports.data?.some((item) => item.status === "PENDING") ?? false;

  const applyQuickRange = (value: [Dayjs, Dayjs]) => {
    form.setFieldsValue({ range: value });
  };

  const applyRecommendation = (item: Recommendation) => {
    form.setFieldsValue({ type: item.type, range: item.range, departmentId: item.departmentId });
    if (!rangeDays(item.range) || rangeDays(item.range) > MAX_REPORT_PERIOD_DAYS) return;
    const existingReport = findExistingReport(item);
    if (existingReport) {
      setSelectedReport(existingReport);
      message.info(existingReport.status === "PENDING" ? "同范围汇报正在生成，已打开已有记录。" : "同范围已有汇报，已打开。");
      return;
    }
    generate.mutate(item);
  };

  const submitForm = (values: ReportForm) => {
    if (rangeDays(values.range) > MAX_REPORT_PERIOD_DAYS) {
      message.warning("报告周期不能超过 31 天");
      return;
    }
    if (isDepartmentReport(values.type) && !values.departmentId) {
      message.warning("请选择部门或全公司");
      return;
    }
    if (readiness.data && !readiness.data.canGenerate) {
      message.warning(readiness.data.emptyReason ?? "当前周期暂无可用日报");
      return;
    }
    const existingReport = findExistingReport(values);
    if (existingReport) {
      setSelectedReport(existingReport);
      message.info(existingReport.status === "PENDING" ? "同范围汇报正在生成，已打开已有记录。" : "同范围已有汇报，已打开。");
      return;
    }
    generate.mutate(values);
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
          <Typography.Text className="page-subtitle">先确认数据是否足够，再生成可查看、可复制、可下载的管理汇报。</Typography.Text>
        </div>
        <Button icon={<RotateCw size={16} />} onClick={() => reports.refetch()} loading={reports.isFetching}>
          刷新列表
        </Button>
      </div>

      <section className="report-recommend-section">
        <div className="section-head">
          <div>
            <div className="section-title">推荐生成</div>
            <div className="section-subtitle">按你的角色预设常用报告，不需要先理解参数。</div>
          </div>
        </div>
        <div className="report-recommend-grid">
          {recommendations.map((item, index) => {
            const current = recommendationReadiness[index];
            const data = current.data;
            const existingReport = findExistingReport(item);
            return (
              <article key={item.id} className="report-recommend-card">
                <div className="report-card-top">
                  <Tag color="blue">{item.kind}</Tag>
                  <span>{periodText(item.range[0], item.range[1])}</span>
                </div>
                <h3>{item.title}</h3>
                <p>{item.copy}</p>
                <div className="report-card-coverage">{current.isLoading ? "正在读取数据准备度" : readinessSummary(data)}</div>
                <div className="report-card-metrics">
                  {readinessMetricItems(data?.stats).map((metric) => (
                    <span key={metric.label}>
                      <strong>{metric.value}{metric.suffix}</strong>
                      {metric.label}
                    </span>
                  ))}
                </div>
                <Button
                  type={index === 0 ? "primary" : "default"}
                  icon={existingReport ? <FileText size={16} /> : <WandSparkles size={16} />}
                  loading={!existingReport && generate.isPending && generate.variables?.type === item.type}
                  disabled={!existingReport && (current.isLoading || !data?.canGenerate || generate.isPending)}
                  onClick={() => (existingReport ? setSelectedReport(existingReport) : applyRecommendation(item))}
                >
                  {existingReport ? "查看已有汇报" : "生成"}
                </Button>
              </article>
            );
          })}
        </div>
      </section>

      <section className="surface-panel report-builder-panel">
        <div className="report-builder-head">
          <div>
            <div className="section-title">生成前检查</div>
            <div className="section-subtitle">系统会先读取本周期日报、人员、项目和风险/阻塞，再允许生成报告。</div>
          </div>
          <Space wrap>
            <Button onClick={() => applyQuickRange(ranges.today)}>今天</Button>
            <Button onClick={() => applyQuickRange(ranges.thisWeek)}>本周</Button>
            <Button onClick={() => applyQuickRange(ranges.lastWeek)}>上周</Button>
            <Button onClick={() => applyQuickRange(ranges.thisMonth)}>本月</Button>
          </Space>
        </div>

        <Form
          form={form}
          layout="vertical"
          className="report-builder-form"
          initialValues={{
            type: canDepartmentReport ? "DEPARTMENT_DAILY" : "PERSONAL_DAILY",
            range: ranges.today,
            departmentId: defaultDepartmentId
          }}
          onFinish={submitForm}
        >
          <Form.Item name="type" label="报告类型" rules={[{ required: true }]}>
            <Select options={visibleTypeOptions} />
          </Form.Item>
          <Form.Item name="range" label="时间范围" rules={[{ required: true }]}>
            <DatePicker.RangePicker className="w-full" />
          </Form.Item>
          {isDepartmentReport(reportType) ? (
            <Form.Item name="departmentId" label="报告范围" rules={[{ required: true, message: "请选择部门或全公司" }]}>
              <Select
                disabled={!canCompanyScope && Boolean(user?.departmentId)}
                placeholder="选择部门或全公司"
                loading={org.isFetching}
                options={departmentOptions}
              />
            </Form.Item>
          ) : null}
          <Form.Item label=" ">
            <Button
              type="primary"
              htmlType={activeExistingReport ? "button" : "submit"}
              icon={activeExistingReport ? <FileText size={16} /> : <Sparkles size={16} />}
              loading={!activeExistingReport && generate.isPending}
              disabled={!activeExistingReport && (generate.isPending || periodTooLong || readiness.isFetching || !readiness.data?.canGenerate)}
              onClick={activeExistingReport ? () => setSelectedReport(activeExistingReport) : undefined}
              block
            >
              {activeExistingReport ? "查看已有汇报" : "生成汇报"}
            </Button>
          </Form.Item>
        </Form>

        {periodTooLong ? (
          <Alert className="mt-3" type="warning" showIcon message="时间范围不能超过 31 天" description="请使用快捷范围，或缩短起止日期后再生成。" />
        ) : null}

        <div className="report-readiness-grid">
          {[
            { label: "日报/计划", value: activeStats?.workLogCount ?? 0, suffix: "条" },
            { label: "覆盖成员", value: activeStats?.coveredMemberCount ?? 0, suffix: "人" },
            { label: "未填报", value: activeStats?.missingMemberCount ?? 0, suffix: "人" },
            { label: "风险/阻塞", value: (activeStats?.riskCount ?? 0) + (activeStats?.blockerCount ?? 0), suffix: "条" },
            { label: "关联项目", value: activeStats?.projectCount ?? 0, suffix: "个" },
            { label: "总工时", value: activeStats?.totalHours ?? 0, suffix: "h" }
          ].map((item) => (
            <div key={item.label} className="report-readiness-item">
              <span>{item.label}</span>
              <strong>{item.value}{item.suffix}</strong>
            </div>
          ))}
        </div>

        {readiness.data && !readiness.data.canGenerate ? (
          <Alert
            className="mt-3"
            type="warning"
            showIcon
            message={readiness.data.emptyReason}
            description="补充日报后再生成，报告会更可信。"
            action={
              <Space wrap>
                <Button size="small" onClick={() => router.push("/work-logs")}>去填报记录</Button>
                <Button size="small" onClick={() => router.push("/calendar")}>看工作日历</Button>
              </Space>
            }
          />
        ) : null}

        {generate.isPending || hasPendingReport ? (
          <Alert
            className="mt-3"
            type="info"
            showIcon
            icon={<Loader2 className="report-spin" size={18} />}
            message={generate.isPending ? "正在生成" : "自动刷新中"}
            description="正在整理日报、项目、风险/阻塞和工时，通常需要几十秒。你可以留在本页等待，也可以稍后回来查看。"
          />
        ) : null}
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
                    <span><Users size={14} />{stats ? `${stats.coveredMemberCount} 人 · ${stats.workLogCount} 条记录` : "等待生成"}</span>
                    {stats ? <span><AlertTriangle size={14} />{stats.riskCount + stats.blockerCount} 条风险/阻塞</span> : null}
                  </div>
                  <p>{report.status === "FAILED" ? reportErrorText(report.error) : content?.summary ?? "正在生成报告，系统会自动刷新状态。"}</p>
                </div>
                <div className="report-history-actions">
                  <Button onClick={() => setSelectedReport(report)}>查看详情</Button>
                  <Button icon={<FileDown size={15} />} disabled={report.status !== "COMPLETED" || !content} onClick={() => downloadReportWord(report)}>
                    下载 Word
                  </Button>
                  {report.status === "FAILED" ? <Button onClick={() => retryReport(report)}>重试</Button> : null}
                </div>
              </article>
            );
          }) : (
            <div className="surface-panel report-empty">
              <Empty description="暂无已生成汇报，先从推荐卡片生成一份" />
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
                message="报告生成失败"
                description={reportErrorText(selectedReport.error)}
                action={
                  <Space wrap>
                    <Button size="small" onClick={() => retryReport(selectedReport)}>重试</Button>
                    <Button size="small" onClick={() => form.setFieldsValue({ type: selectedReport.type, range: [dayjs(selectedReport.periodStart), dayjs(selectedReport.periodEnd)], departmentId: selectedReport.departmentId ?? COMPANY_SCOPE })}>调整时间范围</Button>
                    <Button size="small" onClick={() => router.push("/work-logs")}>去补充日报</Button>
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
                      ? `基于 ${selectedContent.evidence.stats.workLogCount} 条日报/计划、${selectedContent.evidence.stats.coveredMemberCount} 名成员、${selectedContent.evidence.stats.projectCount} 个项目生成。`
                      : "这份报告基于已提交日报生成。"
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
                    <div className="report-muted-box">当前报告未识别到明确风险或阻塞。</div>
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
                  <h3>来源日报/计划依据</h3>
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
                    <div className="report-muted-box">旧报告暂无来源摘要。新生成报告会自动记录来源依据。</div>
                  )}
                </section>
              </>
            ) : selectedReport.status === "PENDING" ? (
              <Alert type="info" showIcon icon={<Loader2 className="report-spin" size={18} />} message="正在生成" description="系统正在生成报告并自动刷新列表，通常需要几十秒。" />
            ) : null}
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
