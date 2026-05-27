const { request } = require("../../utils/request");
const { getToken, getUser } = require("../../utils/storage");
const { dateKey } = require("../../utils/date");

let chatMessageId = 0;

const INITIAL_ASSISTANT_MESSAGE = "告诉我今天做了什么、花了多久，或明天计划做什么。我会整理成日报或计划草稿。";

function chatMessage(role, content) {
  chatMessageId += 1;
  return {
    id: `${Date.now()}-${chatMessageId}`,
    role,
    content
  };
}

function draftMessages(messages) {
  return (messages || []).map((item) => ({
    role: item.role,
    content: item.content
  }));
}

Page({
  data: {
    user: {},
    chatMessages: [chatMessage("assistant", INITIAL_ASSISTANT_MESSAGE)],
    chatInput: "",
    date: dateKey(),
    title: "",
    content: "",
    hours: "1",
    projectOptions: [{ id: "", displayName: "不关联项目" }],
    projectIndex: 0,
    projectId: "",
    workLogs: [],
    todaySubmittedCount: 0,
    todayHoursText: "0",
    todayRiskCount: 0,
    todayStatusIcon: "AI",
    todayConclusion: "今天还未完成填报",
    todayRiskText: "先用一句话描述今天完成的事，AI 会整理标题、内容和工时。",
    savedDraftId: "",
    hasDraftContent: false,
    drafting: false,
    savingDraft: false,
    submitting: false
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
      hasDraftContent,
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

  onChatInput(event) {
    this.setData({ chatInput: event.detail.value });
  },

  async sendChatMessage(text) {
    const content = (typeof text === "string" ? text : this.data.chatInput).trim();
    if (!content) {
      wx.showToast({ title: "请输入填报内容", icon: "none" });
      return;
    }
    const messages = this.data.chatMessages.concat([chatMessage("user", content)]);
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
          messages: draftMessages(messages)
        }
      });
      this.setData({
        date: draft.date,
        title: draft.title,
        content: draft.content,
        hours: String(draft.hours),
        chatMessages: messages.concat([chatMessage("assistant", draft.assistantMessage)])
      });
      this.applyTodayStatus(this.data.workLogs);
      wx.showToast({ title: draft.kind === "PLAN" ? "已生成计划" : "已生成日报" });
    } catch (error) {
      wx.showToast({ title: error.message || "AI 生成失败", icon: "none" });
    } finally {
      this.setData({ drafting: false });
    }
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
    this.setData({ title: event.detail.value }, () => this.applyTodayStatus(this.data.workLogs));
  },

  onContentInput(event) {
    this.setData({ content: event.detail.value }, () => this.applyTodayStatus(this.data.workLogs));
  },

  clearForm() {
    this.setData({
      title: "",
      content: "",
      hours: "1",
      date: dateKey(),
      savedDraftId: "",
      hasDraftContent: false,
      projectIndex: 0,
      projectId: "",
      chatInput: "",
      chatMessages: [chatMessage("assistant", INITIAL_ASSISTANT_MESSAGE)]
    }, () => this.applyTodayStatus(this.data.workLogs));
  },

  validatedPayload() {
    const title = this.data.title.trim();
    const content = this.data.content.trim();
    const hours = Number(this.data.hours);
    if (!title || !content) {
      wx.showToast({ title: "请填写标题和内容", icon: "none" });
      return null;
    }
    if (!Number.isFinite(hours) || hours < 0 || hours > 24) {
      wx.showToast({ title: "工时需在 0-24 之间", icon: "none" });
      return null;
    }
    return {
      date: this.data.date,
      title,
      content,
      hours,
      projectId: this.data.projectId || undefined
    };
  },

  async upsertDraft(payload) {
    if (this.data.savedDraftId) {
      const workLog = await request(`/work-logs/${this.data.savedDraftId}`, {
        method: "PATCH",
        data: payload
      });
      return workLog;
    }
    const workLog = await request("/work-logs", {
      method: "POST",
      data: payload
    });
    this.setData({ savedDraftId: workLog.id });
    return workLog;
  },

  async saveDraft() {
    const payload = this.validatedPayload();
    if (!payload) return;
    this.setData({ savingDraft: true });
    try {
      await this.upsertDraft(payload);
      wx.showToast({ title: "草稿已保存" });
      this.loadWorkLogs();
    } catch (error) {
      wx.showToast({ title: error.message || "保存失败", icon: "none" });
    } finally {
      this.setData({ savingDraft: false });
    }
  },

  async submit() {
    const payload = this.validatedPayload();
    if (!payload) return;
    this.setData({ submitting: true });
    try {
      const workLog = await this.upsertDraft(payload);
      await request(`/work-logs/${workLog.id}/submit`, { method: "POST" });
      wx.showToast({ title: "已提交" });
      this.clearForm();
      this.loadWorkLogs();
    } catch (error) {
      wx.showToast({ title: error.message || "提交失败", icon: "none" });
    } finally {
      this.setData({ submitting: false });
    }
  }
});
