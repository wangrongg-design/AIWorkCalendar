"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Cascader, DatePicker, Empty, Form, Input, InputNumber, Modal, QRCode, Select, Space, Switch, Table, Tabs, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { Dayjs } from "dayjs";
import { CheckCircle2, CreditCard, Download, Edit2, FileLock2, History, KeyRound, MessageSquare, Plus, ReceiptText, RotateCw, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
  FeedbackCategory,
  FeedbackPriority,
  FeedbackRequest,
  FeedbackStatus,
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

type DepartmentTreeNode = Department & {
  children?: DepartmentTreeNode[];
};

type DepartmentCascaderOption = {
  value: string;
  label: string;
  disabled?: boolean;
  children?: DepartmentCascaderOption[];
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

type FeedbackForm = {
  category: FeedbackCategory;
  priority?: FeedbackPriority;
  title: string;
  content: string;
  contact?: string;
};

type FeedbackStatusForm = {
  status: FeedbackStatus;
  resolution?: string;
};

type DepartmentForm = {
  name: string;
  parentId?: string | string[] | null;
};

type OrgUserForm = {
  email?: string;
  phone?: string;
  name: string;
  departmentId?: string | string[] | null;
  password?: string;
  roles: RoleCode[];
  isActive?: boolean;
  requiresWorkReport?: boolean;
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

const paymentProviderOptions: Array<{ value: "ALIPAY" | "WECHAT"; label: string }> = [
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

function lastPathValue(value?: string | string[] | null) {
  if (Array.isArray(value)) return value.at(-1) ?? null;
  return value || null;
}

function contactText(record: { email?: string | null; phone?: string | null }) {
  return [record.phone, record.email].filter(Boolean).join(" / ") || "-";
}

const orderStatusColors: Record<string, string> = {
  PENDING: "orange",
  PAID: "green",
  CANCELED: "default",
  EXPIRED: "red"
};

const orderStatusLabels: Record<string, string> = {
  PENDING: "待支付",
  PAID: "已支付",
  CANCELED: "已取消",
  EXPIRED: "已过期"
};

const deletionStatusColors: Record<string, string> = {
  REQUESTED: "orange",
  PROCESSING: "blue",
  COMPLETED: "green",
  CANCELED: "default"
};

const deletionStatusLabels: Record<string, string> = {
  REQUESTED: "已提交",
  PROCESSING: "处理中",
  COMPLETED: "已完成",
  CANCELED: "已取消"
};

const exportTaskStatusColors: Record<ExportTaskStatus, string> = {
  PENDING: "orange",
  PROCESSING: "blue",
  COMPLETED: "green",
  FAILED: "red",
  EXPIRED: "default"
};

const exportTaskStatusLabels: Record<ExportTaskStatus, string> = {
  PENDING: "排队中",
  PROCESSING: "生成中",
  COMPLETED: "可下载",
  FAILED: "生成失败",
  EXPIRED: "已过期"
};

const feedbackCategoryOptions: Array<{ value: FeedbackCategory; label: string }> = [
  { value: "BUG", label: "功能异常" },
  { value: "ACCOUNT_PERMISSION", label: "账号权限" },
  { value: "DATA_RIGHTS", label: "数据权益" },
  { value: "BILLING", label: "计费订阅" },
  { value: "PRIVACY_SECURITY", label: "隐私安全" },
  { value: "SUGGESTION", label: "产品建议" },
  { value: "OTHER", label: "其他问题" }
];

const feedbackPriorityOptions: Array<{ value: FeedbackPriority; label: string; color: string }> = [
  { value: "LOW", label: "一般", color: "default" },
  { value: "NORMAL", label: "普通", color: "blue" },
  { value: "HIGH", label: "重要", color: "orange" },
  { value: "URGENT", label: "紧急", color: "red" }
];

const feedbackStatusOptions: Array<{ value: FeedbackStatus; label: string; color: string }> = [
  { value: "SUBMITTED", label: "已提交", color: "orange" },
  { value: "PROCESSING", label: "处理中", color: "blue" },
  { value: "RESOLVED", label: "已解决", color: "green" },
  { value: "CLOSED", label: "已关闭", color: "default" }
];

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

function subscriptionPeriodText(period?: BillingOrderPayment["subscriptionPeriod"]) {
  if (!period) return "待支付成功后确认";
  return `${dateText(period.startDate)} 至 ${dateText(period.endDate)}`;
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
  const [feedbackForm] = Form.useForm<FeedbackForm>();
  const [feedbackStatusForm] = Form.useForm<FeedbackStatusForm>();
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
  const [editingUser, setEditingUser] = useState<OrgUser | null>(null);
  const [handlingFeedback, setHandlingFeedback] = useState<FeedbackRequest | null>(null);
  const [tenantModalOpen, setTenantModalOpen] = useState(false);
  const [departmentModalOpen, setDepartmentModalOpen] = useState(false);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [subscriptionModalOpen, setSubscriptionModalOpen] = useState(false);
  const [billingOrderModalOpen, setBillingOrderModalOpen] = useState(false);
  const [dataDeletionModalOpen, setDataDeletionModalOpen] = useState(false);
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [checkoutProvider, setCheckoutProvider] = useState<"ALIPAY" | "WECHAT">("WECHAT");
  const [checkout, setCheckout] = useState<BillingOrderPayment | null>(null);
  const [checkoutRefreshing, setCheckoutRefreshing] = useState(false);

  const org = useQuery({
    queryKey: ["org"],
    queryFn: () => apiFetch<OrgResponse>("/org")
  });

  const departmentById = useMemo(() => {
    return new Map((org.data?.departments ?? []).map((item) => [item.id, item]));
  }, [org.data?.departments]);

  const departmentTree = useMemo<DepartmentTreeNode[]>(() => {
    const nodes = new Map<string, DepartmentTreeNode>();
    for (const department of org.data?.departments ?? []) {
      nodes.set(department.id, { ...department, children: [] });
    }
    const roots: DepartmentTreeNode[] = [];
    for (const department of org.data?.departments ?? []) {
      const node = nodes.get(department.id);
      if (!node) continue;
      const parent = department.parentId ? nodes.get(department.parentId) : null;
      if (parent && parent.id !== node.id) {
        parent.children = parent.children ?? [];
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }
    const trimEmptyChildren = (node: DepartmentTreeNode): DepartmentTreeNode => {
      if (node.children?.length) {
        node.children = node.children.map(trimEmptyChildren);
      } else {
        delete node.children;
      }
      return node;
    };
    return roots.map(trimEmptyChildren);
  }, [org.data?.departments]);

  const departmentPathIds = (departmentId?: string | null) => {
    const ids: string[] = [];
    const visited = new Set<string>();
    let current = departmentId ? departmentById.get(departmentId) : null;
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      ids.unshift(current.id);
      current = current.parentId ? departmentById.get(current.parentId) : null;
    }
    return ids;
  };

  const departmentFullPath = (departmentId?: string | null) => {
    const names = departmentPathIds(departmentId).map((id) => departmentById.get(id)?.name).filter(Boolean);
    return names.length ? names.join(" / ") : "未分配";
  };

  const isDepartmentDescendant = (departmentId: string, ancestorId: string) => {
    let current = departmentById.get(departmentId);
    const visited = new Set<string>();
    while (current?.parentId && !visited.has(current.id)) {
      visited.add(current.id);
      if (current.parentId === ancestorId) return true;
      current = departmentById.get(current.parentId);
    }
    return false;
  };

  const buildDepartmentCascaderOptions = (disabledIds = new Set<string>()) => {
    const toOption = (node: DepartmentTreeNode): DepartmentCascaderOption => ({
      value: node.id,
      label: node.name,
      disabled: disabledIds.has(node.id),
      children: node.children?.map(toOption)
    });
    return departmentTree.map(toOption);
  };

  const departmentCascaderOptions = useMemo(() => buildDepartmentCascaderOptions(), [departmentTree]);

  const parentDepartmentCascaderOptions = useMemo(() => {
    const disabledIds = new Set<string>();
    if (editingDepartment) {
      disabledIds.add(editingDepartment.id);
      for (const department of org.data?.departments ?? []) {
        if (isDepartmentDescendant(department.id, editingDepartment.id)) {
          disabledIds.add(department.id);
        }
      }
    }
    return buildDepartmentCascaderOptions(disabledIds);
  }, [departmentTree, departmentById, editingDepartment, org.data?.departments]);

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

  const availablePaymentProviderOptions = useMemo(() => {
    const configs = billingPlans.data?.paymentProviders ?? [];
    return paymentProviderOptions.map((option) => {
      const config = configs.find((item) => item.provider === option.value);
      const enabled = config?.enabled ?? true;
      return {
        ...option,
        disabled: !enabled,
        label: enabled ? option.label : `${option.label}（暂未配置）`
      };
    });
  }, [billingPlans.data?.paymentProviders]);

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

  const feedbackRequests = useQuery({
    queryKey: ["feedback-requests"],
    queryFn: () => apiFetch<FeedbackRequest[]>("/feedback/requests"),
    enabled: Boolean(user)
  });

  useEffect(() => {
    const selected = availablePaymentProviderOptions.find((item) => item.value === checkoutProvider);
    if (selected?.disabled) {
      const next = availablePaymentProviderOptions.find((item) => !item.disabled);
      if (next) {
        setCheckoutProvider(next.value);
      }
    }
  }, [availablePaymentProviderOptions, checkoutProvider]);

  useEffect(() => {
    if (!checkout || checkout.order.status !== "PENDING" || checkout.payment?.mode !== "live") {
      return;
    }
    let stopped = false;
    const refresh = async () => {
      try {
        const latest = await apiFetch<BillingOrderPayment>(`/billing/orders/${checkout.order.id}/payment`);
        if (stopped) return;
        if (latest.order.status === "PAID") {
          message.success("支付已到账，订阅已自动开通。");
          setCheckout(null);
          queryClient.invalidateQueries({ queryKey: ["billing-orders"] });
          queryClient.invalidateQueries({ queryKey: ["org"] });
          return;
        }
        setCheckout(latest);
      } catch {
        // Keep polling; transient network or callback timing issues should not interrupt checkout.
      }
    };
    const timer = window.setInterval(refresh, 3000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [checkout, queryClient]);

  const saveDepartment = useMutation({
    mutationFn: (values: DepartmentForm) => {
      const payload = {
        name: values.name,
        parentId: lastPathValue(values.parentId)
      };
      if (editingDepartment) {
        return apiFetch<Department>(`/org/departments/${editingDepartment.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload)
        });
      }
      return apiFetch<Department>("/org/departments", { method: "POST", body: JSON.stringify(payload) });
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
    mutationFn: (values: OrgUserForm) => {
      const payload = {
        ...values,
        departmentId: lastPathValue(values.departmentId)
      };
      if (editingUser) {
        return apiFetch<OrgUser>(`/org/users/${editingUser.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload)
        });
      }
      return apiFetch<OrgUser>("/org/users", {
        method: "POST",
        body: JSON.stringify({ ...payload, password: values.password || "Passw0rd!" })
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
        .catch((error) => message.error(error instanceof Error ? error.message : "支付信息获取失败，请刷新订单后重试。"));
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
      message.error(error instanceof Error ? error.message : "支付确认失败，请确认支付状态后重试。");
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

  const createFeedback = useMutation({
    mutationFn: (values: FeedbackForm) =>
      apiFetch<FeedbackRequest>("/feedback/requests", {
        method: "POST",
        body: JSON.stringify(values)
      }),
    onSuccess: () => {
      message.success("问题反馈已提交");
      setFeedbackModalOpen(false);
      feedbackForm.resetFields();
      queryClient.invalidateQueries({ queryKey: ["feedback-requests"] });
    }
  });

  const updateFeedbackStatus = useMutation({
    mutationFn: ({ id, values }: { id: string; values: FeedbackStatusForm }) =>
      apiFetch<FeedbackRequest>(`/feedback/requests/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify(values)
      }),
    onSuccess: () => {
      message.success("反馈处理状态已更新");
      setHandlingFeedback(null);
      feedbackStatusForm.resetFields();
      queryClient.invalidateQueries({ queryKey: ["feedback-requests"] });
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
      message.error(error instanceof Error ? error.message : "导出任务创建失败，请缩小导出范围后重试。");
    }
  });

  const downloadExportTask = useMutation({
    mutationFn: (task: ExportTask) => apiDownload(`/exports/data-tasks/${task.id}/download`),
    onSuccess: ({ blob, filename }) => {
      downloadBlob(filename, blob);
      message.success("备份压缩包已开始下载");
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : "下载失败，请确认文件仍在有效期内。");
    }
  });

  const startPlanCheckout = (plan: BillingPlan) => {
    createBillingOrder.mutate({
      plan: plan.plan,
      interval: "MONTHLY",
      provider: checkoutProvider
    });
  };

  const refreshCheckout = async () => {
    if (!checkout) return;
    setCheckoutRefreshing(true);
    try {
      const latest = await apiFetch<BillingOrderPayment>(`/billing/orders/${checkout.order.id}/payment`);
      if (latest.order.status === "PAID") {
        message.success("支付已到账，订阅已自动开通。");
        setCheckout(null);
        queryClient.invalidateQueries({ queryKey: ["billing-orders"] });
        queryClient.invalidateQueries({ queryKey: ["org"] });
      } else {
        setCheckout(latest);
        message.info("订单仍在等待支付回调，请完成扫码支付后稍等几秒。");
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : "支付状态刷新失败，请稍后重试。");
    } finally {
      setCheckoutRefreshing(false);
    }
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
  const checkoutPaymentCode = checkout?.payment?.qrCodeText ?? checkout?.payment?.paymentUrl ?? "";
  const checkoutIsLive = checkout?.payment?.mode === "live";
  const checkoutIsMock = checkout?.payment?.mode === "mock" || !checkout?.payment?.mode;

  const departmentColumns: ColumnsType<DepartmentTreeNode> = [
    {
      title: "部门",
      dataIndex: "name",
      width: 420,
      render: (value: string, record) => (
        <div>
          <div className="font-medium text-ink">{value}</div>
          <div className="mt-1 text-xs text-muted">完整路径：{departmentFullPath(record.id)}</div>
        </div>
      )
    },
    {
      title: "操作",
      width: 110,
      render: (_, record) =>
        canManage ? (
          <Button
            icon={<Edit2 size={15} />}
            onClick={() => {
              setEditingDepartment(record);
              departmentForm.setFieldsValue({ ...record, parentId: departmentPathIds(record.parentId) });
              setDepartmentModalOpen(true);
            }}
          />
        ) : null
    }
  ];

  const userColumns: ColumnsType<OrgUser> = [
    { title: "姓名", dataIndex: "name", width: 140 },
    { title: "联系方式", width: 260, render: (_, record) => contactText(record) },
    {
      title: "部门",
      width: 260,
      render: (_, record) =>
        record.departmentId ? (
          <span className="font-medium text-ink">{departmentFullPath(record.departmentId)}</span>
        ) : (
          "未分配"
        )
    },
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
              userForm.setFieldsValue({ ...record, departmentId: departmentPathIds(record.departmentId), password: undefined });
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
      render: (value: string) => <Tag color={orderStatusColors[value] ?? "default"}>{orderStatusLabels[value] ?? "未知状态"}</Tag>
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
                .catch((error) => message.error(error instanceof Error ? error.message : "支付信息获取失败，请刷新订单后重试。"))
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
      render: (value: string) => <Tag color={deletionStatusColors[value] ?? "default"}>{deletionStatusLabels[value] ?? "未知状态"}</Tag>
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
      render: (value: ExportTaskStatus) => <Tag color={exportTaskStatusColors[value]}>{exportTaskStatusLabels[value]}</Tag>
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

  const feedbackColumns: ColumnsType<FeedbackRequest> = [
    {
      title: "类型",
      dataIndex: "category",
      width: 120,
      render: (value: FeedbackCategory) => optionLabel(feedbackCategoryOptions, value)
    },
    {
      title: "反馈内容",
      dataIndex: "title",
      render: (_, record) => (
        <div className="min-w-0">
          <div className="font-medium text-ink">{record.title}</div>
          <div className="mt-1 text-xs leading-5 text-muted">{record.content.length > 120 ? `${record.content.slice(0, 120)}...` : record.content}</div>
          {record.resolution ? <div className="mt-1 text-xs leading-5 text-success">处理说明：{record.resolution}</div> : null}
        </div>
      )
    },
    ...(canManage
      ? [
          {
            title: "提交人",
            width: 180,
            render: (_: unknown, record: FeedbackRequest) => (
              <div>
                <div className="text-sm text-ink">{record.requester?.name ?? "-"}</div>
                <div className="mt-1 text-xs text-muted">{record.requester?.department?.name ?? "未分配部门"}</div>
                {record.contact ? <div className="mt-1 text-xs text-muted">{record.contact}</div> : null}
              </div>
            )
          }
        ]
      : []),
    {
      title: "优先级",
      dataIndex: "priority",
      width: 100,
      render: (value: FeedbackPriority) => {
        const option = feedbackPriorityOptions.find((item) => item.value === value);
        return <Tag color={option?.color ?? "default"}>{option?.label ?? value}</Tag>;
      }
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 110,
      render: (value: FeedbackStatus) => {
        const option = feedbackStatusOptions.find((item) => item.value === value);
        return <Tag color={option?.color ?? "default"}>{option?.label ?? value}</Tag>;
      }
    },
    { title: "提交时间", dataIndex: "createdAt", width: 170, render: dateTimeText },
    {
      title: "操作",
      width: 110,
      render: (_, record) =>
        canManage ? (
          <Button
            size="small"
            aria-label="处理"
            onClick={() => {
              setHandlingFeedback(record);
              feedbackStatusForm.setFieldsValue({ status: record.status, resolution: record.resolution ?? undefined });
            }}
          >
            处理
          </Button>
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
                  dataSource={departmentTree}
                  columns={departmentColumns}
                  locale={{ emptyText: <Empty description="暂无部门" /> }}
                  pagination={false}
                  expandable={{ defaultExpandAllRows: true }}
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
          {
            key: "feedback",
            label: "问题反馈",
            children: (
              <div className="space-y-3">
                <div className="surface-panel p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-primary-container text-primary">
                        <MessageSquare size={20} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-ink">用户权益与问题反馈</div>
                        <div className="mt-1 max-w-4xl text-sm leading-6 text-muted">
                          可提交功能异常、账号权限、数据权益、计费订阅、隐私安全等问题。反馈会保留提交人与处理状态，企业管理员可跟进闭环。
                        </div>
                      </div>
                    </div>
                    <Button
                      type="primary"
                      className="w-full shrink-0 lg:w-auto"
                      icon={<MessageSquare size={16} />}
                      onClick={() => {
                        feedbackForm.resetFields();
                        feedbackForm.setFieldsValue({ category: "DATA_RIGHTS", priority: "NORMAL" });
                        setFeedbackModalOpen(true);
                      }}
                    >
                      提交反馈
                    </Button>
                  </div>
                </div>
                <Table
                  rowKey="id"
                  loading={feedbackRequests.isFetching}
                  dataSource={feedbackRequests.data ?? []}
                  columns={feedbackColumns}
                  locale={{ emptyText: <Empty description="暂无问题反馈" /> }}
                  pagination={{ pageSize: 6 }}
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
                                options={availablePaymentProviderOptions}
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
            <Cascader
              allowClear
              changeOnSelect
              options={parentDepartmentCascaderOptions}
              placeholder="选择上级部门"
            />
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
              <Cascader
                allowClear
                changeOnSelect
                options={departmentCascaderOptions}
                placeholder="选择部门"
              />
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
                <Select options={availablePaymentProviderOptions} />
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
                <Tag color={checkout.order.status === "PAID" ? "green" : "orange"}>{orderStatusLabels[checkout.order.status] ?? "未知状态"}</Tag>
              </div>
              <div className="mt-2 text-sm text-muted">
                {planLabel(checkout.order.plan)} · {optionLabel(billingIntervalOptions, checkout.order.interval)} · {checkout.order.seatLimit} 位启用成员
              </div>
              <div className="mt-2 text-sm text-muted">
                本次订阅有效期：{checkout.order.status === "PAID" ? "" : "支付成功后 "}
                {subscriptionPeriodText(checkout.subscriptionPeriod)}
              </div>
            </div>
              <div className="flex flex-col items-center rounded-[8px] border border-line bg-white p-5 text-center">
                <div className="flex min-h-44 w-44 items-center justify-center rounded-[8px] border border-line bg-white p-2">
                  {checkoutPaymentCode ? (
                    <QRCode value={checkoutPaymentCode} size={160} bordered={false} />
                  ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="等待支付二维码" />
                  )}
                </div>
                <div className="mt-3 text-sm font-medium text-ink">
                  {checkoutIsMock ? "本地模拟支付码" : "请使用微信扫码支付"}
                </div>
                <Typography.Text className="mt-2 max-w-full break-all text-xs text-muted">
                  {checkoutPaymentCode || "等待支付信息"}
                </Typography.Text>
              </div>
              <Space className="w-full justify-end" wrap>
                {checkout.payment?.paymentUrl && !checkoutIsLive ? (
                  <Button href={checkout.payment.paymentUrl} target="_blank">
                    打开支付链接
                  </Button>
                ) : null}
                <Button onClick={refreshCheckout} loading={checkoutRefreshing}>
                  刷新支付状态
                </Button>
                {checkoutIsMock ? (
                  <Button
                    type="primary"
                    loading={confirmOnlinePayment.isPending}
                    disabled={checkout.order.status === "PAID"}
                    onClick={() => confirmOnlinePayment.mutate(checkout.order.id)}
                  >
                    模拟支付完成
                  </Button>
                ) : null}
              </Space>
              {checkoutIsLive ? (
                <Alert type="info" showIcon message="系统会自动轮询订单状态，微信回调验签成功后会自动开通订阅。" />
              ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        title="提交问题反馈"
        open={feedbackModalOpen}
        onCancel={() => setFeedbackModalOpen(false)}
        onOk={() => feedbackForm.submit()}
        confirmLoading={createFeedback.isPending}
        width={640}
      >
        {createFeedback.error ? <Alert className="mb-4" type="error" showIcon message={(createFeedback.error as Error).message} /> : null}
        <Form form={feedbackForm} layout="vertical" onFinish={(values) => createFeedback.mutate(values)}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Form.Item name="category" label="问题类型" rules={[{ required: true, message: "请选择问题类型" }]}>
              <Select options={feedbackCategoryOptions} />
            </Form.Item>
            <Form.Item name="priority" label="优先级" rules={[{ required: true, message: "请选择优先级" }]}>
              <Select options={feedbackPriorityOptions.map(({ value, label }) => ({ value, label }))} />
            </Form.Item>
          </div>
          <Form.Item name="title" label="反馈标题" rules={[{ required: true, min: 2, max: 120 }]}>
            <Input placeholder="例如：无法下载企业备份" />
          </Form.Item>
          <Form.Item name="content" label="问题说明" rules={[{ required: true, min: 5, max: 3000 }]}>
            <Input.TextArea rows={5} maxLength={3000} showCount placeholder="请说明发生时间、页面位置、影响范围和期望处理结果。" />
          </Form.Item>
          <Form.Item name="contact" label="备用联系方式">
            <Input maxLength={200} placeholder="可填写手机号、邮箱或企业内部联系方式" />
          </Form.Item>
          <Alert type="info" showIcon message="反馈只在当前企业内流转，普通员工只能查看自己提交的反馈。" />
        </Form>
      </Modal>

      <Modal
        title="处理问题反馈"
        open={Boolean(handlingFeedback)}
        onCancel={() => {
          setHandlingFeedback(null);
          feedbackStatusForm.resetFields();
        }}
        onOk={() => feedbackStatusForm.submit()}
        confirmLoading={updateFeedbackStatus.isPending}
        width={640}
      >
        {handlingFeedback ? (
          <div className="mb-4 rounded-[8px] border border-line bg-surface-container p-4">
            <div className="text-sm font-medium text-ink">{handlingFeedback.title}</div>
            <div className="mt-2 text-sm leading-6 text-muted">{handlingFeedback.content}</div>
          </div>
        ) : null}
        {updateFeedbackStatus.error ? <Alert className="mb-4" type="error" showIcon message={(updateFeedbackStatus.error as Error).message} /> : null}
        <Form
          form={feedbackStatusForm}
          layout="vertical"
          onFinish={(values) => {
            if (handlingFeedback) {
              updateFeedbackStatus.mutate({ id: handlingFeedback.id, values });
            }
          }}
        >
          <Form.Item name="status" label="处理状态" rules={[{ required: true, message: "请选择处理状态" }]}>
            <Select options={feedbackStatusOptions.map(({ value, label }) => ({ value, label }))} />
          </Form.Item>
          <Form.Item name="resolution" label="处理说明">
            <Input.TextArea rows={4} maxLength={1000} showCount placeholder="例如：已修复，请刷新后重试；或说明后续处理安排。" />
          </Form.Item>
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
