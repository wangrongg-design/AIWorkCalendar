"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, DatePicker, Empty, Form, Select, Space, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { FileDown, RotateCw, WandSparkles } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { Department, Report, ReportType } from "@/lib/types";

type OrgResponse = {
  departments: Department[];
};

const reportTypeOptions: Array<{ value: ReportType; label: string }> = [
  { value: "PERSONAL_DAILY", label: "个人日报" },
  { value: "PERSONAL_WEEKLY", label: "个人周报" },
  { value: "DEPARTMENT_DAILY", label: "部门日报" },
  { value: "DEPARTMENT_WEEKLY", label: "部门周报" }
];

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

function downloadReportWord(report: Report) {
  if (!report.content) return;
  const title = report.title || "智能汇报";
  const period = `${dayjs(report.periodStart).format("YYYY-MM-DD")} 至 ${dayjs(report.periodEnd).format("YYYY-MM-DD")}`;
  const hoursRows = report.content.hours.byUser
    .map((item) => `<tr><td>${escapeHtml(item.userName)}</td><td>${item.hours}h</td></tr>`)
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
    .meta { color: #737373; margin-bottom: 20px; }
    table { border-collapse: collapse; width: 100%; margin-top: 8px; }
    th, td { border: 1px solid #E6E6E6; padding: 8px 10px; text-align: left; }
    th { background: #F6F6F6; color: #737373; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">报告周期：${escapeHtml(period)} · 生成时间：${dayjs(report.createdAt).format("YYYY-MM-DD HH:mm")}</div>
  <h2>汇报摘要</h2>
  <p>${escapeHtml(report.content.summary)}</p>
  <h2>已完成工作</h2>
  ${listHtml(report.content.completed)}
  <h2>当前进展</h2>
  ${listHtml(report.content.progress)}
  <h2>风险问题</h2>
  ${listHtml(report.content.risks)}
  <h2>明日/下周计划</h2>
  ${listHtml(report.content.nextPlan)}
  <h2>工时统计</h2>
  <p>合计：${report.content.hours.total}h</p>
  <table>
    <thead><tr><th>成员</th><th>工时</th></tr></thead>
    <tbody>${hoursRows || '<tr><td colspan="2">暂无</td></tr>'}</tbody>
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

export default function ReportsPage() {
  const [form] = Form.useForm();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const canDepartmentReport = Boolean(user?.roles.includes("COMPANY_ADMIN") || user?.roles.includes("SUPER_ADMIN") || user?.roles.includes("DEPARTMENT_MANAGER"));

  const org = useQuery({
    queryKey: ["org"],
    queryFn: () => apiFetch<OrgResponse>("/org")
  });

  const reports = useQuery({
    queryKey: ["reports"],
    queryFn: () => apiFetch<Report[]>("/reports"),
    refetchInterval: 10000
  });

  const generate = useMutation({
    mutationFn: (values: { type: ReportType; range: [dayjs.Dayjs, dayjs.Dayjs]; departmentId?: string }) =>
      apiFetch<Report>("/reports/generate", {
        method: "POST",
        body: JSON.stringify({
          type: values.type,
          periodStart: values.range[0].format("YYYY-MM-DD"),
          periodEnd: values.range[1].format("YYYY-MM-DD"),
          departmentId: values.departmentId
        })
      }),
    onSuccess: () => {
      message.success("已提交报告生成任务");
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    }
  });

  const columns: ColumnsType<Report> = [
    { title: "报告", dataIndex: "title", width: 220 },
    {
      title: "周期",
      width: 190,
      render: (_, record) => `${dayjs(record.periodStart).format("YYYY-MM-DD")} 至 ${dayjs(record.periodEnd).format("YYYY-MM-DD")}`
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (value: string) => <Tag color={value === "COMPLETED" ? "green" : value === "FAILED" ? "red" : "processing"}>{value === "COMPLETED" ? "已完成" : value === "FAILED" ? "失败" : "生成中"}</Tag>
    },
    {
      title: "内容",
      render: (_, record) => {
        if (record.status === "FAILED") return <Typography.Text type="danger">{record.error}</Typography.Text>;
        if (!record.content) return <Typography.Text className="text-muted">等待 AI 生成</Typography.Text>;
        return (
          <div className="space-y-3">
            <div className="font-medium">{record.content.summary}</div>
            <div>
              <Typography.Text className="text-muted">已完成工作</Typography.Text>
              <ul className="mb-0 mt-1 pl-5">
                {record.content.completed.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
            <div>
              <Typography.Text className="text-muted">风险问题</Typography.Text>
              <Space className="mt-1" wrap>
                {record.content.risks.length ? record.content.risks.map((item) => <Tag color="red" key={item}>{item}</Tag>) : <Tag>暂无风险</Tag>}
              </Space>
            </div>
            <div>
              <Typography.Text className="text-muted">工时统计</Typography.Text>
              <Space className="mt-1" wrap>
                <Tag color="green">合计 {record.content.hours.total}h</Tag>
                {record.content.hours.byUser.map((item) => <Tag key={item.userName}>{item.userName}: {item.hours}h</Tag>)}
              </Space>
            </div>
          </div>
        );
      }
    },
    { title: "生成时间", dataIndex: "createdAt", width: 150, render: (value: string) => dayjs(value).format("MM-DD HH:mm") },
    {
      title: "操作",
      width: 140,
      render: (_, record) => (
        <Button
          icon={<FileDown size={15} />}
          disabled={record.status !== "COMPLETED" || !record.content}
          onClick={() => downloadReportWord(record)}
        >
          下载 Word
        </Button>
      )
    }
  ];

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <Typography.Title level={3} className="page-title">
            AI 汇报
          </Typography.Title>
          <Typography.Text className="page-subtitle">用 AI 把日报、计划、风险和工时整理成可复盘的团队汇报。</Typography.Text>
        </div>
      </div>

      <div className="surface-panel report-guide">
        <div className="report-guide-copy">
          <div className="section-title">生成报告向导</div>
          <div className="section-subtitle">选择报告类型、时间范围和部门后，AI 会生成摘要、已完成工作、风险问题、后续计划和工时统计。</div>
        </div>
        <Form
          form={form}
          layout="inline"
          className="report-guide-form"
          initialValues={{
            type: "PERSONAL_DAILY",
            range: [dayjs(), dayjs()],
            departmentId: user?.departmentId ?? undefined
          }}
          onFinish={(values) => generate.mutate(values)}
        >
          <Form.Item name="type" rules={[{ required: true }]}>
            <Select
              style={{ width: 150 }}
              options={reportTypeOptions.filter((item) => canDepartmentReport || item.value.startsWith("PERSONAL"))}
            />
          </Form.Item>
          <Form.Item name="range" rules={[{ required: true }]}>
            <DatePicker.RangePicker />
          </Form.Item>
          {canDepartmentReport ? (
            <Form.Item name="departmentId">
              <Select
                allowClear={user?.roles.includes("COMPANY_ADMIN") || user?.roles.includes("SUPER_ADMIN")}
                style={{ width: 160 }}
                placeholder="部门"
                options={org.data?.departments.map((item) => ({ value: item.id, label: item.name }))}
              />
            </Form.Item>
          ) : null}
          <Button className="ai-soft-button" htmlType="submit" icon={<WandSparkles size={16} />} loading={generate.isPending}>
            生成报告
          </Button>
        </Form>
        <Button icon={<RotateCw size={16} />} onClick={() => reports.refetch()} loading={reports.isFetching}>
          刷新
        </Button>
      </div>

      <Table
        rowKey="id"
        loading={reports.isFetching}
        dataSource={reports.data ?? []}
        columns={columns}
        locale={{ emptyText: <Empty description="暂无报告，先按上方向导生成一份日报或周报" /> }}
        pagination={{ pageSize: 6 }}
      />
    </div>
  );
}
