export type RoleCode = "SUPER_ADMIN" | "COMPANY_ADMIN" | "DEPARTMENT_MANAGER" | "EMPLOYEE";
export type WorkLogStatus = "DRAFT" | "SUBMITTED";
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

export type AuthUser = {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantCode: string;
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
  remainingSeats: number;
  isUsable: boolean;
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
  projectId?: string | null;
  project?: Project | null;
  user?: {
    id: string;
    name: string;
    email: string | null;
    phone?: string | null;
    department?: Department | null;
  };
  aiAnalysis?: AiAnalysis | null;
};

export type WorkLogDraft = {
  date: string;
  kind: "DAILY" | "PLAN";
  title: string;
  content: string;
  hours: number;
  startTime?: string | null;
  endTime?: string | null;
  confidence: number;
  missingFields: string[];
  assistantMessage: string;
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
  fillRate: number;
  riskCount: number;
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
    fillRate: number;
    totalHours: number;
    riskCount: number;
  };
};

export type Report = {
  id: string;
  type: ReportType;
  status: ReportStatus;
  title: string;
  periodStart: string;
  periodEnd: string;
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
  } | null;
  error?: string | null;
  createdAt: string;
};

export type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
};
