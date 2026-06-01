const { request } = require("../../utils/request");
const { getToken } = require("../../utils/storage");

const filters = [
  { value: "all", label: "全部" },
  { value: "draft", label: "草稿" },
  { value: "submitted", label: "已提交" },
  { value: "risk", label: "有风险" }
];

function statusTitle(status) {
  return status === "SUBMITTED" ? "已提交" : "草稿";
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

function normalizeLog(log) {
  const projectName = log.project ? (log.project.code ? `${log.project.code} · ${log.project.name}` : log.project.name) : "";
  const hasRisk = riskCount(log) > 0;
  return {
    ...log,
    dateText: String(log.date || "").slice(0, 10),
    hoursText: formatHours(log.hours),
    statusTitle: statusTitle(log.status),
    statusTone: log.status === "SUBMITTED" ? "success" : "neutral",
    projectName,
    hasRisk,
    riskHint: hasRisk ? "AI 发现风险或阻塞" : "",
    contentPreview: String(log.content || "").slice(0, 72)
  };
}

Page({
  data: {
    filters,
    filterIndex: 0,
    searchText: "",
    logs: [],
    filteredLogs: [],
    operatingId: "",
    loading: false,
    emptyTitle: "暂无填报记录",
    emptyDesc: "提交日报后会显示在这里。"
  },

  onShow() {
    if (!getToken()) {
      wx.reLaunch({ url: "/pages/login/login" });
      return;
    }
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
    this.loadLogs();
  },

  onPullDownRefresh() {
    this.loadLogs().finally(() => wx.stopPullDownRefresh());
  },

  async loadLogs() {
    this.setData({ loading: true });
    try {
      const result = await request("/work-logs");
      const logs = (result || []).map(normalizeLog);
      this.setData({ logs }, () => {
        this.applyFilter();
      });
    } catch (error) {
      wx.showToast({ title: error.message || "记录加载失败", icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  },

  onSearchInput(event) {
    this.setData({ searchText: event.detail.value }, () => this.applyFilter());
  },

  onFilterTap(event) {
    const filterIndex = Number(event.currentTarget.dataset.index);
    if (!Number.isFinite(filterIndex)) return;
    this.setData({ filterIndex }, () => this.applyFilter());
  },

  applyFilter() {
    const filter = filters[this.data.filterIndex].value;
    const query = this.data.searchText.trim().toLowerCase();
    const filteredLogs = this.data.logs.filter((log) => {
      const statusMatched = filter === "all"
        || (filter === "draft" && log.status === "DRAFT")
        || (filter === "submitted" && log.status === "SUBMITTED")
        || (filter === "risk" && log.hasRisk);
      if (!statusMatched) return false;
      if (!query) return true;
      return String(log.title || "").toLowerCase().includes(query)
        || String(log.content || "").toLowerCase().includes(query)
        || String(log.projectName || "").toLowerCase().includes(query);
    });
    this.setData({
      filteredLogs,
      emptyTitle: this.data.logs.length ? "没有匹配结果" : "暂无填报记录",
      emptyDesc: this.data.logs.length ? "调整搜索词或筛选条件后再试。" : "提交日报后会显示在这里。"
    });
  },

  openLog(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/work-log-detail/work-log-detail?id=${id}` });
  },

  async submitLog(event) {
    const id = event.currentTarget.dataset.id;
    if (!id || this.data.operatingId) return;
    this.setData({ operatingId: id });
    try {
      await request(`/work-logs/${id}/submit`, { method: "POST" });
      wx.showToast({ title: "已提交" });
      this.loadLogs();
    } catch (error) {
      wx.showToast({ title: error.message || "提交失败", icon: "none" });
    } finally {
      this.setData({ operatingId: "" });
    }
  },

  deleteLog(event) {
    const id = event.currentTarget.dataset.id;
    if (!id || this.data.operatingId) return;
    wx.showModal({
      title: "删除记录",
      content: "删除后无法恢复，确认删除这条填报记录？",
      confirmText: "删除",
      confirmColor: "#EE3B2B",
      success: async (result) => {
        if (!result.confirm) return;
        this.setData({ operatingId: id });
        try {
          await request(`/work-logs/${id}`, { method: "DELETE" });
          wx.showToast({ title: "已删除" });
          this.loadLogs();
        } catch (error) {
          wx.showToast({ title: error.message || "删除失败", icon: "none" });
        } finally {
          this.setData({ operatingId: "" });
        }
      }
    });
  }
});
