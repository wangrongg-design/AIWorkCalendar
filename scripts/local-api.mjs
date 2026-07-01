import http from "node:http";
import { randomBytes } from "node:crypto";
import { URL } from "node:url";

const PORT = Number(process.env.API_PORT ?? 3001);
const PASSWORD = "Passw0rd!";
const OPS_ADMIN_PASSWORD = process.env.OPS_ADMIN_PASSWORD ?? PASSWORD;
const OPS_USER = {
  id: "platform-ops",
  tenantId: "platform",
  email: null,
  phone: null,
  name: "平台超级管理员",
  departmentId: null,
  roles: ["SUPER_ADMIN"],
  password: OPS_ADMIN_PASSWORD,
  isActive: true,
  requiresWorkReport: false,
  createdAt: new Date().toISOString()
};

const today = new Date();
const todayKey = dateKey(today);
const yesterdayKey = dateKey(addDays(today, -1));
const tomorrowKey = dateKey(addDays(today, 1));
const DEMO_COMPANY_NAME = "北京星澜智能科技有限公司";
const DEMO_UNIFIED_SOCIAL_CREDIT_CODE = "91110105MA01A1B2X3";
const UNIFIED_SOCIAL_CREDIT_CODE_PATTERN = /^[0-9A-HJ-NPQRTUWXY]{18}$/;
const ACTIVE_MEMBER_MONTHLY_PRICE_CENTS = 1900;
const BILLING_PLANS = [
  {
    plan: "TEAM",
    name: "专业版",
    description: "¥19 / 启用成员 / 月，按企业内启用成员数量计费。",
    monthlyPriceCents: ACTIVE_MEMBER_MONTHLY_PRICE_CENTS,
    yearlyPriceCents: 0,
    recommendedSeats: 1,
    features: ["完整 AI 工作日历功能", "AI 日报、周报、月报", "AI 风险分析", "AI 工作问答", "日历看板", "项目管理", "数据导出", "可随时新增或停用成员"]
  }
];

const STANDARD_DEPARTMENT_TEMPLATES = [
  { key: "executive", name: "总经办" },
  { key: "product", name: "产品部", parentKey: "executive" },
  { key: "engineering", name: "研发部", parentKey: "executive" },
  { key: "sales", name: "销售部", parentKey: "executive" },
  { key: "marketing", name: "市场部", parentKey: "executive" },
  { key: "customer-success", name: "客户成功部", parentKey: "executive" },
  { key: "finance", name: "财务部", parentKey: "executive" },
  { key: "hr-admin", name: "人事行政部", parentKey: "executive" }
];
const TENANT_ROLE_CODES = new Set(["COMPANY_ADMIN", "DEPARTMENT_MANAGER", "EMPLOYEE"]);

function generateTemporaryPassword(length = 14) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  return Array.from(randomBytes(length), (byte) => alphabet[byte % alphabet.length]).join("");
}

function requireInitialPassword(value, missingMessage) {
  const password = typeof value === "string" ? value : "";
  if (!password) throw httpError(400, missingMessage);
  if (password.length < 6) throw httpError(400, "初始密码至少 6 位");
  return password;
}

function ensureStandardDepartments(tenantId) {
  const idsByKey = new Map();
  for (const template of STANDARD_DEPARTMENT_TEMPLATES) {
    const existing = departments.find((item) => item.tenantId === tenantId && item.name === template.name && !item.deletedAt);
    const parentId = template.parentKey ? idsByKey.get(template.parentKey) ?? null : null;
    const item =
      existing ??
      {
        id: `dept-${tenantId}-${template.key}`,
        tenantId,
        name: template.name,
        parentId
      };
    if (!existing) {
      departments.push(item);
    }
    idsByKey.set(template.key, item.id);
  }
  return idsByKey;
}

function normalizeTenantRoleCodes(roleCodes) {
  const normalized = Array.from(new Set(Array.isArray(roleCodes) ? roleCodes : []));
  if (normalized.length !== 1) throw httpError(400, "请为成员选择一个企业内角色");
  if (!TENANT_ROLE_CODES.has(normalized[0])) throw httpError(400, "平台超级管理员不能分配给企业成员");
  return normalized;
}

const tenant = {
  id: "tenant-demo",
  name: DEMO_COMPANY_NAME,
  code: DEMO_UNIFIED_SOCIAL_CREDIT_CODE,
  logoUrl: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  deletedAt: null
};
const tenants = [tenant];

const departments = createDemoDepartments();

const projects = createDemoProjects();

const subscription = {
  id: "sub-demo",
  tenantId: tenant.id,
  plan: "TEAM",
  status: "ACTIVE",
  seatLimit: 14,
  currentPeriodStart: todayKey,
  currentPeriodEnd: dateKey(addDays(today, 365)),
  trialEndsAt: null,
  canceledAt: null,
  provider: "manual",
  externalCustomerId: null,
  externalSubscriptionId: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  deletedAt: null
};
const subscriptions = new Map([[subscription.tenantId, subscription]]);

const users = createDemoUsers();

const analyses = new Map();
const workLogs = createDemoWorkLogs();
for (const log of workLogs) {
  analyses.set(log.id, createAnalysis(log));
}

const reports = [];
const notifications = [];
const billingOrders = [];
const dataDeletionRequests = [];
const workLogAttachments = [];
const exportTasks = [];
const feedbackRequests = [];
const auditLogs = [];
const passwordResetTokens = new Map();
const wecomIntegrations = [];
const wecomUserBindings = [];
const communicationSources = [];
const communicationMessages = [];
const communicationFiles = [];
const communicationInsights = [];
const communicationProjectSuggestions = [];
const wecomExternalConsents = [];
const workLogSourceLinks = [];

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin ?? "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Expose-Headers", "Content-Disposition, Content-Length, Content-Type");
  if (req.method === "OPTIONS") return send(res, 204);

  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const body = await readJson(req);
    const currentUser = getCurrentUser(req);
    const route = `${req.method} ${url.pathname}`;

    if (route === "GET /") return apiHome(res);
    if (route === "HEAD /") return send(res, 200);
    if (route === "GET /health") return json(res, { ok: true, mode: "local-memory" });
    if (route === "POST /dev/clear-data") return json(res, clearLocalData(requireUser(currentUser)));
    if (route === "POST /auth/login") return login(res, body);
    if (route === "POST /auth/ops-login") return opsLogin(res, body);
    if (route === "POST /auth/register") return json(res, registerTenant(body));
    if (route === "GET /auth/me") return json(res, me(requireUser(currentUser)));
    if (route === "POST /auth/password-reset/request") return json(res, requestPasswordReset(body));
    if (route === "POST /auth/password-reset/confirm") return json(res, confirmPasswordReset(body));
    if (route === "POST /auth/verify-email") return json(res, verifyEmail(body));
    if (route === "POST /auth/change-password") return json(res, changePassword(requireUser(currentUser), body));
    if (route === "GET /org") return json(res, getOrg(requireUser(currentUser)));
    if (route === "GET /billing/subscription") return json(res, subscriptionSummary(requireUser(currentUser).tenantId));
    if (route === "GET /billing/plans") return json(res, getBillingPlans());
    if (route === "PATCH /billing/subscription") return json(res, updateSubscription(requireUser(currentUser), body));
    if (route === "GET /billing/orders") return json(res, listBillingOrders(requireUser(currentUser)));
    if (route === "POST /billing/orders") return json(res, createBillingOrder(requireUser(currentUser), body));
    if (req.method === "GET" && url.pathname.startsWith("/billing/orders/") && url.pathname.endsWith("/payment")) {
      return json(res, getBillingOrderPayment(requireUser(currentUser), url.pathname.split("/")[3]));
    }
    if (req.method === "POST" && url.pathname.startsWith("/billing/orders/") && url.pathname.endsWith("/confirm-online-payment")) {
      return json(res, confirmOnlinePayment(requireUser(currentUser), url.pathname.split("/")[3]));
    }
    if (route === "GET /ops/overview") return json(res, opsOverview(requireUser(currentUser)));
    if (req.method === "PATCH" && url.pathname.startsWith("/ops/tenants/") && url.pathname.endsWith("/logo")) {
      return json(res, updateOpsTenantLogo(requireUser(currentUser), url.pathname.split("/")[3], body));
    }
    if (route === "POST /ops/accounts/company-admin") {
      return json(res, createOpsCompanyAdmin(requireUser(currentUser), body));
    }
    if (req.method === "POST" && url.pathname.startsWith("/ops/accounts/") && url.pathname.endsWith("/reset-password")) {
      return json(res, resetOpsAccountPassword(requireUser(currentUser), url.pathname.split("/")[3]));
    }
    if (req.method === "POST" && url.pathname.startsWith("/ops/accounts/") && url.pathname.endsWith("/company-admin")) {
      return json(res, restoreOpsCompanyAdmin(requireUser(currentUser), url.pathname.split("/")[3]));
    }
    if (req.method === "DELETE" && url.pathname.startsWith("/ops/accounts/")) {
      return json(res, deleteOpsAccount(requireUser(currentUser), lastPath(url.pathname)));
    }
    if (req.method === "PATCH" && url.pathname.startsWith("/ops/accounts/")) {
      return json(res, updateOpsAccount(requireUser(currentUser), lastPath(url.pathname), body));
    }
    if (req.method === "POST" && url.pathname.startsWith("/billing/orders/") && url.pathname.endsWith("/confirm-manual-payment")) {
      return json(res, confirmManualPayment(requireUser(currentUser), url.pathname.split("/")[3], body));
    }
    if (route === "GET /audit-logs") return json(res, listAuditLogs(requireUser(currentUser), url));
    if (route === "GET /privacy/data-deletion-requests") return json(res, listDataDeletionRequests(requireUser(currentUser)));
    if (route === "POST /privacy/data-deletion-requests") return json(res, requestDataDeletion(requireUser(currentUser), body));
    if (route === "GET /exports/data-tasks") return json(res, listExportTasks(requireUser(currentUser)));
    if (route === "POST /exports/data-tasks") return json(res, createExportTask(requireUser(currentUser), url));
    if (req.method === "GET" && url.pathname.startsWith("/exports/data-tasks/") && url.pathname.endsWith("/download")) {
      return downloadExportTask(res, requireUser(currentUser), url.pathname.split("/")[3]);
    }
    if (route === "GET /exports/data") return json(res, exportData(requireUser(currentUser), url));
    if (route === "GET /feedback/requests") return json(res, listFeedbackRequests(requireUser(currentUser)));
    if (route === "POST /feedback/requests") return json(res, createFeedbackRequest(requireUser(currentUser), body));
    if (req.method === "PATCH" && url.pathname.startsWith("/feedback/requests/") && url.pathname.endsWith("/status")) {
      return json(res, updateFeedbackStatus(requireUser(currentUser), url.pathname.split("/")[3], body));
    }
    if (route === "POST /org/tenants") return json(res, createTenant(requireUser(currentUser), body));
    if (route === "POST /org/departments") return json(res, createDepartment(requireUser(currentUser), body));
    if (req.method === "PATCH" && url.pathname.startsWith("/org/departments/")) {
      return json(res, updateDepartment(requireUser(currentUser), lastPath(url.pathname), body));
    }
    if (req.method === "DELETE" && url.pathname.startsWith("/org/departments/")) {
      return json(res, deleteDepartment(requireUser(currentUser), lastPath(url.pathname)));
    }
    if (route === "POST /org/users") return json(res, createOrgUser(requireUser(currentUser), body));
    if (req.method === "PATCH" && url.pathname.startsWith("/org/users/")) {
      return json(res, updateOrgUser(requireUser(currentUser), lastPath(url.pathname), body));
    }

    if (route === "GET /wecom/overview") return json(res, wecomOverview(requireUser(currentUser)));
    if (route === "POST /wecom/integrations") return json(res, saveWecomIntegration(requireUser(currentUser), body));
    if (route === "POST /wecom/integrations/test") return json(res, testWecomIntegration(requireUser(currentUser)));
    if (route === "POST /wecom/mappings/auto-match") return json(res, autoMatchWecomMembers(requireUser(currentUser)));
    if (route === "GET /wecom/bindings") return json(res, listWecomBindings(requireUser(currentUser)));
    if (req.method === "PATCH" && url.pathname.startsWith("/wecom/bindings/")) {
      return json(res, updateWecomBinding(requireUser(currentUser), lastPath(url.pathname), body));
    }
    if (route === "GET /wecom/sources") return json(res, listCommunicationSources(requireUser(currentUser)));
    if (route === "POST /wecom/sources") return json(res, saveCommunicationSource(requireUser(currentUser), body));
    if (req.method === "PATCH" && url.pathname.startsWith("/wecom/sources/")) {
      return json(res, saveCommunicationSource(requireUser(currentUser), body, lastPath(url.pathname)));
    }
    if (route === "POST /wecom/sync/text") return json(res, syncWecomTextMessages(requireUser(currentUser), body));
    if (route === "POST /wecom/sync/archive") return json(res, syncWecomArchive(requireUser(currentUser), body));
    if (route === "GET /wecom/files") return json(res, listCommunicationFiles(requireUser(currentUser)));
    if (route === "GET /wecom/project-suggestions") return json(res, listCommunicationProjectSuggestions(requireUser(currentUser)));
    if (req.method === "PATCH" && url.pathname.startsWith("/wecom/project-suggestions/")) {
      return json(res, updateCommunicationProjectSuggestion(requireUser(currentUser), lastPath(url.pathname), body));
    }
    if (route === "GET /wecom/log-drafts") return json(res, listWecomLogDrafts(requireUser(currentUser)));
    if (req.method === "POST" && url.pathname.startsWith("/wecom/log-drafts/") && url.pathname.endsWith("/confirm")) {
      return json(res, confirmWecomLogDraft(requireUser(currentUser), url.pathname.split("/")[3], body));
    }
    if (req.method === "POST" && url.pathname.startsWith("/wecom/log-drafts/") && url.pathname.endsWith("/ignore")) {
      return json(res, ignoreWecomLogDraft(requireUser(currentUser), url.pathname.split("/")[3]));
    }

    if (route === "GET /projects") return json(res, listProjects(requireUser(currentUser), url));
    if (route === "POST /projects") return json(res, createProject(requireUser(currentUser), body));
    if (req.method === "PATCH" && url.pathname.startsWith("/projects/")) {
      return json(res, updateProject(requireUser(currentUser), lastPath(url.pathname), body));
    }
    if (req.method === "DELETE" && url.pathname.startsWith("/projects/")) {
      return json(res, deleteProject(requireUser(currentUser), lastPath(url.pathname)));
    }

    if (route === "GET /work-logs") return json(res, listWorkLogs(requireUser(currentUser), url));
    if (route === "POST /work-logs") return json(res, createWorkLog(requireUser(currentUser), body));
    if (req.method === "POST" && url.pathname.match(/^\/work-logs\/[^/]+\/attachments$/)) {
      return json(res, createWorkLogAttachment(requireUser(currentUser), url.pathname.split("/")[2], body));
    }
    if (req.method === "GET" && url.pathname.match(/^\/work-logs\/[^/]+\/attachments\/[^/]+\/download$/)) {
      return downloadWorkLogAttachment(res, requireUser(currentUser), url.pathname.split("/")[2], url.pathname.split("/")[4]);
    }
    if (req.method === "DELETE" && url.pathname.match(/^\/work-logs\/[^/]+\/attachments\/[^/]+$/)) {
      return json(res, deleteWorkLogAttachment(requireUser(currentUser), url.pathname.split("/")[2], url.pathname.split("/")[4]));
    }
    if (req.method === "GET" && url.pathname.startsWith("/work-logs/")) {
      return json(res, getWorkLog(requireUser(currentUser), lastPath(url.pathname)));
    }
    if (req.method === "PATCH" && url.pathname.startsWith("/work-logs/")) {
      return json(res, updateWorkLog(requireUser(currentUser), lastPath(url.pathname), body));
    }
    if (req.method === "DELETE" && url.pathname.startsWith("/work-logs/")) {
      return json(res, deleteWorkLog(requireUser(currentUser), lastPath(url.pathname)));
    }
    if (req.method === "POST" && url.pathname.endsWith("/submit") && url.pathname.startsWith("/work-logs/")) {
      const id = url.pathname.split("/")[2];
      return json(res, submitWorkLog(requireUser(currentUser), id));
    }

    if (route === "GET /analytics/calendar") return json(res, calendar(requireUser(currentUser), url));
    if (route === "GET /analytics/calendar/day") return json(res, calendarDay(requireUser(currentUser), url));

    if (req.method === "GET" && url.pathname.startsWith("/ai/analyses/work-logs/")) {
      return json(res, getAnalysis(requireUser(currentUser), lastPath(url.pathname)));
    }
    if (req.method === "POST" && url.pathname.endsWith("/retry") && url.pathname.startsWith("/ai/analyses/work-logs/")) {
      const id = url.pathname.split("/")[4];
      return json(res, retryAnalysis(requireUser(currentUser), id));
    }
    if (route === "POST /ai/chat/calendar") return json(res, calendarChat(requireUser(currentUser), body));
    if (route === "POST /ai/chat/project") return json(res, projectChat(requireUser(currentUser), body));
    if (route === "POST /ai/work-log-draft") return json(res, workLogDraft(requireUser(currentUser), body));

    if (route === "GET /reports/readiness") return json(res, reportReadiness(requireUser(currentUser), Object.fromEntries(url.searchParams.entries())));
    if (route === "POST /reports/generate") return json(res, generateReport(requireUser(currentUser), body));
    if (route === "GET /reports") {
      const user = requireUser(currentUser);
      return json(
        res,
        reports
          .filter((item) => item.tenantId === user.tenantId && item.requesterId === user.id && !item.deletedAt)
          .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
          .slice(0, 50)
      );
    }
    if (route === "GET /notifications") return json(res, listNotifications(requireUser(currentUser)));
    if (route === "POST /notifications/read-all") return json(res, readAllNotifications(requireUser(currentUser)));
    if (req.method === "POST" && url.pathname.startsWith("/notifications/") && url.pathname.endsWith("/read")) {
      return json(res, readNotification(requireUser(currentUser), url.pathname.split("/")[2]));
    }

    return error(res, 404, "Not found");
  } catch (err) {
    const status = err.status ?? 500;
    return error(res, status, err.message ?? "Internal error");
  }
});

server.listen(PORT, () => {
  console.log(`Local memory API listening on http://localhost:${PORT}`);
});

function makeUser(id, email, name, departmentId, roles, tenantId = tenant.id, password = PASSWORD, phone = null, requiresWorkReport = true) {
  return {
    id,
    tenantId,
    email: normalizeEmail(email),
    phone: normalizePhone(phone),
    name,
    departmentId,
    roles,
    password,
    isActive: true,
    requiresWorkReport,
    createdAt: new Date().toISOString()
  };
}

function workLog(id, userId, date, title, content, hours, projectId = null) {
  return {
    id,
    tenantId: tenant.id,
    userId,
    projectId,
    date,
    kind: workLogKindForDate(date),
    title,
    content,
    startTime: `${date}T09:00:00.000Z`,
    endTime: `${date}T18:00:00.000Z`,
    hours,
    status: "SUBMITTED",
    submittedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null
  };
}

function workLogKindForDate(date, explicitKind = null, referenceToday = todayKey) {
  if (explicitKind === "DAILY" || explicitKind === "PLAN") return explicitKind;
  return String(date) > referenceToday ? "PLAN" : "DAILY";
}

function createDemoDepartments() {
  return [
    { id: "dept-executive", tenantId: tenant.id, name: "总经办", parentId: null },
    { id: "dept-market", tenantId: tenant.id, name: "市场部", parentId: "dept-executive" },
    { id: "dept-engineering", tenantId: tenant.id, name: "研发部", parentId: "dept-executive" },
    { id: "dept-admin", tenantId: tenant.id, name: "行政部", parentId: "dept-executive" }
  ];
}

function createDemoUsers() {
  return [
    makeUser("admin", "admin@example.com", "林知远", "dept-executive", ["COMPANY_ADMIN"], tenant.id, PASSWORD, "13900000002", true),
    makeUser("market-manager", "market.manager@example.com", "周婧", "dept-market", ["DEPARTMENT_MANAGER"], tenant.id, PASSWORD, "13900000003", true),
    makeUser("market-ops", "market.ops@example.com", "陈思琪", "dept-market", ["EMPLOYEE"], tenant.id, PASSWORD, "13900000004", true),
    makeUser("employee2", "employee2@example.com", "赵一然", "dept-market", ["EMPLOYEE"], tenant.id, PASSWORD, "13900000005", true),
    makeUser("market-content", "market.content@example.com", "吴佳宁", "dept-market", ["EMPLOYEE"], tenant.id, PASSWORD, "13900000006", true),
    makeUser("market-growth", "market.growth@example.com", "孙浩", "dept-market", ["EMPLOYEE"], tenant.id, PASSWORD, "13900000007", true),
    makeUser("manager", "manager@example.com", "唐明远", "dept-engineering", ["DEPARTMENT_MANAGER"], tenant.id, PASSWORD, "13900000008", true),
    makeUser("employee", "employee@example.com", "李俊辰", "dept-engineering", ["EMPLOYEE"], tenant.id, PASSWORD, "13900000009", true),
    makeUser("rd-backend", "rd.backend@example.com", "何宇航", "dept-engineering", ["EMPLOYEE"], tenant.id, PASSWORD, "13900000010", true),
    makeUser("rd-frontend", "rd.frontend@example.com", "许嘉言", "dept-engineering", ["EMPLOYEE"], tenant.id, PASSWORD, "13900000011", true),
    makeUser("rd-qa", "rd.qa@example.com", "高宁", "dept-engineering", ["EMPLOYEE"], tenant.id, PASSWORD, "13900000012", true),
    makeUser("rd-ai", "rd.ai@example.com", "罗子涵", "dept-engineering", ["EMPLOYEE"], tenant.id, PASSWORD, "13900000013", true),
    makeUser("admin-ops", "admin.ops@example.com", "宋雨", "dept-admin", ["DEPARTMENT_MANAGER"], tenant.id, PASSWORD, "13900000014", true),
    makeUser("admin-hr", "admin.hr@example.com", "邱雅楠", "dept-admin", ["EMPLOYEE"], tenant.id, PASSWORD, "13900000015", true)
  ];
}

function createDemoProjects() {
  return [
    {
      id: "project-growth",
      tenantId: tenant.id,
      code: "GROWTH",
      name: "Q2 重点客户增长计划",
      description: "围绕重点行业客户线索、渠道活动和转化复盘推进市场增长。",
      status: "ACTIVE",
      ownerUserId: "market-manager",
      startDate: dateKey(addDays(today, -20)),
      endDate: dateKey(addDays(today, 50)),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null
    },
    {
      id: "project-work-calendar",
      tenantId: tenant.id,
      code: "AICAL",
      name: "AI 工作日历产品迭代",
      description: "持续完善 AI 日历、日报附件、智能汇报和组织权限体验。",
      status: "ACTIVE",
      ownerUserId: "manager",
      startDate: dateKey(addDays(today, -14)),
      endDate: dateKey(addDays(today, 45)),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null
    },
    {
      id: "project-operations",
      tenantId: tenant.id,
      code: "OPS",
      name: "企业运营支持体系",
      description: "优化入职、办公资产、行政采购和跨部门支持流程。",
      status: "ACTIVE",
      ownerUserId: "admin-ops",
      startDate: dateKey(addDays(today, -10)),
      endDate: dateKey(addDays(today, 35)),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null
    }
  ];
}

function createDemoWorkLogs() {
  return [
    workLog("log-ceo-today", "admin", todayKey, "确定二季度重点客户推进节奏", "上午和市场、研发负责人确认 Q2 重点客户推进节奏，要求本周完成 3 家标杆客户方案复盘。需要关注大客户交付排期和售前资源冲突。", 1.5, "project-growth"),
    workLog("log-market-manager-today", "market-manager", todayKey, "复盘渠道线索转化", "梳理本月渠道线索 42 条，确认 8 条进入销售跟进池。发现华东区域活动转化偏低，明天需要补充客户画像分析。", 2.5, "project-growth"),
    workLog("log-market-ops-today", "market-ops", todayKey, "整理华东客户回访清单", "完成华东 18 家客户回访清单整理，补充行业、规模、痛点和下一步触达时间，已同步给销售同事。", 3, "project-growth"),
    workLog("log-rd-manager-today", "manager", todayKey, "评审 AI 日历性能方案", "评审 AI 日历月视图性能优化方案，确认缓存粒度和按部门权限裁剪策略，风险是历史数据量增长后还需要继续压测。", 2, "project-work-calendar"),
    workLog("log-rd-frontend-today", "employee", todayKey, "完成日报详情附件预览", "完成日报详情中的附件预览和下载入口，照片、PDF、Word 均可在详情区查看，准备联调小程序附件展示。", 3.5, "project-work-calendar"),
    workLog("log-rd-backend-today", "rd-backend", todayKey, "修复注册计费联调问题", "修复企业注册后订阅初始化和本地演示计费接口，确认专业版按启用成员数计算金额。", 2.5, "project-work-calendar"),
    workLog("log-admin-ops-today", "admin-ops", todayKey, "更新办公采购和入职物料", "整理本周新员工入职物料和办公采购清单，确认 2 台笔记本到货时间，行政流程暂无阻塞。", 2, "project-operations"),
    workLog("log-market-content-yesterday", "market-content", yesterdayKey, "完成行业案例初稿", "完成制造业客户案例初稿，突出 AI 日历对日报沉淀和风险发现的价值，等待客户授权截图。", 4, "project-growth"),
    workLog("log-rd-qa-yesterday", "rd-qa", yesterdayKey, "执行 Web 回归测试", "完成登录、注册、AI 日历、填报、组织权限和订阅页回归测试，发现 2 个视觉细节问题已记录。", 3.5, "project-work-calendar"),
    workLog("log-admin-hr-yesterday", "admin-hr", yesterdayKey, "完成员工档案核对", "核对市场部和研发部员工档案，补齐手机号和部门归属，准备下周入职培训安排。", 2, "project-operations"),
    workLog("log-rd-ai-tomorrow", "rd-ai", tomorrowKey, "AI 汇报质量评估计划", "计划抽样 20 条日报评估 AI 汇报结构，重点检查风险、阻塞和建议动作是否可执行。", 2, "project-work-calendar")
  ];
}

function localAchievementPhrase(log) {
  const text = `${log.title} ${log.content}`;
  const reviewSubmit = text.match(/第([一二三四五六七八九十\d]+)次.*?(模型审查|模型审核|审查|审核|审批).*?(提交|申报)|第([一二三四五六七八九十\d]+)次.*?(提交|申报).*?(模型审查|模型审核|审查|审核|审批)/);
  if (reviewSubmit) return `完成第${reviewSubmit[1] ?? reviewSubmit[4]}次${reviewSubmit[2] ?? reviewSubmit[6]}提交`;
  const title = String(log.title ?? "").trim();
  if (/^(完成|提交|确认|交付|修复|整理|梳理|输出|建立|上线|推进|解决|优化|复盘|评审|核对|补齐|同步|制定|更新|发布|测试|联调|归档)/.test(title)) return title;
  return "";
}

function localAnalysisSummary(log) {
  const hours = `${Number(log.hours || 0).toFixed(1).replace(/\.0$/, "")} 小时`;
  return `${log.date} 的记录围绕「${log.title}」展开，耗时 ${hours}。`;
}

function createAnalysis(log) {
  const text = `${log.title} ${log.content}`;
  const risks = /风险|问题|阻塞|延迟/i.test(text) ? ["填报内容中提到风险或问题，需要管理者关注。"] : [];
  const blockers = /阻塞|依赖|卡住/i.test(text) ? ["存在阻塞或外部依赖。"] : [];
  const achievement = localAchievementPhrase(log);
  return {
    id: `analysis-${log.id}`,
    tenantId: log.tenantId,
    workLogId: log.id,
    userId: log.userId,
    category: /产品|需求|页面/.test(text) ? "产品规划" : "研发交付",
    achievements: achievement ? [achievement] : [],
    risks,
    blockers,
    keywords: Array.from(new Set(text.replace(/[，。！？、,.!?]/g, " ").split(/\s+/).filter((item) => item.length >= 2))).slice(0, 6),
    tags: ["本地分析", Number(log.hours) > 8 ? "工时偏高" : "常规工时"],
    timeReasonableness: Number(log.hours) > 10 ? "工时偏高，建议确认是否拆分记录。" : "工时与填报内容基本匹配。",
    summary: localAnalysisSummary(log),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function login(res, body) {
  const account = normalizeAccount(body.account ?? body.email);
  if (!account.email && !account.phone) {
    return error(res, 400, "请输入邮箱或手机号");
  }
  const tenantId = typeof body.tenantId === "string" && body.tenantId.trim() ? body.tenantId.trim() : undefined;
  const tenantCode = normalizeOptionalUnifiedSocialCreditCode(body.tenantCode);
  const hasTenantScope = Boolean(tenantId || tenantCode);
  const matches = users.filter((item) => {
    const ownerTenant = tenants.find((candidate) => candidate.id === item.tenantId);
    return (
      matchesAccount(item, account) &&
      !item.deletedAt &&
      !ownerTenant?.deletedAt &&
      (!tenantId || item.tenantId === tenantId) &&
      (!tenantCode || ownerTenant?.code === tenantCode)
    );
  });
  const validMatches = matches.filter((item) => item.isActive && body.password === (item.password ?? PASSWORD));
  const businessMatches = validMatches.filter((item) => !hasRole(item, ["SUPER_ADMIN"]));
  if (!validMatches.length) {
    return error(res, 401, "Invalid email or password");
  }
  if (!businessMatches.length) {
    return error(res, 401, "Use platform ops login");
  }
  if (businessMatches.length > 1 && !hasTenantScope) {
    return json(res, {
      requiresTenantSelection: true,
      options: businessMatches.map((item) => tenantSelectionOption(item))
    });
  }
  const found = businessMatches[0];
  found.lastLoginAt = new Date().toISOString();
  audit(found, "AUTH_LOGIN", "User", found.id);
  return json(res, {
    accessToken: `local:${found.id}`,
    user: me(found)
  });
}

function opsLogin(res, body) {
  if (String(body.password ?? "") !== OPS_ADMIN_PASSWORD) {
    return error(res, 401, "Invalid ops password");
  }
  return json(res, {
    accessToken: "local-ops",
    user: me(OPS_USER)
  });
}

function registerTenant(body) {
  const tenantCode = normalizeUnifiedSocialCreditCode(body.tenantCode);
  if (!UNIFIED_SOCIAL_CREDIT_CODE_PATTERN.test(tenantCode)) throw httpError(400, "请输入 18 位营业执照统一社会信用代码");
  if (tenants.some((item) => item.code === tenantCode)) throw httpError(400, "该统一社会信用代码已注册");
  const tenantId = `tenant-${Date.now()}`;
  const logoUrl = normalizeTenantLogoUrl(body.logoUrl);
  const newTenant = {
    id: tenantId,
    name: body.companyName,
    code: tenantCode,
    logoUrl,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null
  };
  const periodEnd = dateKey(addMonths(today, 1));
  tenants.push(newTenant);
  subscriptions.set(tenantId, {
    id: `sub-${Date.now()}`,
    tenantId,
    plan: "TRIAL",
    status: "TRIALING",
    seatLimit: 0,
    currentPeriodStart: todayKey,
    currentPeriodEnd: periodEnd,
    trialEndsAt: periodEnd,
    canceledAt: null,
    provider: "self_service",
    externalCustomerId: null,
    externalSubscriptionId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null
  });
  const departmentIds = ensureStandardDepartments(tenantId);
  const admin = makeUser(`user-${Date.now()}`, body.adminEmail, body.adminName, departmentIds.get("executive") ?? null, ["COMPANY_ADMIN"], tenantId, body.password, null, false);
  users.push(admin);
  audit(admin, "TENANT_REGISTERED", "Tenant", tenantId, { tenantCode, adminEmail: admin.email });
  return {
    accessToken: `local:${admin.id}`,
    user: me(admin),
    emailVerificationRequired: false,
    emailVerificationToken: `verify-${admin.id}`
  };
}

function clearLocalData(user) {
  requireRole(user, ["SUPER_ADMIN"]);
  const now = new Date().toISOString();

  tenants.splice(0, tenants.length, {
    ...tenant,
    name: DEMO_COMPANY_NAME,
    code: DEMO_UNIFIED_SOCIAL_CREDIT_CODE,
    updatedAt: now,
    deletedAt: null
  });
  departments.splice(0, departments.length, ...createDemoDepartments());
  projects.splice(0, projects.length, ...createDemoProjects());
  workLogs.splice(0, workLogs.length, ...createDemoWorkLogs());
  analyses.clear();
  for (const log of workLogs) {
    analyses.set(log.id, createAnalysis(log));
  }
  reports.length = 0;
  notifications.length = 0;
  billingOrders.length = 0;
  dataDeletionRequests.length = 0;
  workLogAttachments.length = 0;
  exportTasks.length = 0;
  feedbackRequests.length = 0;
  auditLogs.length = 0;
  passwordResetTokens.clear();
  wecomIntegrations.length = 0;
  wecomUserBindings.length = 0;
  communicationSources.length = 0;
  communicationMessages.length = 0;
  communicationFiles.length = 0;
  communicationInsights.length = 0;
  communicationProjectSuggestions.length = 0;
  wecomExternalConsents.length = 0;
  workLogSourceLinks.length = 0;

  users.splice(
    0,
    users.length,
    ...createDemoUsers()
  );

  subscriptions.clear();
  subscriptions.set(tenant.id, {
    id: "sub-demo",
    tenantId: tenant.id,
    plan: "TEAM",
    status: "ACTIVE",
    seatLimit: 14,
    currentPeriodStart: todayKey,
    currentPeriodEnd: dateKey(addDays(today, 365)),
    trialEndsAt: null,
    canceledAt: null,
    provider: "manual",
    externalCustomerId: null,
    externalSubscriptionId: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null
  });

  return {
    ok: true,
    preservedLogin: {
      tenantCode: DEMO_UNIFIED_SOCIAL_CREDIT_CODE,
      email: "admin@example.com",
      password: PASSWORD
    },
    remaining: {
      tenants: tenants.length,
      users: users.length,
      opsUsers: 1,
      departments: departments.length,
      projects: projects.length,
      workLogs: workLogs.length,
      reports: reports.length,
      notifications: notifications.length,
      billingOrders: billingOrders.length
    }
  };
}

function requestPasswordReset(body) {
  const email = normalizeEmail(body.email);
  const tenantCode = normalizeOptionalUnifiedSocialCreditCode(body.tenantCode);
  const found = users.find((item) => {
    const ownerTenant = tenants.find((candidate) => candidate.id === item.tenantId);
    return item.email === email && (!tenantCode || ownerTenant?.code === tenantCode);
  });
  if (!found) return { ok: true };
  const token = `reset-${Date.now()}-${found.id}`;
  passwordResetTokens.set(token, { userId: found.id, expiresAt: addHours(new Date(), 2).toISOString(), usedAt: null });
  audit(found, "PASSWORD_RESET_REQUESTED", "User", found.id);
  return { ok: true, resetToken: token };
}

function confirmPasswordReset(body) {
  const token = passwordResetTokens.get(body.token);
  if (!token || token.usedAt || token.expiresAt < new Date().toISOString()) throw httpError(400, "重置链接无效或已过期");
  const found = users.find((item) => item.id === token.userId);
  if (!found) throw httpError(404, "User not found");
  found.password = body.newPassword;
  token.usedAt = new Date().toISOString();
  audit(found, "PASSWORD_RESET_CONFIRMED", "User", found.id);
  return { ok: true };
}

function verifyEmail(body) {
  const userId = String(body.token ?? "").split("-").at(-1);
  const found = users.find((item) => item.id === userId);
  if (!found) throw httpError(400, "验证链接无效或已过期");
  found.emailVerifiedAt = new Date().toISOString();
  audit(found, "EMAIL_VERIFIED", "User", found.id);
  return { ok: true };
}

function changePassword(user, body) {
  if (user.id === OPS_USER.id) throw httpError(400, "平台运维口令由服务器环境变量 OPS_ADMIN_PASSWORD 管理");
  if (body.currentPassword !== (user.password ?? PASSWORD)) throw httpError(400, "当前密码不正确");
  user.password = body.newPassword;
  user.lastPasswordChangedAt = new Date().toISOString();
  audit(user, "PASSWORD_CHANGED", "User", user.id);
  return { ok: true };
}

function me(user) {
  if (user.id === OPS_USER.id) {
    return {
      id: OPS_USER.id,
      tenantId: "platform",
      tenantName: "北京七数智联科技有限公司",
      tenantCode: "PLATFORM",
      tenantLogoUrl: null,
      email: null,
      phone: null,
      name: OPS_USER.name,
      departmentId: null,
      departmentName: null,
      roles: OPS_USER.roles,
      requiresWorkReport: false
    };
  }
  const ownerTenant = tenants.find((item) => item.id === user.tenantId) ?? tenant;
  const dept = departments.find((item) => item.id === user.departmentId && item.tenantId === user.tenantId);
  return {
    id: user.id,
    tenantId: ownerTenant.id,
    tenantName: ownerTenant.name,
    tenantCode: ownerTenant.code,
    tenantLogoUrl: ownerTenant.logoUrl ?? null,
    email: user.email,
    phone: user.phone ?? null,
    name: user.name,
    departmentId: user.departmentId,
    departmentName: dept?.name ?? null,
    roles: user.roles,
    requiresWorkReport: user.requiresWorkReport ?? true
  };
}

function tenantSelectionOption(user) {
  const ownerTenant = tenants.find((item) => item.id === user.tenantId) ?? tenant;
  const dept = departments.find((item) => item.id === user.departmentId && item.tenantId === user.tenantId);
  return {
    tenantId: ownerTenant.id,
    tenantName: ownerTenant.name,
    tenantCode: ownerTenant.code,
    tenantLogoUrl: ownerTenant.logoUrl ?? null,
    userName: user.name,
    departmentName: dept?.name ?? null
  };
}

function getOrg(user) {
  const visibleUsers = filterUsersByAccess(user, new URL("http://localhost/?scope=company"));
  const ownerTenant = tenants.find((item) => item.id === user.tenantId) ?? tenant;
  const visibleDepartments = departments.filter((item) => item.tenantId === user.tenantId && !item.deletedAt);
  return {
    tenant: ownerTenant,
    subscription: subscriptionSummary(user.tenantId),
    departments: visibleDepartments,
    users: visibleUsers.map((item) => ({
      id: item.id,
      email: item.email,
      phone: item.phone ?? null,
      name: item.name,
      departmentId: item.departmentId,
      departmentName: visibleDepartments.find((dept) => dept.id === item.departmentId)?.name ?? null,
      isActive: item.isActive,
      requiresWorkReport: item.requiresWorkReport ?? true,
      roles: item.roles,
      createdAt: item.createdAt
    }))
  };
}

function createTenant(user, body) {
  requireRole(user, ["SUPER_ADMIN"]);
  const code = normalizeUnifiedSocialCreditCode(body.code);
  if (!UNIFIED_SOCIAL_CREDIT_CODE_PATTERN.test(code)) throw httpError(400, "请输入 18 位营业执照统一社会信用代码");
  if (tenants.some((item) => item.code === code && !item.deletedAt)) throw httpError(400, "该统一社会信用代码已注册");
  const adminEmail = normalizeEmail(body.adminEmail);
  if (!adminEmail) throw httpError(400, "Admin email is required");
  const adminPassword = requireInitialPassword(body.adminPassword, "请设置初始管理员密码");
  const now = new Date().toISOString();
  const tenantId = `tenant-${Date.now()}`;
  const logoUrl = normalizeTenantLogoUrl(body.logoUrl);
  const newTenant = {
    id: tenantId,
    name: body.name,
    code,
    logoUrl,
    createdAt: now,
    updatedAt: now,
    deletedAt: null
  };
  tenants.push(newTenant);
  const periodEnd = dateKey(addMonths(today, 1));
  subscriptions.set(tenantId, {
    id: `sub-${tenantId}`,
    tenantId,
    plan: "TRIAL",
    status: "TRIALING",
    seatLimit: 0,
    currentPeriodStart: todayKey,
    currentPeriodEnd: periodEnd,
    trialEndsAt: periodEnd,
    canceledAt: null,
    provider: "manual",
    externalCustomerId: null,
    externalSubscriptionId: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null
  });
  const departmentIds = ensureStandardDepartments(tenantId);
  const admin = makeUser(
    `user-${Date.now()}`,
    adminEmail,
    body.adminName,
    departmentIds.get("executive") ?? null,
    ["COMPANY_ADMIN"],
    tenantId,
    adminPassword,
    null,
    false
  );
  users.push(admin);
  audit(user, "TENANT_CREATED", "Tenant", tenantId, { tenantCode: code, adminEmail });
  return {
    tenant: newTenant,
    admin: {
      id: admin.id,
      email: admin.email,
      name: admin.name
    }
  };
}

function createDepartment(user, body) {
  requireRole(user, ["COMPANY_ADMIN", "SUPER_ADMIN"]);
  if (body.parentId && !departments.some((dept) => dept.id === body.parentId && dept.tenantId === user.tenantId && !dept.deletedAt)) {
    throw httpError(404, "Department not found");
  }
  const item = { id: `dept-${Date.now()}`, tenantId: user.tenantId, name: body.name, parentId: body.parentId ?? null, deletedAt: null };
  departments.push(item);
  return item;
}

function updateDepartment(user, id, body) {
  requireRole(user, ["COMPANY_ADMIN", "SUPER_ADMIN"]);
  const item = departments.find((dept) => dept.id === id && dept.tenantId === user.tenantId && !dept.deletedAt);
  if (!item) throw httpError(404, "Department not found");
  if (body.parentId === id) throw httpError(400, "Department cannot be its own parent");
  if (body.parentId && !departments.some((dept) => dept.id === body.parentId && dept.tenantId === user.tenantId && !dept.deletedAt)) {
    throw httpError(404, "Department not found");
  }
  if (body.name !== undefined) item.name = body.name;
  if (body.parentId !== undefined) item.parentId = body.parentId;
  return item;
}

function deleteDepartment(user, id) {
  requireRole(user, ["COMPANY_ADMIN", "SUPER_ADMIN"]);
  const item = departments.find((dept) => dept.id === id && dept.tenantId === user.tenantId && !dept.deletedAt);
  if (!item) throw httpError(404, "Department not found");
  const childCount = departments.filter((dept) => dept.tenantId === user.tenantId && dept.parentId === id && !dept.deletedAt).length;
  if (childCount) throw httpError(400, "请先删除或移动下级部门，再删除该部门");
  const memberCount = users.filter((member) => member.tenantId === user.tenantId && member.departmentId === id && !member.deletedAt).length;
  if (memberCount) throw httpError(400, "请先将部门成员移到其他部门，再删除该部门");
  item.deletedAt = new Date().toISOString();
  item.updatedAt = item.deletedAt;
  audit(user, "DEPARTMENT_DELETED", "Department", item.id, { name: item.name, parentId: item.parentId });
  return { ok: true };
}

function createOrgUser(currentUser, body) {
  requireRole(currentUser, ["COMPANY_ADMIN", "SUPER_ADMIN"]);
  assertSeatAvailable(currentUser.tenantId);
  const email = normalizeEmail(body.email);
  const phone = normalizePhone(body.phone);
  const password = requireInitialPassword(body.password, "请设置成员初始密码");
  const roles = normalizeTenantRoleCodes(body.roles);
  assertContact(email, phone);
  if (hasContactConflict(currentUser.tenantId, email, phone)) {
    throw httpError(400, "邮箱或手机号已被当前企业其他账号使用");
  }
  const item = {
    ...makeUser(
      `user-${Date.now()}`,
      email,
      body.name,
      body.departmentId ?? null,
      roles,
      currentUser.tenantId,
      password,
      phone,
      body.requiresWorkReport ?? true
    )
  };
  users.push(item);
  return orgUser(item);
}

function subscriptionSummary(tenantId = tenant.id) {
  let item = subscriptions.get(tenantId);
  if (!item) {
    const periodEnd = dateKey(addMonths(today, 1));
    item = {
      id: `sub-${tenantId}`,
      tenantId,
      plan: "TRIAL",
      status: "TRIALING",
      seatLimit: 0,
      currentPeriodStart: todayKey,
      currentPeriodEnd: periodEnd,
      trialEndsAt: periodEnd,
      canceledAt: null,
      provider: "self_service",
      externalCustomerId: null,
      externalSubscriptionId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null
    };
    subscriptions.set(tenantId, item);
  }
  const usedSeats = users.filter((user) => user.tenantId === tenantId && user.isActive).length;
  const isTrialing = item.status === "TRIALING";
  return {
    ...item,
    usedSeats,
    remainingSeats: null,
    isUsable: ["TRIALING", "ACTIVE"].includes(item.status) && (!item.currentPeriodEnd || item.currentPeriodEnd >= todayKey),
    billingModel: "ACTIVE_MEMBER_MONTHLY",
    activeMemberMonthlyPriceCents: ACTIVE_MEMBER_MONTHLY_PRICE_CENTS,
    estimatedMonthlyAmountCents: usedSeats * ACTIVE_MEMBER_MONTHLY_PRICE_CENTS,
    trialUnlimited: isTrialing
  };
}

function getBillingPlans() {
  return {
    currency: "CNY",
    plans: BILLING_PLANS,
    billingPolicy: {
      model: "ACTIVE_MEMBER_MONTHLY",
      trialDays: 30,
      trialUnlimitedMembers: true,
      activeMemberMonthlyPriceCents: ACTIVE_MEMBER_MONTHLY_PRICE_CENTS,
      copy: "企业免费试用1个月，正式使用 ¥19 / 启用成员 / 月。"
    },
    paymentProviders: [
      { provider: "ALIPAY", enabled: true, mode: "mock" },
      { provider: "WECHAT", enabled: true, mode: "mock" }
    ]
  };
}

function updateSubscription(user, body) {
  requireRole(user, ["SUPER_ADMIN"]);
  const item = subscriptions.get(user.tenantId) ?? subscriptionSummary(user.tenantId);
  for (const key of ["plan", "status", "provider", "externalCustomerId", "externalSubscriptionId"]) {
    if (body[key] !== undefined) item[key] = body[key];
  }
  if (body.seatLimit !== undefined) item.seatLimit = Number(body.seatLimit);
  if (body.currentPeriodEnd !== undefined) item.currentPeriodEnd = body.currentPeriodEnd;
  if (body.trialEndsAt !== undefined) item.trialEndsAt = body.trialEndsAt;
  item.canceledAt = body.status === "CANCELED" ? new Date().toISOString() : item.canceledAt;
  item.updatedAt = new Date().toISOString();
  subscriptions.set(user.tenantId, item);
  audit(user, "SUBSCRIPTION_UPDATED", "Subscription", user.tenantId, body);
  return subscriptionSummary(user.tenantId);
}

function listBillingOrders(user) {
  requireRole(user, ["COMPANY_ADMIN", "SUPER_ADMIN"]);
  return billingOrders
    .filter((item) => item.tenantId === user.tenantId && !item.deletedAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function createBillingOrder(user, body) {
  requireRole(user, ["COMPANY_ADMIN", "SUPER_ADMIN"]);
  const plan = body.plan ?? "TEAM";
  const interval = body.interval ?? "MONTHLY";
  if (plan !== "TEAM" || interval !== "MONTHLY") {
    throw httpError(400, "当前仅支持专业版按月订阅");
  }
  const activeMemberCount = subscriptionSummary(user.tenantId).usedSeats;
  const billedMemberCount = Math.max(1, activeMemberCount);
  const amountCents = planUnitPriceCents(plan, interval) * billedMemberCount;
  const paymentUrl = mockPaymentUrl(body.provider, amountCents);
  const order = {
    id: `order-${Date.now()}`,
    tenantId: user.tenantId,
    createdById: user.id,
    plan,
    interval,
    seatLimit: billedMemberCount,
    status: "PENDING",
    provider: body.provider ?? "MANUAL",
    amountCents,
    currency: "CNY",
    paymentUrl,
    paidAt: null,
    expiresAt: addDays(new Date(), 7).toISOString(),
    metadata: {
      billingModel: "ACTIVE_MEMBER_MONTHLY",
      unitPriceCents: planUnitPriceCents(plan, interval),
      activeMemberCount,
      billedMemberCount,
      subscriptionPeriodPreview: subscriptionPeriodFrom(new Date(), interval),
      payment: paymentUrl
        ? {
            provider: body.provider,
            mode: "mock",
            paymentUrl,
            qrCodeText: paymentUrl,
            transactionId: `mock-${Date.now()}`,
            amountCents
          }
        : null
    },
    payments: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null
  };
  billingOrders.unshift(order);
  audit(user, "BILLING_ORDER_CREATED", "BillingOrder", order.id, { plan, interval, activeMemberCount, billedMemberCount, amountCents });
  return order;
}

function getBillingOrderPayment(user, orderId) {
  requireRole(user, ["COMPANY_ADMIN", "SUPER_ADMIN"]);
  const order = billingOrders.find((item) => item.id === orderId && item.tenantId === user.tenantId);
  if (!order) throw httpError(404, "Billing order not found");
  return {
    order,
    subscriptionPeriod: subscriptionPeriodForOrder(order),
    payment: order.metadata?.payment ?? (order.paymentUrl ? {
      provider: order.provider,
      mode: "mock",
      paymentUrl: order.paymentUrl,
      qrCodeText: order.paymentUrl,
      amountCents: order.amountCents
    } : null)
  };
}

function confirmOnlinePayment(user, orderId) {
  requireRole(user, ["COMPANY_ADMIN", "SUPER_ADMIN"]);
  const order = billingOrders.find((item) => item.id === orderId && item.tenantId === user.tenantId);
  if (!order) throw httpError(404, "Billing order not found");
  if (order.status !== "PENDING") return order;
  if (!["ALIPAY", "WECHAT"].includes(order.provider)) throw httpError(400, "当前订单不是线上支付订单");
  return applyPaidBillingOrder(user, order, order.provider, `mock-paid-${order.id}`);
}

function confirmManualPayment(user, orderId, body) {
  requireRole(user, ["SUPER_ADMIN"]);
  const order = billingOrders.find((item) => item.id === orderId && item.tenantId === user.tenantId);
  if (!order) throw httpError(404, "Billing order not found");
  if (order.status !== "PENDING") throw httpError(400, "Billing order is not pending");
  return applyPaidBillingOrder(user, order, "MANUAL", body.transactionId ?? null);
}

function applyPaidBillingOrder(user, order, provider, transactionId) {
  order.status = "PAID";
  order.paidAt = new Date().toISOString();
  order.updatedAt = new Date().toISOString();
  order.metadata = {
    ...(order.metadata ?? {}),
    subscriptionPeriod: subscriptionPeriodFrom(new Date(order.paidAt), order.interval)
  };
  order.payments.push({
    id: `pay-${Date.now()}`,
    tenantId: order.tenantId,
    orderId: order.id,
    provider,
    status: "SUCCEEDED",
    amountCents: order.amountCents,
    currency: order.currency,
    transactionId,
    paidAt: order.paidAt,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  const item = subscriptions.get(order.tenantId) ?? subscriptionSummary(order.tenantId);
  item.plan = order.plan;
  item.status = "ACTIVE";
  item.seatLimit = order.seatLimit;
  item.currentPeriodStart = order.metadata.subscriptionPeriod.startDate;
  item.currentPeriodEnd = order.metadata.subscriptionPeriod.endDate;
  item.provider = String(provider).toLowerCase();
  item.updatedAt = new Date().toISOString();
  subscriptions.set(order.tenantId, item);
  audit(user, provider === "MANUAL" ? "BILLING_MANUAL_PAYMENT_CONFIRMED" : "BILLING_ONLINE_PAYMENT_CONFIRMED", "BillingOrder", order.id, {
    transactionId,
    subscriptionPeriod: order.metadata.subscriptionPeriod
  });
  return order;
}

function mockPaymentUrl(provider, amountCents) {
  if (!provider || provider === "MANUAL") return null;
  const token = Math.random().toString(36).slice(2, 12);
  if (provider === "WECHAT") return `weixin://wxpay/bizpayurl?pr=${token}`;
  if (provider === "ALIPAY") return `alipay://platformapi/startapp?appId=20000067&amount=${amountCents}&tradeNo=${token}`;
  return null;
}

function subscriptionPeriodFrom(startDate, interval) {
  const start = dateKey(startDate);
  const end = dateKey(addMonths(startDate, interval === "YEARLY" ? 12 : 1));
  return { startDate: start, endDate: end };
}

function subscriptionPeriodForOrder(order) {
  if (order.metadata?.subscriptionPeriod) return order.metadata.subscriptionPeriod;
  const start = order.status === "PAID" && order.paidAt ? new Date(order.paidAt) : new Date();
  return subscriptionPeriodFrom(start, order.interval);
}

function planUnitPriceCents(plan, interval) {
  const config = BILLING_PLANS.find((item) => item.plan === plan);
  const monthly = plan === "TRIAL" ? 0 : config?.monthlyPriceCents ?? ACTIVE_MEMBER_MONTHLY_PRICE_CENTS;
  return interval === "YEARLY" ? 0 : monthly;
}

function opsOverview(user) {
  requireRole(user, ["SUPER_ADMIN"]);
  const businessUsers = users.filter(isOpsBusinessAccount);
  const tenantSummaries = tenants
    .filter((item) => !item.deletedAt)
    .map((item) => ({
      id: item.id,
      name: item.name,
      code: item.code,
      logoUrl: item.logoUrl ?? null,
      createdAt: item.createdAt,
      subscription: subscriptionSummary(item.id),
      counts: {
        users: businessUsers.filter((candidate) => candidate.tenantId === item.id).length,
        departments: departments.filter((candidate) => candidate.tenantId === item.id && !candidate.deletedAt).length,
        projects: projects.filter((candidate) => candidate.tenantId === item.id && !candidate.deletedAt).length,
        workLogs: workLogs.filter((candidate) => candidate.tenantId === item.id && !candidate.deletedAt).length,
        reports: reports.filter((candidate) => candidate.tenantId === item.id).length
      }
    }));
  return {
    developerCompany: "北京七数智联科技有限公司",
    totals: {
      tenants: tenantSummaries.length,
      accounts: businessUsers.length,
      activeAccounts: businessUsers.filter((item) => item.isActive).length,
      workLogs: workLogs.filter((item) => !item.deletedAt).length,
      reports: reports.length
    },
    tenants: tenantSummaries,
    accounts: businessUsers
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((item) => {
        const ownerTenant = tenants.find((candidate) => candidate.id === item.tenantId) ?? tenant;
        return {
          id: item.id,
          tenantId: item.tenantId,
          tenantName: ownerTenant.name,
          tenantCode: ownerTenant.code,
          tenantLogoUrl: ownerTenant.logoUrl ?? null,
          email: item.email,
          phone: item.phone ?? null,
          name: item.name,
          departmentName: departments.find((dept) => dept.id === item.departmentId && dept.tenantId === item.tenantId)?.name ?? null,
          isActive: item.isActive,
          requiresWorkReport: item.requiresWorkReport ?? true,
          roles: item.roles,
          lastLoginAt: item.lastLoginAt ?? null,
          createdAt: item.createdAt
        };
      })
  };
}

function isOpsBusinessAccount(item) {
  return Boolean(item && !item.deletedAt && !hasRole(item, ["SUPER_ADMIN"]));
}

function updateOpsAccount(user, accountId, body) {
  requireRole(user, ["SUPER_ADMIN"]);
  if (user.id === accountId && body.isActive === false) throw httpError(400, "Cannot deactivate your own ops account");
  const target = users.find((item) => item.id === accountId && isOpsBusinessAccount(item));
  if (!target) throw httpError(404, "Account not found");
  if (body.name !== undefined) target.name = String(body.name).trim();
  if (body.isActive !== undefined) target.isActive = Boolean(body.isActive);
  audit(user, "OPS_ACCOUNT_UPDATED", "User", target.id, { targetTenantId: target.tenantId, email: target.email, phone: target.phone, isActive: target.isActive });
  const ownerTenant = tenants.find((candidate) => candidate.id === target.tenantId) ?? tenant;
  return {
    id: target.id,
    tenantId: target.tenantId,
    tenantName: ownerTenant.name,
    tenantCode: ownerTenant.code,
    tenantLogoUrl: ownerTenant.logoUrl ?? null,
    email: target.email,
    phone: target.phone ?? null,
    name: target.name,
    departmentName: departments.find((dept) => dept.id === target.departmentId && dept.tenantId === target.tenantId)?.name ?? null,
    isActive: target.isActive,
    requiresWorkReport: target.requiresWorkReport ?? true,
    roles: target.roles,
    lastLoginAt: target.lastLoginAt ?? null,
    createdAt: target.createdAt
  };
}

function createOpsCompanyAdmin(user, body) {
  requireRole(user, ["SUPER_ADMIN"]);
  const targetTenant = tenants.find((item) => item.id === body.tenantId && !item.deletedAt);
  if (!targetTenant) throw httpError(404, "Tenant not found");
  const name = String(body.name ?? "").trim();
  if (name.length < 2) throw httpError(400, "姓名至少 2 个字符");
  const email = normalizeEmail(body.email);
  const phone = normalizePhone(body.phone);
  assertContact(email, phone);
  const matchingUsers = users.filter((item) => item.tenantId === targetTenant.id && matchesContact(item, email, phone));
  const activeConflict = matchingUsers.find((item) => !item.deletedAt);
  if (activeConflict) throw httpError(400, "邮箱或手机号已被当前企业其他账号使用");
  const deletedMatches = Array.from(new Set(matchingUsers.map((item) => item.id)));
  if (deletedMatches.length > 1) throw httpError(400, "邮箱和手机号分别匹配到不同的已删除账号，请更换联系方式或联系运维处理");
  const temporaryPassword = generateTemporaryPassword();
  const target = deletedMatches[0]
    ? users.find((item) => item.id === deletedMatches[0])
    : makeUser(`user-${Date.now()}`, email, name, null, ["COMPANY_ADMIN"], targetTenant.id, temporaryPassword, phone, false);
  if (!target) throw httpError(404, "Account not found");
  target.tenantId = targetTenant.id;
  target.email = email;
  target.phone = phone;
  target.name = name;
  target.departmentId = null;
  target.roles = ["COMPANY_ADMIN"];
  target.password = temporaryPassword;
  target.isActive = true;
  target.requiresWorkReport = false;
  target.failedLoginCount = 0;
  target.lockedUntil = null;
  target.deletedAt = null;
  target.updatedAt = new Date().toISOString();
  if (!deletedMatches[0]) users.push(target);
  audit(user, "OPS_COMPANY_ADMIN_CREATED", "User", target.id, {
    targetTenantId: targetTenant.id,
    tenantCode: targetTenant.code,
    email,
    phone,
    name: target.name
  });
  return {
    id: target.id,
    tenantId: target.tenantId,
    tenantName: targetTenant.name,
    tenantCode: targetTenant.code,
    tenantLogoUrl: targetTenant.logoUrl ?? null,
    email: target.email,
    phone: target.phone ?? null,
    name: target.name,
    departmentName: null,
    isActive: target.isActive,
    requiresWorkReport: target.requiresWorkReport ?? true,
    roles: target.roles,
    lastLoginAt: target.lastLoginAt ?? null,
    createdAt: target.createdAt,
    temporaryPassword
  };
}

function resetOpsAccountPassword(user, accountId) {
  requireRole(user, ["SUPER_ADMIN"]);
  const target = users.find((item) => item.id === accountId && isOpsBusinessAccount(item));
  if (!target) throw httpError(404, "Account not found");
  const temporaryPassword = generateTemporaryPassword();
  target.password = temporaryPassword;
  target.failedLoginCount = 0;
  target.lockedUntil = null;
  target.updatedAt = new Date().toISOString();
  audit(user, "OPS_ACCOUNT_PASSWORD_RESET", "User", target.id, { targetTenantId: target.tenantId, email: target.email, phone: target.phone });
  const ownerTenant = tenants.find((candidate) => candidate.id === target.tenantId) ?? tenant;
  return {
    id: target.id,
    tenantId: target.tenantId,
    tenantName: ownerTenant.name,
    tenantCode: ownerTenant.code,
    tenantLogoUrl: ownerTenant.logoUrl ?? null,
    email: target.email,
    phone: target.phone ?? null,
    name: target.name,
    departmentName: departments.find((dept) => dept.id === target.departmentId && dept.tenantId === target.tenantId)?.name ?? null,
    isActive: target.isActive,
    requiresWorkReport: target.requiresWorkReport ?? true,
    roles: target.roles,
    lastLoginAt: target.lastLoginAt ?? null,
    createdAt: target.createdAt,
    temporaryPassword
  };
}

function restoreOpsCompanyAdmin(user, accountId) {
  requireRole(user, ["SUPER_ADMIN"]);
  const target = users.find((item) => item.id === accountId && isOpsBusinessAccount(item));
  if (!target) throw httpError(404, "Account not found");
  target.roles = ["COMPANY_ADMIN"];
  target.isActive = true;
  target.failedLoginCount = 0;
  target.lockedUntil = null;
  target.updatedAt = new Date().toISOString();
  audit(user, "OPS_ACCOUNT_COMPANY_ADMIN_RESTORED", "User", target.id, {
    targetTenantId: target.tenantId,
    email: target.email,
    phone: target.phone,
    name: target.name
  });
  const ownerTenant = tenants.find((candidate) => candidate.id === target.tenantId) ?? tenant;
  return {
    id: target.id,
    tenantId: target.tenantId,
    tenantName: ownerTenant.name,
    tenantCode: ownerTenant.code,
    tenantLogoUrl: ownerTenant.logoUrl ?? null,
    email: target.email,
    phone: target.phone ?? null,
    name: target.name,
    departmentName: departments.find((dept) => dept.id === target.departmentId && dept.tenantId === target.tenantId)?.name ?? null,
    isActive: target.isActive,
    requiresWorkReport: target.requiresWorkReport ?? true,
    roles: target.roles,
    lastLoginAt: target.lastLoginAt ?? null,
    createdAt: target.createdAt
  };
}

function deleteOpsAccount(user, accountId) {
  requireRole(user, ["SUPER_ADMIN"]);
  const target = users.find((item) => item.id === accountId && isOpsBusinessAccount(item));
  if (!target) throw httpError(404, "Account not found");
  const deletedAt = new Date().toISOString();
  target.isActive = false;
  target.failedLoginCount = 0;
  target.lockedUntil = null;
  target.deletedAt = deletedAt;
  target.updatedAt = deletedAt;
  for (const token of passwordResetTokens.values()) {
    if (token.userId === target.id && !token.usedAt) {
      token.usedAt = deletedAt;
    }
  }
  audit(user, "OPS_ACCOUNT_DELETED", "User", target.id, { targetTenantId: target.tenantId, email: target.email, phone: target.phone, name: target.name });
  return { ok: true };
}

function updateOpsTenantLogo(user, tenantId, body) {
  requireRole(user, ["SUPER_ADMIN"]);
  const target = tenants.find((item) => item.id === tenantId && !item.deletedAt);
  if (!target) throw httpError(404, "Tenant not found");
  const nextLogoUrl = normalizeTenantLogoUrl(body.logoUrl);
  const hadLogo = Boolean(target.logoUrl);
  target.logoUrl = nextLogoUrl;
  target.updatedAt = new Date().toISOString();
  audit(user, "OPS_TENANT_LOGO_UPDATED", "Tenant", target.id, {
    tenantCode: target.code,
    hadLogo,
    hasLogo: Boolean(target.logoUrl)
  });
  return target;
}

function exportData(user, url) {
  const requestedScope = url.searchParams.get("scope") ?? (hasRole(user, ["COMPANY_ADMIN", "SUPER_ADMIN"]) ? "tenant" : "self");
  if (requestedScope === "tenant") {
    requireRole(user, ["COMPANY_ADMIN", "SUPER_ADMIN"]);
    const tenantUsers = users.filter((item) => item.tenantId === user.tenantId).map(publicUser);
    const tenantWorkLogs = workLogs.filter((item) => item.tenantId === user.tenantId).map(enrichLog);
    return {
      metadata: exportMetadata("tenant"),
      tenant: tenants.find((item) => item.id === user.tenantId) ?? tenant,
      subscription: subscriptionSummary(user.tenantId),
      departments: departments.filter((item) => item.tenantId === user.tenantId && !item.deletedAt),
      projects: projects.filter((item) => item.tenantId === user.tenantId && !item.deletedAt).map(projectWithOwner),
      users: tenantUsers,
      workLogs: tenantWorkLogs,
      aiAnalyses: Array.from(analyses.values()).filter((item) => item.tenantId === user.tenantId),
      reports: reports.filter((item) => item.tenantId === user.tenantId),
      notifications: notifications.filter((item) => item.tenantId === user.tenantId),
      billingOrders: billingOrders.filter((item) => item.tenantId === user.tenantId),
      auditLogs: auditLogs.filter((item) => item.tenantId === user.tenantId),
      dataDeletionRequests: dataDeletionRequests.filter((item) => item.tenantId === user.tenantId),
      workLogAttachments: workLogAttachments.filter((item) => item.tenantId === user.tenantId && !item.deletedAt).map(publicAttachment),
      feedbackRequests: feedbackRequests.filter((item) => item.tenantId === user.tenantId && !item.deletedAt),
      exportTasks: exportTasks.filter((item) => item.tenantId === user.tenantId && !item.deletedAt).map(publicExportTask)
    };
  }
  return {
    metadata: exportMetadata("self"),
    tenant: tenants.find((item) => item.id === user.tenantId) ?? tenant,
    account: publicUser(user),
    workLogs: workLogs.filter((item) => item.tenantId === user.tenantId && item.userId === user.id).map(enrichLog),
    reports: reports.filter((item) => item.tenantId === user.tenantId && item.requesterId === user.id),
    notifications: notifications.filter((item) => item.tenantId === user.tenantId && item.userId === user.id),
    dataDeletionRequests: dataDeletionRequests.filter((item) => item.tenantId === user.tenantId && item.requesterId === user.id),
    workLogAttachments: workLogAttachments.filter((item) => item.tenantId === user.tenantId && item.uploaderId === user.id && !item.deletedAt).map(publicAttachment),
    feedbackRequests: feedbackRequests.filter((item) => item.tenantId === user.tenantId && item.requesterId === user.id && !item.deletedAt),
    exportTasks: exportTasks.filter((item) => item.tenantId === user.tenantId && item.requesterId === user.id && !item.deletedAt).map(publicExportTask)
  };
}

function exportMetadata(scope) {
  return {
    product: "Work Calendar AI",
    version: "0.1.0",
    exportScope: scope,
    exportedAt: new Date().toISOString(),
    confidentialityNotice: "所有企业数据均按租户隔离并视为保密数据。本导出文件仅供企业或用户自行备份、迁移和留存使用。"
  };
}

function publicUser(user) {
  const { password, ...safeUser } = user;
  return {
    ...safeUser,
    departmentName: departments.find((dept) => dept.id === user.departmentId && dept.tenantId === user.tenantId && !dept.deletedAt)?.name ?? null
  };
}

function assertSeatAvailable(tenantId) {
  const summary = subscriptionSummary(tenantId);
  if (!summary.isUsable) throw httpError(400, "当前企业订阅不可用，请续费或联系平台管理员。");
}

function isActiveCompanyAdmin(item) {
  return Boolean(item?.isActive && !item.deletedAt && item.roles?.includes("COMPANY_ADMIN"));
}

function activeCompanyAdminCount(tenantId) {
  return users.filter((item) => item.tenantId === tenantId && isActiveCompanyAdmin(item)).length;
}

function assertCompanyAdminRetained(actor, target, nextRoles, nextIsActive) {
  const removesCompanyAdmin = Boolean(nextRoles && !nextRoles.includes("COMPANY_ADMIN"));
  const deactivatesUser = nextIsActive === false;
  if (!removesCompanyAdmin && !deactivatesUser) return;
  if (!isActiveCompanyAdmin(target)) return;
  if (actor.id === target.id) {
    throw httpError(400, "不能移除当前登录账号的企业管理员权限，请先指定另一个企业管理员后再操作");
  }
  if (activeCompanyAdminCount(actor.tenantId) <= 1) {
    throw httpError(400, "至少保留一个可登录的企业管理员，请先新增或指定另一个企业管理员后再修改");
  }
}

function updateOrgUser(user, id, body) {
  requireRole(user, ["COMPANY_ADMIN", "SUPER_ADMIN"]);
  const item = users.find((candidate) => candidate.id === id && candidate.tenantId === user.tenantId);
  if (!item) throw httpError(404, "User not found");
  const nextRoles = body.roles === undefined ? null : normalizeTenantRoleCodes(body.roles);
  assertCompanyAdminRetained(user, item, nextRoles, body.isActive);
  if (body.isActive === true && !item.isActive) assertSeatAvailable(user.tenantId);
  const nextEmail = body.email === undefined ? item.email : normalizeEmail(body.email);
  const nextPhone = body.phone === undefined ? item.phone : normalizePhone(body.phone);
  assertContact(nextEmail, nextPhone);
  if (hasContactConflict(user.tenantId, nextEmail, nextPhone, id)) {
    throw httpError(400, "邮箱或手机号已被当前企业其他账号使用");
  }
  if (body.email !== undefined) item.email = nextEmail;
  if (body.phone !== undefined) item.phone = nextPhone;
  if (body.name !== undefined) item.name = body.name;
  if (body.departmentId !== undefined) item.departmentId = body.departmentId;
  if (nextRoles) item.roles = nextRoles;
  if (body.isActive !== undefined) item.isActive = body.isActive;
  if (body.requiresWorkReport !== undefined) item.requiresWorkReport = Boolean(body.requiresWorkReport);
  if (body.password) item.password = body.password;
  return orgUser(item);
}

function orgUser(item) {
  const visibleDepartments = departments.filter((dept) => dept.tenantId === item.tenantId && !dept.deletedAt);
  return {
    id: item.id,
    email: item.email,
    phone: item.phone ?? null,
    name: item.name,
    departmentId: item.departmentId,
    departmentName: visibleDepartments.find((dept) => dept.id === item.departmentId)?.name ?? null,
    isActive: item.isActive,
    requiresWorkReport: item.requiresWorkReport ?? true,
    roles: item.roles,
    createdAt: item.createdAt
  };
}

function listProjects(user, url) {
  const status = url.searchParams.get("status");
  const search = (url.searchParams.get("search") ?? "").trim().toLowerCase();
  return projects
    .filter((item) => item.tenantId === user.tenantId && !item.deletedAt)
    .filter((item) => !status || item.status === status)
    .filter((item) => {
      if (!search) return true;
      return [item.code, item.name, item.description].some((value) => String(value ?? "").toLowerCase().includes(search));
    })
    .map(projectWithOwner)
    .sort((a, b) => {
      const rank = { ACTIVE: 0, PAUSED: 1, ARCHIVED: 2 };
      return (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || b.updatedAt.localeCompare(a.updatedAt);
    });
}

function createProject(user, body) {
  requireRole(user, ["COMPANY_ADMIN", "SUPER_ADMIN"]);
  if (body.ownerUserId) assertTenantUser(user.tenantId, body.ownerUserId);
  const item = {
    id: `project-${Date.now()}`,
    tenantId: user.tenantId,
    code: normalizeOptional(body.code),
    name: String(body.name ?? "").trim(),
    description: normalizeOptional(body.description),
    status: body.status ?? "ACTIVE",
    ownerUserId: body.ownerUserId || null,
    startDate: body.startDate || null,
    endDate: body.endDate || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null
  };
  if (item.name.length < 2) throw httpError(400, "Project name is required");
  projects.unshift(item);
  audit(user, "PROJECT_CREATED", "Project", item.id, { name: item.name, code: item.code });
  return projectWithOwner(item);
}

function updateProject(user, id, body) {
  requireRole(user, ["COMPANY_ADMIN", "SUPER_ADMIN"]);
  const item = projects.find((project) => project.id === id && project.tenantId === user.tenantId && !project.deletedAt);
  if (!item) throw httpError(404, "Project not found");
  if (body.ownerUserId) assertTenantUser(user.tenantId, body.ownerUserId);
  if (body.code !== undefined) item.code = normalizeOptional(body.code);
  if (body.name !== undefined) item.name = String(body.name).trim();
  if (body.description !== undefined) item.description = normalizeOptional(body.description);
  if (body.status !== undefined) item.status = body.status;
  if (body.ownerUserId !== undefined) item.ownerUserId = body.ownerUserId || null;
  if (body.startDate !== undefined) item.startDate = body.startDate || null;
  if (body.endDate !== undefined) item.endDate = body.endDate || null;
  item.updatedAt = new Date().toISOString();
  audit(user, "PROJECT_UPDATED", "Project", item.id, { name: item.name, status: item.status });
  return projectWithOwner(item);
}

function deleteProject(user, id) {
  requireRole(user, ["COMPANY_ADMIN", "SUPER_ADMIN"]);
  const item = projects.find((project) => project.id === id && project.tenantId === user.tenantId && !project.deletedAt);
  if (!item) throw httpError(404, "Project not found");
  item.status = "ARCHIVED";
  item.deletedAt = new Date().toISOString();
  item.updatedAt = new Date().toISOString();
  audit(user, "PROJECT_DELETED", "Project", item.id);
  return { ok: true };
}

function wecomOverview(user) {
  const integrations = wecomIntegrations.filter((item) => item.tenantId === user.tenantId && !item.deletedAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const bindings = listWecomBindings(user, false);
  const sources = listCommunicationSources(user, false);
  const drafts = listWecomLogDrafts(user, false).slice(0, 8);
  const files = listCommunicationFiles(user, false).slice(0, 8);
  const projectSuggestions = listCommunicationProjectSuggestions(user, false).slice(0, 8);
  const externalConsents = hasRole(user, ["COMPANY_ADMIN", "SUPER_ADMIN"]) ? wecomExternalConsents.filter((item) => item.tenantId === user.tenantId).slice(0, 8) : [];
  const activeIntegration = integrations.find((item) => item.status === "ACTIVE") ?? integrations[0] ?? null;
  const mappingSummary = {
    total: bindings.length,
    AUTO: bindings.filter((item) => item.mappingStatus === "AUTO").length,
    CONFIRMED: bindings.filter((item) => item.mappingStatus === "CONFIRMED").length,
    CONFLICT: bindings.filter((item) => item.mappingStatus === "CONFLICT").length,
    UNMAPPED: bindings.filter((item) => item.mappingStatus === "UNMAPPED").length,
    EXTERNAL: bindings.filter((item) => item.mappingStatus === "EXTERNAL").length
  };
  audit(user, "WECOM_OVERVIEW_VIEWED", "WecomIntegration", activeIntegration?.id);
  return {
    integrations,
    activeIntegration,
    workerRuntime: {
      mode: "mock",
      adapterConfigured: false,
      adapterCommand: null,
      officialReady: false,
      mockAllowed: true
    },
    sources,
    bindings,
    files,
    projectSuggestions,
    externalConsents,
    mappingSummary,
    drafts,
    setupSummary: {
      autoMatched: mappingSummary.AUTO + mappingSummary.CONFIRMED,
      needsConfirmation: mappingSummary.CONFLICT + mappingSummary.UNMAPPED,
      externalContacts: mappingSummary.EXTERNAL,
      chatCount: sources.length,
      suggestedProjectGroups: sources.filter((item) => item.sourceType === "PROJECT").length,
      pendingProjectSuggestions: projectSuggestions.filter((item) => item.status === "PENDING").length,
      fileCount: files.length,
      failedFileCount: files.filter((item) => item.downloadStatus === "FAILED").length,
      externalConsentIssues: externalConsents.filter((item) => item.status !== "AGREED").length,
      pendingDrafts: drafts.length,
      lastSyncAt: activeIntegration?.lastSyncAt ?? null,
      syncStatus: activeIntegration?.lastSyncStatus ?? "PENDING"
    }
  };
}

function saveWecomIntegration(user, body) {
  requireRole(user, ["COMPANY_ADMIN", "SUPER_ADMIN"]);
  const corpId = String(body.corpId ?? "").trim();
  if (corpId.length < 4) throw httpError(400, "corpid is required");
  const now = new Date().toISOString();
  const existing = wecomIntegrations.find((item) => item.tenantId === user.tenantId && item.corpId === corpId && !item.deletedAt);
  const payload = {
    tenantId: user.tenantId,
    corpId,
    msgAuditSecretRef: String(body.msgAuditSecretRef ?? "").trim(),
    rsaPrivateKeyRef: String(body.rsaPrivateKeyRef ?? "").trim(),
    rsaPublicKeyConfigured: Boolean(body.rsaPublicKeyConfigured),
    trustedIpNote: normalizeOptional(body.trustedIpNote),
    mode: body.mode ?? "LIGHT",
    status: body.rsaPublicKeyConfigured ? "ACTIVE" : "DRAFT",
    syncDepartmentIds: Array.isArray(body.syncDepartmentIds) ? body.syncDepartmentIds : [],
    syncUserIds: Array.isArray(body.syncUserIds) ? body.syncUserIds : [],
    syncChatIds: Array.isArray(body.syncChatIds) ? body.syncChatIds : [],
    syncFiles: Boolean(body.syncFiles),
    generateLogDrafts: body.generateLogDrafts !== false,
    generateProjectRisks: body.generateProjectRisks !== false,
    retentionDays: Number(body.retentionDays ?? 180),
    lastSyncStatus: existing?.lastSyncStatus ?? "PENDING",
    lastSyncAt: existing?.lastSyncAt ?? null,
    lastError: null,
    updatedAt: now,
    deletedAt: null
  };
  if (existing) {
    Object.assign(existing, payload);
    audit(user, "WECOM_INTEGRATION_SAVED", "WecomIntegration", existing.id, { corpId, mode: existing.mode });
    return existing;
  }
  const item = { id: `wecom-integration-${Date.now()}`, ...payload, createdAt: now };
  wecomIntegrations.unshift(item);
  audit(user, "WECOM_INTEGRATION_SAVED", "WecomIntegration", item.id, { corpId, mode: item.mode });
  return item;
}

function testWecomIntegration(user) {
  requireRole(user, ["COMPANY_ADMIN", "SUPER_ADMIN"]);
  const integration = activeWecomIntegration(user.tenantId);
  const missing = [
    integration.corpId ? null : "corpid",
    integration.msgAuditSecretRef ? null : "会话内容存档 secret",
    integration.rsaPrivateKeyRef ? null : "RSA 私钥或密钥引用",
    integration.rsaPublicKeyConfigured ? null : "企业微信后台 RSA 公钥"
  ].filter(Boolean);
  const ok = missing.length === 0;
  integration.status = ok ? "ACTIVE" : "ERROR";
  integration.lastSyncStatus = ok ? "PENDING" : "ERROR";
  integration.lastError = ok ? null : `缺少配置：${missing.join("、")}`;
  integration.updatedAt = new Date().toISOString();
  audit(user, "WECOM_INTEGRATION_TESTED", "WecomIntegration", integration.id, { ok, missing });
  return {
    ok,
    integration,
    message: ok ? "企业微信会话内容存档配置已具备同步条件。" : `请先补充：${missing.join("、")}`
  };
}

function activeWecomIntegration(tenantId) {
  const integration =
    wecomIntegrations.find((item) => item.tenantId === tenantId && item.status === "ACTIVE" && !item.deletedAt) ??
    wecomIntegrations.find((item) => item.tenantId === tenantId && !item.deletedAt);
  if (!integration) throw httpError(400, "请先保存企业微信会话内容存档配置");
  return integration;
}

function memberWecomUserId(member) {
  if (member.email) return member.email.split("@")[0].replace(/[^a-zA-Z0-9._-]/g, "_");
  return `u_${String(member.id).replace(/[^a-zA-Z0-9._-]/g, "_")}`;
}

function autoMatchWecomMembers(user) {
  requireRole(user, ["COMPANY_ADMIN", "SUPER_ADMIN"]);
  const integration = activeWecomIntegration(user.tenantId);
  const members = users.filter((item) => item.tenantId === user.tenantId && !item.deletedAt && item.isActive);
  for (const member of members) {
    const wecomUserId = memberWecomUserId(member);
    const existing = wecomUserBindings.find((item) => item.tenantId === user.tenantId && item.wecomCorpId === integration.corpId && item.wecomUserId === wecomUserId);
    const payload = {
      tenantId: user.tenantId,
      userId: member.id,
      wecomCorpId: integration.corpId,
      wecomUserId,
      wecomName: member.name,
      mobile: member.phone ?? null,
      email: member.email ?? null,
      departmentIds: member.departmentId ? [member.departmentId] : [],
      mappingStatus: existing?.mappingStatus === "CONFIRMED" ? "CONFIRMED" : "AUTO",
      confidence: member.phone ? 0.98 : member.email ? 0.94 : 0.76,
      updatedAt: new Date().toISOString()
    };
    if (existing) Object.assign(existing, payload);
    else wecomUserBindings.push({ id: `wecom-binding-${Date.now()}-${Math.random().toString(16).slice(2)}`, ...payload, createdAt: new Date().toISOString() });
  }
  ensureWecomExceptionBindings(user.tenantId, integration.corpId);
  const bindings = listWecomBindings(user, false);
  audit(user, "WECOM_MEMBER_AUTO_MATCHED", "WecomIntegration", integration.id, { matched: members.length });
  return {
    matched: members.length,
    needsConfirmation: bindings.filter((item) => ["CONFLICT", "UNMAPPED"].includes(item.mappingStatus)).length,
    externalContacts: bindings.filter((item) => item.mappingStatus === "EXTERNAL").length,
    bindings
  };
}

function ensureWecomExceptionBindings(tenantId, corpId) {
  for (const example of [
    { wecomUserId: "external_customer_a", wecomName: "客户A联系人", mappingStatus: "EXTERNAL", confidence: 0 },
    { wecomUserId: "unknown_contractor", wecomName: "临时协作成员", mappingStatus: "UNMAPPED", confidence: 0.2 }
  ]) {
    if (wecomUserBindings.some((item) => item.tenantId === tenantId && item.wecomCorpId === corpId && item.wecomUserId === example.wecomUserId)) continue;
    wecomUserBindings.push({
      id: `wecom-binding-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      tenantId,
      userId: null,
      wecomCorpId: corpId,
      wecomUserId: example.wecomUserId,
      wecomName: example.wecomName,
      mobile: null,
      email: null,
      departmentIds: [],
      mappingStatus: example.mappingStatus,
      confidence: example.confidence,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }
}

function listWecomBindings(user, shouldAudit = true) {
  let items = wecomUserBindings.filter((item) => item.tenantId === user.tenantId);
  if (!hasRole(user, ["COMPANY_ADMIN", "SUPER_ADMIN"])) {
    const visibleUserIds = new Set(users.filter((item) => canAccessUser(user, item.id)).map((item) => item.id));
    items = items.filter((item) => item.userId && visibleUserIds.has(item.userId));
  }
  if (shouldAudit) audit(user, "WECOM_BINDINGS_VIEWED", "WecomUserBinding");
  return items
    .map((item) => ({
      ...item,
      user: item.userId ? orgUser(users.find((candidate) => candidate.id === item.userId) ?? {}) : null
    }))
    .sort((a, b) => a.mappingStatus.localeCompare(b.mappingStatus) || b.updatedAt.localeCompare(a.updatedAt));
}

function updateWecomBinding(user, id, body) {
  requireRole(user, ["COMPANY_ADMIN", "SUPER_ADMIN"]);
  const binding = wecomUserBindings.find((item) => item.id === id && item.tenantId === user.tenantId);
  if (!binding) throw httpError(404, "WeCom binding not found");
  const mappingStatus = body.mappingStatus ?? "CONFIRMED";
  let userId = body.userId || null;
  if (mappingStatus === "CONFIRMED") {
    if (!userId) throw httpError(400, "确认映射时必须选择系统成员");
    assertTenantUser(user.tenantId, userId);
  }
  if (["EXTERNAL", "UNMAPPED"].includes(mappingStatus)) userId = null;
  binding.userId = userId;
  binding.mappingStatus = mappingStatus;
  binding.confidence = mappingStatus === "CONFIRMED" ? 1 : binding.confidence;
  binding.updatedAt = new Date().toISOString();
  audit(user, "WECOM_MEMBER_MAPPING_UPDATED", "WecomUserBinding", id, { userId, mappingStatus });
  return { ...binding, user: userId ? orgUser(users.find((item) => item.id === userId)) : null };
}

function listCommunicationSources(user, shouldAudit = true) {
  let items = communicationSources.filter((item) => item.tenantId === user.tenantId && !item.deletedAt);
  if (!hasRole(user, ["COMPANY_ADMIN", "SUPER_ADMIN"])) {
    items = items.filter(
      (item) =>
        item.memberScopeUserIds.includes(user.id) ||
        (user.departmentId && item.departmentIds.includes(user.departmentId)) ||
        communicationMessages.some((message) => message.sourceId === item.id && message.mappedUserId === user.id)
    );
  }
  if (shouldAudit) audit(user, "COMMUNICATION_SOURCES_VIEWED", "CommunicationSource");
  return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function saveCommunicationSource(user, body, id = null) {
  requireRole(user, ["COMPANY_ADMIN", "SUPER_ADMIN"]);
  const integration = activeWecomIntegration(user.tenantId);
  const now = new Date().toISOString();
  const projectIds = Array.isArray(body.projectIds) ? body.projectIds : [];
  for (const projectId of projectIds) assertProject(user, projectId);
  const departmentIds = Array.isArray(body.departmentIds) ? body.departmentIds : [];
  for (const departmentId of departmentIds) {
    if (!departments.some((item) => item.id === departmentId && item.tenantId === user.tenantId && !item.deletedAt)) throw httpError(404, "Department not found");
  }
  const memberScopeUserIds = Array.isArray(body.memberScopeUserIds) ? body.memberScopeUserIds : [];
  for (const memberId of memberScopeUserIds) assertTenantUser(user.tenantId, memberId);
  const existing = id
    ? communicationSources.find((item) => item.id === id && item.tenantId === user.tenantId && !item.deletedAt)
    : communicationSources.find((item) => item.tenantId === user.tenantId && item.chatId === body.chatId && !item.deletedAt);
  const payload = {
    tenantId: user.tenantId,
    integrationId: integration.id,
    name: String(body.name ?? "").trim(),
    chatId: String(body.chatId ?? "").trim(),
    sourceType: body.sourceType ?? "GENERAL",
    projectIds,
    departmentIds,
    memberScopeUserIds,
    generateLogDrafts: body.generateLogDrafts !== false,
    generateProjectRisks: body.generateProjectRisks !== false,
    syncFiles: Boolean(body.syncFiles),
    retentionDays: Number(body.retentionDays ?? 180),
    lastSyncAt: existing?.lastSyncAt ?? null,
    lastSyncStatus: existing?.lastSyncStatus ?? "PENDING",
    lastError: null,
    pendingDraftCount: existing?.pendingDraftCount ?? 0,
    unclassifiedCount: existing?.unclassifiedCount ?? 0,
    updatedAt: now,
    deletedAt: null
  };
  if (payload.name.length < 2 || payload.chatId.length < 3) throw httpError(400, "Source name and chat_id are required");
  if (existing) {
    Object.assign(existing, payload);
    audit(user, "COMMUNICATION_SOURCE_UPDATED", "CommunicationSource", existing.id, { chatId: existing.chatId, sourceType: existing.sourceType });
    return existing;
  }
  const item = { id: `source-${Date.now()}`, ...payload, createdAt: now };
  communicationSources.unshift(item);
  audit(user, "COMMUNICATION_SOURCE_SAVED", "CommunicationSource", item.id, { chatId: item.chatId, sourceType: item.sourceType });
  return item;
}

function syncWecomTextMessages(user, body) {
  requireRole(user, ["COMPANY_ADMIN", "SUPER_ADMIN"]);
  const integration = activeWecomIntegration(user.tenantId);
  const source = body.sourceId ? getCommunicationSource(user.tenantId, body.sourceId) : ensureDefaultCommunicationSource(user.tenantId, integration.id);
  const inputs = Array.isArray(body.items) && body.items.length ? body.items : demoWecomMessages(user.tenantId, integration.corpId, source.id);
  const created = [];
  for (const input of inputs) {
    const content = String(input.content ?? "").trim();
    if (!content) continue;
    const senderWecomUserId = String(input.senderWecomUserId ?? "unknown");
    const binding = wecomUserBindings.find((item) => item.tenantId === user.tenantId && item.wecomCorpId === integration.corpId && item.wecomUserId === senderWecomUserId);
    const mappingStatus = binding?.mappingStatus ?? "UNMAPPED";
    const senderType = mappingStatus === "EXTERNAL" ? "EXTERNAL" : "INTERNAL";
    const mappedUserId = ["AUTO", "CONFIRMED"].includes(mappingStatus) ? binding?.userId ?? null : null;
    const msgId = input.msgId || `wecom-${source.chatId}-${senderWecomUserId}-${new Date(input.sentAt ?? Date.now()).getTime()}`;
    if (communicationMessages.some((item) => item.tenantId === user.tenantId && item.msgId === msgId)) continue;
    const message = {
      id: `message-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      tenantId: user.tenantId,
      integrationId: integration.id,
      sourceId: source.id,
      msgId,
      senderWecomUserId,
      senderName: input.senderName ?? binding?.wecomName ?? senderWecomUserId,
      senderType,
      mappedUserId,
      mappingStatus,
      content,
      msgType: "TEXT",
      sentAt: input.sentAt || new Date().toISOString(),
      rawPayloadEncryptedRef: "wecom-msgaudit-worker://encrypted-payload",
      createdAt: new Date().toISOString()
    };
    communicationMessages.push(message);
    created.push(message);
  }
  const insights = generateCommunicationDrafts(user.tenantId, source, created);
  generateCommunicationProjectSuggestions(user.tenantId, source.id);
  refreshCommunicationSourceCounters(source.id);
  integration.lastSyncAt = new Date().toISOString();
  integration.lastSyncStatus = "OK";
  integration.lastError = null;
  integration.updatedAt = integration.lastSyncAt;
  audit(user, "WECOM_TEXT_MESSAGES_SYNCED", "CommunicationSource", source.id, { messages: created.length, insights: insights.length });
  return { messages: created.length, insights, skipped: inputs.length - created.length };
}

function syncWecomArchive(user, body) {
  requireRole(user, ["COMPANY_ADMIN", "SUPER_ADMIN"]);
  const integration = activeWecomIntegration(user.tenantId);
  const source = body.sourceId ? getCommunicationSource(user.tenantId, body.sourceId) : ensureDefaultCommunicationSource(user.tenantId, integration.id);
  const inputs = Array.isArray(body.messages) && body.messages.length ? body.messages : demoWecomArchiveMessages(source.id);
  const createdMessages = [];
  const createdFiles = [];
  let skippedExternal = 0;
  for (const input of inputs) {
    const senderType = input.senderType === "EXTERNAL" ? "EXTERNAL" : "INTERNAL";
    const consentStatus = input.externalConsentStatus ?? "UNKNOWN";
    if (senderType === "EXTERNAL" && input.externalUserId) {
      upsertExternalConsent(user.tenantId, integration.corpId, input.externalUserId, input.externalName ?? input.senderName, consentStatus);
      if (consentStatus !== "AGREED") {
        skippedExternal += 1;
        continue;
      }
    }
    const senderWecomUserId = String(input.senderWecomUserId ?? input.externalUserId ?? "unknown");
    const binding = senderType === "INTERNAL" ? wecomUserBindings.find((item) => item.tenantId === user.tenantId && item.wecomCorpId === integration.corpId && item.wecomUserId === senderWecomUserId) : null;
    const mappingStatus = senderType === "EXTERNAL" ? "EXTERNAL" : binding?.mappingStatus ?? "UNMAPPED";
    const mappedUserId = ["AUTO", "CONFIRMED"].includes(mappingStatus) ? binding?.userId ?? null : null;
    const msgId = input.msgId || `archive-${source.id}-${senderWecomUserId}-${new Date(input.sentAt ?? Date.now()).getTime()}`;
    if (communicationMessages.some((item) => item.tenantId === user.tenantId && item.msgId === msgId)) continue;
    const message = {
      id: `message-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      tenantId: user.tenantId,
      integrationId: integration.id,
      sourceId: source.id,
      msgId,
      senderWecomUserId,
      senderName: input.senderName ?? binding?.wecomName ?? senderWecomUserId,
      senderType,
      mappedUserId,
      mappingStatus,
      content: String(input.content ?? fileMessageContent(input.files)).trim(),
      msgType: input.msgType ?? "TEXT",
      sentAt: input.sentAt || new Date().toISOString(),
      rawPayloadEncryptedRef: "wecom-msgaudit-worker://encrypted-payload",
      createdAt: new Date().toISOString()
    };
    communicationMessages.push(message);
    createdMessages.push(message);
    for (const fileInput of input.files ?? []) {
      const sdkFileId = fileInput.sdkFileId || `sdk-${message.id}-${Math.random().toString(16).slice(2)}`;
      if (communicationFiles.some((item) => item.tenantId === user.tenantId && item.sdkFileId === sdkFileId)) continue;
      const file = {
        id: `comm-file-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        tenantId: user.tenantId,
        sourceId: source.id,
        messageId: message.id,
        sdkFileId,
        fileName: fileInput.fileName || "企业微信文件",
        mimeType: fileInput.mimeType ?? null,
        fileSize: Number(fileInput.fileSize ?? 0) || null,
        kind: fileInput.kind ?? inferFileKind(fileInput.mimeType, fileInput.fileName),
        downloadStatus: fileInput.downloadStatus ?? "DOWNLOADED",
        storagePath: fileInput.downloadStatus === "FAILED" ? null : `wecom-msgaudit-worker://${sdkFileId}`,
        textContent: fileInput.textContent ?? null,
        aiSummary: fileInput.aiSummary ?? summarizeCommunicationFile(fileInput),
        uploadedByWecomUserId: senderWecomUserId,
        mappedUserId,
        externalUserId: input.externalUserId ?? null,
        consentStatus: senderType === "EXTERNAL" ? consentStatus : "UNKNOWN",
        sentAt: message.sentAt,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null
      };
      communicationFiles.push(file);
      createdFiles.push(enrichCommunicationFile(file));
    }
  }
  const insights = generateCommunicationDrafts(user.tenantId, source, createdMessages);
  const projectSuggestions = generateCommunicationProjectSuggestions(user.tenantId, source.id);
  refreshCommunicationSourceCounters(source.id);
  integration.lastSyncAt = new Date().toISOString();
  integration.lastSyncStatus = "OK";
  integration.lastError = null;
  audit(user, "WECOM_ARCHIVE_SYNCED", "CommunicationSource", source.id, { messages: createdMessages.length, files: createdFiles.length, skippedExternal });
  return { messages: createdMessages.length, files: createdFiles.length, skippedExternal, insights, projectSuggestions };
}

function demoWecomArchiveMessages(sourceId) {
  return [
    {
      msgId: `archive-${sourceId}-${todayKey}-internal-1`,
      senderWecomUserId: "employee",
      senderName: "前端成员",
      senderType: "INTERNAL",
      sentAt: `${todayKey}T09:40:00.000Z`,
      msgType: "TEXT",
      content: "今天完成 AI 工作日历附件归档联调，文件摘要已经能作为日报证据，剩余风险是客户验收材料格式不统一。",
      files: [
        {
          sdkFileId: `sdk-${sourceId}-${todayKey}-acceptance-doc`,
          fileName: "AICAL-客户验收问题清单.docx",
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          fileSize: 186432,
          kind: "FILE",
          downloadStatus: "DOWNLOADED",
          textContent: "客户验收问题清单：登录态、附件归档、风险跟进人、导出格式。",
          aiSummary: "验收文件列出登录态、附件归档、风险负责人和导出格式等待处理项。"
        }
      ]
    },
    {
      msgId: `archive-${sourceId}-${todayKey}-external-1`,
      senderWecomUserId: "external_customer_a",
      senderName: "客户A联系人",
      senderType: "EXTERNAL",
      externalUserId: "external_customer_a",
      externalName: "客户A联系人",
      externalConsentStatus: "AGREED",
      sentAt: `${todayKey}T10:10:00.000Z`,
      msgType: "TEXT",
      content: "客户反馈验收环境的导出按钮偶现失败，希望今天确认修复时间。"
    },
    {
      msgId: `archive-${sourceId}-${todayKey}-external-denied`,
      senderWecomUserId: "external_denied_user",
      senderName: "未同意客户联系人",
      senderType: "EXTERNAL",
      externalUserId: "external_denied_user",
      externalName: "未同意客户联系人",
      externalConsentStatus: "DISAGREED",
      sentAt: `${todayKey}T10:20:00.000Z`,
      msgType: "TEXT",
      content: "这条消息会被合规边界跳过，不进入分析。"
    }
  ];
}

function upsertExternalConsent(tenantId, wecomCorpId, externalUserId, externalName, status) {
  const now = new Date().toISOString();
  const existing = wecomExternalConsents.find((item) => item.tenantId === tenantId && item.wecomCorpId === wecomCorpId && item.externalUserId === externalUserId);
  const patch = {
    externalName: externalName ?? null,
    status,
    agreedAt: status === "AGREED" ? now : existing?.agreedAt ?? null,
    revokedAt: ["DISAGREED", "REVOKED"].includes(status) ? now : existing?.revokedAt ?? null,
    lastCheckedAt: now,
    updatedAt: now
  };
  if (existing) Object.assign(existing, patch);
  else {
    wecomExternalConsents.unshift({
      id: `external-consent-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      tenantId,
      wecomCorpId,
      externalUserId,
      createdAt: now,
      ...patch
    });
  }
}

function fileMessageContent(files) {
  return (files ?? []).map((file) => `文件：${file.fileName ?? "企业微信文件"}`).join("\n") || "企业微信文件消息";
}

function inferFileKind(mimeType, fileName) {
  const normalized = String(mimeType ?? "").toLowerCase();
  if (normalized.startsWith("image/")) return "IMAGE";
  if (normalized.startsWith("audio/")) return "VOICE";
  if (normalized.startsWith("video/")) return "VIDEO";
  if (/^https?:\/\//i.test(String(fileName ?? ""))) return "LINK";
  return "FILE";
}

function summarizeCommunicationFile(file) {
  const size = file.fileSize ? `，大小 ${Math.max(1, Math.round(Number(file.fileSize) / 1024))}KB` : "";
  if (file.textContent) return `来源文件：${file.fileName ?? "企业微信文件"}，类型 ${file.mimeType ?? "未知"}${size}。摘要：${clampLocalText(file.textContent, 160)}`;
  return `来源文件：${file.fileName ?? "企业微信文件"}，类型 ${file.mimeType ?? "未知"}${size}。`;
}

function listCommunicationFiles(user, shouldAudit = true) {
  let items = communicationFiles.filter((item) => item.tenantId === user.tenantId && !item.deletedAt);
  if (!hasRole(user, ["COMPANY_ADMIN", "SUPER_ADMIN"])) {
    const visibleSourceIds = new Set(listCommunicationSources(user, false).map((item) => item.id));
    items = items.filter((item) => visibleSourceIds.has(item.sourceId) || item.mappedUserId === user.id || (item.mappedUserId && canAccessUser(user, item.mappedUserId)));
  }
  if (shouldAudit) audit(user, "COMMUNICATION_FILES_VIEWED", "CommunicationFile");
  return items.map(enrichCommunicationFile).sort((a, b) => b.sentAt.localeCompare(a.sentAt));
}

function enrichCommunicationFile(file) {
  return {
    ...file,
    source: communicationSources.find((source) => source.id === file.sourceId && source.tenantId === file.tenantId) ?? null,
    message: communicationMessages.find((message) => message.id === file.messageId && message.tenantId === file.tenantId) ?? null,
    mappedUser: file.mappedUserId ? orgUser(users.find((user) => user.id === file.mappedUserId && user.tenantId === file.tenantId) ?? {}) : null
  };
}

function generateCommunicationProjectSuggestions(tenantId, sourceId) {
  const source = communicationSources.find((item) => item.id === sourceId && item.tenantId === tenantId && !item.deletedAt);
  if (!source) return [];
  const sourceMessages = communicationMessages.filter((item) => item.tenantId === tenantId && item.sourceId === sourceId).slice(-80);
  const sourceFiles = communicationFiles.filter((item) => item.tenantId === tenantId && item.sourceId === sourceId && !item.deletedAt).slice(-80);
  const corpus = `${source.name}\n${sourceMessages.map((item) => item.content).join("\n")}\n${sourceFiles.map((item) => `${item.fileName}\n${item.aiSummary ?? ""}`).join("\n")}`;
  const created = [];
  for (const project of projects.filter((item) => item.tenantId === tenantId && !item.deletedAt)) {
    if (source.projectIds.includes(project.id)) continue;
    const tokens = [project.code, project.name].filter(Boolean);
    const groupNameHit = tokens.some((token) => source.name.includes(token));
    const messageHit = tokens.some((token) => sourceMessages.some((message) => message.content.includes(token)));
    const fileHit = tokens.some((token) => sourceFiles.some((file) => file.fileName.includes(token) || String(file.aiSummary ?? "").includes(token)));
    const confidence = Math.min(0.98, (groupNameHit ? 0.54 : 0) + (messageHit ? 0.28 : 0) + (fileHit ? 0.22 : 0));
    if (confidence < 0.4) continue;
    const existing = communicationProjectSuggestions.find((item) => item.tenantId === tenantId && item.sourceId === sourceId && item.projectId === project.id);
    const reason = [groupNameHit ? "群名命中项目编号或名称" : null, messageHit ? "消息内容命中项目关键词" : null, fileHit ? "文件名或摘要命中项目关键词" : null].filter(Boolean).join("；");
    const payload = {
      confidence,
      reason,
      evidence: { groupName: source.name, keywords: tokens, sample: clampLocalText(corpus, 240) },
      updatedAt: new Date().toISOString()
    };
    if (existing) Object.assign(existing, payload);
    else {
      communicationProjectSuggestions.unshift({
        id: `project-suggestion-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        tenantId,
        sourceId,
        projectId: project.id,
        status: "PENDING",
        createdAt: new Date().toISOString(),
        confirmedAt: null,
        rejectedAt: null,
        ...payload
      });
    }
    created.push(enrichCommunicationProjectSuggestion(existing ?? communicationProjectSuggestions[0]));
  }
  return created;
}

function listCommunicationProjectSuggestions(user, shouldAudit = true) {
  let items = communicationProjectSuggestions.filter((item) => item.tenantId === user.tenantId);
  if (!hasRole(user, ["COMPANY_ADMIN", "SUPER_ADMIN"])) {
    const visibleSourceIds = new Set(listCommunicationSources(user, false).map((item) => item.id));
    items = items.filter((item) => visibleSourceIds.has(item.sourceId));
  }
  if (shouldAudit) audit(user, "COMMUNICATION_PROJECT_SUGGESTIONS_VIEWED", "CommunicationProjectSuggestion");
  return items.map(enrichCommunicationProjectSuggestion).sort((a, b) => a.status.localeCompare(b.status) || b.confidence - a.confidence);
}

function enrichCommunicationProjectSuggestion(item) {
  return {
    ...item,
    source: communicationSources.find((source) => source.id === item.sourceId && source.tenantId === item.tenantId) ?? null,
    project: projectWithOwner(projects.find((project) => project.id === item.projectId && project.tenantId === item.tenantId) ?? { id: item.projectId, tenantId: item.tenantId, name: "已删除项目" })
  };
}

function updateCommunicationProjectSuggestion(user, id, body) {
  requireRole(user, ["COMPANY_ADMIN", "SUPER_ADMIN"]);
  const item = communicationProjectSuggestions.find((candidate) => candidate.id === id && candidate.tenantId === user.tenantId);
  if (!item) throw httpError(404, "Project suggestion not found");
  const status = body.status;
  if (!["CONFIRMED", "REJECTED", "PENDING"].includes(status)) throw httpError(400, "Invalid suggestion status");
  item.status = status;
  item.updatedAt = new Date().toISOString();
  if (status === "CONFIRMED") {
    item.confirmedAt = item.updatedAt;
    const source = communicationSources.find((candidate) => candidate.id === item.sourceId && candidate.tenantId === user.tenantId);
    if (source && !source.projectIds.includes(item.projectId)) {
      source.projectIds.push(item.projectId);
      source.sourceType = "PROJECT";
      source.updatedAt = item.updatedAt;
    }
  }
  if (status === "REJECTED") item.rejectedAt = item.updatedAt;
  audit(user, "COMMUNICATION_PROJECT_SUGGESTION_UPDATED", "CommunicationProjectSuggestion", id, { status, sourceId: item.sourceId, projectId: item.projectId });
  return enrichCommunicationProjectSuggestion(item);
}

function ensureDefaultCommunicationSource(tenantId, integrationId) {
  let source = communicationSources.find((item) => item.tenantId === tenantId && item.chatId === "demo-general-chat" && !item.deletedAt);
  if (!source) {
    source = {
      id: `source-${Date.now()}`,
      tenantId,
      integrationId,
      name: "通用沟通群",
      chatId: "demo-general-chat",
      sourceType: "GENERAL",
      projectIds: [],
      departmentIds: [],
      memberScopeUserIds: [],
      generateLogDrafts: true,
      generateProjectRisks: true,
      syncFiles: false,
      retentionDays: 180,
      lastSyncAt: null,
      lastSyncStatus: "PENDING",
      lastError: null,
      pendingDraftCount: 0,
      unclassifiedCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null
    };
    communicationSources.unshift(source);
  }
  return source;
}

function getCommunicationSource(tenantId, id) {
  const source = communicationSources.find((item) => item.id === id && item.tenantId === tenantId && !item.deletedAt);
  if (!source) throw httpError(404, "Communication source not found");
  return source;
}

function demoWecomMessages(tenantId, corpId, sourceId) {
  const source = getCommunicationSource(tenantId, sourceId);
  const bindings = wecomUserBindings.filter((item) => item.tenantId === tenantId && item.wecomCorpId === corpId && item.userId && ["AUTO", "CONFIRMED"].includes(item.mappingStatus)).slice(0, 2);
  return bindings.map((binding, index) => ({
    msgId: `demo-wecom-${source.id}-${todayKey}-${binding.wecomUserId}-${index + 1}`,
    senderWecomUserId: binding.wecomUserId,
    senderName: binding.wecomName,
    sentAt: `${todayKey}T0${9 + index}:30:00.000Z`,
    content:
      index === 0
        ? `今天完成 ${source.projectIds[0] ? projectWithOwner(projects.find((item) => item.id === source.projectIds[0])).name : "AI 工作日历"} 支付回调联调，定位到证书配置问题，已提交修复方案；还有证书轮换流程未固化的风险。`
        : "小程序改版验收反馈已整理，阻塞点是客户还未确认埋点口径，明天继续跟进。"
  }));
}

function generateCommunicationDrafts(tenantId, source, messages) {
  if (!source.generateLogDrafts) return [];
  const groups = new Map();
  for (const message of messages) {
    if (message.senderType !== "INTERNAL" || !message.mappedUserId || !["AUTO", "CONFIRMED"].includes(message.mappingStatus)) continue;
    const key = `${message.mappedUserId}:${String(message.sentAt).slice(0, 10)}`;
    groups.set(key, [...(groups.get(key) ?? []), message]);
  }
  const created = [];
  for (const [key, group] of groups.entries()) {
    const [mappedUserId, date] = key.split(":");
    const groupMessageIds = group.map((item) => item.id);
    const sourceFiles = communicationFiles.filter((file) => file.tenantId === tenantId && groupMessageIds.includes(file.messageId) && !file.deletedAt);
    const fileEvidence = sourceFiles.map((file) => file.aiSummary || file.textContent || file.fileName).filter(Boolean).join("\n");
    const content = [group.map((item) => item.content).join("\n"), fileEvidence].filter(Boolean).join("\n");
    const project = inferCommunicationProject(tenantId, source, content);
    const risks = /风险|延期|问题|异常|投诉|返工/.test(content) ? [clampLocalText(content, 90)] : [];
    const blockers = /阻塞|卡住|依赖|无法继续|未确认/.test(content) ? [clampLocalText(content, 90)] : [];
    const item = {
      id: `insight-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      tenantId,
      sourceId: source.id,
      suggestedUserId: mappedUserId,
      type: "WORK_LOG_DRAFT",
      status: "CANDIDATE",
      date,
      title: suggestCommunicationTitle(content, project?.name),
      content: content.split(/\n+/).map((line) => `- ${line.trim()}`).join("\n"),
      hours: null,
      projectId: project?.id ?? null,
      projectHints: project ? [project.code ? `${project.code} · ${project.name}` : project.name] : [],
      risks,
      blockers,
      nextActions: risks.length || blockers.length ? ["确认影响范围、负责人和处理时间。"] : ["补充工时并确认项目归属后提交。"],
      sourceMessageIds: groupMessageIds,
      sourceFileIds: sourceFiles.map((file) => file.id),
      confidence: project ? 0.86 : 0.72,
      missingFields: project ? ["工时"] : ["工时", "项目"],
      needsProjectConfirmation: !project,
      needsUserMappingConfirmation: false,
      confirmedWorkLogId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null
    };
    communicationInsights.unshift(item);
    created.push(enrichCommunicationInsight(item));
  }
  return created;
}

function inferCommunicationProject(tenantId, source, content) {
  if (source.sourceType === "PROJECT" && source.projectIds.length) {
    return projects.find((item) => item.id === source.projectIds[0] && item.tenantId === tenantId && !item.deletedAt) ?? null;
  }
  return (
    projects.find((project) => {
      if (project.tenantId !== tenantId || project.deletedAt) return false;
      return [project.code, project.name].filter(Boolean).some((value) => content.includes(value));
    }) ?? null
  );
}

function suggestCommunicationTitle(content, projectName) {
  const first = String(content).split(/\n|。|；|;/).map((item) => item.trim()).find(Boolean) ?? "沟通记录候选日报";
  const text = clampLocalText(first.replace(/^(今天|今日|上午|下午|晚上)/, ""), 28);
  return projectName ? `${projectName}：${text}` : text;
}

function clampLocalText(value, limit) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function refreshCommunicationSourceCounters(sourceId) {
  const source = communicationSources.find((item) => item.id === sourceId);
  if (!source) return;
  source.pendingDraftCount = communicationInsights.filter((item) => item.tenantId === source.tenantId && item.sourceId === sourceId && item.type === "WORK_LOG_DRAFT" && item.status === "CANDIDATE" && !item.deletedAt).length;
  source.unclassifiedCount = communicationMessages.filter((item) => item.tenantId === source.tenantId && item.sourceId === sourceId && !item.mappedUserId && item.senderType !== "EXTERNAL").length;
  source.lastSyncAt = new Date().toISOString();
  source.lastSyncStatus = "OK";
  source.updatedAt = source.lastSyncAt;
}

function listWecomLogDrafts(user, shouldAudit = true) {
  let items = communicationInsights.filter((item) => item.tenantId === user.tenantId && item.type === "WORK_LOG_DRAFT" && item.status === "CANDIDATE" && !item.deletedAt);
  if (!hasRole(user, ["COMPANY_ADMIN", "SUPER_ADMIN"])) {
    items = items.filter((item) => item.suggestedUserId && canAccessUser(user, item.suggestedUserId));
  }
  if (shouldAudit) audit(user, "COMMUNICATION_LOG_DRAFTS_VIEWED", "CommunicationInsight");
  return items.map(enrichCommunicationInsight).sort((a, b) => `${b.date}${b.createdAt}`.localeCompare(`${a.date}${a.createdAt}`));
}

function enrichCommunicationInsight(item) {
  const source = item.sourceId ? communicationSources.find((source) => source.id === item.sourceId && source.tenantId === item.tenantId) ?? null : null;
  const project = item.projectId ? projectWithOwner(projects.find((project) => project.id === item.projectId) ?? { id: item.projectId, tenantId: item.tenantId, name: "已删除项目" }) : null;
  const suggestedUser = item.suggestedUserId ? users.find((user) => user.id === item.suggestedUserId && user.tenantId === item.tenantId) : null;
  return {
    ...item,
    source,
    project,
    suggestedUser: suggestedUser
      ? {
          id: suggestedUser.id,
          name: suggestedUser.name,
          email: suggestedUser.email,
          phone: suggestedUser.phone ?? null,
          department: departments.find((department) => department.id === suggestedUser.departmentId && department.tenantId === suggestedUser.tenantId) ?? null
      }
      : null,
    sourceMessages: item.sourceMessageIds.map((id) => communicationMessages.find((message) => message.id === id && message.tenantId === item.tenantId)).filter(Boolean),
    sourceFiles: item.sourceFileIds.map((id) => communicationFiles.find((file) => file.id === id && file.tenantId === item.tenantId)).filter(Boolean).map(enrichCommunicationFile)
  };
}

function confirmWecomLogDraft(user, id, body) {
  const draft = communicationInsights.find((item) => item.id === id && item.tenantId === user.tenantId && item.status === "CANDIDATE" && !item.deletedAt);
  if (!draft) throw httpError(404, "Communication draft not found");
  if (!draft.suggestedUserId) throw httpError(400, "成员映射未确认，不能生成个人日报");
  if (!canAccessUser(user, draft.suggestedUserId)) throw httpError(403, "Cannot access this draft");
  if (body.projectId) assertProject(user, body.projectId);
  const now = new Date().toISOString();
  const log = {
    id: `log-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    tenantId: user.tenantId,
    userId: draft.suggestedUserId,
    projectId: body.projectId || null,
    date: body.date || draft.date,
    kind: workLogKindForDate(body.date || draft.date, body.kind),
    title: String(body.title ?? draft.title),
    content: String(body.content ?? draft.content),
    startTime: null,
    endTime: null,
    hours: Number(body.hours ?? draft.hours ?? 0),
    status: body.submit === false ? "DRAFT" : "SUBMITTED",
    submittedAt: body.submit === false ? null : now,
    createdAt: now,
    updatedAt: now,
    deletedAt: null
  };
  workLogs.unshift(log);
  if (log.status === "SUBMITTED") analyses.set(log.id, createAnalysis(log));
  const messages = draft.sourceMessageIds.map((messageId) => communicationMessages.find((item) => item.id === messageId && item.tenantId === user.tenantId)).filter(Boolean);
  for (const message of messages.length ? messages : [null]) {
    workLogSourceLinks.push({
      id: `source-link-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      tenantId: user.tenantId,
      workLogId: log.id,
      insightId: draft.id,
      messageId: message?.id ?? null,
      fileId: null,
      sourceId: message?.sourceId ?? draft.sourceId ?? null,
      sourceType: "WECOM",
      evidenceSummary: message ? clampLocalText(message.content, 220) : "来自企业微信沟通候选草稿。",
      createdAt: now
    });
  }
  const files = draft.sourceFileIds.map((fileId) => communicationFiles.find((item) => item.id === fileId && item.tenantId === user.tenantId)).filter(Boolean);
  for (const file of files) {
    workLogSourceLinks.push({
      id: `source-link-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      tenantId: user.tenantId,
      workLogId: log.id,
      insightId: draft.id,
      messageId: null,
      fileId: file.id,
      sourceId: file.sourceId,
      sourceType: "WECOM",
      evidenceSummary: file.aiSummary ?? `来源文件：${file.fileName}`,
      createdAt: now
    });
  }
  draft.status = "CONFIRMED";
  draft.confirmedWorkLogId = log.id;
  draft.updatedAt = now;
  if (draft.sourceId) refreshCommunicationSourceCounters(draft.sourceId);
  audit(user, "COMMUNICATION_LOG_DRAFT_CONFIRMED", "CommunicationInsight", draft.id, { workLogId: log.id, submit: log.status === "SUBMITTED" });
  return enrichLog(log);
}

function ignoreWecomLogDraft(user, id) {
  const draft = communicationInsights.find((item) => item.id === id && item.tenantId === user.tenantId && item.status === "CANDIDATE" && !item.deletedAt);
  if (!draft) throw httpError(404, "Communication draft not found");
  if (draft.suggestedUserId && !canAccessUser(user, draft.suggestedUserId)) throw httpError(403, "Cannot access this draft");
  draft.status = "IGNORED";
  draft.updatedAt = new Date().toISOString();
  if (draft.sourceId) refreshCommunicationSourceCounters(draft.sourceId);
  audit(user, "COMMUNICATION_LOG_DRAFT_IGNORED", "CommunicationInsight", draft.id);
  return { ok: true };
}

function projectWithOwner(project) {
  const owner = project.ownerUserId ? users.find((item) => item.id === project.ownerUserId && item.tenantId === project.tenantId) : null;
  return {
    ...project,
    owner: owner
      ? {
          id: owner.id,
          name: owner.name,
          email: owner.email,
          phone: owner.phone ?? null,
          departmentId: owner.departmentId,
          department: departments.find((item) => item.id === owner.departmentId && item.tenantId === owner.tenantId) ?? null
        }
      : null
  };
}

function normalizeOptional(value) {
  if (value === undefined) return undefined;
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function assertTenantUser(tenantId, userId) {
  const found = users.find((item) => item.id === userId && item.tenantId === tenantId && item.isActive);
  if (!found) throw httpError(404, "User not found");
}

function assertProject(user, projectId) {
  if (!projectId) return;
  const found = projects.find((item) => item.id === projectId && item.tenantId === user.tenantId && !item.deletedAt);
  if (!found) throw httpError(404, "Project not found");
}

function listWorkLogs(user, url) {
  return filterLogsByAccess(user, url)
    .filter((item) => !item.deletedAt)
    .filter((item) => !url.searchParams.get("date") || item.date === url.searchParams.get("date"))
    .filter((item) => !url.searchParams.get("from") || item.date >= url.searchParams.get("from"))
    .filter((item) => !url.searchParams.get("to") || item.date <= url.searchParams.get("to"))
    .filter((item) => !url.searchParams.get("projectId") || item.projectId === url.searchParams.get("projectId"))
    .filter((item) => !url.searchParams.get("kind") || (item.kind ?? "DAILY") === url.searchParams.get("kind"))
    .map(enrichLog)
    .sort((a, b) => `${b.date}${b.createdAt}`.localeCompare(`${a.date}${a.createdAt}`));
}

function createWorkLog(user, body) {
  const ownerId = body.userId && hasRole(user, ["COMPANY_ADMIN", "SUPER_ADMIN"]) ? body.userId : user.id;
  assertProject(user, body.projectId);
  const item = {
    id: `log-${Date.now()}`,
    tenantId: user.tenantId,
    userId: ownerId,
    projectId: body.projectId || null,
    date: body.date,
    kind: workLogKindForDate(body.date, body.kind),
    title: body.title,
    content: body.content,
    startTime: body.startTime ?? null,
    endTime: body.endTime ?? null,
    hours: Number(body.hours ?? 0),
    status: "DRAFT",
    submittedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null
  };
  workLogs.push(item);
  return enrichLog(item);
}

function getWorkLog(user, id) {
  const item = workLogs.find((log) => log.id === id && !log.deletedAt);
  if (!item) throw httpError(404, "Work log not found");
  assertCanAccessLog(user, item);
  return enrichLog(item);
}

function updateWorkLog(user, id, body) {
  const item = getRawWorkLog(user, id);
  if (item.userId !== user.id && !hasRole(user, ["COMPANY_ADMIN", "SUPER_ADMIN"])) throw httpError(403, "Cannot modify this work log");
  for (const key of ["date", "title", "content", "startTime", "endTime"]) {
    if (body[key] !== undefined) item[key] = body[key];
  }
  if (body.projectId !== undefined) {
    assertProject(user, body.projectId);
    item.projectId = body.projectId || null;
  }
  if (body.kind !== undefined) item.kind = workLogKindForDate(item.date, body.kind);
  if (body.hours !== undefined) item.hours = Number(body.hours);
  item.updatedAt = new Date().toISOString();
  return enrichLog(item);
}

function deleteWorkLog(user, id) {
  const item = getRawWorkLog(user, id);
  if (item.userId !== user.id && !hasRole(user, ["COMPANY_ADMIN", "SUPER_ADMIN"])) throw httpError(403, "Cannot delete this work log");
  item.deletedAt = new Date().toISOString();
  for (const attachment of workLogAttachments) {
    if (attachment.tenantId === user.tenantId && attachment.workLogId === id && !attachment.deletedAt) {
      attachment.deletedAt = item.deletedAt;
      attachment.updatedAt = item.deletedAt;
    }
  }
  return { ok: true };
}

function submitWorkLog(user, id) {
  const item = getRawWorkLog(user, id);
  if (item.userId !== user.id && !hasRole(user, ["COMPANY_ADMIN", "SUPER_ADMIN"])) throw httpError(403, "Cannot submit this work log");
  item.status = "SUBMITTED";
  item.submittedAt = new Date().toISOString();
  item.updatedAt = new Date().toISOString();
  analyses.set(item.id, createAnalysis(item));
  notifications.push({
    id: `notice-${Date.now()}`,
    tenantId: item.tenantId,
    userId: item.userId,
    type: "AI_ANALYSIS_DONE",
    title: "AI 分析已完成",
    body: `「${item.title}」的 AI 分析已完成。`,
    isRead: false,
    createdAt: new Date().toISOString()
  });
  return enrichLog(item);
}

function publicAttachment(attachment) {
  return {
    id: attachment.id,
    workLogId: attachment.workLogId,
    uploaderId: attachment.uploaderId,
    kind: attachment.kind,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    fileSize: attachment.fileSize,
    aiSummary: attachment.aiSummary,
    createdAt: attachment.createdAt,
    updatedAt: attachment.updatedAt
  };
}

function createWorkLogAttachment(user, workLogId, body) {
  const log = getRawWorkLog(user, workLogId);
  if (log.userId !== user.id && !hasRole(user, ["COMPANY_ADMIN", "SUPER_ADMIN"])) throw httpError(403, "Cannot modify this work log");
  const buffer = Buffer.from(String(body.contentBase64 ?? ""), "base64");
  const expectedSize = Number(body.fileSize ?? buffer.length);
  if (!buffer.length || !Number.isFinite(expectedSize) || expectedSize <= 0 || buffer.length > 8 * 1024 * 1024) {
    throw httpError(400, "Invalid attachment content or file size");
  }
  const mimeType = body.mimeType || "application/octet-stream";
  const fileName = sanitizeLocalFileName(body.fileName || "attachment");
  const kind = String(mimeType).toLowerCase().startsWith("image/") ? "IMAGE" : "FILE";
  const textContent = isTextAttachment(mimeType, fileName) ? buffer.toString("utf8").replace(/\u0000/g, "").slice(0, 12000) : null;
  const attachment = {
    id: `attachment-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    tenantId: user.tenantId,
    workLogId,
    uploaderId: user.id,
    kind,
    fileName,
    mimeType,
    fileSize: buffer.length,
    contentBase64: buffer.toString("base64"),
    textContent,
    aiSummary: textContent
      ? `${kind === "IMAGE" ? "图片" : "文件"}附件：${fileName}，文本摘录：${textContent.slice(0, 300)}`
      : `${kind === "IMAGE" ? "图片" : "文件"}附件：${fileName}，大小 ${Math.max(1, Math.round(buffer.length / 1024))}KB。`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null
  };
  workLogAttachments.push(attachment);
  if (log.status === "SUBMITTED") {
    analyses.set(log.id, createAnalysis(log));
  }
  return publicAttachment(attachment);
}

function downloadWorkLogAttachment(res, user, workLogId, attachmentId) {
  getRawWorkLog(user, workLogId);
  const attachment = workLogAttachments.find((item) => item.id === attachmentId && item.tenantId === user.tenantId && item.workLogId === workLogId && !item.deletedAt);
  if (!attachment) throw httpError(404, "Attachment not found");
  const buffer = Buffer.from(attachment.contentBase64, "base64");
  return sendBuffer(res, buffer, {
    contentType: attachment.mimeType,
    fileName: attachment.fileName
  });
}

function deleteWorkLogAttachment(user, workLogId, attachmentId) {
  const log = getRawWorkLog(user, workLogId);
  if (log.userId !== user.id && !hasRole(user, ["COMPANY_ADMIN", "SUPER_ADMIN"])) throw httpError(403, "Cannot modify this work log");
  const attachment = workLogAttachments.find((item) => item.id === attachmentId && item.tenantId === user.tenantId && item.workLogId === workLogId && !item.deletedAt);
  if (!attachment) throw httpError(404, "Attachment not found");
  attachment.deletedAt = new Date().toISOString();
  attachment.updatedAt = new Date().toISOString();
  return { ok: true };
}

function sanitizeLocalFileName(value) {
  return String(value)
    .replace(/[\/\\:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180) || "attachment";
}

function isTextAttachment(mimeType, fileName) {
  const normalized = String(mimeType ?? "").toLowerCase();
  return normalized.startsWith("text/") || ["application/json", "application/xml", "application/csv"].includes(normalized) || /\.(txt|md|csv|json|log|xml)$/i.test(fileName);
}

function calendar(user, url) {
  const month = url.searchParams.get("month") ?? todayKey.slice(0, 7);
  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  const today = todayKeyInShanghai();
  const visibleUsers = filterUsersByAccess(user, url);
  const reportUsers = visibleUsers.filter((item) => item.requiresWorkReport);
  const visibleUserIds = new Set(reportUsers.map((item) => item.id));
  const days = [];
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    const key = dateKey(cursor);
    const logs = workLogs.filter((item) => item.date === key && item.status === "SUBMITTED" && !item.deletedAt && visibleUserIds.has(item.userId));
    const primaryKind = workLogKindForDate(key, null, today);
    const primaryLogs = logs.filter((item) => (item.kind ?? "DAILY") === primaryKind);
    const filled = new Set(primaryLogs.map((item) => item.userId));
    const missingCount = Math.max(reportUsers.length - filled.size, 0);
    const riskCount = logs.reduce((sum, item) => sum + ((analyses.get(item.id)?.risks?.length ?? 0)), 0);
    const blockerCount = logs.reduce((sum, item) => sum + ((analyses.get(item.id)?.blockers?.length ?? 0)), 0);
    days.push({
      date: key,
      primaryKind,
      filledCount: filled.size,
      missingCount,
      remindCount: key <= today ? missingCount : 0,
      fillRate: reportUsers.length ? Number(((filled.size / reportUsers.length) * 100).toFixed(1)) : 0,
      riskCount,
      blockerCount,
      totalHours: Number(primaryLogs.reduce((sum, item) => sum + Number(item.hours), 0).toFixed(2)),
      dailyLogCount: logs.filter((item) => (item.kind ?? "DAILY") === "DAILY").length,
      planLogCount: logs.filter((item) => (item.kind ?? "DAILY") === "PLAN").length
    });
  }
  return { month, scope: resolveScope(user, url), totalEmployees: reportUsers.length, days };
}

function calendarDay(user, url) {
  const date = url.searchParams.get("date") ?? todayKey;
  const today = todayKeyInShanghai();
  const visibleUsers = filterUsersByAccess(user, url).filter((item) => item.requiresWorkReport);
  const visibleUserIds = new Set(visibleUsers.map((item) => item.id));
  const logs = workLogs.filter((item) => item.date === date && item.status === "SUBMITTED" && !item.deletedAt && visibleUserIds.has(item.userId));
  const primaryKind = workLogKindForDate(date, null, today);
  const primaryLogs = logs.filter((item) => (item.kind ?? "DAILY") === primaryKind);
  const primaryUserIds = new Set(primaryLogs.map((item) => item.userId));
  const logsByUser = new Map();
  for (const log of logs) logsByUser.set(log.userId, [...(logsByUser.get(log.userId) ?? []), enrichLog(log)]);
  const filledEmployees = visibleUsers.filter((item) => logsByUser.has(item.id)).map((item) => ({
    id: item.id,
    name: item.name,
    email: item.email,
    phone: item.phone ?? null,
    departmentName: departments.find((dept) => dept.id === item.departmentId)?.name ?? null,
    logs: logsByUser.get(item.id)
  }));
  const missingEmployees = visibleUsers.filter((item) => !primaryUserIds.has(item.id)).map((item) => ({
    id: item.id,
    name: item.name,
    email: item.email,
    phone: item.phone ?? null,
    departmentName: departments.find((dept) => dept.id === item.departmentId)?.name ?? null
  }));
  return {
    date,
    scope: resolveScope(user, url),
    primaryKind,
    filledEmployees,
    missingEmployees,
    stats: {
      totalEmployees: visibleUsers.length,
      filledCount: primaryUserIds.size,
      missingCount: missingEmployees.length,
      remindCount: date <= today ? missingEmployees.length : 0,
      fillRate: visibleUsers.length ? Number(((primaryUserIds.size / visibleUsers.length) * 100).toFixed(1)) : 0,
      totalHours: logs.reduce((sum, item) => sum + Number(item.hours), 0),
      riskCount: logs.reduce((sum, item) => sum + ((analyses.get(item.id)?.risks?.length ?? 0)), 0),
      blockerCount: logs.reduce((sum, item) => sum + ((analyses.get(item.id)?.blockers?.length ?? 0)), 0),
      dailyLogCount: logs.filter((item) => (item.kind ?? "DAILY") === "DAILY").length,
      planLogCount: logs.filter((item) => (item.kind ?? "DAILY") === "PLAN").length
    }
  };
}

function getAnalysis(user, workLogId) {
  getWorkLog(user, workLogId);
  const analysis = analyses.get(workLogId);
  if (!analysis) throw httpError(404, "AI analysis not ready");
  return analysis;
}

function retryAnalysis(user, workLogId) {
  const log = getRawWorkLog(user, workLogId);
  const analysis = createAnalysis(log);
  analyses.set(workLogId, analysis);
  return {
    id: `task-${Date.now()}`,
    tenantId: log.tenantId,
    type: "WORK_LOG_ANALYSIS",
    status: "COMPLETED",
    workLogId
  };
}

function calendarChat(user, body) {
  const month = body.month ?? todayKey.slice(0, 7);
  if ((body.startDate && !body.endDate) || (!body.startDate && body.endDate)) {
    throw httpError(400, "请选择完整的开始日期和结束日期");
  }
  const start = body.date ?? body.startDate ?? `${month}-01`;
  const end = body.date ?? body.endDate ?? monthEndKey(month);
  if (end < start) {
    throw httpError(400, "结束日期不能早于开始日期");
  }
  const periodLabel = body.date ?? (body.startDate && body.endDate ? `${body.startDate} 至 ${body.endDate}` : month);
  const url = new URL("http://localhost/");
  if (body.scope) url.searchParams.set("scope", body.scope);
  if (body.departmentId) url.searchParams.set("departmentId", body.departmentId);
  const visibleLogs = filterLogsByAccess(user, url)
    .filter((item) => item.status === "SUBMITTED" && !item.deletedAt)
    .filter((item) => item.date >= start && item.date <= end)
    .map(enrichLog)
    .sort((a, b) => `${a.date}${a.createdAt}`.localeCompare(`${b.date}${b.createdAt}`));
  return {
    answer: localCalendarAnswer(body.question ?? "", visibleLogs, periodLabel),
    contextCount: visibleLogs.length,
    scope: resolveScope(user, url),
    period: { start, end }
  };
}

function projectChat(user, body) {
  const projectId = String(body.projectId ?? "").trim();
  assertProject(user, projectId);
  const project = projectWithOwner(projects.find((item) => item.id === projectId && item.tenantId === user.tenantId && !item.deletedAt));
  if ((body.startDate && !body.endDate) || (!body.startDate && body.endDate)) {
    throw httpError(400, "请选择完整的开始日期和结束日期");
  }
  const end = body.endDate ?? todayKey;
  const start = body.startDate ?? dateKey(addDays(new Date(`${end}T00:00:00.000Z`), -29));
  if (end < start) {
    throw httpError(400, "结束日期不能早于开始日期");
  }
  const visibleLogs = filterLogsByAccess(user, new URL("http://localhost/"))
    .filter((item) => item.status === "SUBMITTED" && !item.deletedAt)
    .filter((item) => item.projectId === projectId)
    .filter((item) => item.date >= start && item.date <= end)
    .map(enrichLog)
    .sort((a, b) => `${b.date}${b.createdAt}`.localeCompare(`${a.date}${a.createdAt}`));
  const sources = projectChatSources(visibleLogs);
  return {
    answer: projectChatAnswer(body.question ?? "", visibleLogs, sources, body.startDate && body.endDate ? `${start} 至 ${end}` : "最近 30 天"),
    contextCount: visibleLogs.length,
    project: {
      id: project.id,
      name: project.name,
      code: project.code,
      ownerName: project.owner?.name ?? null
    },
    period: { start, end },
    sources
  };
}

function projectChatAnswer(question, logs, sources, periodLabel) {
  if (!logs.length) {
    return `结论：当前项目暂无可用于分析的来源日报。\n\n依据：${periodLabel} 内没有可引用的项目日报。\n\n建议动作：\n1. 先关联项目日报或扩大时间范围。\n2. 成员提交日报时确认项目归属。\n\n来源：\n- 来源日报 0 条\n- 时间范围 ${periodLabel}`;
  }
  const lowerQuestion = String(question ?? "").toLowerCase();
  const wantsRisk = /风险|问题|阻塞|block|risk/.test(lowerQuestion);
  const wantsReport = /周报|同步|汇报|摘要|summary|report/i.test(lowerQuestion);
  const riskTotal = sources.reduce((sum, source) => sum + source.riskCount + source.blockerCount, 0);
  const totalHours = logs.reduce((sum, log) => sum + Number(log.hours ?? 0), 0);
  const conclusion = wantsRisk
    ? riskTotal
      ? `当前项目存在 ${riskTotal} 条风险/阻塞，需要先确认负责人和处理动作。`
      : "当前项目在所选范围内没有明确风险或阻塞。"
    : wantsReport
      ? `${periodLabel} 项目共有 ${logs.length} 条来源日报，可生成项目同步摘要。`
      : `${periodLabel} 项目共有 ${logs.length} 条日报/计划，合计 ${Number(totalHours.toFixed(1))} 小时。`;
  const evidence = sources
    .slice(0, 4)
    .map((source) => `- ${source.date} ${source.userName}：${source.title}。${source.evidence}`)
    .join("\n");
  const actions = riskTotal
    ? ["1. 优先确认风险/阻塞负责人和处理时间。", "2. 周会前复核相关来源日报，补齐下一步动作。", "3. 如需对外同步，可生成项目周报。"]
    : ["1. 继续保持日报按项目归属。", "2. 周会前复核关键进展。", "3. 如需对外同步，可生成项目周报。"];
  return `结论：${conclusion}\n\n依据：\n${evidence}\n\n建议动作：\n${actions.join("\n")}\n\n来源：\n- 来源日报 ${sources.length} 条\n- 时间范围 ${periodLabel}`;
}

function projectChatSources(logs) {
  return logs.slice(0, 8).map((log) => {
    const analysis = analyses.get(log.id);
    return {
      id: log.id,
      date: log.date,
      title: log.title,
      userName: log.user?.name ?? "员工",
      departmentName: log.user?.department?.name ?? null,
      hours: Number(log.hours ?? 0),
      evidence: analysis?.summary || String(log.content ?? "").slice(0, 120),
      riskCount: Array.isArray(analysis?.risks) ? analysis.risks.length : 0,
      blockerCount: Array.isArray(analysis?.blockers) ? analysis.blockers.length : 0
    };
  });
}

function workLogDraft(user, body) {
  requireUser(user);
  const currentDate = body.currentDate ?? todayKey;
  const today = body.today ?? todayKey;
  const text = (body.messages ?? [])
    .filter((item) => item.role === "user")
    .map((item) => item.content)
    .join("\n")
    .trim();
  const items = inferDraftItems(text, currentDate, today);
  const first = items[0];
  return {
    ...first,
    assistantMessage:
      items.length > 1
        ? `已识别 ${items.length} 条可填报日程。`
        : `${first.kind === "PLAN" ? "已整理为计划" : "已整理为日报"}：${first.date}，${first.hours} 小时。`,
    items
  };
}

function inferDraftItems(text, currentDate, today) {
  const content = text.trim();
  if (!content) return [buildDraftItem("请补充工作内容。", currentDate, today, undefined, true)];
  const globalDate = inferDraftDate(content, currentDate);
  const explicitSections = extractExplicitDraftSections(content);
  if (explicitSections.length > 1) {
    return explicitSections.map((section) => applyGlobalDraftDate(buildDraftItem(section, currentDate, today), section, globalDate, currentDate, today));
  }

  const ranges = Array.from(content.matchAll(timeRangePattern()));
  if (ranges.length) {
    const items = splitDraftClauses(content, true).flatMap((clause) => {
      const clauseRanges = Array.from(clause.matchAll(timeRangePattern()));
      if (!clauseRanges.length) {
        return [applyGlobalDraftDate(buildDraftItem(clause, currentDate, today), clause, globalDate, currentDate, today)];
      }
      return clauseRanges.map((match, index) => {
        const start = match.index ?? 0;
        const end = start + match[0].length;
        const segment = rangeSegment(clause, start, end, clauseRanges[index + 1]?.index);
        return applyGlobalDraftDate(buildDraftItem(segment, currentDate, today, parseDraftTimeRange(match)), segment, globalDate, currentDate, today);
      });
    });
    return items.length ? items : [buildDraftItem(content, currentDate, today)];
  }

  const clauses = splitDraftClauses(content, shouldSplitDraftSoftly(content));
  const hourClauses = clauses.filter((item) => /(\d+(?:\.\d+)?)\s*(?:小时|个?工时|h|H)/.test(item));
  if (hourClauses.length > 1) return hourClauses.map((item) => applyGlobalDraftDate(buildDraftItem(item, currentDate, today), item, globalDate, currentDate, today));
  if (clauses.length > 1) return clauses.map((item) => applyGlobalDraftDate(buildDraftItem(item, currentDate, today), item, globalDate, currentDate, today));
  return [buildDraftItem(content, currentDate, today)];
}

function extractExplicitDraftSections(text) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  const strictSections = splitDraftSectionsByMarker(
    normalized,
    /(^|[\s\n\r。；;])((?:第?\s*(?:\d{1,2}|[一二三四五六七八九十])\s*[、.．)]|[（(]\s*(?:\d{1,2}|[一二三四五六七八九十])\s*[）)])\s*)(?=\s|[\u4e00-\u9fa5A-Za-z])/g
  );
  if (strictSections.length > 1) return strictSections;

  const looseSections = splitDraftSectionsByMarker(normalized, /(^|[\n\r。；;]|\s)(\d{1,2})\s+(?=[\u4e00-\u9fa5A-Za-z])/g);
  return looseSections.length > 1 ? looseSections : [];
}

function splitDraftSectionsByMarker(text, markerPattern) {
  const matches = Array.from(text.matchAll(markerPattern));
  if (matches.length < 2) return [];
  return matches
    .map((match, index) => {
      const start = (match.index ?? 0) + match[0].length;
      const end = matches[index + 1]?.index ?? text.length;
      return text
        .slice(start, end)
        .replace(/^[，,、。；;\s]+/, "")
        .trim();
    })
    .filter((item) => item && hasDraftClauseContent(item));
}

function splitDraftClauses(text, includeSoftSeparators = false) {
  const separator = includeSoftSeparators ? /[，,。；;\n]+/ : /[。；;\n]+/;
  return text
    .split(separator)
    .map((item) => item.trim())
    .filter((item) => item && hasDraftClauseContent(item));
}

function shouldSplitDraftSoftly(text) {
  const timeMarkers = text.match(/上午|下午|晚上|中午|早上|凌晨/g)?.length ?? 0;
  const projectMarkers = text.match(/项目|需求|客户/g)?.length ?? 0;
  return timeMarkers >= 2 || projectMarkers >= 2;
}

function hasDraftClauseContent(text) {
  const cleaned = text
    .replace(timeRangePattern(), " ")
    .replace(/(\d+(?:\.\d+)?)\s*(?:小时|个?工时|h|H)/g, " ")
    .replace(/今天|昨天|明天|后天|计划|日报|工时|小时|上午|下午|晚上|中午|凌晨|早上/g, "")
    .replace(/[，。！？、,.!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 0;
}

function buildDraftItem(text, currentDate, today, timing, missingContent = false) {
  const date = inferDraftDate(text, currentDate);
  const hoursMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:小时|个?工时|h|H)/);
  const hours = timing?.hours ?? (hoursMatch ? Math.min(Math.max(Number(hoursMatch[1]), 0), 24) : 1);
  const title = inferDraftTitle(text);
  const kind = inferDraftKind(date, text, today);
  return {
    date,
    kind,
    title,
    content: inferDraftContent(text) || text || "请补充工作内容。",
    hours,
    startTime: timing?.startTime ?? null,
    endTime: timing?.endTime ?? null,
    projectHint: inferDraftProjectHint(text),
    confidence: missingContent || (!timing && !hoursMatch) ? 0.72 : 0.9,
    missingFields: [missingContent ? "content" : null, timing || hoursMatch ? null : "hours"].filter(Boolean)
  };
}

function timeRangePattern() {
  return /(?:(上午|下午|晚上|中午|凌晨|早上)\s*)?(\d{1,2})(?:(?:[:：])(\d{1,2})|[点时](\d{0,2})?)\s*(?:到|至|-|—|~)\s*(?:(上午|下午|晚上|中午|凌晨|早上)\s*)?(\d{1,2})(?:(?:[:：])(\d{1,2})|[点时](\d{0,2})?)/g;
}

function rangeSegment(text, start, end, nextStart) {
  const separators = "，,。；;\n";
  let left = 0;
  for (let index = start - 1; index >= 0; index -= 1) {
    if (separators.includes(text[index])) {
      left = index + 1;
      break;
    }
  }
  let right = nextStart ?? text.length;
  for (let index = end; index < right; index += 1) {
    if (separators.includes(text[index])) {
      right = index;
      break;
    }
  }
  return text.slice(left, right).trim() || text;
}

function parseDraftTimeRange(match) {
  const start = normalizeDraftClock(match[1], Number(match[2]), Number(match[3] || match[4] || 0));
  const end = normalizeDraftClock(match[5] || match[1], Number(match[6]), Number(match[7] || match[8] || 0));
  let minutes = end.hour * 60 + end.minute - (start.hour * 60 + start.minute);
  if (minutes <= 0) minutes += 24 * 60;
  return {
    startTime: formatDraftClock(start.hour, start.minute),
    endTime: formatDraftClock(end.hour, end.minute),
    hours: Number((minutes / 60).toFixed(2))
  };
}

function normalizeDraftClock(period, hourValue, minuteValue) {
  let hour = hourValue;
  const minute = minuteValue;
  if ((period === "下午" || period === "晚上") && hour < 12) hour += 12;
  if (period === "中午" && hour < 11) hour += 12;
  if (period === "凌晨" && hour === 12) hour = 0;
  return { hour: Math.min(Math.max(hour, 0), 23), minute: Math.min(Math.max(minute, 0), 59) };
}

function formatDraftClock(hour, minute) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function inferDraftKind(date, text, today) {
  return date > today || /计划|明天|后天|下周|安排/.test(text) ? "PLAN" : "DAILY";
}

function applyGlobalDraftDate(item, text, globalDate, currentDate, today) {
  if (globalDate === currentDate || hasDraftDateHint(text)) return item;
  return {
    ...item,
    date: globalDate,
    kind: inferDraftKind(globalDate, text, today)
  };
}

function hasDraftDateHint(text) {
  return /今天|昨天|明天|后天|20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}|\d{1,2}月\d{1,2}[日号]?/.test(text);
}

function inferDraftDate(text, currentDate) {
  const current = new Date(`${currentDate}T00:00:00.000Z`);
  if (/后天/.test(text)) return dateKey(addDays(current, 2));
  if (/明天/.test(text)) return dateKey(addDays(current, 1));
  if (/昨天/.test(text)) return dateKey(addDays(current, -1));
  const iso = text.match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if (iso) return `${iso[1]}-${String(Number(iso[2])).padStart(2, "0")}-${String(Number(iso[3])).padStart(2, "0")}`;
  const monthDay = text.match(/(\d{1,2})月(\d{1,2})[日号]?/);
  if (monthDay) return `${current.getUTCFullYear()}-${String(Number(monthDay[1])).padStart(2, "0")}-${String(Number(monthDay[2])).padStart(2, "0")}`;
  return currentDate;
}

function inferDraftTitle(text) {
  const cleaned = text
    .replace(timeRangePattern(), " ")
    .replace(/(\d+(?:\.\d+)?)\s*(?:小时|个?工时|h|H)/g, " ")
    .replace(/今天|昨天|明天|后天|计划|日报|工时|小时|上午|下午|晚上|中午|凌晨|早上/g, "")
    .replace(/[，。！？、,.!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "工作填报";
  return cleaned.length > 24 ? `${cleaned.slice(0, 24)}...` : cleaned;
}

function inferDraftProjectHint(text) {
  const patterns = [
    /([A-Za-z][A-Za-z0-9_-]{1,16})\s*(?:项目|需求|系统|平台|模块)/,
    /([\u4e00-\u9fa5A-Za-z0-9_-]{2,24})\s*(?:项目|需求|系统|平台|模块|客户)/
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = match?.[1]?.trim();
    if (value && !/今天|昨天|明天|上午|下午|晚上|客户/.test(value)) return value;
  }
  return null;
}

function inferDraftContent(text) {
  const cleaned = text
    .replace(timeRangePattern(), " ")
    .replace(/(\d+(?:\.\d+)?)\s*(?:小时|个?工时|h|H)/g, " ")
    .replace(/今天|昨天|明天|后天|计划|日报|工时/g, " ")
    .replace(/[，。！？、,.!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned ? `${cleaned.replace(/[。.]$/, "")}。` : "";
}

function localCalendarAnswer(question, logs, periodLabel) {
  if (logs.length === 0) return `${periodLabel} 暂无可用于回答的日报或计划。`;
  const wantsRisk = /风险|问题|阻塞|risk|block/i.test(question);
  const wantsPlan = /计划|未来|明天|下周|安排/i.test(question);
  const wantsHours = /工时|小时|投入|耗时/i.test(question);
  const risks = logs.flatMap((log) => analyses.get(log.id)?.risks ?? []);
  const blockers = logs.flatMap((log) => analyses.get(log.id)?.blockers ?? []);
  const plans = logs.filter((log) => log.date > todayKey);
  const totalHours = logs.reduce((sum, log) => sum + Number(log.hours), 0);
  const highlights = logs.slice(0, 8).map((log) => {
    const owner = users.find((item) => item.id === log.userId);
    return `${log.date} ${owner?.name ?? "员工"}${log.project?.name ? ` [${log.project.name}]` : ""}: ${log.title}`;
  });

  if (wantsRisk) {
    const items = [...risks, ...blockers];
    return items.length
      ? `${periodLabel} 发现 ${items.length} 条风险/阻塞：\n${items.map((item, index) => `${index + 1}. ${item}`).join("\n")}`
      : `${periodLabel} 当前上下文中没有明确风险或阻塞。`;
  }
  if (wantsPlan) {
    return plans.length
      ? `${periodLabel} 未来计划主要包括：\n${plans.map((log, index) => `${index + 1}. ${log.user?.name ?? "员工"}${log.project?.name ? ` [${log.project.name}]` : ""}: ${log.title}`).join("\n")}`
      : `${periodLabel} 暂无未来计划记录。`;
  }
  if (wantsHours) {
    return `${periodLabel} 共 ${logs.length} 条日报/计划，合计 ${Number(totalHours.toFixed(2))} 小时。`;
  }
  return [
    `${periodLabel} 共 ${logs.length} 条日报/计划，合计 ${Number(totalHours.toFixed(2))} 小时。`,
    `重点记录：\n${highlights.map((item, index) => `${index + 1}. ${item}`).join("\n")}`,
    risks.length ? `需要关注的风险：${risks.slice(0, 5).join("；")}` : "暂未看到明确风险。"
  ].join("\n");
}

function normalizeReportDepartmentId(value) {
  return value && value !== "__company__" ? value : null;
}

function reportScope(user, body) {
  const type = body.type;
  const isPersonal = type === "PERSONAL_DAILY" || type === "PERSONAL_WEEKLY";
  if (isPersonal) {
    return { isPersonal: true, departmentId: null, scopeName: user.name };
  }
  const isDepartment = type === "DEPARTMENT_DAILY" || type === "DEPARTMENT_WEEKLY";
  if (!isDepartment) throw httpError(400, "Unsupported report type");
  let departmentId = normalizeReportDepartmentId(body.departmentId);
  if (hasRole(user, ["DEPARTMENT_MANAGER"])) departmentId = user.departmentId;
  if (!departmentId && !hasRole(user, ["COMPANY_ADMIN", "SUPER_ADMIN"])) {
    throw httpError(400, "Department report requires departmentId");
  }
  if (!hasRole(user, ["COMPANY_ADMIN", "SUPER_ADMIN"]) && departmentId !== user.departmentId) {
    throw httpError(400, "Cannot generate report for another department");
  }
  const department = departmentId ? departments.find((item) => item.id === departmentId && item.tenantId === user.tenantId && !item.deletedAt) : null;
  if (departmentId && !department) throw httpError(400, "Department not found");
  return { isPersonal: false, departmentId, scopeName: department?.name ?? "全公司" };
}

function reportDataset(user, body) {
  const start = body.periodStart;
  const end = body.periodEnd;
  const scope = reportScope(user, body);
  const members = scope.isPersonal
    ? users.filter((item) => item.id === user.id && item.tenantId === user.tenantId && !item.deletedAt)
    : users.filter((item) =>
        item.tenantId === user.tenantId &&
        item.isActive &&
        item.requiresWorkReport &&
        !item.deletedAt &&
        (!scope.departmentId || item.departmentId === scope.departmentId)
      );
  const candidates = workLogs
    .filter((item) => item.tenantId === user.tenantId && item.status === "SUBMITTED" && !item.deletedAt && item.date >= start && item.date <= end)
    .filter((item) => {
      if (scope.isPersonal) return item.userId === user.id;
      const owner = users.find((candidate) => candidate.id === item.userId);
      return owner?.requiresWorkReport && owner.isActive && !owner.deletedAt && (!scope.departmentId || owner.departmentId === scope.departmentId);
    });
  const coveredUserIds = new Set(candidates.map((item) => item.userId));
  const projectIds = new Set(candidates.map((item) => item.projectId).filter(Boolean));
  const riskCount = candidates.reduce((sum, item) => sum + (analyses.get(item.id)?.risks?.length ?? 0), 0);
  const blockerCount = candidates.reduce((sum, item) => sum + (analyses.get(item.id)?.blockers?.length ?? 0), 0);
  const totalHours = candidates.reduce((sum, item) => sum + Number(item.hours), 0);
  const stats = {
    workLogCount: candidates.length,
    targetMemberCount: members.length,
    coveredMemberCount: coveredUserIds.size,
    missingMemberCount: Math.max(members.length - coveredUserIds.size, 0),
    riskCount,
    blockerCount,
    projectCount: projectIds.size,
    totalHours: Number(totalHours.toFixed(2))
  };
  const sources = candidates.slice(0, 20).map((item) => {
    const owner = users.find((candidate) => candidate.id === item.userId);
    const project = projects.find((candidate) => candidate.id === item.projectId);
    const analysis = analyses.get(item.id);
    return {
      id: item.id,
      date: item.date,
      title: item.title,
      userName: owner?.name ?? item.userId,
      projectName: project?.name ?? null,
      summary: analysis?.summary ?? item.content,
      risks: analysis?.risks ?? [],
      blockers: analysis?.blockers ?? [],
      hours: Number(item.hours)
    };
  });
  return { start, end, scope, members, candidates, stats, sources };
}

function reportReadiness(user, body) {
  const dataset = reportDataset(user, body);
  return {
    type: body.type,
    periodStart: dataset.start,
    periodEnd: dataset.end,
    departmentId: dataset.scope.departmentId,
    scopeName: dataset.scope.scopeName,
    canGenerate: dataset.stats.workLogCount > 0,
    emptyReason: dataset.stats.workLogCount > 0 ? null : "当前周期暂无可用日报，建议先填写日报或切换时间范围。",
    stats: dataset.stats,
    sources: dataset.sources.slice(0, 12)
  };
}

function generateReport(user, body) {
  const { start, end, scope, candidates, stats, sources } = reportDataset(user, body);
  const existing = reports.find(
    (item) =>
      item.tenantId === user.tenantId &&
      item.requesterId === user.id &&
      item.type === body.type &&
      item.periodStart === start &&
      item.periodEnd === end &&
      (item.departmentId ?? null) === (scope.departmentId ?? null) &&
      ["PENDING", "COMPLETED"].includes(item.status) &&
      !item.deletedAt
  );
  if (existing) return existing;
  if (!candidates.length) {
    throw httpError(400, "当前周期暂无可用日报，建议先填写日报或切换时间范围。");
  }
  const byUser = new Map();
  for (const log of candidates) {
    const owner = users.find((item) => item.id === log.userId);
    const name = owner?.name ?? log.userId;
    byUser.set(name, (byUser.get(name) ?? 0) + Number(log.hours));
  }
  const content = {
    completed: candidates.map((item) => {
      const owner = users.find((candidate) => candidate.id === item.userId);
      const project = projects.find((candidate) => candidate.id === item.projectId);
      return `${owner?.name ?? "员工"}${project?.name ? ` [${project.name}]` : ""}: ${item.title}`;
    }),
    progress: candidates.map((item) => analyses.get(item.id)?.summary ?? item.content),
    risks: candidates.flatMap((item) => [...(analyses.get(item.id)?.risks ?? []), ...(analyses.get(item.id)?.blockers ?? [])]),
    nextPlan: ["继续推进已提交工作中的后续事项。"],
    hours: {
      total: Number(candidates.reduce((sum, item) => sum + Number(item.hours), 0).toFixed(2)),
      byUser: Array.from(byUser.entries()).map(([userName, hours]) => ({ userName, hours: Number(hours.toFixed(2)) }))
    },
    summary: `${start} 至 ${end} 共生成 ${candidates.length} 条工作记录的汇报。`,
    evidence: { stats, sources }
  };
  const report = {
    id: `report-${Date.now()}`,
    tenantId: user.tenantId,
    requesterId: user.id,
    departmentId: scope.departmentId,
    type: body.type,
    status: "COMPLETED",
    title: `${reportTypeLabel(body.type)} ${start === end ? start : `${start} 至 ${end}`}`,
    periodStart: start,
    periodEnd: end,
    content,
    error: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  reports.unshift(report);
  notifications.push({
    id: `notice-${Date.now()}`,
    tenantId: user.tenantId,
    userId: user.id,
    type: "REPORT_DONE",
    title: "报告生成完成",
    body: `「${report.title}」已生成。`,
    isRead: false,
    createdAt: new Date().toISOString()
  });
  return report;
}

function listNotifications(user) {
  if (!user.requiresWorkReport) {
    return notifications.filter((item) => item.userId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  const hasSubmittedToday = workLogs.some((item) => item.userId === user.id && item.date === todayKey && item.status === "SUBMITTED" && !item.deletedAt);
  const hasReminder = notifications.some((item) => item.userId === user.id && item.type === "WORK_LOG_REMINDER" && item.createdAt.slice(0, 10) === todayKey);
  if (!hasSubmittedToday && !hasReminder) {
    notifications.unshift({
      id: `notice-${Date.now()}`,
      tenantId: user.tenantId,
      userId: user.id,
      type: "WORK_LOG_REMINDER",
      title: "今日未填报提醒",
      body: "今天还没有提交工作填报。",
      isRead: false,
      createdAt: new Date().toISOString()
    });
  }
  return notifications.filter((item) => item.userId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function readNotification(user, id) {
  const item = notifications.find((notice) => notice.id === id && notice.userId === user.id);
  if (!item) throw httpError(404, "Notification not found");
  item.isRead = true;
  item.readAt = new Date().toISOString();
  return item;
}

function readAllNotifications(user) {
  for (const item of notifications) {
    if (item.userId === user.id) {
      item.isRead = true;
      item.readAt = new Date().toISOString();
    }
  }
  return { ok: true };
}

function listAuditLogs(user, url) {
  requireRole(user, ["COMPANY_ADMIN", "SUPER_ADMIN"]);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50), 1), 200);
  return auditLogs
    .filter((item) => item.tenantId === user.tenantId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

function requestDataDeletion(user, body) {
  if (body.scope === "TENANT") requireRole(user, ["COMPANY_ADMIN", "SUPER_ADMIN"]);
  const request = {
    id: `deletion-${Date.now()}`,
    tenantId: user.tenantId,
    requesterId: user.id,
    scope: body.scope ?? "SELF",
    reason: body.reason ?? null,
    status: "REQUESTED",
    requestedAt: new Date().toISOString(),
    processedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null
  };
  dataDeletionRequests.unshift(request);
  audit(user, "DATA_DELETION_REQUESTED", "DataDeletionRequest", request.id, { scope: request.scope, reason: request.reason });
  return request;
}

function listDataDeletionRequests(user) {
  return dataDeletionRequests
    .filter((item) => item.tenantId === user.tenantId)
    .filter((item) => hasRole(user, ["COMPANY_ADMIN", "SUPER_ADMIN"]) || item.requesterId === user.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function listExportTasks(user) {
  return exportTasks
    .filter((item) => item.tenantId === user.tenantId && item.requesterId === user.id && !item.deletedAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 50)
    .map(publicExportTask);
}

function createExportTask(user, url) {
  const scope = url.searchParams.get("scope") === "tenant" ? "TENANT" : "SELF";
  if (scope === "TENANT") requireRole(user, ["COMPANY_ADMIN", "SUPER_ADMIN"]);
  const data = exportData(user, new URL(`http://localhost/exports/data?scope=${scope === "TENANT" ? "tenant" : "self"}`));
  const buffer = Buffer.from(JSON.stringify(data, null, 2), "utf8");
  const now = new Date();
  const task = {
    id: `export-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    tenantId: user.tenantId,
    requesterId: user.id,
    scope,
    status: "COMPLETED",
    fileName: `work-calendar-ai-${scope.toLowerCase()}-${dateKey(now)}.json`,
    fileSize: buffer.length,
    contentType: "application/json; charset=utf-8",
    contentBase64: buffer.toString("base64"),
    expiresAt: addDays(now, 7).toISOString(),
    completedAt: now.toISOString(),
    error: null,
    metadata: { jsonBytes: buffer.length, localDemo: true },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    deletedAt: null
  };
  exportTasks.unshift(task);
  audit(user, "DATA_EXPORT_TASK_CREATED", "ExportTask", task.id, { scope });
  return publicExportTask(task);
}

function downloadExportTask(res, user, taskId) {
  const task = exportTasks.find((item) => item.id === taskId && item.tenantId === user.tenantId && item.requesterId === user.id && !item.deletedAt);
  if (!task) throw httpError(404, "Export task not found");
  if (task.status !== "COMPLETED") throw httpError(400, "Export file is not ready");
  return sendBuffer(res, Buffer.from(task.contentBase64, "base64"), {
    contentType: task.contentType,
    fileName: task.fileName
  });
}

function publicExportTask(task) {
  return {
    id: task.id,
    scope: task.scope,
    status: task.status,
    fileName: task.fileName,
    fileSize: task.fileSize,
    contentType: task.contentType,
    expiresAt: task.expiresAt,
    completedAt: task.completedAt,
    error: task.error,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt
  };
}

function listFeedbackRequests(user) {
  return feedbackRequests
    .filter((item) => item.tenantId === user.tenantId && !item.deletedAt)
    .filter((item) => hasRole(user, ["COMPANY_ADMIN", "SUPER_ADMIN"]) || item.requesterId === user.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(publicFeedbackRequest);
}

function createFeedbackRequest(user, body) {
  const now = new Date().toISOString();
  const request = {
    id: `feedback-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    tenantId: user.tenantId,
    requesterId: user.id,
    category: body.category ?? "OTHER",
    priority: body.priority ?? "NORMAL",
    status: "SUBMITTED",
    title: String(body.title ?? "").trim(),
    content: String(body.content ?? "").trim(),
    contact: normalizeOptional(body.contact) ?? null,
    resolution: null,
    resolvedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null
  };
  if (request.title.length < 2 || request.content.length < 5) {
    throw httpError(400, "请完整填写反馈标题和问题说明");
  }
  feedbackRequests.unshift(request);
  audit(user, "FEEDBACK_REQUEST_CREATED", "FeedbackRequest", request.id, { category: request.category, priority: request.priority });
  return publicFeedbackRequest(request);
}

function updateFeedbackStatus(user, feedbackId, body) {
  requireRole(user, ["COMPANY_ADMIN", "SUPER_ADMIN"]);
  const request = feedbackRequests.find((item) => item.id === feedbackId && item.tenantId === user.tenantId && !item.deletedAt);
  if (!request) throw httpError(404, "Feedback request not found");
  request.status = body.status ?? request.status;
  request.resolution = body.resolution === undefined ? request.resolution : normalizeOptional(body.resolution);
  request.resolvedAt = ["RESOLVED", "CLOSED"].includes(request.status) ? new Date().toISOString() : null;
  request.updatedAt = new Date().toISOString();
  audit(user, "FEEDBACK_REQUEST_UPDATED", "FeedbackRequest", request.id, { status: request.status });
  return publicFeedbackRequest(request);
}

function publicFeedbackRequest(request) {
  const requester = users.find((item) => item.id === request.requesterId && item.tenantId === request.tenantId);
  return {
    ...request,
    requester: requester
      ? {
          id: requester.id,
          name: requester.name,
          email: requester.email,
          phone: requester.phone ?? null,
          department: departments.find((item) => item.id === requester.departmentId && item.tenantId === requester.tenantId) ?? null
        }
      : null
  };
}

function filterLogsByAccess(user, url) {
  const visibleUserIds = new Set(filterUsersByAccess(user, url).map((item) => item.id));
  return workLogs.filter((item) => visibleUserIds.has(item.userId));
}

function filterUsersByAccess(user, url) {
  const scope = resolveScope(user, url);
  const tenantUsers = users.filter((item) => item.tenantId === user.tenantId);
  if (scope.scope === "self") return users.filter((item) => item.id === user.id);
  if (scope.scope === "department") return tenantUsers.filter((item) => item.departmentId === scope.departmentId && item.isActive);
  if (scope.departmentId) return tenantUsers.filter((item) => item.departmentId === scope.departmentId && item.isActive);
  return tenantUsers.filter((item) => item.isActive);
}

function normalizeEmail(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized || null;
}

function normalizePhone(value) {
  const normalized = String(value ?? "").trim().replace(/[\s-]/g, "");
  return normalized || null;
}

function normalizeAccount(value) {
  const text = String(value ?? "").trim();
  return {
    email: text.toLowerCase(),
    phone: normalizePhone(text)
  };
}

function normalizeUnifiedSocialCreditCode(value) {
  return String(value ?? "").trim().toUpperCase();
}

function normalizeOptionalUnifiedSocialCreditCode(value) {
  const normalized = normalizeUnifiedSocialCreditCode(value);
  return normalized || undefined;
}

function normalizeTenantLogoUrl(value) {
  if (value === undefined) return undefined;
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^data:image\/png;base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) throw httpError(400, "企业 Logo 仅支持 PNG data URL");
  const buffer = Buffer.from(match[1].replace(/\s/g, ""), "base64");
  if (buffer.byteLength > 256 * 1024) throw httpError(400, "企业 Logo 不能超过 256KB");
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(pngSignature)) {
    throw httpError(400, "企业 Logo 文件不是有效 PNG");
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width !== 620 || height !== 220) {
    throw httpError(400, "企业 Logo 尺寸必须为 620 x 220px");
  }
  return trimmed;
}

function matchesAccount(user, account) {
  return Boolean((account.email && user.email === account.email) || (account.phone && user.phone === account.phone));
}

function matchesContact(user, email, phone) {
  return Boolean((email && user.email === email) || (phone && user.phone === phone));
}

function hasContactConflict(tenantId, email, phone, excludeUserId = null) {
  return users.some(
    (item) =>
      item.tenantId === tenantId &&
      item.id !== excludeUserId &&
      !item.deletedAt &&
      matchesContact(item, email, phone)
  );
}

function assertContact(email, phone) {
  if (!email && !phone) throw httpError(400, "请至少填写邮箱或手机号");
  if (phone && !/^\+?\d{6,20}$/.test(phone)) throw httpError(400, "手机号格式不正确");
}

function resolveScope(user, url) {
  const requestedScope = url.searchParams.get("scope");
  const requestedDepartmentId = url.searchParams.get("departmentId");
  if (hasRole(user, ["COMPANY_ADMIN", "SUPER_ADMIN"])) {
    return { scope: requestedScope || "company", departmentId: requestedDepartmentId || undefined };
  }
  if (hasRole(user, ["DEPARTMENT_MANAGER"])) {
    if (requestedScope === "self") return { scope: "self" };
    return { scope: "department", departmentId: user.departmentId };
  }
  return { scope: "self" };
}

function enrichLog(log) {
  const owner = users.find((item) => item.id === log.userId);
  return {
    ...log,
    kind: log.kind ?? "DAILY",
    user: owner
      ? {
          id: owner.id,
          name: owner.name,
          email: owner.email,
          phone: owner.phone ?? null,
          departmentId: owner.departmentId,
          department: departments.find((item) => item.id === owner.departmentId && item.tenantId === owner.tenantId) ?? null
        }
      : null,
    project: log.projectId ? projectWithOwner(projects.find((item) => item.id === log.projectId) ?? { id: log.projectId, name: "已删除项目", tenantId: log.tenantId }) : null,
    aiAnalysis: analyses.get(log.id) ?? null,
    attachments: workLogAttachments
      .filter((item) => item.tenantId === log.tenantId && item.workLogId === log.id && !item.deletedAt)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map(publicAttachment),
    sourceLinks: workLogSourceLinks
      .filter((item) => item.tenantId === log.tenantId && item.workLogId === log.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((link) => ({
        ...link,
        source: communicationSources.find((item) => item.id === link.sourceId && item.tenantId === log.tenantId) ?? null,
        message: communicationMessages.find((item) => item.id === link.messageId && item.tenantId === log.tenantId) ?? null,
        file: communicationFiles.find((item) => item.id === link.fileId && item.tenantId === log.tenantId) ?? null,
        insight: communicationInsights.find((item) => item.id === link.insightId && item.tenantId === log.tenantId) ?? null
      }))
  };
}

function getRawWorkLog(user, id) {
  const item = workLogs.find((log) => log.id === id && !log.deletedAt);
  if (!item) throw httpError(404, "Work log not found");
  assertCanAccessLog(user, item);
  return item;
}

function assertCanAccessLog(user, log) {
  if (log.tenantId !== user.tenantId) throw httpError(403, "Cannot access this work log");
  const owner = users.find((item) => item.id === log.userId);
  if (hasRole(user, ["COMPANY_ADMIN", "SUPER_ADMIN"])) return;
  if (log.userId === user.id) return;
  if (hasRole(user, ["DEPARTMENT_MANAGER"]) && owner?.departmentId === user.departmentId) return;
  throw httpError(403, "Cannot access this work log");
}

function canAccessUser(user, targetUserId) {
  const target = users.find((item) => item.id === targetUserId && item.tenantId === user.tenantId && !item.deletedAt);
  if (!target) return false;
  if (hasRole(user, ["COMPANY_ADMIN", "SUPER_ADMIN"])) return true;
  if (target.id === user.id) return true;
  return Boolean(hasRole(user, ["DEPARTMENT_MANAGER"]) && target.departmentId && target.departmentId === user.departmentId);
}

function requireUser(user) {
  if (!user) throw httpError(401, "Missing bearer token");
  if (!user.isActive || user.deletedAt) throw httpError(401, "User not found");
  return user;
}

function requireRole(user, roles) {
  if (!hasRole(user, roles)) throw httpError(403, "Insufficient role");
}

function hasRole(user, roles) {
  return user.roles.some((role) => roles.includes(role));
}

function getCurrentUser(req) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length);
  if (token === "local-ops") return OPS_USER;
  if (!token.startsWith("local:")) return null;
  return users.find((item) => item.id === token.slice("local:".length) && item.isActive && !item.deletedAt) ?? null;
}

function lastPath(pathname) {
  return pathname.split("/").filter(Boolean).at(-1);
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function todayKeyInShanghai() {
  const shanghai = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return dateKey(new Date(Date.UTC(shanghai.getUTCFullYear(), shanghai.getUTCMonth(), shanghai.getUTCDate())));
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addMonths(date, months) {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function addHours(date, hours) {
  const next = new Date(date);
  next.setHours(next.getHours() + hours);
  return next;
}

function monthEndKey(month) {
  const start = new Date(`${month}-01T00:00:00.000Z`);
  return dateKey(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)));
}

function reportTypeLabel(type) {
  return {
    PERSONAL_DAILY: "个人日报",
    PERSONAL_WEEKLY: "个人周报",
    DEPARTMENT_DAILY: "部门日报",
    DEPARTMENT_WEEKLY: "部门周报"
  }[type] ?? "智能汇报";
}

async function readJson(req) {
  if (!["POST", "PATCH", "PUT"].includes(req.method ?? "")) return {};
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function json(res, body) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.writeHead(200);
  res.end(JSON.stringify(body));
}

function asciiFallbackFileName(fileName) {
  const fallback = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_").trim();
  return fallback || "download";
}

function encodeRFC5987Value(value) {
  return encodeURIComponent(value).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function attachmentDisposition(fileName) {
  return `attachment; filename="${asciiFallbackFileName(fileName)}"; filename*=UTF-8''${encodeRFC5987Value(fileName)}`;
}

function sendBuffer(res, buffer, { contentType = "application/octet-stream", fileName = "download.bin" } = {}) {
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Length", buffer.length);
  res.setHeader("Content-Disposition", attachmentDisposition(fileName));
  res.writeHead(200);
  res.end(buffer);
}

function apiHome(res) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.writeHead(200);
  res.end(`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Work Calendar AI API</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f8fafd; color: #1f1f1f; }
    main { width: min(560px, calc(100vw - 40px)); background: #fff; border-radius: 24px; padding: 32px; box-shadow: 0 2px 8px rgba(60,64,67,.14); }
    h1 { margin: 0 0 8px; font-size: 28px; font-weight: 600; }
    p { margin: 0 0 18px; color: #5f6368; line-height: 1.6; }
    a { display: inline-flex; margin-right: 12px; margin-top: 8px; padding: 10px 16px; border-radius: 999px; background: #0b57d0; color: #fff; text-decoration: none; font-weight: 600; }
    code { background: #eef3f8; padding: 3px 7px; border-radius: 8px; }
  </style>
</head>
<body>
  <main>
    <h1>Work Calendar AI API</h1>
    <p>API 服务正在运行。产品页面请访问 <code>http://localhost:3000</code>。</p>
    <p>当前模式：本地内存演示 API。健康检查：<code>/health</code></p>
    <a href="http://localhost:3000">打开 Web 应用</a>
    <a href="/health">查看健康检查</a>
  </main>
</body>
</html>`);
}

function send(res, status) {
  res.writeHead(status);
  res.end();
}

function error(res, status, message) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.writeHead(status);
  res.end(JSON.stringify({ statusCode: status, message }));
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function audit(user, action, targetType, targetId, metadata = undefined) {
  auditLogs.unshift({
    id: `audit-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    tenantId: user.tenantId,
    actorUserId: user.id,
    action,
    targetType,
    targetId,
    metadata,
    createdAt: new Date().toISOString()
  });
}
