"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Avatar, Button, DatePicker, Form, Input, Layout, Modal, Popconfirm, Select, Space, Switch, Table, Tag, Typography, Upload, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { RcFile, UploadFile } from "antd/es/upload/interface";
import dayjs, { Dayjs } from "dayjs";
import { AlertTriangle, Download, ImagePlus, KeyRound, LogOut, RefreshCw, ShieldCheck, Trash2, UserCog } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { apiDownload, apiFetch } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { tenantLogoSpec, validateTenantLogoFile } from "@/lib/tenant-logo";
import { RoleCode, SubscriptionPlan, SubscriptionStatus } from "@/lib/types";

const { RangePicker } = DatePicker;

type OpsTenant = {
  id: string;
  name: string;
  code: string;
  logoUrl?: string | null;
  createdAt: string;
  subscription?: {
    plan: SubscriptionPlan;
    status: SubscriptionStatus;
    seatLimit: number;
    activeUserCount?: number;
    activeMemberMonthlyPriceCents?: number;
    estimatedMonthlyAmountCents?: number;
    currentPeriodEnd?: string | null;
    trialEndsAt?: string | null;
  } | null;
  counts: {
    users: number;
    departments: number;
    projects: number;
    workLogs: number;
    reports: number;
  };
};

type OpsAccount = {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantCode: string;
  tenantLogoUrl?: string | null;
  email: string | null;
  phone?: string | null;
  name: string;
  departmentName?: string | null;
  isActive: boolean;
  requiresWorkReport: boolean;
  roles: RoleCode[];
  lastLoginAt?: string | null;
  createdAt: string;
};

type OpsPasswordResetResult = OpsAccount & {
  temporaryPassword: string;
};

type OpsCompanyAdminForm = {
  tenantId: string;
  name: string;
  email?: string;
  phone?: string;
};

type OpsOverview = {
  developerCompany: string;
  totals: {
    tenants: number;
    accounts: number;
    activeAccounts: number;
    workLogs: number;
    reports: number;
  };
  tenants: OpsTenant[];
  accounts: OpsAccount[];
};

type RuntimeLogLevel = "INFO" | "WARN" | "ERROR";
type RuntimeLogLevelFilter = RuntimeLogLevel | "ALL";

type OpsRuntimeLog = {
  id: string;
  level: RuntimeLogLevel;
  source: string;
  tenantId?: string | null;
  userId?: string | null;
  method?: string | null;
  path?: string | null;
  statusCode?: number | null;
  requestId?: string | null;
  message: string;
  stack?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: unknown;
  createdAt: string;
};

type OpsRuntimeLogResponse = {
  logs: OpsRuntimeLog[];
  total: number;
  limit: number;
  range: {
    startAt: string;
    endAt: string;
  };
};

function dateText(value?: string | null) {
  return value ? dayjs(value).format("YYYY-MM-DD") : "-";
}

function subscriptionStatusColor(status?: SubscriptionStatus) {
  return status === "ACTIVE" || status === "TRIALING" ? "green" : status === "PAST_DUE" ? "orange" : status ? "red" : "default";
}

function subscriptionStatusLabel(status?: SubscriptionStatus) {
  const labels: Record<SubscriptionStatus, string> = {
    TRIALING: "试用中",
    ACTIVE: "已开通",
    PAST_DUE: "待续费",
    EXPIRED: "已到期",
    CANCELED: "已取消"
  };
  return status ? labels[status] : "未开通";
}

function moneyText(amountCents?: number) {
  if (amountCents === undefined) return "-";
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2
  }).format(amountCents / 100);
}

function roleLabel(role: RoleCode) {
  const labels: Record<RoleCode, string> = {
    SUPER_ADMIN: "平台超管",
    COMPANY_ADMIN: "企业管理员",
    DEPARTMENT_MANAGER: "部门经理",
    EMPLOYEE: "普通员工"
  };
  return labels[role];
}

function runtimeLogLevelColor(level: RuntimeLogLevel) {
  if (level === "ERROR") return "red";
  if (level === "WARN") return "orange";
  return "blue";
}

function runtimeLogLevelText(level: RuntimeLogLevelFilter) {
  const labels: Record<RuntimeLogLevelFilter, string> = {
    ERROR: "错误",
    WARN: "警告",
    INFO: "信息",
    ALL: "全部"
  };
  return labels[level];
}

function runtimeLogQuery(range: [Dayjs, Dayjs], level: RuntimeLogLevelFilter, limit?: number) {
  const params = new URLSearchParams();
  params.set("startAt", range[0].toISOString());
  params.set("endAt", range[1].toISOString());
  params.set("level", level);
  if (limit) params.set("limit", String(limit));
  return params.toString();
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function OpsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);
  const isOps = Boolean(user?.roles.includes("SUPER_ADMIN"));
  const [companyAdminForm] = Form.useForm<OpsCompanyAdminForm>();
  const [logoTenant, setLogoTenant] = useState<OpsTenant | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoFileList, setLogoFileList] = useState<UploadFile[]>([]);
  const [companyAdminModalOpen, setCompanyAdminModalOpen] = useState(false);
  const [selectedAccountTenantId, setSelectedAccountTenantId] = useState<string>();
  const [runtimeLogLevel, setRuntimeLogLevel] = useState<RuntimeLogLevelFilter>("ERROR");
  const [runtimeLogRange, setRuntimeLogRange] = useState<[Dayjs, Dayjs]>(() => [dayjs().subtract(24, "hour"), dayjs()]);

  useEffect(() => {
    if (!token) {
      router.replace("/ops/login");
    }
  }, [router, token]);

  const overview = useQuery({
    queryKey: ["ops-overview"],
    queryFn: () => apiFetch<OpsOverview>("/ops/overview"),
    enabled: Boolean(token && isOps)
  });

  const runtimeLogs = useQuery({
    queryKey: ["ops-runtime-logs", runtimeLogLevel, runtimeLogRange[0].toISOString(), runtimeLogRange[1].toISOString()],
    queryFn: () => apiFetch<OpsRuntimeLogResponse>(`/ops/runtime-logs?${runtimeLogQuery(runtimeLogRange, runtimeLogLevel)}`),
    enabled: Boolean(token && isOps)
  });

  const tenantOptions = useMemo(
    () =>
      (overview.data?.tenants ?? []).map((tenant) => ({
        value: tenant.id,
        label: `${tenant.name} · ${tenant.code}`
      })),
    [overview.data?.tenants]
  );

  const selectedAccountTenant = useMemo(
    () => overview.data?.tenants.find((tenant) => tenant.id === selectedAccountTenantId),
    [overview.data?.tenants, selectedAccountTenantId]
  );

  const filteredAccounts = useMemo(() => {
    const accounts = overview.data?.accounts ?? [];
    if (!selectedAccountTenantId) return accounts;
    return accounts.filter((account) => account.tenantId === selectedAccountTenantId);
  }, [overview.data?.accounts, selectedAccountTenantId]);

  const updateAccount = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiFetch<OpsAccount>(`/ops/accounts/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive })
      }),
    onSuccess: () => {
      message.success("账号状态已更新");
      queryClient.invalidateQueries({ queryKey: ["ops-overview"] });
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : "账号更新失败，请刷新账号列表后重试。");
    }
  });

  const resetAccountPassword = useMutation({
    mutationFn: (id: string) => apiFetch<OpsPasswordResetResult>(`/ops/accounts/${id}/reset-password`, { method: "POST" }),
    onSuccess: (data, accountId) => {
      const account = overview.data?.accounts.find((item) => item.id === accountId);
      Modal.info({
        title: account ? `${account.name} 的临时密码已生成` : "临时密码已生成",
        content: (
          <Space direction="vertical" size={8}>
            <Typography.Text>请仅通过安全渠道发送给本人，并提醒对方登录后立即修改。</Typography.Text>
            <Typography.Text code copyable>
              {data.temporaryPassword}
            </Typography.Text>
          </Space>
        )
      });
      queryClient.invalidateQueries({ queryKey: ["ops-overview"] });
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : "密码重置失败，请刷新账号列表后重试。");
    }
  });

  const createCompanyAdmin = useMutation({
    mutationFn: (values: OpsCompanyAdminForm) =>
      apiFetch<OpsPasswordResetResult>("/ops/accounts/company-admin", {
        method: "POST",
        body: JSON.stringify({
          tenantId: values.tenantId,
          name: values.name.trim(),
          email: values.email?.trim() || undefined,
          phone: values.phone?.trim() || undefined
        })
      }),
    onSuccess: (data) => {
      setCompanyAdminModalOpen(false);
      companyAdminForm.resetFields();
      Modal.info({
        title: `${data.name} 的企业管理员账号已创建`,
        content: (
          <Space direction="vertical" size={8}>
            <Typography.Text>
              {data.tenantName} · {[data.phone, data.email].filter(Boolean).join(" / ")}
            </Typography.Text>
            <Typography.Text>请仅通过安全渠道发送临时密码，并提醒对方登录后立即修改。</Typography.Text>
            <Typography.Text code copyable>
              {data.temporaryPassword}
            </Typography.Text>
          </Space>
        )
      });
      queryClient.invalidateQueries({ queryKey: ["ops-overview"] });
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : "企业管理员账号创建失败，请检查企业和联系方式后重试。");
    }
  });

  const restoreCompanyAdmin = useMutation({
    mutationFn: (id: string) => apiFetch<OpsAccount>(`/ops/accounts/${id}/company-admin`, { method: "POST" }),
    onSuccess: (account) => {
      message.success(`${account.name} 已设为企业管理员`);
      queryClient.invalidateQueries({ queryKey: ["ops-overview"] });
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : "企业管理员维护失败，请刷新账号列表后重试。");
    }
  });

  const deleteAccount = useMutation({
    mutationFn: (id: string) => apiFetch<{ ok: boolean }>(`/ops/accounts/${id}`, { method: "DELETE" }),
    onSuccess: (_, accountId) => {
      const account = overview.data?.accounts.find((item) => item.id === accountId);
      message.success(account ? `${account.name} 已删除，历史填报数据仍保留` : "账号已删除，历史填报数据仍保留");
      queryClient.invalidateQueries({ queryKey: ["ops-overview"] });
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : "账号删除失败，请刷新账号列表后重试。");
    }
  });

  const downloadRuntimeLogs = useMutation({
    mutationFn: () => apiDownload(`/ops/runtime-logs/download?${runtimeLogQuery(runtimeLogRange, runtimeLogLevel, 5000)}`),
    onSuccess: ({ blob, filename }) => {
      downloadBlob(filename, blob);
      message.success("运行日志已开始下载");
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : "运行日志下载失败，请缩小时间范围后重试。");
    }
  });

  const updateTenantLogo = useMutation({
    mutationFn: ({ tenantId, nextLogoUrl }: { tenantId: string; nextLogoUrl: string | null }) =>
      apiFetch<OpsTenant>(`/ops/tenants/${tenantId}/logo`, {
        method: "PATCH",
        body: JSON.stringify({ logoUrl: nextLogoUrl })
      }),
    onSuccess: () => {
      message.success("企业 Logo 已更新");
      setLogoTenant(null);
      setLogoUrl(null);
      setLogoFileList([]);
      queryClient.invalidateQueries({ queryKey: ["ops-overview"] });
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : "企业 Logo 更新失败，请检查图片规格后重试。");
    }
  });

  const openLogoEditor = (tenant: OpsTenant) => {
    setLogoTenant(tenant);
    setLogoUrl(tenant.logoUrl ?? null);
    setLogoFileList(
      tenant.logoUrl
        ? [{ uid: tenant.id, name: `${tenant.name}-logo.png`, status: "done" }]
        : []
    );
  };

  const beforeLogoUpload = async (file: RcFile) => {
    try {
      const logo = await validateTenantLogoFile(file);
      setLogoUrl(logo.dataUrl);
      setLogoFileList([{ uid: file.uid, name: file.name, status: "done", size: file.size }]);
      message.success("企业 Logo 已读取，保存后生效");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "企业 Logo 不符合规格，请使用 512 x 512px PNG 文件。");
    }
    return false;
  };

  const submitCompanyAdminForm = (values: OpsCompanyAdminForm) => {
    const email = values.email?.trim();
    const phone = values.phone?.trim();
    if (!email && !phone) {
      companyAdminForm.setFields([
        { name: "email", errors: ["邮箱和手机号至少填写一个"] },
        { name: "phone", errors: ["邮箱和手机号至少填写一个"] }
      ]);
      return;
    }
    createCompanyAdmin.mutate(values);
  };

  const tenantColumns: ColumnsType<OpsTenant> = [
    {
      title: "企业",
      render: (_, record) => (
        <div className="flex items-center gap-3">
          <div className="tenant-logo-thumb">
            <img src={record.logoUrl || "/seven-ai-logo.png"} alt={`${record.name} Logo`} />
          </div>
          <div className="min-w-0">
            <div className="font-medium text-ink">{record.name}</div>
            <div className="mt-1 text-xs text-muted">统一社会信用代码 {record.code}</div>
          </div>
        </div>
      )
    },
    {
      title: "订阅",
      width: 180,
      render: (_, record) => (
        <Space direction="vertical" size={4}>
          <Tag color={subscriptionStatusColor(record.subscription?.status)}>{subscriptionStatusLabel(record.subscription?.status)}</Tag>
          <span className="text-xs text-muted">
            {record.subscription?.plan === "TRIAL" ? "免费试用" : "专业版"} · 启用 {record.subscription?.activeUserCount ?? 0} 人
          </span>
          <span className="text-xs text-muted">
            预计 {moneyText(record.subscription?.estimatedMonthlyAmountCents)} / 月
          </span>
        </Space>
      )
    },
    { title: "成员", width: 90, render: (_, record) => record.counts.users },
    { title: "项目", width: 90, render: (_, record) => record.counts.projects },
    { title: "填报", width: 90, render: (_, record) => record.counts.workLogs },
    { title: "汇报", width: 90, render: (_, record) => record.counts.reports },
    { title: "服务到期", width: 120, render: (_, record) => dateText(record.subscription?.currentPeriodEnd) },
    { title: "创建日期", width: 120, render: (_, record) => dateText(record.createdAt) },
    {
      title: "Logo",
      width: 110,
      render: (_, record) => (
        <Button size="small" icon={<ImagePlus size={14} />} onClick={() => openLogoEditor(record)}>
          修改
        </Button>
      )
    }
  ];

  const accountColumns: ColumnsType<OpsAccount> = [
    {
      title: "账号",
      render: (_, record) => (
        <div>
          <div className="font-medium text-ink">{record.name}</div>
          <div className="mt-1 text-xs text-muted">{[record.phone, record.email].filter(Boolean).join(" / ") || "-"}</div>
        </div>
      )
    },
    {
      title: "企业",
      width: 180,
      render: (_, record) => (
        <div>
          <div>{record.tenantName}</div>
          <div className="mt-1 text-xs text-muted">统一社会信用代码 {record.tenantCode}</div>
        </div>
      )
    },
    {
      title: "角色",
      width: 220,
      render: (_, record) => (
        <Space wrap size={[4, 4]}>
          {record.roles.map((role) => (
            <Tag key={role} color={role === "SUPER_ADMIN" ? "purple" : role === "COMPANY_ADMIN" ? "blue" : "default"}>
              {roleLabel(role)}
            </Tag>
          ))}
        </Space>
      )
    },
    { title: "部门", width: 120, render: (_, record) => record.departmentName ?? "-" },
    {
      title: "填报",
      width: 90,
      render: (_, record) => <Tag color={record.requiresWorkReport ? "blue" : "default"}>{record.requiresWorkReport ? "需要" : "不需要"}</Tag>
    },
    { title: "最近登录", width: 150, render: (_, record) => (record.lastLoginAt ? dayjs(record.lastLoginAt).format("YYYY-MM-DD HH:mm") : "-") },
    {
      title: "操作",
      width: 390,
      render: (_, record) => {
        const isHealthyCompanyAdmin = record.isActive && record.roles.length === 1 && record.roles.includes("COMPANY_ADMIN");
        return (
          <Space wrap size={[8, 8]}>
            <Switch
              checked={record.isActive}
              disabled={record.id === user?.id}
              loading={updateAccount.isPending}
              onChange={(checked) => updateAccount.mutate({ id: record.id, isActive: checked })}
            />
            <Popconfirm
              title="设为企业管理员？"
              description="系统会启用该账号，清除登录锁定，并把角色调整为企业管理员。"
              okText="设为企业管理员"
              cancelText="取消"
              onConfirm={() => restoreCompanyAdmin.mutate(record.id)}
            >
              <Button
                size="small"
                icon={<UserCog size={14} />}
                disabled={isHealthyCompanyAdmin}
                loading={restoreCompanyAdmin.isPending}
              >
                {isHealthyCompanyAdmin ? "企管正常" : "设为企管"}
              </Button>
            </Popconfirm>
            <Popconfirm
              title="确认重置这个账号的密码？"
              description="系统会生成一次性临时密码，请通过安全渠道发送给本人。"
              okText="确认重置"
              cancelText="取消"
              onConfirm={() => resetAccountPassword.mutate(record.id)}
            >
              <Button size="small" icon={<KeyRound size={14} />} loading={resetAccountPassword.isPending}>
                重置密码
              </Button>
            </Popconfirm>
            <Popconfirm
              title="确认删除这个账号？"
              description="删除后该账号不能登录，账号列表不再显示；历史填报、汇报和审计记录会保留。"
              okText="确认删除"
              cancelText="取消"
              okButtonProps={{ danger: true, loading: deleteAccount.isPending }}
              onConfirm={() => deleteAccount.mutate(record.id)}
            >
              <Button size="small" danger icon={<Trash2 size={14} />} loading={deleteAccount.isPending}>
                删除
              </Button>
            </Popconfirm>
          </Space>
        );
      }
    }
  ];

  const runtimeLogColumns: ColumnsType<OpsRuntimeLog> = [
    {
      title: "时间",
      width: 160,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Typography.Text className="text-sm text-ink">{dayjs(record.createdAt).format("MM-DD HH:mm:ss")}</Typography.Text>
          <Typography.Text className="text-xs text-muted">{record.source}</Typography.Text>
        </Space>
      )
    },
    {
      title: "级别",
      width: 90,
      render: (_, record) => <Tag color={runtimeLogLevelColor(record.level)}>{runtimeLogLevelText(record.level)}</Tag>
    },
    {
      title: "请求",
      width: 280,
      render: (_, record) => (
        <Space direction="vertical" size={2} className="max-w-[260px]">
          <Typography.Text className="text-sm text-ink" ellipsis={{ tooltip: `${record.method ?? "-"} ${record.path ?? "-"}` }}>
            {[record.method, record.path].filter(Boolean).join(" ") || "-"}
          </Typography.Text>
          <Typography.Text className="text-xs text-muted">
            {record.statusCode ? `HTTP ${record.statusCode}` : "无状态码"}
          </Typography.Text>
        </Space>
      )
    },
    {
      title: "错误信息",
      render: (_, record) => (
        <Space direction="vertical" size={2} className="max-w-[520px]">
          <Typography.Text className="text-sm text-ink" ellipsis={{ tooltip: record.message }}>
            {record.message}
          </Typography.Text>
          {record.stack ? (
            <Typography.Text className="text-xs text-muted" ellipsis={{ tooltip: record.stack }}>
              {record.stack.split("\n")[0]}
            </Typography.Text>
          ) : null}
        </Space>
      )
    },
    {
      title: "定位信息",
      width: 260,
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Typography.Text className="text-xs text-muted">租户 {record.tenantId ?? "-"}</Typography.Text>
          <Typography.Text className="text-xs text-muted">用户 {record.userId ?? "-"}</Typography.Text>
          <Typography.Text className="text-xs text-muted" copyable={Boolean(record.requestId)}>
            请求 {record.requestId ?? "-"}
          </Typography.Text>
        </Space>
      )
    }
  ];

  if (!token || !user) {
    return null;
  }

  if (!isOps) {
    return (
      <main className="min-h-screen bg-surface p-6">
        <Alert type="error" showIcon message="无权访问运维端" description="请使用北京七数智联科技有限公司的平台运维口令登录。" />
      </main>
    );
  }

  const totals = overview.data?.totals;

  return (
    <Layout className="min-h-screen bg-surface">
      <header className="flex items-center justify-between bg-white px-6 py-4 shadow-[0_12px_30px_rgba(26,26,26,0.04)]">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-[142px] items-center rounded-[16px] bg-surface-container-low px-3">
            <img src="/seven-ai-logo.png" alt="七数AI" className="h-10 w-full object-contain" />
          </div>
          <div>
            <Typography.Title level={4} className="!m-0 !font-medium">
              运维控制台
            </Typography.Title>
            <Typography.Text className="text-muted">{overview.data?.developerCompany ?? "北京七数智联科技有限公司"}</Typography.Text>
          </div>
        </div>
        <Space>
          <Button icon={<RefreshCw size={16} />} onClick={() => overview.refetch()} loading={overview.isFetching}>
            刷新
          </Button>
          <div className="flex items-center gap-2 rounded-full bg-surface-container px-3 py-2">
            <Avatar size={28} className="bg-primary">
              {user.name.slice(0, 1)}
            </Avatar>
            <span className="text-sm font-medium text-ink">{user.name}</span>
          </div>
          <Button
            icon={<LogOut size={16} />}
            onClick={() => {
              clearSession();
              router.replace("/ops/login");
            }}
          />
        </Space>
      </header>

      <main className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 p-6">
        <div className="grid gap-3 md:grid-cols-5">
          <div className="metric-card">
            <ShieldCheck size={20} className="mb-3 text-primary" />
            <div className="metric-label">企业数</div>
            <div className="metric-value">{totals?.tenants ?? 0}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">账号数</div>
            <div className="metric-value">{totals?.accounts ?? 0}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">启用账号</div>
            <div className="metric-value">{totals?.activeAccounts ?? 0}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">工作填报</div>
            <div className="metric-value">{totals?.workLogs ?? 0}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">周期汇报</div>
            <div className="metric-value">{totals?.reports ?? 0}</div>
          </div>
        </div>

        {overview.error ? <Alert type="error" showIcon message={(overview.error as Error).message} /> : null}
        {runtimeLogs.error ? <Alert type="error" showIcon message={(runtimeLogs.error as Error).message} /> : null}

        <section className="surface-panel bg-white p-5">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="mb-1 flex items-center gap-2">
                <AlertTriangle size={18} className="text-danger" />
                <Typography.Title level={4} className="!m-0 !font-medium">
                  运行日志
                </Typography.Title>
              </div>
              <Typography.Text className="text-muted">
                仅记录结构化 API 报错信息。默认显示最近 24 小时错误日志，可按时间段下载 CSV。
              </Typography.Text>
            </div>
            <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
              <RangePicker
                showTime
                allowClear={false}
                value={runtimeLogRange}
                className="w-full xl:w-[420px]"
                onChange={(dates) => {
                  if (dates?.[0] && dates?.[1]) {
                    setRuntimeLogRange([dates[0], dates[1]]);
                  }
                }}
              />
              <Select<RuntimeLogLevelFilter>
                value={runtimeLogLevel}
                className="w-full xl:w-[132px]"
                options={[
                  { value: "ERROR", label: "错误" },
                  { value: "WARN", label: "警告" },
                  { value: "INFO", label: "信息" },
                  { value: "ALL", label: "全部" }
                ]}
                onChange={setRuntimeLogLevel}
              />
              <Space.Compact className="w-full xl:w-auto">
                <Button icon={<RefreshCw size={16} />} onClick={() => runtimeLogs.refetch()} loading={runtimeLogs.isFetching}>
                  刷新
                </Button>
                <Button icon={<Download size={16} />} onClick={() => downloadRuntimeLogs.mutate()} loading={downloadRuntimeLogs.isPending}>
                  下载
                </Button>
              </Space.Compact>
            </div>
          </div>
          <div className="mb-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-[12px] border border-line bg-surface-container-low p-3">
              <div className="text-xs text-muted">匹配日志</div>
              <div className="mt-1 text-xl font-semibold text-ink">{runtimeLogs.data?.total ?? 0}</div>
            </div>
            <div className="rounded-[12px] border border-line bg-surface-container-low p-3">
              <div className="text-xs text-muted">当前级别</div>
              <div className="mt-1 text-xl font-semibold text-ink">{runtimeLogLevelText(runtimeLogLevel)}</div>
            </div>
            <div className="rounded-[12px] border border-line bg-surface-container-low p-3">
              <div className="text-xs text-muted">查询范围</div>
              <div className="mt-1 text-sm font-medium text-ink">
                {runtimeLogs.data
                  ? `${dayjs(runtimeLogs.data.range.startAt).format("MM-DD HH:mm")} 至 ${dayjs(runtimeLogs.data.range.endAt).format("MM-DD HH:mm")}`
                  : "最近 24 小时"}
              </div>
            </div>
          </div>
          <Table
            rowKey="id"
            size="middle"
            loading={runtimeLogs.isFetching}
            dataSource={runtimeLogs.data?.logs ?? []}
            columns={runtimeLogColumns}
            pagination={{ pageSize: 6 }}
            scroll={{ x: 1200 }}
          />
        </section>

        <section className="surface-panel bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <Typography.Title level={4} className="!m-0 !font-medium">
              企业监管
            </Typography.Title>
            <Tag color="blue">全平台</Tag>
          </div>
          <Table rowKey="id" loading={overview.isFetching} dataSource={overview.data?.tenants ?? []} columns={tenantColumns} pagination={{ pageSize: 8 }} />
        </section>

        <section className="surface-panel bg-white p-5">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <Typography.Title level={4} className="!m-0 !font-medium">
                账号管理
              </Typography.Title>
              <Typography.Text className="text-muted">
                运维可新增和恢复企业管理员权限、重置密码、启停账号；关键操作会写入审计日志。
              </Typography.Text>
            </div>
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-end md:w-auto">
              <Select
                allowClear
                showSearch
                className="w-full sm:w-[320px]"
                placeholder="选择公司"
                value={selectedAccountTenantId}
                options={tenantOptions}
                optionFilterProp="label"
                notFoundContent="未找到公司"
                onChange={(value) => setSelectedAccountTenantId(value)}
                filterOption={(input, option) =>
                  String(option?.label ?? "")
                    .toLowerCase()
                    .includes(input.trim().toLowerCase())
                }
              />
              <Tag className="m-0 w-fit">
                {selectedAccountTenant ? `${filteredAccounts.length} 个账号` : `最近 ${filteredAccounts.length} 个账号`}
              </Tag>
              <Button
                type="primary"
                className="w-full sm:w-auto"
                icon={<UserCog size={16} />}
                onClick={() => {
                  companyAdminForm.resetFields();
                  setCompanyAdminModalOpen(true);
                }}
              >
                新增企管
              </Button>
            </div>
          </div>
          <Table rowKey="id" loading={overview.isFetching} dataSource={filteredAccounts} columns={accountColumns} pagination={{ pageSize: 10 }} />
        </section>
      </main>

      <Modal
        title="新增企业管理员账号"
        open={companyAdminModalOpen}
        onCancel={() => {
          setCompanyAdminModalOpen(false);
          companyAdminForm.resetFields();
        }}
        onOk={() => companyAdminForm.submit()}
        confirmLoading={createCompanyAdmin.isPending}
        okText="创建账号"
      >
        <Alert
          className="mb-4"
          type="info"
          showIcon
          message="系统会自动生成临时密码"
          description="新账号会被设为启用状态，并只分配企业管理员角色。创建后请通过安全渠道发送临时密码。"
        />
        <Form form={companyAdminForm} layout="vertical" onFinish={submitCompanyAdminForm}>
          <Form.Item name="tenantId" label="企业" rules={[{ required: true, message: "请选择企业" }]}>
            <Select
              showSearch
              allowClear
              optionFilterProp="label"
              placeholder="选择企业"
              options={tenantOptions}
              notFoundContent="未找到企业"
              filterOption={(input, option) =>
                String(option?.label ?? "")
                  .toLowerCase()
                  .includes(input.trim().toLowerCase())
              }
            />
          </Form.Item>
          <Form.Item name="name" label="姓名" rules={[{ required: true, min: 2, message: "请输入至少 2 个字符的姓名" }]}>
            <Input placeholder="例如：齐鹏飞" />
          </Form.Item>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Form.Item
              name="phone"
              label="手机号"
              rules={[
                {
                  validator: async (_, value?: string) => {
                    const phone = value?.trim().replace(/[\s-]/g, "");
                    if (phone && !/^\+?\d{6,20}$/.test(phone)) {
                      throw new Error("请输入 6 到 20 位数字，国际号码可加 +");
                    }
                  }
                }
              ]}
            >
              <Input placeholder="13900000000" />
            </Form.Item>
            <Form.Item name="email" label="邮箱" rules={[{ type: "email", message: "请输入有效邮箱" }]}>
              <Input placeholder="name@example.com" />
            </Form.Item>
          </div>
        </Form>
      </Modal>

      <Modal
        title="修改企业 Logo"
        open={Boolean(logoTenant)}
        onCancel={() => {
          setLogoTenant(null);
          setLogoUrl(null);
          setLogoFileList([]);
        }}
        onOk={() => {
          if (!logoTenant) return;
          updateTenantLogo.mutate({ tenantId: logoTenant.id, nextLogoUrl: logoUrl });
        }}
        confirmLoading={updateTenantLogo.isPending}
        okText="保存 Logo"
      >
        <Alert
          className="mb-4"
          type="info"
          showIcon
          message={logoTenant ? `${logoTenant.name} · 统一社会信用代码 ${logoTenant.code}` : "企业 Logo"}
          description={tenantLogoSpec.helpText}
        />
        <Upload.Dragger
          accept="image/png"
          maxCount={1}
          fileList={logoFileList}
          beforeUpload={beforeLogoUpload}
          onRemove={() => {
            setLogoUrl(null);
            setLogoFileList([]);
            return true;
          }}
        >
          <p className="ant-upload-drag-icon">
            {logoUrl ? (
              <img src={logoUrl} alt="企业 Logo 预览" className="mx-auto h-14 max-w-[220px] object-contain" />
            ) : (
              <ImagePlus size={30} />
            )}
          </p>
          <p className="ant-upload-text">上传或替换企业 Logo</p>
          <p className="ant-upload-hint">移除当前文件后保存，可恢复显示七数AI默认 Logo。</p>
        </Upload.Dragger>
      </Modal>
    </Layout>
  );
}
