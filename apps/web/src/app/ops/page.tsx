"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Avatar, Button, Layout, Modal, Popconfirm, Space, Switch, Table, Tag, Typography, Upload, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { RcFile, UploadFile } from "antd/es/upload/interface";
import dayjs from "dayjs";
import { ImagePlus, KeyRound, LogOut, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { tenantLogoSpec, validateTenantLogoFile } from "@/lib/tenant-logo";
import { RoleCode, SubscriptionPlan, SubscriptionStatus } from "@/lib/types";

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

export default function OpsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);
  const isOps = Boolean(user?.roles.includes("SUPER_ADMIN"));
  const [logoTenant, setLogoTenant] = useState<OpsTenant | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoFileList, setLogoFileList] = useState<UploadFile[]>([]);

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
    { title: "报告", width: 90, render: (_, record) => record.counts.reports },
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
              {role}
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
      width: 280,
      render: (_, record) => (
        <Space wrap size={[8, 8]}>
          <Switch
            checked={record.isActive}
            disabled={record.id === user?.id}
            loading={updateAccount.isPending}
            onChange={(checked) => updateAccount.mutate({ id: record.id, isActive: checked })}
          />
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
            description="删除后该账号不能登录，账号列表不再显示；历史填报、报告和审计记录会保留。"
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
      <header className="flex items-center justify-between border-b border-line bg-white px-6 py-4">
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
            <div className="metric-label">AI 报告</div>
            <div className="metric-value">{totals?.reports ?? 0}</div>
          </div>
        </div>

        {overview.error ? <Alert type="error" showIcon message={(overview.error as Error).message} /> : null}

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
          <div className="mb-4 flex items-center justify-between">
            <Typography.Title level={4} className="!m-0 !font-medium">
              账号管理
            </Typography.Title>
            <Tag>最近 300 个账号</Tag>
          </div>
          <Table rowKey="id" loading={overview.isFetching} dataSource={overview.data?.accounts ?? []} columns={accountColumns} pagination={{ pageSize: 10 }} />
        </section>
      </main>

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
