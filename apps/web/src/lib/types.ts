export type RoleCode = "SUPER_ADMIN" | "COMPANY_ADMIN" | "DEPARTMENT_MANAGER" | "EMPLOYEE";
export type WorkLogStatus = "DRAFT" | "SUBMITTED";
export type WorkLogAttachmentKind = "IMAGE" | "FILE";
export type ProjectStatus = "ACTIVE" | "PAUSED" | "ARCHIVED";
export type ReportType = "PERSONAL_DAILY" | "PERSONAL_WEEKLY" | "DEPARTMENT_DAILY" | "DEPARTMENT_WEEKLY";
export type ReportStatus = "PENDING" | "COMPLETED" | "FAILED";
export type SubscriptionPlan = "TRIAL" | "TEAM" | "BUSINESS" | "ENTERPRISE";
export type SubscriptionStatus = "TRIALING" | "ACTIVE" | "PAST_DUE" | "EXPIRED" | "CANCELED";
export type BillingInterval = "MONTHLY" | "YEARLY";
export type BillingOrderStatus = "PENDING" | "PAID" | "CANCELED" | "EXPIRED";
export type PaymentProvider = "MANUAL" | "ALIPAY" | "WECHAT" | "STRIPE";
export type PaymentStatus = "PENDING" | "SUCCEEDED" | "FAILED" | "REFUNDED";
export type DataDeletionScope = "SELF" | "TENANT";
export type DataDeletionStatus = "REQUESTED" | "PROCESSING" | "COMPLETED" | "CANCELED";
export type ExportScope = "SELF" | "TENANT";
export type ExportTaskStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "EXPIRED";
export type FeedbackCategory = "BUG" | "ACCOUNT_PERMISSION" | "DATA_RIGHTS" | "BILLING" | "PRIVACY_SECURITY" | "SUGGESTION" | "OTHER";
export type FeedbackPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
export type FeedbackStatus = "SUBMITTED" | "PROCESSING" | "RESOLVED" | "CLOSED";

export type AuthUser = {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantCode: string;
  tenantLogoUrl?: string | null;
  email: string | null;
  phone?: string | null;
  name: string;
  departmentId: string | null;
  departmentName: string | null;
  roles: RoleCode[];
  requiresWorkReport?: boolean;
};

export type Department = {
  id: string;
  name: string;
  parentId?: string | null;
};

export type OrgUser = {
  id: string;
  email: string | null;
  phone?: string | null;
  name: string;
  departmentId: string | null;
  departmentName: string | null;
  isActive: boolean;
  requiresWorkReport: boolean;
  roles: RoleCode[];
  createdAt: string;
};

export type Project = {
  id: string;
  tenantId: string;
  code?: string | null;
  name: string;
  description?: string | null;
  status: ProjectStatus;
  ownerUserId?: string | null;
  owner?: {
    id: string;
    name: string;
    email: string | null;
    phone?: string | null;
    departmentId?: string | null;
    department?: Department | null;
  } | null;
  startDate?: string | null;
  endDate?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Subscription = {
  id: string;
  tenantId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  seatLimit: number;
  usedSeats: number;
  remainingSeats: number | null;
  isUsable: boolean;
  billingModel?: "ACTIVE_MEMBER_MONTHLY";
  activeMemberMonthlyPriceCents?: number;
  estimatedMonthlyAmountCents?: number;
  trialUnlimited?: boolean;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  trialEndsAt?: string | null;
  canceledAt?: string | null;
  provider?: string | null;
  externalCustomerId?: string | null;
  externalSubscriptionId?: string | null;
};

export type PaymentRecord = {
  id: string;
  provider: PaymentProvider;
  status: PaymentStatus;
  amountCents: number;
  currency: string;
  transactionId?: string | null;
  paidAt?: string | null;
  createdAt: string;
};

export type BillingOrder = {
  id: string;
  plan: SubscriptionPlan;
  interval: BillingInterval;
  seatLimit: number;
  status: BillingOrderStatus;
  provider: PaymentProvider;
  amountCents: number;
  currency: string;
  paymentUrl?: string | null;
  paidAt?: string | null;
  expiresAt?: string | null;
  createdAt: string;
  payments?: PaymentRecord[];
};

export type BillingPlan = {
  plan: Exclude<SubscriptionPlan, "TRIAL">;
  name: string;
  description: string;
  monthlyPriceCents: number;
  yearlyPriceCents: number;
  recommendedSeats: number;
  features: string[];
};

export type BillingPlansResponse = {
  currency: string;
  plans: BillingPlan[];
  billingPolicy?: {
    model: "ACTIVE_MEMBER_MONTHLY";
    trialDays: number;
    trialUnlimitedMembers: boolean;
    activeMemberMonthlyPriceCents: number;
    copy: string;
  };
  paymentProviders: Array<{
    provider: "ALIPAY" | "WECHAT";
    enabled: boolean;
    mode: "mock" | "live";
  }>;
};

export type BillingOrderPayment = {
  order: BillingOrder;
  subscriptionPeriod?: {
    startDate: string;
    endDate: string;
  };
  payment: {
    provider: PaymentProvider;
    mode?: "mock" | "live";
    paymentUrl?: string | null;
    qrCodeText?: string | null;
    transactionId?: string | null;
    amountCents?: number;
    notifyUrl?: string | null;
    returnUrl?: string | null;
  } | null;
};

export type AuditLog = {
  id: string;
  tenantId: string;
  actorUserId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: unknown;
  createdAt: string;
};

export type DataDeletionRequest = {
  id: string;
  scope: DataDeletionScope;
  reason?: string | null;
  status: DataDeletionStatus;
  requestedAt: string;
  processedAt?: string | null;
  createdAt: string;
};

export type ExportTask = {
  id: string;
  scope: ExportScope;
  status: ExportTaskStatus;
  fileName?: string | null;
  fileSize?: number | null;
  contentType?: string | null;
  expiresAt: string;
  completedAt?: string | null;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FeedbackRequest = {
  id: string;
  tenantId: string;
  requesterId: string;
  category: FeedbackCategory;
  priority: FeedbackPriority;
  status: FeedbackStatus;
  title: string;
  content: string;
  contact?: string | null;
  resolution?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  requester?: {
    id: string;
    name: string;
    email: string | null;
    phone?: string | null;
    department?: Department | null;
  };
};

export type WorkLog = {
  id: string;
  userId: string;
  date: string;
  title: string;
  content: string;
  startTime?: string | null;
  endTime?: string | null;
  hours: string | number;
  status: WorkLogStatus;
  submittedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  projectId?: string | null;
  project?: Project | null;
  attachments?: WorkLogAttachment[];
  user?: {
    id: string;
    name: string;
    email: string | null;
    phone?: string | null;
    department?: Department | null;
  };
  aiAnalysis?: AiAnalysis | null;
};

export type WorkLogAttachment = {
  id: string;
  workLogId: string;
  uploaderId: string;
  kind: WorkLogAttachmentKind;
  fileName: string;
  mimeType: string;
  fileSize: number;
  aiSummary?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkLogDraftItem = {
  date: string;
  kind: "DAILY" | "PLAN";
  title: string;
  content: string;
  hours: number;
  startTime?: string | null;
  endTime?: string | null;
  confidence: number;
  missingFields: string[];
};

export type WorkLogDraft = WorkLogDraftItem & {
  assistantMessage: string;
  items?: WorkLogDraftItem[];
};

export type AiAnalysis = {
  id: string;
  category: string;
  achievements: string[];
  risks: string[];
  blockers: string[];
  keywords: string[];
  tags: string[];
  timeReasonableness: string;
  summary: string;
};

export type CalendarDay = {
  date: string;
  filledCount: number;
  missingCount: number;
  remindCount?: number;
  fillRate: number;
  riskCount: number;
  blockerCount?: number;
  totalHours?: number;
};

export type CalendarResponse = {
  month: string;
  totalEmployees: number;
  days: CalendarDay[];
};

export type CalendarDayDetail = {
  date: string;
  filledEmployees: Array<{
    id: string;
    name: string;
    email: string | null;
    phone?: string | null;
    departmentName: string | null;
    logs: WorkLog[];
  }>;
  missingEmployees: Array<{
    id: string;
    name: string;
    email: string | null;
    phone?: string | null;
    departmentName: string | null;
  }>;
  stats: {
    totalEmployees: number;
    filledCount: number;
    missingCount: number;
    remindCount?: number;
    fillRate: number;
    totalHours: number;
    riskCount: number;
    blockerCount?: number;
  };
};

export type Report = {
  id: string;
  type: ReportType;
  status: ReportStatus;
  title: string;
  periodStart: string;
  periodEnd: string;
  departmentId?: string | null;
  department?: Department | null;
  content?: {
    completed: string[];
    progress: string[];
    risks: string[];
    nextPlan: string[];
    hours: {
      total: number;
      byUser: Array<{ userName: string; hours: number }>;
    };
    summary: string;
    evidence?: ReportEvidence;
  } | null;
  error?: string | null;
  createdAt: string;
};

export type ReportEvidence = {
  stats: ReportReadinessStats;
  sources: ReportSource[];
};

export type ReportSource = {
  id: string;
  date: string;
  title: string;
  userName: string;
  projectName?: string | null;
  summary: string;
  risks?: string[];
  blockers?: string[];
  hours: number;
};

export type ReportReadinessStats = {
  workLogCount: number;
  targetMemberCount: number;
  coveredMemberCount: number;
  missingMemberCount: number;
  riskCount: number;
  blockerCount: number;
  projectCount: number;
  totalHours: number;
};

export type ReportReadiness = {
  type: ReportType;
  periodStart: string;
  periodEnd: string;
  departmentId?: string | null;
  scopeName: string;
  canGenerate: boolean;
  emptyReason?: string | null;
  stats: ReportReadinessStats;
  sources: ReportSource[];
};

export type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
};
