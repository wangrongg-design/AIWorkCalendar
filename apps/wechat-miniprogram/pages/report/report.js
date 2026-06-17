const { request } = require("../../utils/request");
const { getToken, getUser } = require("../../utils/storage");
const { dateKey } = require("../../utils/date");

let chatMessageId = 0;

const INITIAL_ASSISTANT_MESSAGE = "今天你完成了什么？告诉我任务、项目、风险或工时，我会整理成可提交的日报。";

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

function datePillText(key) {
  const [, month, day] = String(key || dateKey()).split("-");
  return `${Number(month || 0)}月${Number(day || 0)}日`;
}

function projectIndexForId(projectOptions, projectId) {
  return Math.max(
    0,
    (projectOptions || []).findIndex((item) => item.id === (projectId || ""))
  );
}

function projectDisplayName(projectOptions, projectIndex) {
  const project = (projectOptions || [])[projectIndex] || (projectOptions || [])[0];
  return project ? project.displayName : "不关联项目";
}

function normalizedDraftItems(draft, projectOptions, fallbackProjectId) {
  const sourceItems = Array.isArray(draft && draft.items) && draft.items.length ? draft.items : [draft || {}];
  return sourceItems.map((item, index) => {
    const projectId = item.projectId || fallbackProjectId || "";
    const projectIndex = projectIndexForId(projectOptions, projectId);
    const confidence = Number(item.confidence == null ? draft.confidence : item.confidence);
    return {
      id: `draft-${Date.now()}-${index}`,
      selected: true,
      kind: item.kind || draft.kind || "WORK_LOG",
      date: item.date || draft.date || dateKey(),
      title: item.title || "工作填报",
      content: item.content || item.title || "工作填报",
      hours: String(item.hours == null ? "1" : item.hours),
      projectId,
      projectIndex,
      projectName: projectDisplayName(projectOptions, projectIndex),
      confidenceText: Number.isFinite(confidence) ? `${Math.round(confidence * 100)}%` : "需确认",
      missingFields: Array.isArray(item.missingFields) ? item.missingFields.join("、") : ""
    };
  });
}

function createVoiceRecognitionManager() {
  if (typeof requirePlugin !== "function") {
    return null;
  }
  try {
    const plugin = requirePlugin("WechatSI");
    if (!plugin || typeof plugin.getRecordRecognitionManager !== "function") {
      return null;
    }
    return plugin.getRecordRecognitionManager();
  } catch (error) {
    return null;
  }
}

Page({
  data: {
    user: {},
    chatMessages: [chatMessage("assistant", INITIAL_ASSISTANT_MESSAGE)],
    chatInput: "",
    date: dateKey(),
    datePill: datePillText(dateKey()),
    title: "",
    content: "",
    hours: "1",
    draftItems: [],
    projectOptions: [{ id: "", displayName: "不关联项目" }],
    projectIndex: 0,
    projectId: "",
    workLogs: [],
    todaySubmittedCount: 0,
    todayHoursText: "0",
    todayRiskCount: 0,
    todayBlockerCount: 0,
    todayStatusIcon: "AI",
    todayConclusion: "今天还未完成填报",
    todayRiskText: "先用一句话描述今天完成的事，系统会整理标题、内容和工时。",
    savedDraftId: "",
    hasDraftContent: false,
    drafting: false,
    savingDraft: false,
    submitting: false,
    voiceRecognizing: false,
    voiceError: "",
    voiceBaseText: "",
    voiceSupported: true
  },

  onLoad() {
    this.setupVoiceRecognition();
  },

  onShow() {
    if (!getToken()) {
      wx.reLaunch({ url: "/pages/login/login" });
      return;
    }
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
    const prefillDate = wx.getStorageSync("reportPrefillDate");
    if (prefillDate) {
      wx.removeStorageSync("reportPrefillDate");
    }
    this.setData({
      user: getUser() || {},
      date: prefillDate || this.data.date || dateKey(),
      datePill: datePillText(prefillDate || this.data.date || dateKey())
    });
    this.loadProjects();
    this.loadWorkLogs();
  },

  onHide() {
    this.stopVoiceRecognition();
  },

  onUnload() {
    this.stopVoiceRecognition();
  },

  setupVoiceRecognition() {
    const manager = createVoiceRecognitionManager();
    if (!manager) {
      this.setData({ voiceSupported: false });
      return;
    }
    this.voiceManager = manager;
    manager.onRecognize = (result) => {
      this.applyVoiceResult(result && result.result);
    };
    manager.onStop = (result) => {
      this.applyVoiceResult(result && result.result);
      this.setData({ voiceRecognizing: false });
    };
    manager.onError = (error) => {
      const message = error && error.msg ? error.msg : "语音识别失败，请重试";
      this.setData({
        voiceRecognizing: false,
        voiceError: message
      });
      wx.showToast({ title: message, icon: "none" });
    };
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
      const draftItems = (this.data.draftItems || []).map((item) => {
        const projectIndex = projectIndexForId(projectOptions, item.projectId);
        return {
          ...item,
          projectIndex,
          projectName: projectDisplayName(projectOptions, projectIndex)
        };
      });
      this.setData({ projectOptions, projectIndex: selectedIndex, draftItems });
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

  refreshPage() {
    this.loadProjects();
    this.loadWorkLogs();
  },

  applyTodayStatus(workLogs) {
    const today = dateKey();
    const todayLogs = (workLogs || []).filter((item) => String(item.date || "").slice(0, 10) === today);
    const submitted = todayLogs.filter((item) => item.status === "SUBMITTED").length;
    const hours = todayLogs.reduce((sum, item) => sum + Number(item.hours || 0), 0);
    const riskCount = todayLogs.reduce((sum, item) => {
      const risks = item.aiAnalysis && Array.isArray(item.aiAnalysis.risks) ? item.aiAnalysis.risks.length : 0;
      return sum + risks;
    }, 0);
    const blockerCount = todayLogs.reduce((sum, item) => {
      const blockers = item.aiAnalysis && Array.isArray(item.aiAnalysis.blockers) ? item.aiAnalysis.blockers.length : 0;
      return sum + blockers;
    }, 0);
    const riskBlockerCount = riskCount + blockerCount;
    const hasDraftContent = Boolean((this.data.draftItems || []).length || this.data.title.trim() || this.data.content.trim());
    const todayHoursText = Number(hours.toFixed(1)).toString();
    this.setData({
      workLogs,
      hasDraftContent,
      todaySubmittedCount: submitted,
      todayHoursText,
      todayRiskCount: riskCount,
      todayBlockerCount: blockerCount,
      todayStatusIcon: riskBlockerCount > 0 ? "!" : "AI",
      todayConclusion: submitted > 0 ? `今天已提交 ${submitted} 条日报` : hasDraftContent ? "日报草稿已准备，等待确认提交" : "今天还未完成填报",
      todayRiskText: riskBlockerCount > 0
        ? `发现 ${riskBlockerCount} 个风险/阻塞，提交前建议补充处理动作。`
        : submitted > 0
          ? "暂无明显风险/阻塞，今日工作信号已进入团队看板。"
          : "先用一句话描述今天完成的事，系统会整理标题、内容和工时。"
    });
  },

  onChatInput(event) {
    this.setData({ chatInput: event.detail.value });
  },

  toggleVoiceInput() {
    if (this.data.voiceRecognizing) {
      this.stopVoiceRecognition();
      return;
    }
    if (!this.voiceManager) {
      this.setupVoiceRecognition();
    }
    if (!this.voiceManager) {
      this.setData({ voiceSupported: false });
      wx.showToast({ title: "语音识别插件不可用", icon: "none" });
      return;
    }
    wx.authorize({
      scope: "scope.record",
      success: () => this.startVoiceRecognition(),
      fail: () => {
        wx.showModal({
          title: "需要麦克风权限",
          content: "开启麦克风权限后，可以语音输入并自动转成日报文字。",
          confirmText: "去设置",
          success: (result) => {
            if (result.confirm) {
              wx.openSetting();
            }
          }
        });
      }
    });
  },

  startVoiceRecognition() {
    const voiceBaseText = this.data.chatInput.trim();
    this.setData({
      voiceRecognizing: true,
      voiceError: "",
      voiceBaseText
    });
    try {
      this.voiceManager.start({
        duration: 60000,
        lang: "zh_CN"
      });
    } catch (error) {
      this.setData({
        voiceRecognizing: false,
        voiceError: "语音识别启动失败，请重试"
      });
      wx.showToast({ title: "语音识别启动失败", icon: "none" });
    }
  },

  stopVoiceRecognition() {
    if (!this.voiceManager || !this.data.voiceRecognizing) {
      return;
    }
    try {
      this.voiceManager.stop();
    } catch (error) {
      this.setData({ voiceRecognizing: false });
    }
  },

  applyVoiceResult(result) {
    const transcript = String(result || "").trim();
    if (!transcript) {
      return;
    }
    const base = this.data.voiceBaseText.trim();
    this.setData({
      chatInput: base ? `${base}\n${transcript}` : transcript
    });
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
          currentDate: this.data.date || dateKey(),
          messages: draftMessages(messages)
        }
      });
      const draftItems = normalizedDraftItems(draft, this.data.projectOptions, this.data.projectId);
      const first = draftItems[0] || {};
      this.setData({
        draftItems,
        date: first.date || this.data.date,
        datePill: datePillText(first.date || this.data.date),
        title: first.title || "",
        content: first.content || "",
        hours: first.hours || "1",
        projectId: first.projectId || "",
        projectIndex: first.projectIndex || 0,
        hasDraftContent: draftItems.length > 0,
        chatMessages: messages.concat([chatMessage("assistant", draft.assistantMessage)])
      });
      this.applyTodayStatus(this.data.workLogs);
      wx.showToast({ title: draftItems.length > 1 ? `已生成 ${draftItems.length} 条草稿` : (first.kind === "PLAN" ? "已生成计划" : "已生成日报") });
    } catch (error) {
      wx.showToast({ title: error.message || "人工智能生成失败", icon: "none" });
    } finally {
      this.setData({ drafting: false });
    }
  },

  onDateChange(event) {
    this.setData({
      date: event.detail.value,
      datePill: datePillText(event.detail.value)
    });
  },

  onProjectChange(event) {
    const projectIndex = Number(event.detail.value);
    const project = this.data.projectOptions[projectIndex] || this.data.projectOptions[0];
    this.setData({
      projectIndex,
      projectId: project.id
    });
  },

  updateDraftItem(index, patch) {
    const draftItems = (this.data.draftItems || []).map((item, itemIndex) => (
      itemIndex === index ? { ...item, ...patch } : item
    ));
    const active = draftItems.find((item) => item.selected) || draftItems[0] || {};
    this.setData({
      draftItems,
      date: active.date || this.data.date,
      datePill: datePillText(active.date || this.data.date),
      title: active.title || "",
      content: active.content || "",
      hours: active.hours || "1",
      projectId: active.projectId || "",
      projectIndex: active.projectIndex || 0,
      hasDraftContent: draftItems.length > 0
    }, () => this.applyTodayStatus(this.data.workLogs));
  },

  onDraftSelectedChange(event) {
    this.updateDraftItem(Number(event.currentTarget.dataset.index), { selected: Boolean(event.detail.value) });
  },

  onDraftDateChange(event) {
    this.updateDraftItem(Number(event.currentTarget.dataset.index), { date: event.detail.value });
  },

  onDraftProjectChange(event) {
    const projectIndex = Number(event.detail.value);
    const project = this.data.projectOptions[projectIndex] || this.data.projectOptions[0];
    this.updateDraftItem(Number(event.currentTarget.dataset.index), {
      projectIndex,
      projectId: project.id,
      projectName: project.displayName
    });
  },

  onDraftTitleInput(event) {
    this.updateDraftItem(Number(event.currentTarget.dataset.index), { title: event.detail.value });
  },

  onDraftHoursInput(event) {
    this.updateDraftItem(Number(event.currentTarget.dataset.index), { hours: event.detail.value });
  },

  onDraftContentInput(event) {
    this.updateDraftItem(Number(event.currentTarget.dataset.index), { content: event.detail.value });
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
      draftItems: [],
      date: dateKey(),
      datePill: datePillText(dateKey()),
      savedDraftId: "",
      hasDraftContent: false,
      projectIndex: 0,
      projectId: "",
      chatInput: "",
      voiceError: "",
      voiceBaseText: "",
      chatMessages: [chatMessage("assistant", INITIAL_ASSISTANT_MESSAGE)]
    }, () => this.applyTodayStatus(this.data.workLogs));
  },

  validatedPayload(source) {
    const values = source || this.data;
    const title = String(values.title || "").trim();
    const content = String(values.content || "").trim();
    const hours = Number(values.hours);
    if (!title || !content) {
      wx.showToast({ title: "请填写标题和内容", icon: "none" });
      return null;
    }
    if (!Number.isFinite(hours) || hours < 0 || hours > 24) {
      wx.showToast({ title: "工时需在 0-24 之间", icon: "none" });
      return null;
    }
    return {
      date: values.date || this.data.date,
      title,
      content,
      hours,
      projectId: values.projectId || undefined
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
    const draftItem = (this.data.draftItems || []).find((item) => item.selected) || (this.data.draftItems || [])[0];
    const payload = this.validatedPayload(draftItem);
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
    const selectedDraftItems = (this.data.draftItems || []).filter((item) => item.selected);
    if ((this.data.draftItems || []).length && !selectedDraftItems.length) {
      wx.showToast({ title: "请至少确认一条草稿", icon: "none" });
      return;
    }
    const singleDraftItem = selectedDraftItems.length === 1 ? selectedDraftItems[0] : null;
    const payload = this.validatedPayload(singleDraftItem);
    if (!payload) return;
    this.setData({ submitting: true });
    try {
      if (selectedDraftItems.length > 1) {
        for (const item of selectedDraftItems) {
          const itemPayload = this.validatedPayload(item);
          if (!itemPayload) {
            this.setData({ submitting: false });
            return;
          }
          const workLog = await request("/work-logs", {
            method: "POST",
            data: itemPayload
          });
          await request(`/work-logs/${workLog.id}/submit`, { method: "POST" });
        }
      } else {
        const workLog = await this.upsertDraft(payload);
        await request(`/work-logs/${workLog.id}/submit`, { method: "POST" });
      }
      wx.showToast({ title: selectedDraftItems.length > 1 ? `已提交 ${selectedDraftItems.length} 条` : "已提交" });
      this.clearForm();
      this.loadWorkLogs();
    } catch (error) {
      wx.showToast({ title: error.message || "提交失败", icon: "none" });
    } finally {
      this.setData({ submitting: false });
    }
  }
});
