const API_URL = process.env.API_URL ?? "http://localhost:3001";

async function request(path, options = {}, token) {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${options.method ?? "GET"} ${path} failed ${response.status}: ${body}`);
  }
  return response.status === 204 ? null : response.json();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

const login = await request("/auth/login", {
  method: "POST",
  body: JSON.stringify({
    tenantCode: "demo",
    email: "admin@example.com",
    password: "Passw0rd!"
  })
});

const token = login.accessToken;
console.log("login ok:", login.user.email);

const org = await request("/org", {}, token);
console.log("org ok:", org.tenant.name, `${org.users.length} users`);

const projects = await request("/projects", {}, token);
console.log("projects ok:", `${projects.length} projects`);

const workLog = await request(
  "/work-logs",
  {
    method: "POST",
    body: JSON.stringify({
      date: today(),
      title: `Smoke test ${Date.now()}`,
      content: "验证登录、填报、提交、日历和报告生成闭环。风险是本地环境可能未配置 OpenAI Key。",
      hours: 1.5,
      projectId: projects[0]?.id
    })
  },
  token
);
console.log("work log created:", workLog.id);

await request(`/work-logs/${workLog.id}/submit`, { method: "POST" }, token);
console.log("work log submitted");

const month = today().slice(0, 7);
const calendar = await request(`/analytics/calendar?month=${month}&scope=company`, {}, token);
if (!calendar.days?.length) throw new Error("calendar returned no days");
console.log("calendar ok:", calendar.days.find((day) => day.date === today()));

const report = await request(
  "/reports/generate",
  {
    method: "POST",
    body: JSON.stringify({
      type: "PERSONAL_DAILY",
      periodStart: today(),
      periodEnd: today()
    })
  },
  token
);
console.log("report task created:", report.id, report.status);

const opsLogin = await request("/auth/login", {
  method: "POST",
  body: JSON.stringify({
    tenantCode: "demo",
    email: "super@example.com",
    password: "Passw0rd!"
  })
});
const opsOverview = await request("/ops/overview", {}, opsLogin.accessToken);
if (!opsOverview.totals?.tenants) throw new Error("ops overview returned no tenants");
console.log("ops overview ok:", opsOverview.developerCompany, `${opsOverview.totals.tenants} tenants`);

console.log("smoke ok");
