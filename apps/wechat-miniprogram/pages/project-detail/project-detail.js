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
    statusTitle: project.statusTitle || statusTitle(project.status),
    statusTone: project.statusTone || (project.status === "ACTIVE" ? "success" : project.status === "PAUSED" ? "warning" : "neutral"),
    ownerName: project.ownerName || (project.owner ? project.owner.name : "未设置负责人"),
    ownerEmail: project.ownerEmail || (project.owner && project.owner.email ? project.owner.email : ""),
    dueText: project.dueText || dueText(project.endDate),
    riskClass: project.riskClass || (hasRisk ? "risk" : ""),
    aiRiskHint: project.aiRiskHint || (hasRisk ? "项目需要关注，包含暂停、临期或负责人缺失。" : "项目状态整体稳定。"),
    startText: project.startDate ? String(project.startDate).slice(0, 10) : "未设置",
    endText: project.endDate ? String(project.endDate).slice(0, 10) : "未设置",
    timelineText: project.timelineText || (project.startDate || project.endDate
      ? `${project.startDate ? String(project.startDate).slice(0, 10) : "未设置"} - ${project.endDate ? String(project.endDate).slice(0, 10) : "未设置"}`
      : "周期未设置")
  };
}

Page({
  data: {
    id: "",
    project: null,
    loading: false
  },

  onLoad(options) {
    const id = options.id || "";
    const cachedProject = wx.getStorageSync("selectedProjectDetail");
    this.setData({
      id,
      project: cachedProject && (!id || cachedProject.id === id) ? normalizeProject(cachedProject) : null
    });
    this.loadProject();
  },

  async loadProject() {
    if (!getToken()) {
      wx.reLaunch({ url: "/pages/login/login" });
      return;
    }
    if (!this.data.id) {
      if (!this.data.project) {
        wx.showToast({ title: "项目不存在", icon: "none" });
      }
      return;
    }
    this.setData({ loading: true });
    try {
      const projects = await request("/projects");
      const project = (projects || []).find((item) => item.id === this.data.id);
      if (!project) {
        wx.showToast({ title: "项目不存在", icon: "none" });
        return;
      }
      const normalizedProject = normalizeProject(project);
      this.setData({ project: normalizedProject });
      wx.setStorageSync("selectedProjectDetail", normalizedProject);
    } catch (error) {
      if (!this.data.project) {
        wx.showToast({ title: error.message || "项目加载失败", icon: "none" });
      }
    } finally {
      this.setData({ loading: false });
    }
  }
});
