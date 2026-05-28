const { request } = require("../../utils/request");
const { getToken, getUser, clearSession } = require("../../utils/storage");
const { dateKey } = require("../../utils/date");
const config = require("../../app.config");

function roleTitle(role) {
  if (role === "SUPER_ADMIN") return "平台超管";
  if (role === "COMPANY_ADMIN") return "企业管理员";
  if (role === "DEPARTMENT_MANAGER") return "部门经理";
  return "员工";
}

function formatHours(value) {
  const number = Number(value || 0);
  return Number(number.toFixed(1)).toString();
}

function riskCount(log) {
  const risks = log.aiAnalysis && Array.isArray(log.aiAnalysis.risks) ? log.aiAnalysis.risks.length : 0;
  const blockers = log.aiAnalysis && Array.isArray(log.aiAnalysis.blockers) ? log.aiAnalysis.blockers.length : 0;
  return risks + blockers;
}

Page({
  data: {
    user: {},
    departmentText: "未分配部门",
    emailText: "-",
    rolesText: "",
    apiBaseURL: config.apiBaseUrl,
    todayCount: 0,
    todayHours: "0",
    todayRiskCount: 0,
    weeklyHours: "0",
    profileConclusion: "今天还没有工作摘要",
    profileRiskText: "连续填报后，这里会形成个人节奏、风险和效率画像。",
    loading: false
  },

  onShow() {
    if (!getToken()) {
      wx.reLaunch({ url: "/pages/login/login" });
      return;
    }
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 4 });
    }
    const user = getUser() || {};
    this.setData({
      user,
      departmentText: user.departmentName || "未分配部门",
      emailText: user.email || "-",
      rolesText: Array.isArray(user.roles) ? user.roles.map(roleTitle).join("、") : ""
    });
    this.loadProfileStats();
  },

  async loadProfileStats() {
    this.setData({ loading: true });
    try {
      const logs = await request("/work-logs");
      this.applyStats(logs || []);
    } catch (error) {
      this.applyStats([]);
    } finally {
      this.setData({ loading: false });
    }
  },

  applyStats(logs) {
    const today = dateKey();
    const todayLogs = logs.filter((item) => String(item.date || "").slice(0, 10) === today);
    const todayHours = todayLogs.reduce((sum, item) => sum + Number(item.hours || 0), 0);
    const todayRiskCount = todayLogs.reduce((sum, item) => sum + riskCount(item), 0);
    const now = new Date(`${today}T00:00:00`);
    const weeklyHours = logs.reduce((sum, item) => {
      const date = new Date(`${String(item.date || "").slice(0, 10)}T00:00:00`);
      const diff = Math.round((now.getTime() - date.getTime()) / 86400000);
      return diff >= 0 && diff <= 6 ? sum + Number(item.hours || 0) : sum;
    }, 0);
    this.setData({
      todayCount: todayLogs.length,
      todayHours: formatHours(todayHours),
      todayRiskCount,
      weeklyHours: formatHours(weeklyHours),
      profileConclusion: todayLogs.length ? `今日 ${todayLogs.length} 条记录，${formatHours(todayHours)} 小时` : "今天还没有工作摘要",
      profileRiskText: todayRiskCount > 0
        ? `AI 发现 ${todayRiskCount} 个风险或阻塞，建议回到项目页确认影响范围。`
        : weeklyHours > 0
          ? `近 7 日累计 ${formatHours(weeklyHours)} 小时，工作画像会随持续填报更准确。`
          : "连续填报后，这里会形成个人节奏、风险和效率画像。"
    });
  },

  logout() {
    clearSession();
    wx.reLaunch({ url: "/pages/login/login" });
  }
});
