const { request } = require("../../utils/request");
const { getToken, getUser } = require("../../utils/storage");

const periods = [
  { value: "week", label: "本周" },
  { value: "month", label: "本月" },
  { value: "quarter", label: "季度" },
  { value: "year", label: "年度" }
];

function pad(value) {
  return String(value).padStart(2, "0");
}

function dateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function monthKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

function dateFromKey(key) {
  return new Date(`${key}T00:00:00`);
}

function dateFromMonth(month) {
  return new Date(`${month}-01T00:00:00`);
}

function addDays(date, diff) {
  const next = new Date(date);
  next.setDate(next.getDate() + diff);
  return next;
}

function addMonths(date, diff) {
  return new Date(date.getFullYear(), date.getMonth() + diff, 1);
}

function monthRange(start, end) {
  const result = [];
  let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cursor <= last) {
    result.push(monthKey(cursor));
    cursor = addMonths(cursor, 1);
  }
  return result;
}

function periodRange(period, anchor) {
  if (period === "week") {
    const diffFromMonday = (anchor.getDay() + 6) % 7;
    const start = addDays(anchor, -diffFromMonday);
    return { start, end: addDays(start, 6) };
  }
  if (period === "quarter") {
    const firstMonth = Math.floor(anchor.getMonth() / 3) * 3;
    const start = new Date(anchor.getFullYear(), firstMonth, 1);
    const end = new Date(anchor.getFullYear(), firstMonth + 3, 0);
    return { start, end };
  }
  if (period === "year") {
    return {
      start: new Date(anchor.getFullYear(), 0, 1),
      end: new Date(anchor.getFullYear(), 11, 31)
    };
  }
  return {
    start: new Date(anchor.getFullYear(), anchor.getMonth(), 1),
    end: new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)
  };
}

function rangeText(range) {
  return `${dateKey(range.start)} 至 ${dateKey(range.end)}`;
}

function projectRisk(project) {
  const paused = project.status === "PAUSED";
  const missingOwner = !project.owner;
  const endDate = project.endDate ? dateFromKey(String(project.endDate).slice(0, 10)) : null;
  const today = dateFromKey(dateKey(new Date()));
  const overdue = endDate && endDate < today;
  return paused || missingOwner || overdue;
}

function summarize(days, projects, totalEmployees) {
  const filled = days.reduce((sum, item) => sum + (item.filledCount || 0), 0);
  const missing = days.reduce((sum, item) => sum + (item.missingCount || 0), 0);
  const risks = days.reduce((sum, item) => sum + (item.riskCount || 0), 0);
  const blockers = days.reduce((sum, item) => sum + (item.blockerCount || 0), 0);
  const riskBlockerCount = risks + blockers;
  const riskDays = days.filter((item) => ((item.riskCount || 0) + (item.blockerCount || 0)) > 0);
  const missingDays = days.filter((item) => (item.missingCount || 0) > 0);
  const denominator = filled + missing;
  const fillRate = denominator ? Math.round((filled / denominator) * 100) : 0;
  const activeProjects = projects.filter((item) => item.status === "ACTIVE");
  const riskProjects = projects.filter(projectRisk);

  let coreConclusion = "当前周期暂无足够填报信号";
  if (riskBlockerCount > 0) {
    coreConclusion = `当前周期发现 ${riskBlockerCount} 条风险/阻塞信号，优先处理重点日期。`;
  } else if (missing > 0) {
    coreConclusion = `当前周期有 ${missing} 条缺填记录，先补齐日报覆盖。`;
  } else if (filled > 0) {
    coreConclusion = `当前周期填报覆盖稳定，填报率 ${fillRate}%。`;
  }

  return {
    fillRate,
    missingCount: missing,
    riskCount: risks,
    blockerCount: blockers,
    riskBlockerCount,
    riskDayCount: riskDays.length,
    firstRiskDate: riskDays[0] ? riskDays[0].date : "",
    firstMissingDate: missingDays[0] ? missingDays[0].date : "",
    coreConclusion,
    riskReminder: riskBlockerCount > 0
      ? `有 ${riskDays.length} 天出现风险/阻塞，建议先进入重点日期查看具体日报。`
      : missing > 0
        ? "缺填会影响人工智能对团队状态的判断，建议优先提醒未填成员。"
        : "暂无明显风险/阻塞，继续关注临近截止日期和低覆盖日期。",
    peopleStatus: totalEmployees > 0
      ? `当前范围约 ${totalEmployees} 名成员，周期填报率 ${fillRate}%，缺填 ${missing} 条。`
      : "当前范围暂无成员统计，请确认组织和范围配置。",
    projectProgress: projects.length
      ? `${activeProjects.length} 个项目进行中，${riskProjects.length} 个项目需要关注。`
      : "当前范围暂无项目数据，项目风险可进入项目页查看。",
    suggestedAction: riskBlockerCount > 0
      ? "先查看风险/阻塞日期，再复盘关联项目和负责人。"
      : missing > 0
        ? "先提醒未填报，再生成周报沉淀本周期结论。"
        : "可以生成周报，保留本周期工作节奏和关键结论。"
  };
}

Page({
  data: {
    periods,
    periodIndex: 0,
    periodLabel: "本周",
    month: "",
    scope: "self",
    rangeTitle: "",
    loading: false,
    generating: false,
    fillRate: 0,
    missingCount: 0,
    riskCount: 0,
    blockerCount: 0,
    riskBlockerCount: 0,
    riskDayCount: 0,
    firstRiskDate: "",
    firstMissingDate: "",
    coreConclusion: "正在分析当前周期",
    riskReminder: "",
    peopleStatus: "",
    projectProgress: "",
    suggestedAction: ""
  },

  onLoad(options) {
    const currentMonth = options.month || monthKey(new Date());
    this.setData({
      month: currentMonth,
      scope: options.scope || "self"
    });
    this.loadAnalysis();
  },

  onPeriodChange(event) {
    const periodIndex = Number(event.currentTarget.dataset.index);
    this.setData({
      periodIndex,
      periodLabel: periods[periodIndex].label
    });
    this.loadAnalysis();
  },

  async loadAnalysis() {
    if (!getToken()) {
      wx.reLaunch({ url: "/pages/login/login" });
      return;
    }
    const period = periods[this.data.periodIndex].value;
    const today = new Date();
    const selectedMonth = this.data.month || monthKey(today);
    const anchor = selectedMonth === monthKey(today) ? today : dateFromMonth(selectedMonth);
    const range = periodRange(period, anchor);
    const startKey = dateKey(range.start);
    const endKey = dateKey(range.end);
    this.setData({ loading: true, rangeTitle: rangeText(range) });
    try {
      const months = monthRange(range.start, range.end);
      const responses = await Promise.all(
        months.map((month) => request(`/analytics/calendar?month=${month}&scope=${this.data.scope}`))
      );
      const days = responses
        .flatMap((item) => item.days || [])
        .filter((item) => item.date >= startKey && item.date <= endKey);
      const totalEmployees = responses.reduce((max, item) => Math.max(max, item.totalEmployees || 0), 0);
      let projects = [];
      try {
        projects = await request("/projects");
      } catch (error) {
        projects = [];
      }
      this.setData(summarize(days, projects || [], totalEmployees));
    } catch (error) {
      wx.showToast({ title: error.message || "分析加载失败", icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  },

  async generateWeeklyReport() {
    if (this.data.scope === "company") {
      wx.showToast({ title: "全公司周报暂未开放", icon: "none" });
      return;
    }
    const user = getUser() || {};
    const today = new Date();
    const anchor = this.data.month === monthKey(today) ? today : dateFromMonth(this.data.month);
    const range = periodRange("week", anchor);
    const body = {
      type: this.data.scope === "department" ? "DEPARTMENT_WEEKLY" : "PERSONAL_WEEKLY",
      periodStart: dateKey(range.start),
      periodEnd: dateKey(range.end)
    };
    if (this.data.scope === "department") {
      if (!user.departmentId) {
        wx.showToast({ title: "当前账号未绑定部门", icon: "none" });
        return;
      }
      body.departmentId = user.departmentId;
    }
    this.setData({ generating: true });
    try {
      await request("/reports/generate", {
        method: "POST",
        data: body
      });
      wx.showToast({ title: "周报已开始生成" });
    } catch (error) {
      wx.showToast({ title: error.message || "生成失败", icon: "none" });
    } finally {
      this.setData({ generating: false });
    }
  },

  remindMissing() {
    if (!this.data.firstMissingDate) {
      wx.showToast({ title: "当前周期暂无缺填", icon: "none" });
      return;
    }
    wx.navigateTo({
      url: `/pages/day-detail/day-detail?date=${this.data.firstMissingDate}&scope=${this.data.scope}`
    });
  },

  viewRiskProjects() {
    wx.setStorageSync("projectRiskOnly", true);
    wx.switchTab({ url: "/pages/projects/projects" });
  },

  openRiskDay() {
    if (!this.data.firstRiskDate) return;
    wx.navigateTo({
      url: `/pages/day-detail/day-detail?date=${this.data.firstRiskDate}&scope=${this.data.scope}`
    });
  }
});
