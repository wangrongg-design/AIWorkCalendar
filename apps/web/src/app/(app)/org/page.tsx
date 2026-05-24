"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, DatePicker, Empty, Form, Input, InputNumber, Modal, Select, Space, Switch, Table, Tabs, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { Dayjs } from "dayjs";
import { CreditCard, Download, Edit2, FileLock2, History, KeyRound, Plus, ReceiptText, RotateCw, ShieldCheck, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { hasAnyRole, useAuthStore } from "@/lib/auth-store";
import {
  AuditLog,
  BillingInterval,
  BillingOrder,
  DataDeletionRequest,
  DataDeletionScope,
  Department,
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
  plan: SubscriptionPlan;
  interval: BillingInterval;
  seatLimit: number;
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
  { value: "TRIAL", label: "试用版" },
  { value: "TEAM", label: "团队版" },
  { value: "BUSINESS", label: "商业版" },
  { value: "ENTERPRISE", label: "企业版" }
];

const statusOptions: Array<{ value: SubscriptionStatus; label: string; color: string }> = [
  { value: "TRIALING", label: "试用中", color: "blue" },
  { value: "ACTIVE", label: "已开通", color: "green" },
  { value: "PAST_DUE", label: "待续费", color: "orange" },
  { value: "EXPIRED", label: "已到期", color: "red" },
  { value: "CANCELED", label: "已取消", color: "default" }
];

const billingIntervalOptions: Array<{ value: BillingInterval; label: string }> = [
  { value: "MONTHLY", label: "月付" },
  { value: "YEARLY", label: "年付" }
];

const paymentProviderOptions: Array<{ value: PaymentProvider; label: string }> = [
  { value: "MANUAL", label: "线下转账" },
  { value: "ALIPAY", label: "支付宝" },
  { value: "WECHAT", label: "微信支付" },
  { value: "STRIPE", label: "Stripe" }
];

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

function optionLabel<T extends string>(options: Array<{ value: T; label: string }>, value?: T) {
  return options.find((item) => item.value === value)?.label ?? value ?? "-";
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

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
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
      apiFetch("/org/tenants", { method: "POST", body: JSON.stringify(values) }),
    onSuccess: () => {
      message.success("企业已创建");
      setTenantModalOpen(false);
      tenantForm.resetFields();
      queryClient.invalidateQueries({ queryKey: ["org"] });
    }
  });

  const saveUser = useMutation({
    mutationFn: (values: {
      email: string;
      name: string;
      departmentId?: string;
      password?: string;
      roles: RoleCode[];
      isActive?: boolean;
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
    onSuccess: () => {
      message.success("订阅订单已创建");
      setBillingOrderModalOpen(false);
      billingOrderForm.resetFields();
      queryClient.invalidateQueries({ queryKey: ["billing-orders"] });
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

  const exportData = useMutation({
    mutationFn: () => apiFetch<unknown>(`/exports/data?scope=${canManage ? "tenant" : "self"}`),
    onSuccess: (data) => {
      const scope = canManage ? "tenant" : "self";
      const code = org.data?.tenant.code ?? "work-calendar";
      downloadJson(`work-calendar-ai-${code}-${scope}-${dayjs().format("YYYYMMDD-HHmmss")}.json`, data);
      message.success("数据备份已导出");
    }
  });

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
    { title: "邮箱", dataIndex: "email", width: 220 },
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
    { title: "套餐", dataIndex: "plan", width: 110, render: (value: SubscriptionPlan) => optionLabel(planOptions, value) },
    { title: "周期", dataIndex: "interval", width: 90, render: (value: BillingInterval) => optionLabel(billingIntervalOptions, value) },
    { title: "席位", dataIndex: "seatLimit", width: 90 },
    { title: "金额", dataIndex: "amountCents", width: 130, render: (value: number, record) => moneyText(value, record.currency) },
    { title: "支付方式", dataIndex: "provider", width: 120, render: (value: PaymentProvider) => optionLabel(paymentProviderOptions, value) },
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
        ) : record.paymentUrl ? (
          <Button size="small" href={record.paymentUrl} target="_blank">
            去支付
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

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <Typography.Title level={3} className="page-title">
            组织权限
          </Typography.Title>
          <Typography.Text className="page-subtitle">
            {org.data?.tenant.name ?? "企业"} · 企业代码 {org.data?.tenant.code ?? "-"}
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
          <div className="metric-label">当前套餐</div>
          <div className="metric-value text-[24px]">{optionLabel(planOptions, org.data?.subscription.plan)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">订阅状态</div>
          <div className="mt-2">
            <Tag color={statusColor(org.data?.subscription.status)}>{optionLabel(statusOptions, org.data?.subscription.status)}</Tag>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">席位用量</div>
          <div className="metric-value">
            {org.data?.subscription.usedSeats ?? 0}/{org.data?.subscription.seatLimit ?? 0}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">服务到期</div>
          <div className="mt-2 text-lg font-medium">{dateText(org.data?.subscription.currentPeriodEnd)}</div>
        </div>
      </div>

      {org.data?.subscription && !org.data.subscription.isUsable ? (
        <Alert
          type="warning"
          showIcon
          message="当前企业订阅不可用"
          description="订阅已到期、取消或处于待续费状态。新增员工会被限制，请联系平台管理员续费或调整套餐。"
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
                企业数据按租户隔离并视为保密数据。企业管理员可导出全企业组织、填报、AI 分析、汇报、通知和订阅数据；普通员工可导出自己的相关数据。
              </div>
            </div>
          </div>
          <Button className="w-full shrink-0 lg:w-auto" icon={<Download size={16} />} loading={exportData.isPending} onClick={() => exportData.mutate()}>
            {canManage ? "导出企业数据" : "导出我的数据"}
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
                      userForm.setFieldsValue({ roles: ["EMPLOYEE"], isActive: true });
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
                    <div className="space-y-3">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <Alert
                          className="flex-1"
                          type="info"
                          showIcon
                          message="第一版支持手动开通订单"
                          description="企业管理员可创建升级订单；平台超级管理员确认线下收款后，系统会自动开通对应套餐。支付宝、微信支付和 Stripe 已预留 Provider。"
                        />
                        <Button
                          type="primary"
                          icon={<ReceiptText size={16} />}
                          onClick={() => {
                            billingOrderForm.setFieldsValue({
                              plan: "TEAM",
                              interval: "MONTHLY",
                              seatLimit: Math.max(org.data?.subscription.seatLimit ?? 3, 5),
                              provider: "MANUAL"
                            });
                            setBillingOrderModalOpen(true);
                          }}
                        >
                          创建订阅订单
                        </Button>
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
                      <Button icon={<Download size={16} />} loading={exportData.isPending} onClick={() => exportData.mutate()}>
                        {canManage ? "导出企业数据" : "导出我的数据"}
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
          <Form.Item name="code" label="企业代码" rules={[{ required: true, pattern: /^[a-z0-9-]{2,32}$/ }]}>
            <Input placeholder="acme" />
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
            <Form.Item name="email" label="邮箱" rules={[{ required: true, type: "email" }]}>
              <Input disabled={Boolean(editingUser)} />
            </Form.Item>
            <Form.Item name="departmentId" label="部门">
              <Select allowClear options={departmentOptions} />
            </Form.Item>
            <Form.Item name="password" label={editingUser ? "重置密码" : "初始密码"}>
              <Input.Password placeholder={editingUser ? "留空不修改" : "默认 Passw0rd!"} />
            </Form.Item>
          </div>
          <Form.Item name="roles" label="角色" rules={[{ required: true }]}>
            <Select mode="multiple" options={roleOptions} />
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
            <Form.Item name="plan" label="套餐" rules={[{ required: true }]}>
              <Select options={planOptions} />
            </Form.Item>
            <Form.Item name="status" label="状态" rules={[{ required: true }]}>
              <Select options={statusOptions.map(({ value, label }) => ({ value, label }))} />
            </Form.Item>
            <Form.Item name="seatLimit" label="席位上限" rules={[{ required: true }]}>
              <InputNumber className="w-full" min={1} max={100000} />
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
        title="创建订阅订单"
        open={billingOrderModalOpen}
        onCancel={() => setBillingOrderModalOpen(false)}
        onOk={() => billingOrderForm.submit()}
        confirmLoading={createBillingOrder.isPending}
      >
        {createBillingOrder.error ? <Alert className="mb-4" type="error" showIcon message={(createBillingOrder.error as Error).message} /> : null}
        <Form form={billingOrderForm} layout="vertical" onFinish={(values) => createBillingOrder.mutate(values)}>
          <div className="grid grid-cols-2 gap-3">
            <Form.Item name="plan" label="套餐" rules={[{ required: true }]}>
              <Select options={planOptions.filter((item) => item.value !== "TRIAL")} />
            </Form.Item>
            <Form.Item name="interval" label="付费周期" rules={[{ required: true }]}>
              <Select options={billingIntervalOptions} />
            </Form.Item>
            <Form.Item name="seatLimit" label="席位数" rules={[{ required: true }]}>
              <InputNumber className="w-full" min={1} max={100000} />
            </Form.Item>
            <Form.Item name="provider" label="支付方式" rules={[{ required: true }]}>
              <Select options={paymentProviderOptions} />
            </Form.Item>
          </div>
          <Alert
            type="info"
            showIcon
            message="价格规则"
            description="团队版 39 元/席/月，商业版 99 元/席/月，企业版 299 元/席/月；年付按 10 个月计费。"
          />
        </Form>
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
