const { request, apiBaseUrl } = require("../../utils/request");
const { getToken } = require("../../utils/storage");

function formatHours(value) {
  const number = Number(value || 0);
  return Number(number.toFixed(1)).toString();
}

function normalizeAttachment(item) {
  const size = Number(item.fileSize || 0);
  return {
    ...item,
    displaySize: size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(size / 1024))}KB`,
    isImage: String(item.mimeType || "").startsWith("image/"),
    kindText: String(item.mimeType || "").startsWith("image/") ? "图片" : "文件"
  };
}

function normalizeLog(log) {
  const analysis = log.aiAnalysis || {};
  const risks = Array.isArray(analysis.risks) ? analysis.risks : [];
  const blockers = Array.isArray(analysis.blockers) ? analysis.blockers : [];
  const achievements = Array.isArray(analysis.achievements) ? analysis.achievements : [];
  const keywords = Array.isArray(analysis.keywords) ? analysis.keywords : [];
  return {
    ...log,
    dateText: String(log.date || "").slice(0, 10),
    hoursText: formatHours(log.hours),
    statusTitle: log.status === "SUBMITTED" ? "已提交" : "草稿",
    projectName: log.project ? (log.project.code ? `${log.project.code} · ${log.project.name}` : log.project.name) : "",
    userName: log.user ? log.user.name : "",
    departmentName: log.user && log.user.department ? log.user.department.name : "",
    aiSummary: analysis.summary || "",
    risks,
    blockers,
    achievements,
    keywords,
    hasAnalysis: Boolean(analysis.summary || risks.length || blockers.length || achievements.length || keywords.length),
    attachments: (log.attachments || []).map(normalizeAttachment)
  };
}

Page({
  data: {
    id: "",
    log: null,
    loading: false
  },

  onLoad(options) {
    this.setData({ id: options.id || "" });
    this.loadLog();
  },

  async loadLog() {
    if (!getToken()) {
      wx.reLaunch({ url: "/pages/login/login" });
      return;
    }
    if (!this.data.id) return;
    this.setData({ loading: true });
    try {
      const log = await request(`/work-logs/${this.data.id}`);
      this.setData({ log: normalizeLog(log) });
    } catch (error) {
      wx.showToast({ title: error.message || "详情加载失败", icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  },

  openAttachment(event) {
    const attachmentId = event.currentTarget.dataset.id;
    const attachment = (this.data.log.attachments || []).find((item) => item.id === attachmentId);
    if (!attachment) return;
    const url = `${apiBaseUrl()}/work-logs/${this.data.id}/attachments/${attachment.id}/download`;
    wx.downloadFile({
      url,
      header: {
        Authorization: `Bearer ${getToken()}`
      },
      success: (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          wx.showToast({ title: "附件下载失败", icon: "none" });
          return;
        }
        if (attachment.isImage) {
          wx.previewImage({ urls: [res.tempFilePath], current: res.tempFilePath });
          return;
        }
        wx.openDocument({
          filePath: res.tempFilePath,
          showMenu: true,
          fail: () => wx.showToast({ title: "当前文件暂不支持预览", icon: "none" })
        });
      },
      fail: () => wx.showToast({ title: "附件下载失败", icon: "none" })
    });
  }
});
