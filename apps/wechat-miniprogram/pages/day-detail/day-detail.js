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
    aiInsightTitle: "今日洞察",
    aiInsightText: "日期详情会展示填报、缺填、风险/阻塞和关联日报。",
    aiInsightTone: "",
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
      const rawStats = result.stats || {};
      const stats = {
        ...rawStats,
        riskBlockerCount: (rawStats.riskCount || 0) + (rawStats.blockerCount || 0)
      };
      const aiInsight = this.buildInsight(stats, filledEmployees, missingEmployees);
      this.setData({
        stats,
        filledEmployees,
        missingEmployees,
        hasFilled: filledEmployees.length > 0,
        hasMissing: missingEmployees.length > 0,
        ...aiInsight
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
  },

  buildInsight(stats, filledEmployees, missingEmployees) {
    const riskBlockerCount = (stats.riskCount || 0) + (stats.blockerCount || 0);
    if (riskBlockerCount > 0) {
      return {
        aiInsightTitle: `${riskBlockerCount} 条风险/阻塞需要关注`,
        aiInsightText: "建议优先查看相关记录，确认阻塞来源、负责人和后续动作。",
        aiInsightTone: "risk"
      };
    }
    if ((stats.missingCount || missingEmployees.length || 0) > 0) {
      return {
        aiInsightTitle: `${stats.missingCount || missingEmployees.length} 人未填报`,
        aiInsightText: "缺填会影响团队状态判断，建议提醒成员补齐日报或计划。",
        aiInsightTone: "warning"
      };
    }
    if (filledEmployees.length > 0) {
      return {
        aiInsightTitle: "当天填报已形成团队信号",
        aiInsightText: `共 ${stats.filledCount || filledEmployees.length} 人提交，累计 ${stats.totalHours || 0} 小时。`,
        aiInsightTone: ""
      };
    }
    return {
      aiInsightTitle: "今天还没有团队成员提交日报",
      aiInsightText: "提醒员工填写后，会生成团队观察和风险/阻塞提示。",
      aiInsightTone: "warning"
    };
  }
});
