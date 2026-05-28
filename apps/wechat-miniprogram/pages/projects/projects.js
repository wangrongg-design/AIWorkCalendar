const { request } = require("../../utils/request");
const { getToken } = require("../../utils/storage");

function statusTitle(status) {
  if (status === "PAUSED") return "暂停";
  if (status === "ARCHIVED") return "已归档";
  return "进行中";
}

function dueText(endDate) {
  if (!endDate) return "无截止";
  const target = new Date(String(endDate).slice(0, 10));
  if (Number.isNaN(target.getTime())) return "无截止";
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diff = Math.ceil((target.getTime() - start.getTime()) / 86400000);
  if (diff < 0) return `已逾期 ${Math.abs(diff)} 天`;
  if (diff === 0) return "今天截止";
  return `${diff} 天后截止`;
}

function normalizeProject(project) {
  const paused = project.status === "PAUSED";
  const missingOwner = !project.owner;
  const overdue = project.endDate && dueText(project.endDate).startsWith("已逾期");
  const hasRisk = paused || missingOwner || overdue;
  return {
    ...project,
    displayName: project.code ? `${project.code} · ${project.name}` : project.name,
    statusTitle: statusTitle(project.status),
    statusTone: project.status === "ACTIVE" ? "success" : project.status === "PAUSED" ? "warning" : "neutral",
    ownerName: project.owner ? project.owner.name : "未设置负责人",
    ownerEmail: project.owner && project.owner.email ? project.owner.email : "",
    dueText: dueText(project.endDate),
    hasRisk,
    riskClass: hasRisk ? "risk" : "",
    aiRiskHint: hasRisk ? "项目需要关注，包含暂停、临期或负责人缺失。" : "项目状态整体稳定。",
    timelineText: project.startDate || project.endDate
      ? `${project.startDate ? String(project.startDate).slice(0, 10) : "未设置"} - ${project.endDate ? String(project.endDate).slice(0, 10) : "未设置"}`
      : "周期未设置"
  };
}

Page({
  data: {
    projects: [],
    filteredProjects: [],
    searchText: "",
    riskOnly: false,
    riskToggleText: "只看异常",
    riskToggleClass: "",
    emptyTitle: "暂无项目",
    emptyDesc: "项目由企业管理员在后台创建。",
    loading: false,
    aiConclusion: "当前没有进行中项目",
    aiRiskText: "项目状态会结合负责人、截止日期和状态展示风险。"
  },

  onShow() {
    if (!getToken()) {
      wx.reLaunch({ url: "/pages/login/login" });
      return;
    }
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 });
    }
    if (wx.getStorageSync("projectRiskOnly")) {
      wx.removeStorageSync("projectRiskOnly");
      this.setData({
        riskOnly: true,
        riskToggleText: "查看全部",
        riskToggleClass: "active"
      });
    }
    this.loadProjects();
  },

  onPullDownRefresh() {
    this.loadProjects().finally(() => wx.stopPullDownRefresh());
  },

  async loadProjects() {
    this.setData({ loading: true });
    try {
      const result = await request("/projects");
      const projects = (result || []).map(normalizeProject);
      this.setData({ projects }, () => {
        this.applyFilter();
        this.applyInsight(projects);
      });
    } catch (error) {
      wx.showToast({ title: error.message || "项目加载失败", icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  },

  onSearchInput(event) {
    this.setData({ searchText: event.detail.value }, () => this.applyFilter());
  },

  toggleRiskOnly() {
    const riskOnly = !this.data.riskOnly;
    this.setData({
      riskOnly,
      riskToggleText: riskOnly ? "查看全部" : "只看异常",
      riskToggleClass: riskOnly ? "active" : ""
    }, () => this.applyFilter());
  },

  applyFilter() {
    const query = this.data.searchText.trim().toLowerCase();
    const filteredProjects = this.data.projects.filter((project) => {
      if (this.data.riskOnly && !project.hasRisk) return false;
      if (!query) return true;
      return String(project.displayName || "").toLowerCase().includes(query)
        || String(project.description || "").toLowerCase().includes(query)
        || String(project.ownerName || "").toLowerCase().includes(query);
    });
    this.setData({
      filteredProjects,
      emptyTitle: this.data.projects.length ? "没有匹配项目" : "暂无项目",
      emptyDesc: this.data.projects.length ? "调整搜索词后再试。" : "项目由企业管理员在后台创建。"
    });
  },

  applyInsight(projects) {
    const active = projects.filter((item) => item.status === "ACTIVE").length;
    const risks = projects.filter((item) => item.hasRisk).length;
    this.setData({
      aiConclusion: active > 0 ? `${active} 个项目进行中` : "当前没有进行中项目",
      aiRiskText: risks > 0 ? `${risks} 个项目需要关注，包含暂停、临期或负责人缺失。` : "项目状态整体稳定，继续关注临近截止日期。"
    });
  },

  openProject(event) {
    const id = event.currentTarget.dataset.id;
    const project = this.data.projects.find((item) => item.id === id);
    if (!project) return;
    wx.setStorageSync("selectedProjectDetail", project);
    wx.navigateTo({ url: `/pages/project-detail/project-detail?id=${id}` });
  }
});
