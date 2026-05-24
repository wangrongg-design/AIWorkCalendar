const { request } = require("../../utils/request");
const { getToken } = require("../../utils/storage");

Page({
  data: {
    date: "",
    scope: "self",
    scopeText: "只看自己",
    stats: {},
    filledEmployees: [],
    missingEmployees: [],
    hasFilled: false,
    hasMissing: false,
    loading: false
  },

  onLoad(options) {
    this.setData({
      date: options.date,
      scope: options.scope || "self",
      scopeText: this.scopeText(options.scope || "self")
    });
    this.loadDetail();
  },

  async loadDetail() {
    if (!getToken()) {
      wx.reLaunch({ url: "/pages/login/login" });
      return;
    }
    this.setData({ loading: true });
    try {
      const result = await request(`/analytics/calendar/day?date=${this.data.date}&scope=${this.data.scope}`);
      const filledEmployees = (result.filledEmployees || []).map((employee) => ({
        ...employee,
        logs: (employee.logs || []).map((log) => ({
          ...log,
          projectName: log.project ? (log.project.code ? `${log.project.code} · ${log.project.name}` : log.project.name) : "",
          aiSummary: log.aiAnalysis && log.aiAnalysis.summary ? log.aiAnalysis.summary : "",
          riskText: log.aiAnalysis && Array.isArray(log.aiAnalysis.risks) ? log.aiAnalysis.risks.join("；") : ""
        }))
      }));
      const missingEmployees = result.missingEmployees || [];
      this.setData({
        stats: result.stats || {},
        filledEmployees,
        missingEmployees,
        hasFilled: filledEmployees.length > 0,
        hasMissing: missingEmployees.length > 0
      });
    } catch (error) {
      wx.showToast({ title: error.message || "详情加载失败", icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  },

  scopeText(scope) {
    if (scope === "company") return "全公司";
    if (scope === "department") return "本部门";
    return "只看自己";
  }
});
