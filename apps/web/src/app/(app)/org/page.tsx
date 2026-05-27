"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, DatePicker, Empty, Form, Input, InputNumber, Modal, Select, Space, Switch, Table, Tabs, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { Dayjs } from "dayjs";
import { CheckCircle2, CreditCard, Download, Edit2, FileLock2, History, KeyRound, Plus, QrCode, ReceiptText, RotateCw, ShieldCheck, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { apiDownload, apiFetch } from "@/lib/api";
import { hasAnyRole, useAuthStore } from "@/lib/auth-store";
import { normalizeUnifiedSocialCreditCode, unifiedSocialCreditCodeMessage, unifiedSocialCreditCodePattern } from "@/lib/unified-social-credit-code";
import {
  AuditLog,
  BillingInterval,
  BillingOrder,
  BillingOrderPayment,
  BillingPlan,
  BillingPlansResponse,
  DataDeletionRequest,
  DataDeletionScope,
  Department,
  ExportTask,
  ExportTaskStatus,
  OrgUser,
  PaymentProvider,
  RoleCode,
  Subscription,
  SubscriptionPlan,
  SubscriptionStatus
} from "@/lib/types";

type OrgResponse = {
  tenant: { id: string; name: string; code: string };
  subscription: Subscription;
  departments: Department[];
  users: OrgUser[];
};

type SubscriptionForm = {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  seatLimit: number;
  currentPeriodEnd?: Dayjs;
  trialEndsAt?: Dayjs;
  provider?: string;
};

type BillingOrderForm = {
  plan?: SubscriptionPlan;
  interval?: BillingInterval;
  provider: PaymentProvider;
};

type DataDeletionForm = {
  scope: DataDeletionScope;
  reason?: string;
};

type ChangePasswordForm = {
  currentPassword: string;
  newPassword: string;
};

const roleOptions: Array<{ value: RoleCode; label: string }> = [
  { value: "COMPANY_ADMIN", label: "企业管理员" },
  { value: "DEPARTMENT_MANAGER", label: "部门经理" },
  { value: "EMPLOYEE", label: "普通员工" }
];

const planOptions: Array<{ value: SubscriptionPlan; label: string }> = [
  { value: "TRIAL", label: "免费试用" },
  { value: "TEAM", label: "专业版" }
];

const planLabels: Record<SubscriptionPlan, string> = {
  TRIAL: "免费试用",
  TEAM: "专业版",
  BUSINESS: "专业版",
  ENTERPRISE: "企业版"
};

const freeBillingPlan = {
  name: "免费试用",
  price: "¥0",
  description: "企业免费试用 1 个月，不限制人数，完整功能开放。",
  features: ["企业免费试用 1 个月", "不限制成员人数", "完整 AI 工作日历功能", "AI 日报、周报、月报", "AI 风险分析", "AI 工作问答"]
};

const statusOptions: Array<{ value: SubscriptionStatus; label: string; color: string }> = [
  { value: "TRIALING", label: "试用中", color: "blue" },
  { value: "ACTIVE", label: "已开通", color: "green" },
  { value: "PAST_DUE", label: "待续费", color: "orange" },
  { value: "EXPIRED", label: "已到期", color: "red" },
  { value: "CANCELED", label: "已取消", color: "default" }
];

const billingIntervalOptions: Array<{ value: BillingInterval; label: string }> = [
  { value: "MONTHLY", label: "月付" }
];

const paymentProviderOptions: Array<{ value: PaymentProvider; label: string }> = [
  { value: "ALIPAY", label: "支付宝" },
  { value: "WECHAT", label: "微信支付" }
];

const paymentProviderLabels: Record<PaymentProvider, string> = {
  MANUAL: "线下转账",
  ALIPAY: "支付宝",
  WECHAT: "微信支付",
  STRIPE: "Stripe"
};

const activeMemberMonthlyPriceCents = 1900;

function contactText(record: { email?: string | null; phone?: string | null }) {
  return [record.phone, record.email].filter(Boolean).join(" / ") || "-";
}

const orderStatusColors: Record<string, string> = {
  PENDING: "orange",
  PAID: "green",
  CANCELED: "default",
  EXPIRED: "red"
};

const deletionStatusColors: Record<string, string> = {
  REQUESTED: "orange",
  PROCESSING: "blue",
  COMPLETED: "green",
  CANCELED: "default"
};

const exportTaskStatusColors: Record<ExportTaskStatus, string> = {
  PENDING: "orange",
  PROCESSING: "blue",
  COMPLETED: "green",
  FAILED: "red",
  EXPIRED: "default"
};

function optionLabel<T extends string>(options: Array<{ value: T; label: string }>, value?: T) {
  return options.find((item) => item.value === value)?.label ?? value ?? "-";
}

function planLabel(value?: SubscriptionPlan) {
  return value ? planLabels[value] : "-";
}

function statusColor(status?: SubscriptionStatus) {
  return statusOptions.find((item) => item.value === status)?.color ?? "default";
}

function dateText(value?: string | null) {
  return value ? dayjs(value).format("YYYY-MM-DD") : "未设置";
}

function dateTimeText(value?: string | null) {
  return value ? dayjs(value).format("YYYY-MM-DD HH:mm") : "-";
}

function moneyText(amountCents?: number, currency = "CNY") {
  if (amountCents === undefined) return "-";
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2
  }).format(amountCents / 100);
}

function planPrice(plan: BillingPlan) {
  return plan.monthlyPriceCents;
}

function fileSizeText(bytes?: number | null) {
  if (!bytes) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
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

export default function OrgPage() {
  const user = useAuthStore((state) => state.user);
  const canManage = hasAnyRole(user, ["SUPER_ADMIN", "COMPANY_ADMIN"]);
  const isSuperAdmin = hasAnyRole(user, ["SUPER_ADMIN"]);
  const queryClient = useQueryClient();
  const [tenantForm] = Form.useForm();
  const [departmentForm] = Form.useForm();
  const [userForm] = Form.useForm();
  const [subscriptionForm] = Form.useForm<SubscriptionForm>();
  const [billingOrderForm] = Form.useForm<BillingOrderForm>();
  const [dataDeletionForm] = Form.useForm<DataDeletionForm>();
  const [changePasswordForm] = Form.useForm<ChangePasswordForm>();
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
  const [editingUser, setEditingUser] = useState<OrgUser | null>(null);
  const [tenantModalOpen, setTenantModalOpen] = useState(false);
  const [departmentModalOpen, setDepartmentModalOpen] = useState(false);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [subscriptionModalOpen, setSubscriptionModalOpen] = useState(false);
  const [billingOrderModalOpen, setBillingOrderModalOpen] = useState(false);
  const [dataDeletionModalOpen, setDataDeletionModalOpen] = useState(false);
  const [checkoutProvider, setCheckoutProvider] = useState<"ALIPAY" | "WECHAT">("WECHAT");
  const [checkout, setCheckout] = useState<BillingOrderPayment | null>(null);

  const org = useQuery({
    queryKey: ["org"],
    queryFn: () => apiFetch<OrgResponse>("/org")
  });

  const departmentOptions = useMemo(
    () => org.data?.departments.map((item) => ({ value: item.id, label: item.name })) ?? [],
    [org.data?.departments]
  );

  const billingOrders = useQuery({
    queryKey: ["billing-orders"],
    queryFn: () => apiFetch<BillingOrder[]>("/billing/orders"),
    enabled: canManage
  });

  const billingPlans = useQuery({
    queryKey: ["billing-plans"],
    queryFn: () => apiFetch<BillingPlansResponse>("/billing/plans"),
    enabled: canManage
  });

  const auditLogs = useQuery({
    queryKey: ["audit-logs"],
    queryFn: () => apiFetch<AuditLog[]>("/audit-logs?limit=100"),
    enabled: canManage
  });

  const deletionRequests = useQuery({
    queryKey: ["data-deletion-requests"],
    queryFn: () => apiFetch<DataDeletionRequest[]>("/privacy/data-deletion-requests"),
    enabled: Boolean(user)
  });

  const exportTasks = useQuery({
    queryKey: ["export-tasks"],
    queryFn: () => apiFetch<ExportTask[]>("/exports/data-tasks"),
    enabled: Boolean(user),
    refetchInterval: 5000
  });

  const saveDepartment = useMutation({
    mutationFn: (values: { name: string; parentId?: string }) => {
      if (editingDepartment) {
        return apiFetch<Department>(`/org/departments/${editingDepartment.id}`, {
          method: "PATCH",
          body: JSON.stringify(values)
        });
      }
      return apiFetch<Department>("/org/departments", { method: "POST", body: JSON.stringify(values) });
    },
    onSuccess: () => {
      message.success("部门已保存");
      setDepartmentModalOpen(false);
      setEditingDepartment(null);
      queryClient.invalidateQueries({ queryKey: ["org"] });
    }
  });

  const createTenant = useMutation({
    mutationFn: (values: { name: string; code: string; adminEmail: string; adminName: string; adminPassword?: string }) =>
      apiFetch("/org/tenants", { method: "POST", body: JSON.stringify({ ...values, code: normalizeUnifiedSocialCreditCode(values.code) }) }),
    onSuccess: () => {
      message.success("企业已创建");
      setTenantModalOpen(false);
      tenantForm.resetFields();
      queryClient.invalidateQueries({ queryKey: ["org"] });
    }
  });

  const saveUser = useMutation({
    mutationFn: (values: {
      email?: string;
      phone?: string;
      name: string;
      departmentId?: string;
      password?: string;
      roles: RoleCode[];
      isActive?: boolean;
      requiresWorkReport?: boolean;
    }) => {
      if (editingUser) {
        return apiFetch<OrgUser>(`/org/users/${editingUser.id}`, {
          method: "PATCH",
          body: JSON.stringify(values)
        });
      }
      return apiFetch<OrgUser>("/org/users", {
        method: "POST",
        body: JSON.stringify({ ...values, password: values.password || "Passw0rd!" })
      });
    },
    onSuccess: () => {
      message.success("员工已保存");
      setUserModalOpen(false);
      setEditingUser(null);
      queryClient.invalidateQueries({ queryKey: ["org"] });
    }
  });

  const saveSubscription = useMutation({
    mutationFn: (values: SubscriptionForm) =>
      apiFetch<Subscription>("/billing/subscription", {
        method: "PATCH",
        body: JSON.stringify({
          ...values,
          currentPeriodEnd: values.currentPeriodEnd?.format("YYYY-MM-DD"),
          trialEndsAt: values.trialEndsAt?.format("YYYY-MM-DD")
        })
      }),
    onSuccess: () => {
      message.success("订阅已更新");
      setSubscriptionModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["org"] });
    }
  });

  const createBillingOrder = useMutation({
    mutationFn: (values: BillingOrderForm) =>
      apiFetch<BillingOrder>("/billing/orders", {
        method: "POST",
        body: JSON.stringify(values)
      }),
    onSuccess: (order) => {
      message.success("订阅订单已创建");
      setBillingOrderModalOpen(false);
      billingOrderForm.resetFields();
      apiFetch<BillingOrderPayment>(`/billing/orders/${order.id}/payment`)
        .then(setCheckout)
        .catch((error) => message.error(error instanceof Error ? error.message : "支付信息获取失败"));
      queryClient.invalidateQueries({ queryKey: ["billing-orders"] });
    }
  });

  const confirmOnlinePayment = useMutation({
    mutationFn: (orderId: string) => apiFetch<BillingOrder>(`/billing/orders/${orderId}/confirm-online-payment`, { method: "POST" }),
    onSuccess: () => {
      message.success("支付已完成，订阅已开通");
      setCheckout(null);
      queryClient.invalidateQueries({ queryKey: ["billing-orders"] });
      queryClient.invalidateQueries({ queryKey: ["org"] });
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : "支付确认失败");
    }
  });

  const confirmManualPayment = useMutation({
    mutationFn: (orderId: string) =>
      apiFetch<BillingOrder>(`/billing/orders/${orderId}/confirm-manual-payment`, {
        method: "POST",
        body: JSON.stringify({})
      }),
    onSuccess: () => {
      message.success("已确认线下收款，订阅已开通");
      queryClient.invalidateQueries({ queryKey: ["billing-orders"] });
      queryClient.invalidateQueries({ queryKey: ["org"] });
    }
  });

  const requestDataDeletion = useMutation({
    mutationFn: (values: DataDeletionForm) =>
      apiFetch<DataDeletionRequest>("/privacy/data-deletion-requests", {
        method: "POST",
        body: JSON.stringify(values)
      }),
    onSuccess: () => {
      message.success("数据删除申请已提交");
      setDataDeletionModalOpen(false);
      dataDeletionForm.resetFields();
      queryClient.invalidateQueries({ queryKey: ["data-deletion-requests"] });
    }
  });

  const changePassword = useMutation({
    mutationFn: (values: ChangePasswordForm) =>
      apiFetch<{ ok: boolean }>("/auth/change-password", {
        method: "POST",
        body: JSON.stringify(values)
      }),
    onSuccess: () => {
      message.success("密码已更新");
      changePasswordForm.resetFields();
    }
  });

  const createExportTask = useMutation({
    mutationFn: () =>
      apiFetch<ExportTask>(`/exports/data-tasks?scope=${canManage ? "tenant" : "self"}`, {
        method: "POST",
        body: JSON.stringify({})
      }),
    onSuccess: () => {
      message.success("导出任务已创建，生成完成后可下载压缩包。");
      queryClient.invalidateQueries({ queryKey: ["export-tasks"] });
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : "导出任务创建失败");
    }
  });

  const downloadExportTask = useMutation({
    mutationFn: (task: ExportTask) => apiDownload(`/exports/data-tasks/${task.id}/download`),
    onSuccess: ({ blob, filename }) => {
      downloadBlob(filename, blob);
      message.success("备份压缩包已开始下载");
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : "下载失败");
    }
  });

  const startPlanCheckout = (plan: BillingPlan) => {
    createBillingOrder.mutate({
      plan: plan.plan,
      interval: "MONTHLY",
      provider: checkoutProvider
    });
  };

  const subscription = org.data?.subscription;
  const activeMemberCount = subscription?.usedSeats ?? 0;
  const unitPriceCents = subscription?.activeMemberMonthlyPriceCents ?? billingPlans.data?.billingPolicy?.activeMemberMonthlyPriceCents ?? activeMemberMonthlyPriceCents;
  const estimatedMonthlyAmountCents = subscription?.estimatedMonthlyAmountCents ?? activeMemberCount * unitPriceCents;
  const isTrialing = subscription?.status === "TRIALING";
  const subscriptionTitle = isTrialing ? "免费试用中" : subscription?.status === "ACTIVE" ? "专业版已开通" : optionLabel(statusOptions, subscription?.status);
  const memberBillingHint = isTrialing
    ? "试用期内不限制成员人数。试用结束后将按启用成员数量计费。"
    : "新增成员将立即可用，并从下个计费周期开始计费。";

  const departmentColumns: ColumnsType<Department> = [
    { title: "部门", dataIndex: "name" },
    {
      title: "操作",
      width: 110,
      render: (_, record) =>
        canManage ? (
          <Button
            icon={<Edit2 size={15} />}
            onClick={() => {
              setEditingDepartment(record);
              departmentForm.setFieldsValue(record);
              setDepartmentModalOpen(true);
            }}
          />
        ) : null
    }
  ];

  const userColumns: ColumnsType<OrgUser> = [
    { title: "姓名", dataIndex: "name", width: 140 },
    { title: "联系方式", width: 260, render: (_, record) => contactText(record) },
    { title: "部门", dataIndex: "departmentName", width: 150, render: (value: string | null) => value ?? "未分配" },
    {
      title: "角色",
      dataIndex: "roles",
      render: (roles: RoleCode[]) => (
        <Space wrap>
          {roles.map((role) => <Tag key={role}>{roleOptions.find((item) => item.value === role)?.label ?? role}</Tag>)}
        </Space>
      )
    },
    { title: "状态", dataIndex: "isActive", width: 90, render: (value: boolean) => <Tag color={value ? "green" : "red"}>{value ? "启用" : "停用"}</Tag> },
    {
      title: "填报",
      dataIndex: "requiresWorkReport",
      width: 90,
      render: (value: boolean) => <Tag color={value ? "blue" : "default"}>{value ? "需要" : "不需要"}</Tag>
    },
    {
      title: "操作",
      width: 110,
      render: (_, record) =>
        canManage ? (
          <Button
            icon={<Edit2 size={15} />}
            onClick={() => {
              setEditingUser(record);
              userForm.setFieldsValue({ ...record, password: undefined });
              setUserModalOpen(true);
            }}
          />
        ) : null
    }
  ];

  const billingOrderColumns: ColumnsType<BillingOrder> = [
    { title: "版本", dataIndex: "plan", width: 110, render: (value: SubscriptionPlan) => planLabel(value) },
    { title: "周期", dataIndex: "interval", width: 90, render: (value: BillingInterval) => optionLabel(billingIntervalOptions, value) },
    { title: "计费人数", dataIndex: "seatLimit", width: 100, render: (value: number) => `${value} 人` },
    { title: "金额", dataIndex: "amountCents", width: 130, render: (value: number, record) => moneyText(value, record.currency) },
    { title: "支付方式", dataIndex: "provider", width: 120, render: (value: PaymentProvider) => paymentProviderLabels[value] ?? value },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (value: string) => <Tag color={orderStatusColors[value] ?? "default"}>{value}</Tag>
    },
    { title: "创建时间", dataIndex: "createdAt", width: 170, render: dateTimeText },
    {
      title: "操作",
      width: 150,
      render: (_, record) =>
        isSuperAdmin && record.status === "PENDING" && record.provider === "MANUAL" ? (
          <Button size="small" loading={confirmManualPayment.isPending} onClick={() => confirmManualPayment.mutate(record.id)}>
            确认收款
          </Button>
        ) : record.paymentUrl && record.status === "PENDING" ? (
          <Button
            size="small"
            onClick={() =>
              apiFetch<BillingOrderPayment>(`/billing/orders/${record.id}/payment`)
                .then(setCheckout)
                .catch((error) => message.error(error instanceof Error ? error.message : "支付信息获取失败"))
            }
          >
            支付
          </Button>
        ) : (
          "-"
        )
    }
  ];

  const auditColumns: ColumnsType<AuditLog> = [
    { title: "时间", dataIndex: "createdAt", width: 170, render: dateTimeText },
    { title: "动作", dataIndex: "action", width: 230 },
    {
      title: "对象",
      width: 220,
      render: (_, record) => [record.targetType, record.targetId].filter(Boolean).join(" / ") || "-"
    },
    {
      title: "附加信息",
      dataIndex: "metadata",
      render: (value: unknown) => (
        <Typography.Text className="text-xs text-muted">
          {value ? JSON.stringify(value).slice(0, 160) : "-"}
        </Typography.Text>
      )
    }
  ];

  const deletionColumns: ColumnsType<DataDeletionRequest> = [
    { title: "范围", dataIndex: "scope", width: 120, render: (value: DataDeletionScope) => (value === "TENANT" ? "全企业" : "仅本人") },
    {
      title: "状态",
      dataIndex: "status",
      width: 120,
      render: (value: string) => <Tag color={deletionStatusColors[value] ?? "default"}>{value}</Tag>
    },
    { title: "原因", dataIndex: "reason", render: (value?: string | null) => value || "-" },
    { title: "申请时间", dataIndex: "requestedAt", width: 170, render: dateTimeText }
  ];

  const exportTaskColumns: ColumnsType<ExportTask> = [
    { title: "范围", dataIndex: "scope", width: 110, render: (value: string) => (value === "TENANT" ? "全企业" : "仅本人") },
    {
      title: "状态",
      dataIndex: "status",
      width: 120,
      render: (value: ExportTaskStatus) => <Tag color={exportTaskStatusColors[value]}>{value}</Tag>
    },
    { title: "文件", dataIndex: "fileName", render: (value?: string | null) => value || "-" },
    { title: "大小", dataIndex: "fileSize", width: 100, render: fileSizeText },
    { title: "有效期至", dataIndex: "expiresAt", width: 170, render: dateTimeText },
    {
      title: "操作",
      width: 120,
      render: (_, record) =>
        record.status === "COMPLETED" ? (
          <Button size="small" loading={downloadExportTask.isPending} onClick={() => downloadExportTask.mutate(record)}>
            下载
          </Button>
        ) : record.status === "FAILED" ? (
          <Typography.Text type="danger" className="text-xs">
            {record.error ?? "生成失败"}
          </Typography.Text>
        ) : (
          "-"
        )
    }
  ];

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <Typography.Title level={3} className="page-title">
            组织权限
          </Typography.Title>
          <Typography.Text className="page-subtitle">
            {org.data?.tenant.name ?? "企业"} · 统一社会信用代码 {org.data?.tenant.code ?? "-"}
          </Typography.Text>
        </div>
        <Space>
          <Button icon={<RotateCw size={16} />} onClick={() => org.refetch()} loading={org.isFetching}>
            刷新
          </Button>
          {isSuperAdmin ? (
            <Button
              icon={<CreditCard size={16} />}
              onClick={() => {
                const subscription = org.data?.subscription;
                if (subscription) {
                  subscriptionForm.setFieldsValue({
                    plan: subscription.plan,
                    status: subscription.status,
                    seatLimit: subscription.seatLimit,
                    currentPeriodEnd: subscription.currentPeriodEnd ? dayjs(subscription.currentPeriodEnd) : undefined,
                    trialEndsAt: subscription.trialEndsAt ? dayjs(subscription.trialEndsAt) : undefined,
                    provider: subscription.provider ?? "manual"
                  });
                }
                setSubscriptionModalOpen(true);
              }}
            >
              调整订阅
            </Button>
          ) : null}
          {isSuperAdmin ? (
            <Button type="primary" icon={<Plus size={16} />} onClick={() => setTenantModalOpen(true)}>
              新增企业
            </Button>
          ) : null}
        </Space>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="metric-card">
          <div className="metric-label">当前状态</div>
          <div className="metric-value text-[24px]">{subscriptionTitle}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">{isTrialing ? "试用到期" : "服务到期"}</div>
          <div className="mt-2">
            <Tag color={statusColor(subscription?.status)}>{dateText(isTrialing ? subscription?.trialEndsAt : subscription?.currentPeriodEnd)}</Tag>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">当前启用成员</div>
          <div className="metric-value">
            {activeMemberCount} 人
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">{isTrialing ? "试用结束后预计月费" : "当前预计月费"}</div>
          <div className="mt-2 text-lg font-medium">
            {activeMemberCount} × ¥{(unitPriceCents / 100).toFixed(0)} = {moneyText(estimatedMonthlyAmountCents)} / 月
          </div>
        </div>
      </div>

      {org.data?.subscription && !org.data.subscription.isUsable ? (
        <Alert
          type="warning"
          showIcon
          message="当前企业订阅不可用"
          description="试用或服务周期已结束。请完成专业版续费后继续使用，专业版按启用成员数量计费。"
        />
      ) : null}

      <div className="surface-panel p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-secondary-container text-secondary">
              <ShieldCheck size={20} />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-ink">数据保密与导出备份</div>
              <div className="mt-1 max-w-4xl text-sm leading-6 text-muted">
                企业数据按租户隔离并视为保密数据。导出会在后台生成 ZIP 压缩包并设置下载有效期，避免大数据量请求超时。
              </div>
            </div>
          </div>
          <Button className="w-full shrink-0 lg:w-auto" icon={<Download size={16} />} loading={createExportTask.isPending} onClick={() => createExportTask.mutate()}>
            {canManage ? "生成企业备份" : "生成我的备份"}
          </Button>
        </div>
      </div>

      {!canManage ? (
        <Alert
          type="info"
          showIcon
          message="当前身份为只读权限"
          description="只有企业管理员可以设置组织架构、管理员工、分配部门和调整角色。"
        />
      ) : null}

      <Tabs
        items={[
          {
            key: "departments",
            label: "部门",
            children: (
              <div className="space-y-3">
                {canManage ? (
                  <Button
                    type="primary"
                    icon={<Plus size={16} />}
                    onClick={() => {
                      setEditingDepartment(null);
                      departmentForm.resetFields();
                      setDepartmentModalOpen(true);
                    }}
                  >
                    新增部门
                  </Button>
                ) : null}
                <Table
                  rowKey="id"
                  loading={org.isFetching}
                  dataSource={org.data?.departments ?? []}
                  columns={departmentColumns}
                  locale={{ emptyText: <Empty description="暂无部门" /> }}
                  pagination={false}
                />
              </div>
            )
          },
          {
            key: "users",
            label: "员工与角色",
            children: (
              <div className="space-y-3">
                {canManage ? (
                  <Button
                    type="primary"
                    icon={<Plus size={16} />}
                    onClick={() => {
                      setEditingUser(null);
                      userForm.resetFields();
                      userForm.setFieldsValue({ roles: ["EMPLOYEE"], isActive: true, requiresWorkReport: true });
                      setUserModalOpen(true);
                    }}
                  >
                    新增员工
                  </Button>
                ) : null}
                <Table
                  rowKey="id"
                  loading={org.isFetching}
                  dataSource={org.data?.users ?? []}
                  columns={userColumns}
                  locale={{ emptyText: <Empty description="暂无员工" /> }}
                  pagination={{ pageSize: 8 }}
                />
              </div>
            )
          },
          ...(canManage
            ? [
                {
                  key: "billing",
                  label: "订阅订单",
                  children: (
                    <div className="space-y-4">
                      <div className="surface-panel p-5">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                          <div>
                            <div className="text-base font-medium text-ink">订阅与支付</div>
                            <div className="mt-1 text-sm text-muted">企业免费试用1个月，正式使用 ¥19 / 启用成员 / 月。</div>
                          </div>
                          <Space wrap>
                            <Select
                              value={checkoutProvider}
                              style={{ width: 128 }}
                              options={paymentProviderOptions}
                              onChange={setCheckoutProvider}
                            />
                          </Space>
                        </div>
                        <div className="mt-4 grid gap-3 xl:grid-cols-2">
                          <div className="rounded-[8px] border border-line bg-white p-4 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-base font-semibold text-ink">{freeBillingPlan.name}</div>
                                <div className="mt-1 min-h-10 text-sm leading-5 text-muted">{freeBillingPlan.description}</div>
                              </div>
                              {org.data?.subscription.plan === "TRIAL" ? <Tag color="green">当前</Tag> : null}
                            </div>
                            <div className="mt-4 flex items-end gap-2">
                              <span className="text-3xl font-semibold text-ink">{freeBillingPlan.price}</span>
                            </div>
                            <div className="mt-2 text-sm text-muted">注册后自动获得，试用期内不限制成员人数。</div>
                            <div className="mt-4 space-y-2">
                              {freeBillingPlan.features.map((feature) => (
                                <div key={feature} className="flex items-center gap-2 text-sm text-muted">
                                  <CheckCircle2 size={15} className="text-success" />
                                  <span>{feature}</span>
                                </div>
                              ))}
                            </div>
                            <Button className="mt-4 w-full" disabled>
                              当前试用规则
                            </Button>
                          </div>
                          {(billingPlans.data?.plans ?? []).map((plan) => {
                            const amount = Math.max(1, activeMemberCount) * planPrice(plan);
                            const isCurrent = org.data?.subscription.plan === plan.plan;
                            return (
                              <div key={plan.plan} className={`rounded-[8px] border bg-white p-4 shadow-sm ${plan.plan === "TEAM" ? "border-primary bg-primary-container/40" : "border-line"}`}>
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <div className="text-base font-semibold text-ink">{plan.name}</div>
                                    <div className="mt-1 min-h-10 text-sm leading-5 text-muted">{plan.description}</div>
                                  </div>
                                  {isCurrent ? <Tag color="green">当前</Tag> : null}
                                </div>
                                <div className="mt-4 flex items-end gap-2">
                                  <span className="text-3xl font-semibold text-ink">¥{(planPrice(plan) / 100).toFixed(0)}</span>
                                  <span className="pb-1 text-xs text-muted">/ 启用成员 / 月</span>
                                </div>
                                <div className="mt-2 text-sm text-muted">
                                  当前启用成员：{activeMemberCount} 人 · 应付金额：{moneyText(amount)} / 月
                                </div>
                                <div className="mt-4 space-y-2">
                                  {plan.features.map((feature) => (
                                    <div key={feature} className="flex items-center gap-2 text-sm text-muted">
                                      <CheckCircle2 size={15} className="text-success" />
                                      <span>{feature}</span>
                                    </div>
                                  ))}
                                </div>
                                <Button
                                  className="mt-4 w-full"
                                  type={plan.plan === "TEAM" ? "primary" : "default"}
                                  icon={<ReceiptText size={16} />}
                                  loading={createBillingOrder.isPending}
                                  onClick={() => {
                                    startPlanCheckout(plan);
                                  }}
                                >
                                  {isTrialing ? "试用结束后支付" : "续费专业版"}
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                        {billingPlans.error ? <Alert className="mt-4" type="error" showIcon message={(billingPlans.error as Error).message} /> : null}
                      </div>
                      <Table
                        rowKey="id"
                        loading={billingOrders.isFetching}
                        dataSource={billingOrders.data ?? []}
                        columns={billingOrderColumns}
                        locale={{ emptyText: <Empty description="暂无订阅订单" /> }}
                        pagination={{ pageSize: 6 }}
                      />
                    </div>
                  )
                },
                {
                  key: "audit",
                  label: "安全审计",
                  children: (
                    <div className="space-y-3">
                      <Alert
                        type="success"
                        showIcon
                        message="关键操作已进入审计日志"
                        description="登录、注册、密码、订阅、数据删除申请等关键操作会记录到租户内审计日志，便于企业追溯。"
                      />
                      <Table
                        rowKey="id"
                        loading={auditLogs.isFetching}
                        dataSource={auditLogs.data ?? []}
                        columns={auditColumns}
                        locale={{ emptyText: <Empty description="暂无审计日志" /> }}
                        pagination={{ pageSize: 8 }}
                      />
                    </div>
                  )
                }
              ]
            : []),
          {
            key: "privacy",
            label: "数据治理",
            children: (
              <div className="space-y-3">
                <div className="surface-panel p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-error-container text-error">
                        <FileLock2 size={20} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-ink">数据可携带与退出机制</div>
                        <div className="mt-1 max-w-4xl text-sm leading-6 text-muted">
                          企业停用系统前可以先导出完整备份，再提交数据删除申请。全企业删除需要企业管理员发起；个人可申请删除自己的账号相关数据。
                        </div>
                      </div>
                    </div>
                    <Space className="w-full shrink-0 lg:w-auto">
                      <Button icon={<Download size={16} />} loading={createExportTask.isPending} onClick={() => createExportTask.mutate()}>
                        {canManage ? "生成企业备份" : "生成我的备份"}
                      </Button>
                      <Button
                        danger
                        icon={<Trash2 size={16} />}
                        onClick={() => {
                          dataDeletionForm.setFieldsValue({ scope: canManage ? "TENANT" : "SELF" });
                          setDataDeletionModalOpen(true);
                        }}
                      >
                        申请删除数据
                      </Button>
                    </Space>
                  </div>
                </div>
                <div className="surface-panel p-5">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-ink">导出任务</div>
                      <div className="mt-1 text-xs text-muted">生成完成后请在有效期内下载，过期后需重新生成。</div>
                    </div>
                    <Button icon={<RotateCw size={16} />} onClick={() => exportTasks.refetch()} loading={exportTasks.isFetching}>
                      刷新任务
                    </Button>
                  </div>
                  <Table
                    rowKey="id"
                    loading={exportTasks.isFetching}
                    dataSource={exportTasks.data ?? []}
                    columns={exportTaskColumns}
                    locale={{ emptyText: <Empty description="暂无导出任务" /> }}
                    pagination={{ pageSize: 5 }}
                  />
                </div>
                <Table
                  rowKey="id"
                  loading={deletionRequests.isFetching}
                  dataSource={deletionRequests.data ?? []}
                  columns={deletionColumns}
                  locale={{ emptyText: <Empty description="暂无数据删除申请" /> }}
                  pagination={{ pageSize: 6 }}
                />
              </div>
            )
          },
          {
            key: "security",
            label: "账号安全",
            children: (
              <div className="grid gap-3 lg:grid-cols-[420px_1fr]">
                <div className="surface-panel p-5">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-primary-container text-primary">
                      <KeyRound size={20} />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-ink">修改登录密码</div>
                      <div className="text-xs text-muted">发布前已加入登录限流、失败锁定和密码重置接口。</div>
                    </div>
                  </div>
                  {changePassword.error ? <Alert className="mb-4" type="error" showIcon message={(changePassword.error as Error).message} /> : null}
                  <Form form={changePasswordForm} layout="vertical" onFinish={(values) => changePassword.mutate(values)}>
                    <Form.Item name="currentPassword" label="当前密码" rules={[{ required: true }]}>
                      <Input.Password />
                    </Form.Item>
                    <Form.Item name="newPassword" label="新密码" rules={[{ required: true, min: 6 }]}>
                      <Input.Password />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" icon={<KeyRound size={16} />} loading={changePassword.isPending}>
                      更新密码
                    </Button>
                  </Form>
                </div>
                <Alert
                  type="info"
                  showIcon
                  icon={<History size={18} />}
                  message="账号安全策略"
                  description="连续登录失败会临时锁定账号；密码重置令牌和邮箱验证令牌只保存哈希值；生产环境可开启 REQUIRE_EMAIL_VERIFICATION=true 强制邮箱验证。"
                />
              </div>
            )
          }
        ]}
      />

      <Modal
        title="新增企业"
        open={tenantModalOpen}
        onCancel={() => setTenantModalOpen(false)}
        onOk={() => tenantForm.submit()}
        confirmLoading={createTenant.isPending}
      >
        <Form form={tenantForm} layout="vertical" onFinish={(values) => createTenant.mutate(values)}>
          <Form.Item name="name" label="企业名称" rules={[{ required: true, min: 2 }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="code"
            label="统一社会信用代码"
            extra="请填写营业执照上的 18 位统一社会信用代码，系统将作为企业唯一注册标识。"
            normalize={normalizeUnifiedSocialCreditCode}
            rules={[{ required: true, pattern: unifiedSocialCreditCodePattern, message: unifiedSocialCreditCodeMessage }]}
          >
            <Input placeholder="例如：91110105MA01A1B2X3" />
          </Form.Item>
          <Form.Item name="adminName" label="初始管理员姓名" rules={[{ required: true, min: 2 }]}>
            <Input />
          </Form.Item>
          <Form.Item name="adminEmail" label="初始管理员邮箱" rules={[{ required: true, type: "email" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="adminPassword" label="初始管理员密码">
            <Input.Password placeholder="默认 Passw0rd!" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingDepartment ? "编辑部门" : "新增部门"}
        open={departmentModalOpen}
        onCancel={() => setDepartmentModalOpen(false)}
        onOk={() => departmentForm.submit()}
        confirmLoading={saveDepartment.isPending}
      >
        <Form form={departmentForm} layout="vertical" onFinish={(values) => saveDepartment.mutate(values)}>
          <Form.Item name="name" label="部门名称" rules={[{ required: true, min: 2 }]}>
            <Input />
          </Form.Item>
          <Form.Item name="parentId" label="上级部门">
            <Select allowClear options={departmentOptions.filter((item) => item.value !== editingDepartment?.id)} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingUser ? "编辑员工" : "新增员工"}
        open={userModalOpen}
        onCancel={() => setUserModalOpen(false)}
        onOk={() => userForm.submit()}
        confirmLoading={saveUser.isPending}
        width={680}
      >
        <Form form={userForm} layout="vertical" onFinish={(values) => saveUser.mutate(values)}>
          <div className="grid grid-cols-2 gap-3">
            <Form.Item name="name" label="姓名" rules={[{ required: true, min: 2 }]}>
              <Input />
            </Form.Item>
            <Form.Item name="email" label="邮箱" rules={[{ type: "email", message: "请输入有效邮箱" }]}>
              <Input placeholder="name@example.com" />
            </Form.Item>
            <Form.Item name="phone" label="手机号">
              <Input placeholder="13900000000" />
            </Form.Item>
            <Form.Item name="departmentId" label="部门">
              <Select allowClear options={departmentOptions} />
            </Form.Item>
            <Form.Item name="password" label={editingUser ? "重置密码" : "初始密码"}>
              <Input.Password placeholder={editingUser ? "留空不修改" : "默认 Passw0rd!"} />
            </Form.Item>
          </div>
          <Alert
            className="mb-4"
            type="info"
            showIcon
            message="邮箱和手机号至少填写一个。管理员等无需日报统计的账号，可关闭“需要填报”。"
            description={memberBillingHint}
          />
          <Form.Item name="roles" label="角色" rules={[{ required: true }]}>
            <Select mode="multiple" options={roleOptions} />
          </Form.Item>
          <Form.Item name="requiresWorkReport" label="需要填报" valuePropName="checked">
            <Switch checkedChildren="计入" unCheckedChildren="不计入" />
          </Form.Item>
          {editingUser ? (
            <Form.Item name="isActive" label="账号启用" valuePropName="checked">
              <Switch />
            </Form.Item>
          ) : null}
        </Form>
      </Modal>

      <Modal
        title="调整订阅"
        open={subscriptionModalOpen}
        onCancel={() => setSubscriptionModalOpen(false)}
        onOk={() => subscriptionForm.submit()}
        confirmLoading={saveSubscription.isPending}
      >
        <Form form={subscriptionForm} layout="vertical" onFinish={(values) => saveSubscription.mutate(values)}>
          <div className="grid grid-cols-2 gap-3">
            <Form.Item name="plan" label="订阅版本" rules={[{ required: true }]}>
              <Select options={planOptions} />
            </Form.Item>
            <Form.Item name="status" label="状态" rules={[{ required: true }]}>
              <Select options={statusOptions.map(({ value, label }) => ({ value, label }))} />
            </Form.Item>
            <Form.Item name="seatLimit" label="计费人数记录" rules={[{ required: true }]}>
              <InputNumber className="w-full" min={0} max={100000} />
            </Form.Item>
            <Form.Item name="provider" label="开通渠道">
              <Input placeholder="manual / alipay / stripe" />
            </Form.Item>
            <Form.Item name="currentPeriodEnd" label="服务到期日">
              <DatePicker className="w-full" />
            </Form.Item>
            <Form.Item name="trialEndsAt" label="试用到期日">
              <DatePicker className="w-full" />
            </Form.Item>
          </div>
        </Form>
      </Modal>

      <Modal
        title="创建专业版订单"
        open={billingOrderModalOpen}
        onCancel={() => setBillingOrderModalOpen(false)}
        onOk={() => billingOrderForm.submit()}
        confirmLoading={createBillingOrder.isPending}
      >
        {createBillingOrder.error ? <Alert className="mb-4" type="error" showIcon message={(createBillingOrder.error as Error).message} /> : null}
        <Form form={billingOrderForm} layout="vertical" onFinish={(values) => createBillingOrder.mutate(values)}>
          <div className="grid grid-cols-1 gap-3">
            <Form.Item name="provider" label="支付方式" rules={[{ required: true }]}>
              <Select options={paymentProviderOptions} />
            </Form.Item>
          </div>
          <Alert
            type="info"
            showIcon
            message="价格规则"
            description={`专业版 ¥19 / 启用成员 / 月。当前启用成员 ${activeMemberCount} 人，应付 ${moneyText(Math.max(1, activeMemberCount) * unitPriceCents)} / 月。`}
          />
        </Form>
      </Modal>

      <Modal
        title="完成支付"
        open={Boolean(checkout)}
        onCancel={() => setCheckout(null)}
        footer={null}
        width={560}
      >
        {checkout ? (
          <div className="space-y-4">
            <div className="rounded-[8px] bg-surface-container p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm text-muted">{paymentProviderLabels[checkout.order.provider] ?? checkout.order.provider}</div>
                  <div className="mt-1 text-2xl font-semibold text-ink">{moneyText(checkout.order.amountCents, checkout.order.currency)}</div>
                </div>
                <Tag color={checkout.order.status === "PAID" ? "green" : "orange"}>{checkout.order.status}</Tag>
              </div>
              <div className="mt-2 text-sm text-muted">
                {planLabel(checkout.order.plan)} · {optionLabel(billingIntervalOptions, checkout.order.interval)} · {checkout.order.seatLimit} 位启用成员
              </div>
            </div>
            <div className="flex flex-col items-center rounded-[8px] border border-line bg-white p-5 text-center">
              <div className="flex h-32 w-32 items-center justify-center rounded-[8px] border border-line bg-surface-container-low text-primary">
                <QrCode size={74} />
              </div>
              <div className="mt-3 text-sm font-medium text-ink">
                {checkout.payment?.mode === "mock" ? "本地模拟支付码" : "请使用对应支付 App 扫码"}
              </div>
              <Typography.Text className="mt-2 max-w-full break-all text-xs text-muted">
                {checkout.payment?.qrCodeText ?? checkout.payment?.paymentUrl ?? "等待支付信息"}
              </Typography.Text>
            </div>
            <Space className="w-full justify-end" wrap>
              {checkout.payment?.paymentUrl ? (
                <Button href={checkout.payment.paymentUrl} target="_blank">
                  打开支付链接
                </Button>
              ) : null}
              <Button onClick={() => billingOrders.refetch()} loading={billingOrders.isFetching}>
                刷新订单
              </Button>
              <Button
                type="primary"
                loading={confirmOnlinePayment.isPending}
                disabled={checkout.order.status === "PAID"}
                onClick={() => confirmOnlinePayment.mutate(checkout.order.id)}
              >
                {checkout.payment?.mode === "mock" ? "模拟支付完成" : "我已完成支付"}
              </Button>
            </Space>
            {checkout.payment?.mode === "live" ? (
              <Alert type="info" showIcon message="生产支付应由微信/支付宝回调确认，本按钮不会绕过平台验签。" />
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        title="申请删除数据"
        open={dataDeletionModalOpen}
        onCancel={() => setDataDeletionModalOpen(false)}
        onOk={() => dataDeletionForm.submit()}
        confirmLoading={requestDataDeletion.isPending}
        okButtonProps={{ danger: true }}
      >
        {requestDataDeletion.error ? <Alert className="mb-4" type="error" showIcon message={(requestDataDeletion.error as Error).message} /> : null}
        <Alert
          className="mb-4"
          type="warning"
          showIcon
          message="提交前请先导出备份"
          description="删除申请进入人工处理流程，生产环境应在确认企业授权、结清账单和完成备份交接后执行。"
        />
        <Form form={dataDeletionForm} layout="vertical" onFinish={(values) => requestDataDeletion.mutate(values)}>
          <Form.Item name="scope" label="删除范围" rules={[{ required: true }]}>
            <Select
              options={[
                { value: "SELF", label: "仅删除我的相关数据" },
                ...(canManage ? [{ value: "TENANT", label: "删除全企业相关数据" }] : [])
              ]}
            />
          </Form.Item>
          <Form.Item name="reason" label="申请原因">
            <Input.TextArea rows={4} maxLength={1000} showCount placeholder="例如：停止使用系统，已完成数据导出备份。" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
