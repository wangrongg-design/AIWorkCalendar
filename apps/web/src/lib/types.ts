export type RoleCode = "SUPER_ADMIN" | "COMPANY_ADMIN" | "DEPARTMENT_MANAGER" | "EMPLOYEE";
export type WorkLogStatus = "DRAFT" | "SUBMITTED";
export type WorkLogKind = "DAILY" | "PLAN";
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
export type WecomIntegrationMode = "ZERO" | "LIGHT" | "PRECISE";
export type WecomIntegrationStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "ERROR";
export type WecomUserMappingStatus = "AUTO" | "CONFIRMED" | "CONFLICT" | "UNMAPPED" | "EXTERNAL";
export type CommunicationSourceType = "PROJECT" | "DEPARTMENT" | "GENERAL";
export type CommunicationSyncStatus = "PENDING" | "SYNCING" | "OK" | "ERROR" | "PAUSED";
export type CommunicationSenderType = "INTERNAL" | "EXTERNAL" | "BOT" | "UNKNOWN";
export type CommunicationMessageType = "TEXT" | "FILE" | "IMAGE" | "VOICE" | "LINK" | "OTHER";
export type CommunicationInsightStatus = "CANDIDATE" | "CONFIRMED" | "IGNORED";
export type CommunicationFileKind = "FILE" | "IMAGE" | "VOICE" | "VIDEO" | "LINK" | "OTHER";
export type CommunicationFileDownloadStatus = "PENDING" | "DOWNLOADING" | "DOWNLOADED" | "SKIPPED" | "FAILED";
export type WecomExternalConsentStatus = "UNKNOWN" | "AGREED" | "DISAGREED" | "REVOKED";
export type CommunicationProjectSuggestionStatus = "PENDING" | "CONFIRMED" | "REJECTED";

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
  kind?: WorkLogKind;
  submittedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  projectId?: string | null;
  project?: Project | null;
  attachments?: WorkLogAttachment[];
  sourceLinks?: WorkLogSourceLink[];
  user?: {
    id: string;
    name: string;
    email: string | null;
    phone?: string | null;
    department?: Department | null;
  };
  aiAnalysis?: AiAnalysis | null;
};

export type WorkLogSourceLink = {
  id: string;
  workLogId: string;
  insightId?: string | null;
  messageId?: string | null;
  fileId?: string | null;
  sourceId?: string | null;
  sourceType: string;
  evidenceSummary?: string | null;
  createdAt: string;
  source?: CommunicationSource | null;
  message?: CommunicationMessage | null;
  file?: CommunicationFile | null;
  insight?: CommunicationInsight | null;
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
  projectHint?: string | null;
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
  primaryKind?: WorkLogKind;
  filledCount: number;
  missingCount: number;
  remindCount?: number;
  fillRate: number;
  riskCount: number;
  blockerCount?: number;
  totalHours?: number;
  dailyLogCount?: number;
  planLogCount?: number;
};

export type CalendarResponse = {
  month: string;
  totalEmployees: number;
  days: CalendarDay[];
};

export type CalendarDayDetail = {
  date: string;
  primaryKind?: WorkLogKind;
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
    dailyLogCount?: number;
    planLogCount?: number;
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

export type WecomIntegration = {
  id: string;
  tenantId: string;
  corpId: string;
  msgAuditSecretRef?: string;
  rsaPrivateKeyRef?: string;
  rsaPublicKeyConfigured: boolean;
  trustedIpNote?: string | null;
  mode: WecomIntegrationMode;
  status: WecomIntegrationStatus;
  syncDepartmentIds: string[];
  syncUserIds: string[];
  syncChatIds: string[];
  syncFiles: boolean;
  generateLogDrafts: boolean;
  generateProjectRisks: boolean;
  retentionDays: number;
  lastSyncAt?: string | null;
  lastSyncStatus: CommunicationSyncStatus;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WecomUserBinding = {
  id: string;
  tenantId: string;
  userId?: string | null;
  wecomCorpId: string;
  wecomUserId: string;
  wecomName: string;
  mobile?: string | null;
  email?: string | null;
  departmentIds: string[];
  mappingStatus: WecomUserMappingStatus;
  confidence: number;
  createdAt: string;
  updatedAt: string;
  user?: (OrgUser & { department?: Department | null }) | null;
};

export type CommunicationSource = {
  id: string;
  tenantId: string;
  integrationId?: string | null;
  name: string;
  chatId: string;
  sourceType: CommunicationSourceType;
  projectIds: string[];
  departmentIds: string[];
  memberScopeUserIds: string[];
  generateLogDrafts: boolean;
  generateProjectRisks: boolean;
  syncFiles: boolean;
  retentionDays: number;
  lastSyncAt?: string | null;
  lastSyncStatus: CommunicationSyncStatus;
  lastError?: string | null;
  pendingDraftCount: number;
  unclassifiedCount: number;
  createdAt: string;
  updatedAt: string;
};

export type CommunicationMessage = {
  id: string;
  tenantId: string;
  sourceId: string;
  msgId: string;
  senderWecomUserId?: string | null;
  senderName?: string | null;
  senderType: CommunicationSenderType;
  mappedUserId?: string | null;
  mappingStatus: WecomUserMappingStatus;
  content: string;
  msgType: CommunicationMessageType;
  sentAt: string;
  source?: CommunicationSource | null;
};

export type CommunicationFile = {
  id: string;
  tenantId: string;
  sourceId: string;
  messageId?: string | null;
  sdkFileId: string;
  fileName: string;
  mimeType?: string | null;
  fileSize?: number | null;
  kind: CommunicationFileKind;
  downloadStatus: CommunicationFileDownloadStatus;
  storagePath?: string | null;
  textContent?: string | null;
  aiSummary?: string | null;
  uploadedByWecomUserId?: string | null;
  mappedUserId?: string | null;
  externalUserId?: string | null;
  consentStatus: WecomExternalConsentStatus;
  sentAt: string;
  createdAt: string;
  updatedAt: string;
  source?: CommunicationSource | null;
  message?: CommunicationMessage | null;
  mappedUser?: {
    id: string;
    name: string;
    email: string | null;
    phone?: string | null;
    department?: Department | null;
  } | null;
};

export type WecomExternalContactConsent = {
  id: string;
  tenantId: string;
  wecomCorpId: string;
  externalUserId: string;
  externalName?: string | null;
  status: WecomExternalConsentStatus;
  agreedAt?: string | null;
  revokedAt?: string | null;
  lastCheckedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CommunicationProjectSuggestion = {
  id: string;
  tenantId: string;
  sourceId: string;
  projectId: string;
  status: CommunicationProjectSuggestionStatus;
  confidence: number;
  reason: string;
  evidence?: unknown;
  createdAt: string;
  updatedAt: string;
  confirmedAt?: string | null;
  rejectedAt?: string | null;
  source?: CommunicationSource | null;
  project?: Project | null;
};

export type CommunicationInsight = {
  id: string;
  tenantId: string;
  sourceId?: string | null;
  suggestedUserId?: string | null;
  type: "WORK_LOG_DRAFT" | "PROJECT_PROGRESS" | "PROJECT_RISK";
  status: CommunicationInsightStatus;
  date: string;
  title: string;
  content: string;
  hours?: number | null;
  projectId?: string | null;
  projectHints: string[];
  risks: string[];
  blockers: string[];
  nextActions: string[];
  sourceMessageIds: string[];
  sourceFileIds: string[];
  confidence: number;
  missingFields: string[];
  needsProjectConfirmation: boolean;
  needsUserMappingConfirmation: boolean;
  confirmedWorkLogId?: string | null;
  createdAt: string;
  updatedAt: string;
  source?: CommunicationSource | null;
  project?: Project | null;
  suggestedUser?: {
    id: string;
    name: string;
    email: string | null;
    phone?: string | null;
    department?: Department | null;
  } | null;
  sourceMessages?: CommunicationMessage[];
  sourceFiles?: CommunicationFile[];
};

export type WecomOverview = {
  integrations: WecomIntegration[];
  activeIntegration?: WecomIntegration | null;
  workerRuntime?: {
    mode: "official" | "mock" | string;
    adapterConfigured: boolean;
    adapterCommand?: string | null;
    officialReady: boolean;
    mockAllowed: boolean;
  };
  sources: CommunicationSource[];
  bindings: WecomUserBinding[];
  files: CommunicationFile[];
  projectSuggestions: CommunicationProjectSuggestion[];
  externalConsents: WecomExternalContactConsent[];
  mappingSummary: Record<WecomUserMappingStatus | "total", number>;
  drafts: CommunicationInsight[];
  setupSummary: {
    autoMatched: number;
    needsConfirmation: number;
    externalContacts: number;
    chatCount: number;
    suggestedProjectGroups: number;
    pendingProjectSuggestions: number;
    fileCount: number;
    failedFileCount: number;
    externalConsentIssues: number;
    pendingDrafts: number;
    lastSyncAt?: string | null;
    syncStatus: CommunicationSyncStatus;
  };
};
