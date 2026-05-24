const { request } = require("../../utils/request");
const { getToken, getUser, clearSession } = require("../../utils/storage");
const { dateKey } = require("../../utils/date");

let speechManager = null;

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
    projectOptions: [{ id: "", displayName: "不关联项目" }],
    projectIndex: 0,
    projectId: "",
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
        chatMessages: messages.concat([{ role: "assistant", content: draft.assistantMessage }])
      });
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
    this.setData({ hours: event.detail.value });
  },

  onTitleInput(event) {
    this.setData({ title: event.detail.value });
  },

  onContentInput(event) {
    this.setData({ content: event.detail.value });
  },

  clearForm() {
    this.setData({
      title: "",
      content: "",
      hours: "1",
      date: dateKey(),
      projectIndex: 0,
      projectId: "",
      chatInput: "",
      chatMessages: [
        {
          role: "assistant",
          content: "告诉我今天做了什么、花了多久，或明天计划做什么。我会整理成日报或计划草稿。"
        }
      ]
    });
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
          projectId: this.data.projectId || undefined
        }
      });
      await request(`/work-logs/${workLog.id}/submit`, { method: "POST" });
      wx.showToast({ title: "已提交" });
      this.clearForm();
    } catch (error) {
      wx.showToast({ title: error.message || "提交失败", icon: "none" });
    } finally {
      this.setData({ submitting: false });
    }
  },

  logout() {
    clearSession();
    wx.reLaunch({ url: "/pages/login/login" });
  }
});
