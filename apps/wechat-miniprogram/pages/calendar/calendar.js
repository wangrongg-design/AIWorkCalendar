const { request } = require("../../utils/request");
const { getToken, getUser } = require("../../utils/storage");
const { dateKey, monthKey, monthTitle } = require("../../utils/date");

const HOME_MODES = {
  team: { value: "team", label: "团队" },
  mine: { value: "mine", label: "我的" }
};

function pad(value) {
  return String(value).padStart(2, "0");
}

function dateFromKey(key) {
  const [year, month, day] = String(key || "").split("-").map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day);
}

function addDays(date, diff) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + diff);
  return next;
}

function startOfWeek(date) {
  const diffFromMonday = (date.getDay() + 6) % 7;
  return addDays(date, -diffFromMonday);
}

function weekDates(anchorKey) {
  const start = startOfWeek(dateFromKey(anchorKey));
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

function keyFromDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function weekdayText(date) {
  return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()];
}

function shortDateText(date) {
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function weekRangeTitle(anchorKey) {
  const dates = weekDates(anchorKey);
  return `${shortDateText(dates[0])} - ${shortDateText(dates[6])}`;
}

function roleTeamScope(user) {
  const roles = user && Array.isArray(user.roles) ? user.roles : [];
  if (roles.includes("COMPANY_ADMIN") || roles.includes("SUPER_ADMIN")) return "company";
  if (roles.includes("DEPARTMENT_MANAGER")) return "department";
  return "self";
}

function riskCount(log) {
  const risks = log.aiAnalysis && Array.isArray(log.aiAnalysis.risks) ? log.aiAnalysis.risks.length : 0;
  const blockers = log.aiAnalysis && Array.isArray(log.aiAnalysis.blockers) ? log.aiAnalysis.blockers.length : 0;
  return risks + blockers;
}

function formatHours(value) {
  const number = Number(value || 0);
  return Number(number.toFixed(1)).toString();
}

function logStatsByDate(logs) {
  return (logs || []).reduce((map, log) => {
    const key = String(log.date || "").slice(0, 10);
    if (!key) return map;
    const current = map[key] || { count: 0, submitted: 0, hours: 0, riskCount: 0 };
    current.count += 1;
    current.submitted += log.status === "SUBMITTED" ? 1 : 0;
    current.hours += Number(log.hours || 0);
    current.riskCount += riskCount(log);
    map[key] = current;
    return map;
  }, {});
}

function normalizeRecentLog(log) {
  const risk = riskCount(log);
  return {
    id: log.id,
    title: log.title || "未命名日报",
    meta: `${String(log.date || "").slice(0, 10)} · ${formatHours(log.hours)}h`,
    statusTitle: risk > 0 ? "风险" : log.status === "SUBMITTED" ? "已提交" : "草稿",
    statusTone: risk > 0 ? "risk" : log.status === "SUBMITTED" ? "success" : "neutral"
  };
}

function dayStatus(day, isManager) {
  if (day.riskCount > 0) {
    return { title: "风险", tone: "risk" };
  }
  if (isManager && day.missingCount > 0) {
    return { title: "缺填", tone: "warning" };
  }
  if (day.filledCount > 0 || day.logCount > 0) {
    return { title: "已填", tone: "success" };
  }
  if (day.isFuture) {
    return { title: "待填", tone: "primary" };
  }
  return { title: "未填", tone: "warning" };
}

function buildDayItem(date, source, stats, selectedKey, isManager) {
  const key = keyFromDate(date);
  const today = dateKey();
  const fillRate = Number(source && source.fillRate ? source.fillRate : 0);
  const filledCount = Number(source && source.filledCount ? source.filledCount : 0);
  const missingCount = Number(source && source.missingCount ? source.missingCount : 0);
  const localStats = stats[key] || { count: 0, submitted: 0, hours: 0, riskCount: 0 };
  const risk = Math.max(Number(source && source.riskCount ? source.riskCount : 0), localStats.riskCount);
  const progress = isManager
    ? Math.max(0.08, Math.min(1, fillRate / 100))
    : localStats.count > 0 || filledCount > 0
      ? 1
      : 0.08;

  const item = {
    id: key,
    dateKey: key,
    dayNumber: date.getDate(),
    weekdayShort: weekdayText(date).replace("周", ""),
    fullDateText: `${shortDateText(date)} ${weekdayText(date)}`,
    isToday: key === today,
    isSelected: key === selectedKey,
    isFuture: key > today,
    filledCount: isManager ? filledCount : Math.max(filledCount, localStats.count),
    missingCount,
    fillRate: Math.round(fillRate),
    riskCount: risk,
    logCount: localStats.count,
    hoursText: `${formatHours(localStats.hours)}h`,
    progressPercent: Math.round(progress * 100)
  };
  const status = dayStatus(item, isManager);
  item.statusTitle = status.title;
  item.statusTone = status.tone;
  item.summaryText = daySummaryText(item, isManager);
  item.canCreatePlan = !isManager && item.isFuture;
  return item;
}

function daySummaryText(day, isManager) {
  if (isManager) {
    if (day.riskCount > 0) return `${day.riskCount} 条风险，${day.missingCount} 人未填报`;
    if (day.missingCount > 0) return `${day.missingCount} 人未填报，填报率 ${day.fillRate}%`;
    if (day.filledCount > 0) return `已填 ${day.filledCount} 人，填报率 ${day.fillRate}%`;
    return day.isFuture ? "等待团队填报" : "暂无填报信号";
  }
  if (day.riskCount > 0) return `AI 发现 ${day.riskCount} 个风险或阻塞，建议补充处理动作`;
  if (day.filledCount > 0 || day.logCount > 0) return `已记录 ${day.logCount || day.filledCount} 条，累计 ${day.hoursText}`;
  return day.isFuture ? "可以提前写计划" : "还未填报，先完成今日记录";
}

function buildHero(today, isManager) {
  if (isManager) {
    if (today.riskCount > 0) {
      return {
        kicker: "今天先处理",
        kickerTone: "risk",
        title: `${today.riskCount} 条风险待确认`,
        subtitle: "先确认影响项目和负责人，再决定是否提醒或升级。",
        primaryTitle: "查看风险记录",
        primaryAction: "openTodayRisk",
        queueLabel: "有风险",
        queueTone: "risk"
      };
    }
    if (today.missingCount > 0) {
      return {
        kicker: "今天先处理",
        kickerTone: "warning",
        title: `${today.missingCount} 人未填报`,
        subtitle: "先看名单并提醒，避免周报和复盘失真。",
        primaryTitle: "查看未填报成员",
        primaryAction: "remindMissing",
        queueLabel: "待补齐",
        queueTone: "warning"
      };
    }
    return {
      kicker: "今天先处理",
      kickerTone: "success",
      title: today.filledCount > 0 ? "团队今日状态正常" : "等待团队填报",
      subtitle: "暂无风险和缺填，可继续查看本周节奏。",
      primaryTitle: "查看今日状态",
      primaryAction: "openTodayRisk",
      queueLabel: "正常",
      queueTone: "success"
    };
  }

  if (today.filledCount > 0 || today.logCount > 0) {
    return {
      kicker: "今天先完成",
      kickerTone: today.riskCount > 0 ? "risk" : "success",
      title: today.riskCount > 0 ? "今天已提交，但有风险待补充" : "今天已完成填报",
      subtitle: "可继续补充风险、工时，或查看最近记录。",
      primaryTitle: "补充今日日报",
      primaryAction: "createReport",
      queueLabel: today.riskCount > 0 ? "有风险" : "正常",
      queueTone: today.riskCount > 0 ? "risk" : "success"
    };
  }

  return {
    kicker: "今天先完成",
    kickerTone: "primary",
    title: "今天还未填报",
    subtitle: "先完成今天的日报，AI 会同步更新本周状态。",
    primaryTitle: "填写今日日报",
    primaryAction: "createReport",
    queueLabel: "待填报",
    queueTone: "primary"
  };
}

function heroMetrics(today, isManager) {
  if (isManager) {
    return [
      { title: "填报率", value: `${today.fillRate}%`, tone: today.fillRate >= 80 ? "success" : "primary" },
      { title: "未填", value: `${today.missingCount}`, tone: today.missingCount > 0 ? "warning" : "success" },
      { title: "风险", value: today.riskCount > 0 ? `${today.riskCount}` : "暂无", tone: today.riskCount > 0 ? "risk" : "muted" }
    ];
  }
  return [
    { title: "状态", value: today.filledCount > 0 || today.logCount > 0 ? "已填" : "待填", tone: today.filledCount > 0 || today.logCount > 0 ? "success" : "primary" },
    { title: "风险", value: today.riskCount > 0 ? `${today.riskCount}` : "暂无", tone: today.riskCount > 0 ? "risk" : "muted" },
    { title: "工时", value: today.hoursText, tone: "ink" }
  ];
}

function actionRows(today, isManager) {
  if (isManager) {
    const rows = [];
    if (today.riskCount > 0) {
      rows.push({ id: "openTodayRisk", title: "处理风险记录", desc: `今天有 ${today.riskCount} 条风险，先确认影响和责任人。`, tone: "risk" });
    }
    if (today.missingCount > 0) {
      rows.push({ id: "remindMissing", title: "查看未填报成员", desc: `${today.missingCount} 人未填报，先补齐团队状态。`, tone: "warning" });
    }
    rows.push({ id: "openAIInsight", title: "AI 复盘建议", desc: "汇总本周风险、缺填和下一步动作。", tone: "ai" });
    if (today.riskCount === 0 && today.missingCount === 0) {
      rows.push({ id: "openProjects", title: "查看项目节奏", desc: "确认项目进展、风险和负责人状态。", tone: "primary" });
    }
    return rows;
  }
  return [
    {
      id: "createReport",
      title: today.filledCount > 0 || today.logCount > 0 ? "补充今日日报" : "填写今日日报",
      desc: today.filledCount > 0 || today.logCount > 0 ? "继续补充风险、工时或关键产出。" : "用一句话开始，减少日报录入成本。",
      tone: "primary"
    },
    {
      id: today.riskCount > 0 ? "createReport" : "openAIInsight",
      title: today.riskCount > 0 ? "补充风险说明" : "AI 写作建议",
      desc: today.riskCount > 0 ? "把风险原因、影响和下一步补完整。" : "查看 AI 对今天和本周的建议。",
      tone: today.riskCount > 0 ? "risk" : "ai"
    },
    { id: "openLogs", title: "查看最近记录", desc: "快速回看最近提交的日报。", tone: "ink" }
  ];
}

function buildPriorityDays(days, isManager, showAll) {
  let priority = [];
  if (isManager) {
    priority = days
      .filter((day) => day.riskCount > 0 || day.missingCount > 0)
      .sort((left, right) => {
        if (left.riskCount !== right.riskCount) return right.riskCount - left.riskCount;
        if (left.missingCount !== right.missingCount) return right.missingCount - left.missingCount;
        if (left.isToday !== right.isToday) return left.isToday ? -1 : 1;
        return left.dateKey.localeCompare(right.dateKey);
      })
      .slice(0, 3);
  } else {
    const seen = {};
    days.forEach((day) => {
      if (day.isToday || day.isSelected || day.riskCount > 0) {
        seen[day.id] = day;
      }
    });
    priority = Object.keys(seen).map((key) => seen[key]);
    if (!priority.length && days[0]) priority = [days[0]];
  }

  const priorityIds = priority.reduce((map, day) => {
    map[day.id] = true;
    return map;
  }, {});
  const regular = days.filter((day) => !priorityIds[day.id]);
  const display = showAll ? priority.concat(regular) : priority;
  return display.map((day) => ({
    ...day,
    emphasized: Boolean(priorityIds[day.id])
  }));
}

function riskSignals(days) {
  return days
    .filter((day) => day.riskCount > 0)
    .sort((left, right) => right.riskCount - left.riskCount)
    .slice(0, 3);
}

function assistantActionMeta(action) {
  const map = {
    openTodayRisk: { title: "查看今日风险", tone: "risk" },
    remindMissing: { title: "查看未填报", tone: "warning" },
    openAIInsight: { title: "打开 AI 洞察", tone: "ai" },
    createReport: { title: "填写日报", tone: "primary" },
    openProjects: { title: "查看项目状态", tone: "primary" },
    openLogs: { title: "查看填报记录", tone: "ink" }
  };
  return { id: action, ...(map[action] || map.openAIInsight) };
}

Page({
  data: {
    month: monthKey(),
    monthTitle: monthTitle(monthKey()),
    weekAnchor: dateKey(),
    weekRangeTitle: weekRangeTitle(dateKey()),
    homeSubtitle: "",
    homeModeOptions: [HOME_MODES.mine],
    homeModeIndex: 0,
    supportsTeamMode: false,
    isManagerHome: false,
    scope: "self",
    days: [],
    rawLogs: [],
    weekItems: [],
    priorityDays: [],
    riskSignals: [],
    recentLogs: [],
    today: {},
    hero: {},
    heroMetrics: [],
    actionRows: [],
    quickCommands: [],
    assistantInput: "",
    canSubmitAssistant: false,
    assistantReplyTitle: "",
    assistantReplyText: "",
    assistantReplyActions: [],
    hasAssistantReply: false,
    showAllPriorityDays: false,
    priorityToggleText: "查看全部",
    loading: false
  },

  onShow() {
    if (!getToken()) {
      wx.reLaunch({ url: "/pages/login/login" });
      return;
    }
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
    this.configureHomeMode();
    this.loadHome();
  },

  onPullDownRefresh() {
    this.loadHome().finally(() => wx.stopPullDownRefresh());
  },

  configureHomeMode() {
    const user = getUser() || {};
    const teamScope = roleTeamScope(user);
    const supportsTeamMode = teamScope !== "self";
    const homeModeOptions = supportsTeamMode ? [HOME_MODES.team, HOME_MODES.mine] : [HOME_MODES.mine];
    let homeModeIndex = Number(this.data.homeModeIndex || 0);
    if (!this.didConfigureHomeMode) {
      homeModeIndex = 0;
      this.didConfigureHomeMode = true;
    }
    if (!homeModeOptions[homeModeIndex]) homeModeIndex = 0;
    const mode = homeModeOptions[homeModeIndex].value;
    const isManagerHome = supportsTeamMode && mode === "team";
    const today = new Date();
    this.setData({
      homeModeOptions,
      homeModeIndex,
      supportsTeamMode,
      isManagerHome,
      scope: isManagerHome ? teamScope : "self",
      homeSubtitle: `${isManagerHome ? "风险和缺填优先处理" : "今日日报和本周节奏"} · ${shortDateText(today)} ${weekdayText(today)}`,
      quickCommands: isManagerHome
        ? [
            { id: "daily-report", title: "生成今日汇报", tone: "ai" },
            { id: "project-progress", title: "查看项目进度", tone: "primary" }
          ]
        : [
            { id: "work-log", title: "帮我整理日报", tone: "primary" },
            { id: "week-risk", title: "查看本周风险", tone: "ai" }
          ]
    });
  },

  async loadHome() {
    const anchor = dateFromKey(this.data.weekAnchor);
    const weekMonths = weekDates(this.data.weekAnchor).map((date) => monthKey(date));
    const months = Array.from(new Set(weekMonths.concat([monthKey(new Date())])));
    const month = monthKey(anchor);
    this.setData({
      loading: true,
      month,
      monthTitle: monthTitle(month),
      weekRangeTitle: weekRangeTitle(this.data.weekAnchor)
    });
    try {
      const responses = await Promise.all(
        months.map((item) => request(`/analytics/calendar?month=${item}&scope=${this.data.scope}`))
      );
      const days = responses.flatMap((item) => item.days || []);
      let logs = [];
      try {
        logs = await request("/work-logs");
      } catch (error) {
        logs = [];
      }
      this.applyHome(days, logs);
    } catch (error) {
      wx.showToast({ title: error.message || "日历加载失败", icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  },

  applyHome(days, logs) {
    const dayMap = new Map((days || []).map((item) => [item.date, item]));
    const stats = logStatsByDate(logs || []);
    const isManager = this.data.isManagerHome;
    const selectedKey = this.data.weekAnchor;
    const weekItems = weekDates(selectedKey).map((date) => buildDayItem(date, dayMap.get(keyFromDate(date)), stats, selectedKey, isManager));
    const todayDate = new Date();
    const today = buildDayItem(todayDate, dayMap.get(dateKey(todayDate)), stats, selectedKey, isManager);
    const hero = buildHero(today, isManager);
    const recentLogs = (logs || [])
      .slice()
      .sort((left, right) => String(right.submittedAt || right.createdAt || right.date || "").localeCompare(String(left.submittedAt || left.createdAt || left.date || "")))
      .slice(0, 3)
      .map(normalizeRecentLog);
    const priorityDays = buildPriorityDays(weekItems, isManager, this.data.showAllPriorityDays);

    this.setData({
      days,
      rawLogs: logs || [],
      weekItems,
      priorityDays,
      riskSignals: riskSignals(weekItems),
      recentLogs,
      today,
      hero,
      heroMetrics: heroMetrics(today, isManager),
      actionRows: actionRows(today, isManager),
      priorityToggleText: this.data.showAllPriorityDays ? "收起" : "查看全部"
    });
  },

  onHomeModeTap(event) {
    const index = Number(event.currentTarget.dataset.index);
    if (!Number.isFinite(index) || index === this.data.homeModeIndex) return;
    this.setData({
      homeModeIndex: index,
      showAllPriorityDays: false,
      hasAssistantReply: false
    }, () => {
      this.configureHomeMode();
      this.loadHome();
    });
  },

  previousWeek() {
    const weekAnchor = keyFromDate(addDays(dateFromKey(this.data.weekAnchor), -7));
    this.setData({ weekAnchor, showAllPriorityDays: false }, () => this.loadHome());
  },

  currentWeek() {
    this.setData({ weekAnchor: dateKey(), showAllPriorityDays: false }, () => this.loadHome());
  },

  nextWeek() {
    const weekAnchor = keyFromDate(addDays(dateFromKey(this.data.weekAnchor), 7));
    this.setData({ weekAnchor, showAllPriorityDays: false }, () => this.loadHome());
  },

  selectWeekDay(event) {
    const weekAnchor = event.currentTarget.dataset.date;
    if (!weekAnchor || weekAnchor === this.data.weekAnchor) return;
    const month = monthKey(dateFromKey(weekAnchor));
    this.setData({
      weekAnchor,
      month,
      monthTitle: monthTitle(month),
      weekRangeTitle: weekRangeTitle(weekAnchor)
    }, () => this.applyHome(this.data.days, this.data.rawLogs || []));
  },

  togglePriorityDays() {
    this.setData({
      showAllPriorityDays: !this.data.showAllPriorityDays
    }, () => this.applyHome(this.data.days, this.data.rawLogs || []));
  },

  onAssistantInput(event) {
    const assistantInput = event.detail.value;
    this.setData({
      assistantInput,
      canSubmitAssistant: Boolean(assistantInput.trim())
    });
  },

  submitAssistant() {
    this.handleAssistantPrompt(this.data.assistantInput);
  },

  quickCommand(event) {
    this.handleAssistantPrompt(event.currentTarget.dataset.command || "");
  },

  handleAssistantPrompt(prompt) {
    const content = String(prompt || "").trim();
    if (!content) return;
    const reply = this.makeAssistantReply(content);
    this.setData({
      assistantInput: "",
      canSubmitAssistant: false,
      hasAssistantReply: true,
      assistantReplyTitle: reply.title,
      assistantReplyText: reply.text,
      assistantReplyActions: reply.actions.map(assistantActionMeta)
    });
  },

  makeAssistantReply(prompt) {
    const today = this.data.today || {};
    const normalized = prompt.toLowerCase();
    const asksRisk = normalized.includes("风险") || normalized.includes("阻塞") || normalized.includes("异常");
    const asksMissing = normalized.includes("未填") || normalized.includes("缺填") || normalized.includes("提醒");
    const asksReport = normalized.includes("汇报") || normalized.includes("周报") || normalized.includes("总结");
    const asksEntry = normalized.includes("日报") || normalized.includes("填报") || normalized.includes("整理");
    const asksProject = normalized.includes("项目") || normalized.includes("进度");

    if (asksProject) {
      return {
        title: "我会先打开项目状态",
        text: "项目页会展示负责人、截止日期和 AI 风险提示，适合继续判断延期或阻塞。",
        actions: ["openProjects", "openAIInsight"]
      };
    }
    if (asksRisk) {
      return {
        title: "已整理风险处理入口",
        text: today.riskCount > 0 ? `今天有 ${today.riskCount} 条风险信号，建议先进入日期详情确认影响项目和负责人。` : "今天暂无明显风险，可以继续查看本周 AI 洞察。",
        actions: today.riskCount > 0 ? ["openTodayRisk", "openAIInsight"] : ["openAIInsight", "openProjects"]
      };
    }
    if (asksMissing) {
      return {
        title: "已准备缺填处理入口",
        text: today.missingCount > 0 ? `今天还有 ${today.missingCount} 人未填报，先查看名单，再决定是否提醒。` : "当前今日缺填不明显，可以打开 AI 洞察查看本周覆盖情况。",
        actions: today.missingCount > 0 ? ["remindMissing", "openAIInsight"] : ["openAIInsight"]
      };
    }
    if (asksReport) {
      return {
        title: "已准备汇报生成入口",
        text: "先进入 AI 洞察查看本周风险、缺填和人员状态，再生成适合汇报的结构化结论。",
        actions: ["openAIInsight", "openTodayRisk"]
      };
    }
    if (asksEntry) {
      return {
        title: "我可以帮你进入日报整理",
        text: "到填报页后，可以直接写今天完成的工作，再用 AI 整理成日报草稿。",
        actions: ["createReport", "openLogs"]
      };
    }
    return {
      title: "我建议先处理今天的关键状态",
      text: this.data.isManagerHome ? "可以先看风险和缺填，再进入 AI 洞察生成汇报材料。" : "可以先完成今日日报，再回看本周风险和最近记录。",
      actions: this.data.isManagerHome ? ["openTodayRisk", "remindMissing", "openAIInsight"] : ["createReport", "openAIInsight", "openLogs"]
    };
  },

  onActionTap(event) {
    this.handleAction(event.currentTarget.dataset.action, event.currentTarget.dataset.date);
  },

  handleAction(action, date) {
    const targetDate = date || dateKey();
    if (action === "openTodayRisk" || action === "remindMissing" || action === "openDay") {
      wx.navigateTo({ url: `/pages/day-detail/day-detail?date=${targetDate}&scope=${this.data.scope}` });
      return;
    }
    if (action === "openAIInsight") {
      this.openAnalysis();
      return;
    }
    if (action === "createReport") {
      this.createReport(targetDate);
      return;
    }
    if (action === "openProjects") {
      wx.switchTab({ url: "/pages/projects/projects" });
      return;
    }
    if (action === "openLogs") {
      wx.switchTab({ url: "/pages/work-logs/work-logs" });
    }
  },

  openDay(event) {
    this.handleAction("openDay", event.currentTarget.dataset.date);
  },

  createReport(date) {
    const targetDate = typeof date === "string" ? date : dateKey();
    wx.setStorageSync("reportPrefillDate", targetDate);
    wx.switchTab({ url: "/pages/report/report" });
  },

  openAnalysis() {
    wx.navigateTo({
      url: `/pages/ai-analysis/ai-analysis?month=${this.data.month}&scope=${this.data.scope}`
    });
  },

  openLogDetail(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/work-log-detail/work-log-detail?id=${id}` });
  }
});
