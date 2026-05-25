import http from "node:http";
import { URL } from "node:url";

const PORT = Number(process.env.API_PORT ?? 3001);
const PASSWORD = "Passw0rd!";

const today = new Date();
const todayKey = dateKey(today);
const yesterdayKey = dateKey(addDays(today, -1));
const tomorrowKey = dateKey(addDays(today, 1));

const tenant = {
  id: "tenant-demo",
  name: "示例科技有限公司",
  code: "demo",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  deletedAt: null
};
const tenants = [tenant];

const departments = [
  { id: "dept-engineering", tenantId: tenant.id, name: "研发部", parentId: null },
  { id: "dept-product", tenantId: tenant.id, name: "产品部", parentId: null }
];

const projects = [
  {
    id: "project-work-calendar",
    tenantId: tenant.id,
    code: "WCA",
    name: "Work Calendar AI 商业化版本",
    description: "围绕日报、计划、日历看板、AI 汇报和发布准备的核心产品项目。",
    status: "ACTIVE",
    ownerUserId: "manager",
    startDate: dateKey(addDays(today, -14)),
    endDate: dateKey(addDays(today, 45)),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null
  },
  {
    id: "project-ai-report",
    tenantId: tenant.id,
    code: "AIR",
    name: "AI 汇报能力优化",
    description: "优化 AI 分析、问答和日报周报生成质量。",
    status: "ACTIVE",
    ownerUserId: "admin",
    startDate: dateKey(addDays(today, -7)),
    endDate: dateKey(addDays(today, 30)),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null
  }
];

const subscription = {
  id: "sub-demo",
  tenantId: tenant.id,
  plan: "BUSINESS",
  status: "ACTIVE",
  seatLimit: 30,
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

const users = [
  makeUser("super", "super@example.com", "平台超管", null, ["SUPER_ADMIN"], tenant.id, PASSWORD, "13900000001", false),
  makeUser("admin", "admin@example.com", "企业管理员", null, ["COMPANY_ADMIN"], tenant.id, PASSWORD, "13900000002", false),
  makeUser("manager", "manager@example.com", "研发经理", "dept-engineering", ["DEPARTMENT_MANAGER"], tenant.id, PASSWORD, "13900000003", true),
  makeUser("employee", "employee@example.com", "研发员工一", "dept-engineering", ["EMPLOYEE"], tenant.id, PASSWORD, "13900000004", true),
  makeUser("employee2", "employee2@example.com", "产品员工一", "dept-product", ["EMPLOYEE"], tenant.id, PASSWORD, "13900000005", true)
];

const analyses = new Map();
const workLogs = [
  workLog("log-1", "employee", todayKey, "完成日报月历查询", "实现管理驾驶舱的月历查询接口，补充部门权限过滤，并完成接口自测。风险是月末大数据量需要继续压测。", 3.5, "project-work-calendar"),
  workLog("log-2", "manager", todayKey, "评审 AI 分析提示词", "评审工作填报 AI 分析 Prompt，明确成果、风险、阻塞字段的 JSON 输出结构。明天继续观察失败重试。", 2, "project-ai-report"),
  workLog("log-3", "employee2", yesterdayKey, "梳理组织权限页面", "梳理企业管理员新增部门和员工的最小闭环，确认第一版不加入审批流。", 3, "project-work-calendar"),
  workLog("log-4", "employee", tomorrowKey, "发布前联调计划", "计划完成登录、填报、日历详情和 AI 汇报的发布前联调，并检查阿里云生产环境变量。潜在风险是 DeepSeek Key 未配置。", 2, "project-work-calendar")
];
for (const log of workLogs) {
  analyses.set(log.id, createAnalysis(log));
}

const reports = [];
const notifications = [];
const billingOrders = [];
const dataDeletionRequests = [];
const auditLogs = [];
const passwordResetTokens = new Map();

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin ?? "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Credentials", "true");
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
    if (route === "POST /auth/register") return json(res, registerTenant(body));
    if (route === "GET /auth/me") return json(res, me(requireUser(currentUser)));
    if (route === "POST /auth/password-reset/request") return json(res, requestPasswordReset(body));
    if (route === "POST /auth/password-reset/confirm") return json(res, confirmPasswordReset(body));
    if (route === "POST /auth/verify-email") return json(res, verifyEmail(body));
    if (route === "POST /auth/change-password") return json(res, changePassword(requireUser(currentUser), body));
    if (route === "GET /org") return json(res, getOrg(requireUser(currentUser)));
    if (route === "GET /billing/subscription") return json(res, subscriptionSummary(requireUser(currentUser).tenantId));
    if (route === "PATCH /billing/subscription") return json(res, updateSubscription(requireUser(currentUser), body));
    if (route === "GET /billing/orders") return json(res, listBillingOrders(requireUser(currentUser)));
    if (route === "POST /billing/orders") return json(res, createBillingOrder(requireUser(currentUser), body));
    if (route === "GET /ops/overview") return json(res, opsOverview(requireUser(currentUser)));
    if (req.method === "PATCH" && url.pathname.startsWith("/ops/accounts/")) {
      return json(res, updateOpsAccount(requireUser(currentUser), lastPath(url.pathname), body));
    }
    if (req.method === "POST" && url.pathname.startsWith("/billing/orders/") && url.pathname.endsWith("/confirm-manual-payment")) {
      return json(res, confirmManualPayment(requireUser(currentUser), url.pathname.split("/")[3], body));
    }
    if (route === "GET /audit-logs") return json(res, listAuditLogs(requireUser(currentUser), url));
    if (route === "GET /privacy/data-deletion-requests") return json(res, listDataDeletionRequests(requireUser(currentUser)));
    if (route === "POST /privacy/data-deletion-requests") return json(res, requestDataDeletion(requireUser(currentUser), body));
    if (route === "GET /exports/data") return json(res, exportData(requireUser(currentUser), url));
    if (route === "POST /org/tenants") return json(res, createTenant(requireUser(currentUser), body));
    if (route === "POST /org/departments") return json(res, createDepartment(requireUser(currentUser), body));
    if (req.method === "PATCH" && url.pathname.startsWith("/org/departments/")) {
      return json(res, updateDepartment(requireUser(currentUser), lastPath(url.pathname), body));
    }
    if (route === "POST /org/users") return json(res, createOrgUser(requireUser(currentUser), body));
    if (req.method === "PATCH" && url.pathname.startsWith("/org/users/")) {
      return json(res, updateOrgUser(requireUser(currentUser), lastPath(url.pathname), body));
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
    if (route === "POST /ai/work-log-draft") return json(res, workLogDraft(requireUser(currentUser), body));

    if (route === "POST /reports/generate") return json(res, generateReport(requireUser(currentUser), body));
    if (route === "GET /reports") return json(res, reports.filter((item) => item.requesterId === requireUser(currentUser).id));
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

function createAnalysis(log) {
  const text = `${log.title} ${log.content}`;
  const risks = /风险|问题|阻塞|延迟/i.test(text) ? ["填报内容中提到风险或问题，需要管理者关注。"] : [];
  const blockers = /阻塞|依赖|卡住/i.test(text) ? ["存在阻塞或外部依赖。"] : [];
  return {
    id: `analysis-${log.id}`,
    tenantId: log.tenantId,
    workLogId: log.id,
    userId: log.userId,
    category: /产品|需求|页面/.test(text) ? "产品规划" : "研发交付",
    achievements: [log.title],
    risks,
    blockers,
    keywords: Array.from(new Set(text.replace(/[，。！？、,.!?]/g, " ").split(/\s+/).filter((item) => item.length >= 2))).slice(0, 6),
    tags: ["本地分析", Number(log.hours) > 8 ? "工时偏高" : "常规工时"],
    timeReasonableness: Number(log.hours) > 10 ? "工时偏高，建议确认是否拆分记录。" : "工时与填报内容基本匹配。",
    summary: log.content.length > 80 ? `${log.content.slice(0, 80)}...` : log.content,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function login(res, body) {
  const account = normalizeAccount(body.account ?? body.email);
  const found = users.find((item) => {
    const ownerTenant = tenants.find((candidate) => candidate.id === item.tenantId);
    return matchesAccount(item, account) && (!body.tenantCode || ownerTenant?.code === body.tenantCode);
  });
  if (!found || body.password !== (found.password ?? PASSWORD)) {
    return error(res, 401, "Invalid email or password");
  }
  found.lastLoginAt = new Date().toISOString();
  audit(found, "AUTH_LOGIN", "User", found.id);
  return json(res, {
    accessToken: `local:${found.id}`,
    user: me(found)
  });
}

function registerTenant(body) {
  if (tenants.some((item) => item.code === body.tenantCode)) throw httpError(400, "企业代码已被使用");
  const tenantId = `tenant-${Date.now()}`;
  const newTenant = {
    id: tenantId,
    name: body.companyName,
    code: body.tenantCode,
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
    seatLimit: 3,
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
  const admin = makeUser(`user-${Date.now()}`, body.adminEmail, body.adminName, null, ["COMPANY_ADMIN"], tenantId, body.password, null, false);
  users.push(admin);
  audit(admin, "TENANT_REGISTERED", "Tenant", tenantId, { tenantCode: newTenant.code, adminEmail: admin.email });
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
  const periodEnd = dateKey(addMonths(today, 1));

  tenants.splice(0, tenants.length, {
    ...tenant,
    name: "示例科技有限公司",
    code: "demo",
    updatedAt: now,
    deletedAt: null
  });
  departments.length = 0;
  projects.length = 0;
  workLogs.length = 0;
  analyses.clear();
  reports.length = 0;
  notifications.length = 0;
  billingOrders.length = 0;
  dataDeletionRequests.length = 0;
  auditLogs.length = 0;
  passwordResetTokens.clear();

  users.splice(
    0,
    users.length,
    makeUser("super", "super@example.com", "平台超管", null, ["SUPER_ADMIN"], tenant.id, PASSWORD, "13900000001", false),
    makeUser("admin", "admin@example.com", "企业管理员", null, ["COMPANY_ADMIN"], tenant.id, PASSWORD, "13900000002", false)
  );

  subscriptions.clear();
  subscriptions.set(tenant.id, {
    id: "sub-demo",
    tenantId: tenant.id,
    plan: "TRIAL",
    status: "TRIALING",
    seatLimit: 3,
    currentPeriodStart: todayKey,
    currentPeriodEnd: periodEnd,
    trialEndsAt: periodEnd,
    canceledAt: null,
    provider: "self_service",
    externalCustomerId: null,
    externalSubscriptionId: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null
  });

  return {
    ok: true,
    preservedLogin: {
      tenantCode: "demo",
      email: "admin@example.com",
      password: PASSWORD
    },
    remaining: {
      tenants: tenants.length,
      users: users.length,
      opsUsers: users.filter((item) => hasRole(item, ["SUPER_ADMIN"])).length,
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
  const found = users.find((item) => {
    const ownerTenant = tenants.find((candidate) => candidate.id === item.tenantId);
    return item.email === email && (!body.tenantCode || ownerTenant?.code === body.tenantCode);
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
  if (body.currentPassword !== (user.password ?? PASSWORD)) throw httpError(400, "当前密码不正确");
  user.password = body.newPassword;
  user.lastPasswordChangedAt = new Date().toISOString();
  audit(user, "PASSWORD_CHANGED", "User", user.id);
  return { ok: true };
}

function me(user) {
  const ownerTenant = tenants.find((item) => item.id === user.tenantId) ?? tenant;
  const dept = departments.find((item) => item.id === user.departmentId && item.tenantId === user.tenantId);
  return {
    id: user.id,
    tenantId: ownerTenant.id,
    tenantName: ownerTenant.name,
    tenantCode: ownerTenant.code,
    email: user.email,
    phone: user.phone ?? null,
    name: user.name,
    departmentId: user.departmentId,
    departmentName: dept?.name ?? null,
    roles: user.roles,
    requiresWorkReport: user.requiresWorkReport ?? true
  };
}

function getOrg(user) {
  const visibleUsers = filterUsersByAccess(user, new URL("http://localhost/?scope=company"));
  const ownerTenant = tenants.find((item) => item.id === user.tenantId) ?? tenant;
  const visibleDepartments = departments.filter((item) => item.tenantId === user.tenantId);
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
  return {
    tenant: {
      id: `tenant-${Date.now()}`,
      name: body.name,
      code: body.code
    },
    admin: {
      id: `user-${Date.now()}`,
      email: body.adminEmail,
      name: body.adminName
    }
  };
}

function createDepartment(user, body) {
  requireRole(user, ["COMPANY_ADMIN", "SUPER_ADMIN"]);
  const item = { id: `dept-${Date.now()}`, tenantId: user.tenantId, name: body.name, parentId: body.parentId ?? null };
  departments.push(item);
  return item;
}

function updateDepartment(user, id, body) {
  requireRole(user, ["COMPANY_ADMIN", "SUPER_ADMIN"]);
  const item = departments.find((dept) => dept.id === id && dept.tenantId === user.tenantId);
  if (!item) throw httpError(404, "Department not found");
  if (body.name !== undefined) item.name = body.name;
  if (body.parentId !== undefined) item.parentId = body.parentId;
  return item;
}

function createOrgUser(currentUser, body) {
  requireRole(currentUser, ["COMPANY_ADMIN", "SUPER_ADMIN"]);
  assertSeatAvailable(currentUser.tenantId);
  const email = normalizeEmail(body.email);
  const phone = normalizePhone(body.phone);
  assertContact(email, phone);
  if (users.some((item) => item.tenantId === currentUser.tenantId && (item.email === email || (phone && item.phone === phone)))) {
    throw httpError(400, "邮箱或手机号已被当前企业其他账号使用");
  }
  const item = {
    ...makeUser(
      `user-${Date.now()}`,
      email,
      body.name,
      body.departmentId ?? null,
      body.roles?.length ? body.roles : ["EMPLOYEE"],
      currentUser.tenantId,
      body.password || PASSWORD,
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
      seatLimit: 3,
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
  return {
    ...item,
    usedSeats,
    remainingSeats: Math.max(item.seatLimit - usedSeats, 0),
    isUsable: ["TRIALING", "ACTIVE"].includes(item.status) && (!item.currentPeriodEnd || item.currentPeriodEnd >= todayKey)
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
  const seatLimit = Number(body.seatLimit ?? subscriptionSummary(user.tenantId).seatLimit);
  const amountCents = planUnitPriceCents(plan, interval) * seatLimit;
  const order = {
    id: `order-${Date.now()}`,
    tenantId: user.tenantId,
    createdById: user.id,
    plan,
    interval,
    seatLimit,
    status: "PENDING",
    provider: body.provider ?? "MANUAL",
    amountCents,
    currency: "CNY",
    paymentUrl: body.provider === "MANUAL" || !body.provider ? null : "PAYMENT_PROVIDER_NOT_CONFIGURED",
    paidAt: null,
    expiresAt: addDays(new Date(), 7).toISOString(),
    payments: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null
  };
  billingOrders.unshift(order);
  audit(user, "BILLING_ORDER_CREATED", "BillingOrder", order.id, { plan, interval, seatLimit, amountCents });
  return order;
}

function confirmManualPayment(user, orderId, body) {
  requireRole(user, ["SUPER_ADMIN"]);
  const order = billingOrders.find((item) => item.id === orderId && item.tenantId === user.tenantId);
  if (!order) throw httpError(404, "Billing order not found");
  if (order.status !== "PENDING") throw httpError(400, "Billing order is not pending");
  order.status = "PAID";
  order.paidAt = new Date().toISOString();
  order.updatedAt = new Date().toISOString();
  order.payments.push({
    id: `pay-${Date.now()}`,
    tenantId: order.tenantId,
    orderId: order.id,
    provider: "MANUAL",
    status: "SUCCEEDED",
    amountCents: order.amountCents,
    currency: order.currency,
    transactionId: body.transactionId ?? null,
    paidAt: order.paidAt,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  const item = subscriptions.get(order.tenantId) ?? subscriptionSummary(order.tenantId);
  item.plan = order.plan;
  item.status = "ACTIVE";
  item.seatLimit = order.seatLimit;
  item.currentPeriodStart = todayKey;
  item.currentPeriodEnd = dateKey(addMonths(new Date(), order.interval === "YEARLY" ? 12 : 1));
  item.provider = "manual";
  item.updatedAt = new Date().toISOString();
  subscriptions.set(order.tenantId, item);
  audit(user, "BILLING_MANUAL_PAYMENT_CONFIRMED", "BillingOrder", order.id, { transactionId: body.transactionId ?? null });
  return order;
}

function planUnitPriceCents(plan, interval) {
  const monthly = { TRIAL: 0, TEAM: 3900, BUSINESS: 9900, ENTERPRISE: 29900 }[plan] ?? 3900;
  return interval === "YEARLY" ? Math.round(monthly * 10) : monthly;
}

function opsOverview(user) {
  requireRole(user, ["SUPER_ADMIN"]);
  const tenantSummaries = tenants
    .filter((item) => !item.deletedAt)
    .map((item) => ({
      id: item.id,
      name: item.name,
      code: item.code,
      createdAt: item.createdAt,
      subscription: subscriptionSummary(item.id),
      counts: {
        users: users.filter((candidate) => candidate.tenantId === item.id).length,
        departments: departments.filter((candidate) => candidate.tenantId === item.id).length,
        projects: projects.filter((candidate) => candidate.tenantId === item.id && !candidate.deletedAt).length,
        workLogs: workLogs.filter((candidate) => candidate.tenantId === item.id && !candidate.deletedAt).length,
        reports: reports.filter((candidate) => candidate.tenantId === item.id).length
      }
    }));
  return {
    developerCompany: "北京七数智联科技有限公司",
    totals: {
      tenants: tenantSummaries.length,
      accounts: users.length,
      activeAccounts: users.filter((item) => item.isActive).length,
      workLogs: workLogs.filter((item) => !item.deletedAt).length,
      reports: reports.length
    },
    tenants: tenantSummaries,
    accounts: users
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((item) => {
        const ownerTenant = tenants.find((candidate) => candidate.id === item.tenantId) ?? tenant;
        return {
          id: item.id,
          tenantId: item.tenantId,
          tenantName: ownerTenant.name,
          tenantCode: ownerTenant.code,
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

function updateOpsAccount(user, accountId, body) {
  requireRole(user, ["SUPER_ADMIN"]);
  if (user.id === accountId && body.isActive === false) throw httpError(400, "Cannot deactivate your own ops account");
  const target = users.find((item) => item.id === accountId);
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
      departments: departments.filter((item) => item.tenantId === user.tenantId),
      projects: projects.filter((item) => item.tenantId === user.tenantId && !item.deletedAt).map(projectWithOwner),
      users: tenantUsers,
      workLogs: tenantWorkLogs,
      aiAnalyses: Array.from(analyses.values()).filter((item) => item.tenantId === user.tenantId),
      reports: reports.filter((item) => item.tenantId === user.tenantId),
      notifications: notifications.filter((item) => item.tenantId === user.tenantId),
      billingOrders: billingOrders.filter((item) => item.tenantId === user.tenantId),
      auditLogs: auditLogs.filter((item) => item.tenantId === user.tenantId),
      dataDeletionRequests: dataDeletionRequests.filter((item) => item.tenantId === user.tenantId)
    };
  }
  return {
    metadata: exportMetadata("self"),
    tenant: tenants.find((item) => item.id === user.tenantId) ?? tenant,
    account: publicUser(user),
    workLogs: workLogs.filter((item) => item.tenantId === user.tenantId && item.userId === user.id).map(enrichLog),
    reports: reports.filter((item) => item.tenantId === user.tenantId && item.requesterId === user.id),
    notifications: notifications.filter((item) => item.tenantId === user.tenantId && item.userId === user.id),
    dataDeletionRequests: dataDeletionRequests.filter((item) => item.tenantId === user.tenantId && item.requesterId === user.id)
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
    departmentName: departments.find((dept) => dept.id === user.departmentId && dept.tenantId === user.tenantId)?.name ?? null
  };
}

function assertSeatAvailable(tenantId) {
  const summary = subscriptionSummary(tenantId);
  if (!summary.isUsable) throw httpError(400, "当前企业订阅不可用，请续费或联系平台管理员。");
  if (summary.usedSeats + 1 > summary.seatLimit) {
    throw httpError(400, `当前订阅席位已满：${summary.usedSeats}/${summary.seatLimit}。请升级套餐或增加席位。`);
  }
}

function updateOrgUser(user, id, body) {
  requireRole(user, ["COMPANY_ADMIN", "SUPER_ADMIN"]);
  const item = users.find((candidate) => candidate.id === id && candidate.tenantId === user.tenantId);
  if (!item) throw httpError(404, "User not found");
  if (body.isActive === true && !item.isActive) assertSeatAvailable(user.tenantId);
  const nextEmail = body.email === undefined ? item.email : normalizeEmail(body.email);
  const nextPhone = body.phone === undefined ? item.phone : normalizePhone(body.phone);
  assertContact(nextEmail, nextPhone);
  if (users.some((candidate) => candidate.tenantId === user.tenantId && candidate.id !== id && (candidate.email === nextEmail || (nextPhone && candidate.phone === nextPhone)))) {
    throw httpError(400, "邮箱或手机号已被当前企业其他账号使用");
  }
  if (body.email !== undefined) item.email = nextEmail;
  if (body.phone !== undefined) item.phone = nextPhone;
  if (body.name !== undefined) item.name = body.name;
  if (body.departmentId !== undefined) item.departmentId = body.departmentId;
  if (body.roles !== undefined) item.roles = body.roles;
  if (body.isActive !== undefined) item.isActive = body.isActive;
  if (body.requiresWorkReport !== undefined) item.requiresWorkReport = Boolean(body.requiresWorkReport);
  if (body.password) item.password = body.password;
  return orgUser(item);
}

function orgUser(item) {
  const visibleDepartments = departments.filter((dept) => dept.tenantId === item.tenantId);
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
    .filter((item) => !url.searchParams.get("projectId") || item.projectId === url.searchParams.get("projectId"))
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
  if (body.hours !== undefined) item.hours = Number(body.hours);
  item.updatedAt = new Date().toISOString();
  return enrichLog(item);
}

function deleteWorkLog(user, id) {
  const item = getRawWorkLog(user, id);
  if (item.userId !== user.id && !hasRole(user, ["COMPANY_ADMIN", "SUPER_ADMIN"])) throw httpError(403, "Cannot delete this work log");
  item.deletedAt = new Date().toISOString();
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

function calendar(user, url) {
  const month = url.searchParams.get("month") ?? todayKey.slice(0, 7);
  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  const visibleUsers = filterUsersByAccess(user, url);
  const reportUsers = visibleUsers.filter((item) => item.requiresWorkReport);
  const visibleUserIds = new Set(reportUsers.map((item) => item.id));
  const days = [];
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    const key = dateKey(cursor);
    const logs = workLogs.filter((item) => item.date === key && item.status === "SUBMITTED" && !item.deletedAt && visibleUserIds.has(item.userId));
    const filled = new Set(logs.map((item) => item.userId));
    const riskCount = logs.reduce((sum, item) => sum + ((analyses.get(item.id)?.risks?.length ?? 0)), 0);
    days.push({
      date: key,
      filledCount: filled.size,
      missingCount: Math.max(reportUsers.length - filled.size, 0),
      fillRate: reportUsers.length ? Number(((filled.size / reportUsers.length) * 100).toFixed(1)) : 0,
      riskCount
    });
  }
  return { month, scope: resolveScope(user, url), totalEmployees: reportUsers.length, days };
}

function calendarDay(user, url) {
  const date = url.searchParams.get("date") ?? todayKey;
  const visibleUsers = filterUsersByAccess(user, url).filter((item) => item.requiresWorkReport);
  const visibleUserIds = new Set(visibleUsers.map((item) => item.id));
  const logs = workLogs.filter((item) => item.date === date && item.status === "SUBMITTED" && !item.deletedAt && visibleUserIds.has(item.userId));
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
  const missingEmployees = visibleUsers.filter((item) => !logsByUser.has(item.id)).map((item) => ({
    id: item.id,
    name: item.name,
    email: item.email,
    phone: item.phone ?? null,
    departmentName: departments.find((dept) => dept.id === item.departmentId)?.name ?? null
  }));
  return {
    date,
    scope: resolveScope(user, url),
    filledEmployees,
    missingEmployees,
    stats: {
      totalEmployees: visibleUsers.length,
      filledCount: filledEmployees.length,
      missingCount: missingEmployees.length,
      fillRate: visibleUsers.length ? Number(((filledEmployees.length / visibleUsers.length) * 100).toFixed(1)) : 0,
      totalHours: logs.reduce((sum, item) => sum + Number(item.hours), 0),
      riskCount: logs.reduce((sum, item) => sum + ((analyses.get(item.id)?.risks?.length ?? 0)), 0)
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
  const start = body.date ?? `${month}-01`;
  const end = body.date ?? monthEndKey(month);
  const url = new URL("http://localhost/");
  if (body.scope) url.searchParams.set("scope", body.scope);
  if (body.departmentId) url.searchParams.set("departmentId", body.departmentId);
  const visibleLogs = filterLogsByAccess(user, url)
    .filter((item) => item.status === "SUBMITTED" && !item.deletedAt)
    .filter((item) => item.date >= start && item.date <= end)
    .map(enrichLog)
    .sort((a, b) => `${a.date}${a.createdAt}`.localeCompare(`${b.date}${b.createdAt}`));
  return {
    answer: localCalendarAnswer(body.question ?? "", visibleLogs, body.date ?? month),
    contextCount: visibleLogs.length,
    scope: resolveScope(user, url),
    period: { start, end }
  };
}

function workLogDraft(user, body) {
  requireUser(user);
  const currentDate = body.currentDate ?? todayKey;
  const text = (body.messages ?? [])
    .filter((item) => item.role === "user")
    .map((item) => item.content)
    .join("\n")
    .trim();
  const date = inferDraftDate(text, currentDate);
  const hoursMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:小时|个?工时|h|H)/);
  const hours = hoursMatch ? Math.min(Math.max(Number(hoursMatch[1]), 0), 24) : 1;
  const kind = date > currentDate || /计划|明天|后天|下周|安排/.test(text) ? "PLAN" : "DAILY";
  const title = inferDraftTitle(text);
  return {
    date,
    kind,
    title,
    content: text || "请补充工作内容。",
    hours,
    startTime: null,
    endTime: null,
    confidence: hoursMatch ? 0.88 : 0.72,
    missingFields: hoursMatch ? [] : ["hours"],
    assistantMessage: `${kind === "PLAN" ? "已整理为计划草稿" : "已整理为日报草稿"}：${date}，${hours} 小时。请确认后提交。`
  };
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
    .replace(/今天|昨天|明天|后天|计划|日报|工时|小时/g, "")
    .replace(/[，。！？、,.!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "工作填报";
  return cleaned.length > 24 ? `${cleaned.slice(0, 24)}...` : cleaned;
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

function generateReport(user, body) {
  const start = body.periodStart;
  const end = body.periodEnd;
  const isDepartment = body.type?.startsWith("DEPARTMENT");
  const targetDept = isDepartment ? (hasRole(user, ["COMPANY_ADMIN", "SUPER_ADMIN"]) ? body.departmentId : user.departmentId) : null;
  const candidates = workLogs
    .filter((item) => item.tenantId === user.tenantId && item.status === "SUBMITTED" && !item.deletedAt && item.date >= start && item.date <= end)
    .filter((item) => {
      if (!isDepartment) return item.userId === user.id;
      const owner = users.find((candidate) => candidate.id === item.userId);
      return owner?.departmentId === targetDept;
    });
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
    risks: candidates.flatMap((item) => analyses.get(item.id)?.risks ?? []),
    nextPlan: ["继续推进已提交工作中的后续事项。"],
    hours: {
      total: Number(candidates.reduce((sum, item) => sum + Number(item.hours), 0).toFixed(2)),
      byUser: Array.from(byUser.entries()).map(([userName, hours]) => ({ userName, hours: Number(hours.toFixed(2)) }))
    },
    summary: `${start} 至 ${end} 共生成 ${candidates.length} 条工作记录的汇报。`
  };
  const report = {
    id: `report-${Date.now()}`,
    tenantId: user.tenantId,
    requesterId: user.id,
    departmentId: targetDept,
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

function matchesAccount(user, account) {
  return Boolean((account.email && user.email === account.email) || (account.phone && user.phone === account.phone));
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
    aiAnalysis: analyses.get(log.id) ?? null
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

function requireUser(user) {
  if (!user) throw httpError(401, "Missing bearer token");
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
  if (!token.startsWith("local:")) return null;
  return users.find((item) => item.id === token.slice("local:".length)) ?? null;
}

function lastPath(pathname) {
  return pathname.split("/").filter(Boolean).at(-1);
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
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
