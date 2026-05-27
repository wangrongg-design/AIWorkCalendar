const { request } = require("../../utils/request");
const { getToken, getUser, clearSession } = require("../../utils/storage");
const { dateKey } = require("../../utils/date");

let speechManager = null;

const ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024;

function fileNameFromPath(path, fallback) {
  const parts = String(path || "").split(/[\\/]/);
  return parts[parts.length - 1] || fallback;
}

function mimeFromName(name, fallback) {
  const lower = String(name || "").toLowerCase();
  if (/\.(jpg|jpeg)$/.test(lower)) return "image/jpeg";
  if (/\.png$/.test(lower)) return "image/png";
  if (/\.gif$/.test(lower)) return "image/gif";
  if (/\.webp$/.test(lower)) return "image/webp";
  if (/\.pdf$/.test(lower)) return "application/pdf";
  if (/\.txt$/.test(lower)) return "text/plain";
  if (/\.csv$/.test(lower)) return "text/csv";
  if (/\.json$/.test(lower)) return "application/json";
  if (/\.(doc|docx)$/.test(lower)) return "application/msword";
  if (/\.(xls|xlsx)$/.test(lower)) return "application/vnd.ms-excel";
  return fallback || "application/octet-stream";
}

function formatFileSize(size) {
  if (size >= 1024 * 1024) {
    return `${(size / 1024 / 1024).toFixed(1)}MB`;
  }
  return `${Math.max(1, Math.round(size / 1024))}KB`;
}

function parseTimeMinutes(value) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function formatTime(minutes) {
  const normalized = ((Math.round(minutes) % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

function durationHours(startMinutes, endMinutes) {
  let diff = endMinutes - startMinutes;
  if (diff < 0) diff += 24 * 60;
  return Number((diff / 60).toFixed(2));
}

function timeFromIso(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

Page({
  data: {
    user: {},
    chatMessages: [
      {
        role: "assistant",
        content: "告诉我今天做了什么、花了多久，或明天计划做什么。我会整理成日报或计划草稿。"
      }
    ],
    chatInput: "",
    date: dateKey(),
    title: "",
    content: "",
    hours: "1",
    startTime: "",
    endTime: "",
    projectOptions: [{ id: "", displayName: "不关联项目" }],
    projectIndex: 0,
    projectId: "",
    attachments: [],
    workLogs: [],
    todaySubmittedCount: 0,
    todayHoursText: "0",
    todayRiskCount: 0,
    todayStatusIcon: "AI",
    todayConclusion: "今天还未完成填报",
    todayRiskText: "先用一句话描述今天完成的事，AI 会整理标题、内容和工时。",
    recording: false,
    drafting: false,
    submitting: false,
    voiceError: ""
  },

  onShow() {
    if (!getToken()) {
      wx.reLaunch({ url: "/pages/login/login" });
      return;
    }
    this.setData({
      user: getUser() || {},
      date: this.data.date || dateKey()
    });
    this.initSpeechManager();
    this.loadProjects();
    this.loadWorkLogs();
  },

  async loadProjects() {
    try {
      const projects = await request("/projects");
      const projectOptions = [{ id: "", displayName: "不关联项目" }].concat(
        (projects || [])
          .filter((item) => item.status === "ACTIVE")
          .map((item) => ({
            id: item.id,
            displayName: item.code ? `${item.code} · ${item.name}` : item.name
          }))
      );
      const selectedIndex = Math.max(
        0,
        projectOptions.findIndex((item) => item.id === this.data.projectId)
      );
      this.setData({ projectOptions, projectIndex: selectedIndex });
    } catch (error) {
      this.setData({ projectOptions: [{ id: "", displayName: "不关联项目" }], projectIndex: 0, projectId: "" });
    }
  },

  async loadWorkLogs() {
    try {
      const workLogs = await request("/work-logs");
      this.applyTodayStatus(workLogs || []);
    } catch (error) {
      this.applyTodayStatus([]);
    }
  },

  applyTodayStatus(workLogs) {
    const today = dateKey();
    const todayLogs = (workLogs || []).filter((item) => String(item.date || "").slice(0, 10) === today);
    const submitted = todayLogs.filter((item) => item.status === "SUBMITTED").length;
    const hours = todayLogs.reduce((sum, item) => sum + Number(item.hours || 0), 0);
    const riskCount = todayLogs.reduce((sum, item) => {
      const risks = item.aiAnalysis && Array.isArray(item.aiAnalysis.risks) ? item.aiAnalysis.risks.length : 0;
      const blockers = item.aiAnalysis && Array.isArray(item.aiAnalysis.blockers) ? item.aiAnalysis.blockers.length : 0;
      return sum + risks + blockers;
    }, 0);
    const hasDraftContent = Boolean(this.data.title.trim() || this.data.content.trim());
    const todayHoursText = Number(hours.toFixed(1)).toString();
    this.setData({
      workLogs,
      todaySubmittedCount: submitted,
      todayHoursText,
      todayRiskCount: riskCount,
      todayStatusIcon: riskCount > 0 ? "!" : "AI",
      todayConclusion: submitted > 0 ? `今天已提交 ${submitted} 条日报` : hasDraftContent ? "日报草稿已准备，等待确认提交" : "今天还未完成填报",
      todayRiskText: riskCount > 0
        ? `AI 发现 ${riskCount} 个风险或阻塞，提交前建议补充处理动作。`
        : submitted > 0
          ? "暂无明显风险，今日工作信号已进入团队看板。"
          : "先用一句话描述今天完成的事，AI 会整理标题、内容和工时。"
    });
  },

  initSpeechManager() {
    if (speechManager) return;
    try {
      const plugin = requirePlugin("WechatSI");
      speechManager = plugin.getRecordRecognitionManager();
      speechManager.onStart = () => {
        this.setData({ recording: true, voiceError: "" });
      };
      speechManager.onRecognize = (result) => {
        if (result && result.result) {
          this.applySpeechText(result.result, false);
        }
      };
      speechManager.onStop = (result) => {
        if (result && result.result) {
          this.applySpeechText(result.result, true);
        }
        this.setData({ recording: false });
      };
      speechManager.onError = (error) => {
        this.setData({
          recording: false,
          voiceError: error && error.msg ? error.msg : "语音识别失败，请检查录音权限或改为手动输入。"
        });
      };
    } catch (error) {
      this.setData({ voiceError: "未加载微信同声传译插件，请在微信开发者工具中刷新或检查 app.json 插件配置。" });
    }
  },

  applySpeechText(text, finalResult) {
    const trimmed = (text || "").trim();
    if (!trimmed) return;
    this.setData({ chatInput: trimmed });
    if (finalResult) {
      this.sendChatMessage(trimmed);
    }
  },

  onChatInput(event) {
    this.setData({ chatInput: event.detail.value });
  },

  async sendChatMessage(text) {
    const content = (typeof text === "string" ? text : this.data.chatInput).trim();
    if (!content) {
      wx.showToast({ title: "请输入填报内容", icon: "none" });
      return;
    }
    const messages = this.data.chatMessages.concat([{ role: "user", content }]);
    this.setData({
      chatMessages: messages,
      chatInput: "",
      drafting: true
    });
    try {
      const draft = await request("/ai/work-log-draft", {
        method: "POST",
        data: {
          currentDate: dateKey(),
          messages
        }
      });
      this.setData({
        date: draft.date,
        title: draft.title,
        content: draft.content,
        hours: String(draft.hours),
        startTime: timeFromIso(draft.startTime),
        endTime: timeFromIso(draft.endTime),
        chatMessages: messages.concat([{ role: "assistant", content: draft.assistantMessage }])
      });
      this.applyTodayStatus(this.data.workLogs);
      wx.showToast({ title: draft.kind === "PLAN" ? "已生成计划" : "已生成日报" });
    } catch (error) {
      wx.showToast({ title: error.message || "AI 生成失败", icon: "none" });
    } finally {
      this.setData({ drafting: false });
    }
  },

  toggleRecord() {
    if (!speechManager) {
      this.initSpeechManager();
      if (!speechManager) return;
    }
    if (this.data.recording) {
      speechManager.stop();
      return;
    }
    wx.authorize({
      scope: "scope.record",
      success: () => {
        speechManager.start({
          duration: 60000,
          lang: "zh_CN"
        });
      },
      fail: () => {
        wx.showModal({
          title: "需要录音权限",
          content: "开启录音权限后才能使用语音识别快速填报。",
          confirmText: "去设置",
          success(result) {
            if (result.confirm) wx.openSetting();
          }
        });
      }
    });
  },

  onDateChange(event) {
    this.setData({ date: event.detail.value });
  },

  onProjectChange(event) {
    const projectIndex = Number(event.detail.value);
    const project = this.data.projectOptions[projectIndex] || this.data.projectOptions[0];
    this.setData({
      projectIndex,
      projectId: project.id
    });
  },

  onHoursInput(event) {
    this.setData({ hours: event.detail.value }, () => this.syncTiming("hours"));
  },

  onStartTimeChange(event) {
    this.setData({ startTime: event.detail.value }, () => this.syncTiming("startTime"));
  },

  onEndTimeChange(event) {
    this.setData({ endTime: event.detail.value }, () => this.syncTiming("endTime"));
  },

  syncTiming(changed) {
    const startMinutes = parseTimeMinutes(this.data.startTime);
    const endMinutes = parseTimeMinutes(this.data.endTime);
    const hours = Number(this.data.hours);
    const hasHours = Number.isFinite(hours) && hours >= 0 && hours <= 24;
    const patch = {};

    if ((changed === "startTime" || changed === "endTime") && startMinutes !== null && endMinutes !== null) {
      patch.hours = String(durationHours(startMinutes, endMinutes));
    } else if (changed === "startTime" && startMinutes !== null && hasHours && !this.data.endTime) {
      patch.endTime = formatTime(startMinutes + hours * 60);
    } else if (changed === "endTime" && endMinutes !== null && hasHours && !this.data.startTime) {
      patch.startTime = formatTime(endMinutes - hours * 60);
    } else if (changed === "hours" && hasHours) {
      if (startMinutes !== null) {
        patch.endTime = formatTime(startMinutes + hours * 60);
      } else if (endMinutes !== null) {
        patch.startTime = formatTime(endMinutes - hours * 60);
      }
    }

    if (Object.keys(patch).length) {
      this.setData(patch);
    }
  },

  onTitleInput(event) {
    this.setData({ title: event.detail.value }, () => this.applyTodayStatus(this.data.workLogs));
  },

  onContentInput(event) {
    this.setData({ content: event.detail.value }, () => this.applyTodayStatus(this.data.workLogs));
  },

  choosePhotos() {
    wx.chooseMedia({
      count: Math.max(1, 9 - this.data.attachments.length),
      mediaType: ["image"],
      sourceType: ["album", "camera"],
      success: (res) => {
        const items = (res.tempFiles || [])
          .filter((item) => this.acceptAttachmentSize(item.size))
          .map((item) => {
            const path = item.tempFilePath || item.path;
            const name = fileNameFromPath(path, `photo-${Date.now()}.jpg`);
            return {
              id: `${Date.now()}-${Math.random()}`,
              name,
              path,
              size: item.size || 0,
              displaySize: formatFileSize(item.size || 0),
              mimeType: mimeFromName(name, "image/jpeg"),
              kind: "IMAGE",
              kindText: "图片"
            };
          });
        this.setData({ attachments: this.data.attachments.concat(items).slice(0, 9) });
      }
    });
  },

  chooseFiles() {
    if (!wx.chooseMessageFile) {
      wx.showToast({ title: "当前微信版本不支持选择文件", icon: "none" });
      return;
    }
    wx.chooseMessageFile({
      count: Math.max(1, 9 - this.data.attachments.length),
      type: "file",
      success: (res) => {
        const items = (res.tempFiles || [])
          .filter((item) => this.acceptAttachmentSize(item.size))
          .map((item) => ({
            id: `${Date.now()}-${Math.random()}`,
            name: item.name || fileNameFromPath(item.path, "attachment"),
            path: item.path,
            size: item.size || 0,
            displaySize: formatFileSize(item.size || 0),
            mimeType: mimeFromName(item.name || item.path),
            kind: "FILE",
            kindText: "文件"
          }));
        this.setData({ attachments: this.data.attachments.concat(items).slice(0, 9) });
      }
    });
  },

  acceptAttachmentSize(size) {
    if (size > ATTACHMENT_MAX_BYTES) {
      wx.showToast({ title: "单个附件不能超过 8MB", icon: "none" });
      return false;
    }
    return true;
  },

  removeAttachment(event) {
    const id = event.currentTarget.dataset.id;
    this.setData({
      attachments: this.data.attachments.filter((item) => item.id !== id)
    });
  },

  readFileBase64(path) {
    return new Promise((resolve, reject) => {
      wx.getFileSystemManager().readFile({
        filePath: path,
        encoding: "base64",
        success: (res) => resolve(res.data),
        fail: (error) => reject(new Error(error.errMsg || "附件读取失败"))
      });
    });
  },

  async uploadAttachments(workLogId) {
    for (const item of this.data.attachments) {
      await request(`/work-logs/${workLogId}/attachments`, {
        method: "POST",
        data: {
          fileName: item.name,
          mimeType: item.mimeType,
          fileSize: item.size,
          contentBase64: await this.readFileBase64(item.path)
        }
      });
    }
  },

  clearForm() {
    this.setData({
      title: "",
      content: "",
      hours: "1",
      startTime: "",
      endTime: "",
      date: dateKey(),
      projectIndex: 0,
      projectId: "",
      attachments: [],
      chatInput: "",
      chatMessages: [
        {
          role: "assistant",
          content: "告诉我今天做了什么、花了多久，或明天计划做什么。我会整理成日报或计划草稿。"
        }
      ]
    }, () => this.applyTodayStatus(this.data.workLogs));
  },

  async submit() {
    const title = this.data.title.trim();
    const content = this.data.content.trim();
    const hours = Number(this.data.hours);
    if (!title || !content) {
      wx.showToast({ title: "请填写标题和内容", icon: "none" });
      return;
    }
    if (!Number.isFinite(hours) || hours < 0 || hours > 24) {
      wx.showToast({ title: "工时需在 0-24 之间", icon: "none" });
      return;
    }
    this.setData({ submitting: true });
    try {
      const workLog = await request("/work-logs", {
        method: "POST",
        data: {
          date: this.data.date,
          title,
          content,
          hours,
          startTime: this.data.startTime ? this.dateTimeIso(this.data.startTime) : undefined,
          endTime: this.data.endTime ? this.dateTimeIso(this.data.endTime) : undefined,
          projectId: this.data.projectId || undefined
        }
      });
      await this.uploadAttachments(workLog.id);
      await request(`/work-logs/${workLog.id}/submit`, { method: "POST" });
      wx.showToast({ title: "已提交" });
      this.clearForm();
      this.loadWorkLogs();
    } catch (error) {
      wx.showToast({ title: error.message || "提交失败", icon: "none" });
    } finally {
      this.setData({ submitting: false });
    }
  },

  logout() {
    clearSession();
    wx.reLaunch({ url: "/pages/login/login" });
  },

  dateTimeIso(time) {
    return new Date(`${this.data.date}T${time}:00`).toISOString();
  }
});
