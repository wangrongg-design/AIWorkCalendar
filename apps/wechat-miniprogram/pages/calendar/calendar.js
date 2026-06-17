const { request } = require("../../utils/request");
const { getToken } = require("../../utils/storage");
const { dateKey, monthKey } = require("../../utils/date");

function pad(value) {
  return String(value).padStart(2, "0");
}

function keyFromDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
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
  return addDays(date, -((date.getDay() + 6) % 7));
}

function weekDates(anchor = new Date()) {
  const start = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

function shortDateText(date) {
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function weekdayText(date) {
  return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()];
}

function formatHours(value) {
  const number = Number(value || 0);
  const rounded = Math.round(number * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function riskBlockerCount(log) {
  const risks = log.aiAnalysis && Array.isArray(log.aiAnalysis.risks) ? log.aiAnalysis.risks.length : 0;
  const blockers = log.aiAnalysis && Array.isArray(log.aiAnalysis.blockers) ? log.aiAnalysis.blockers.length : 0;
  return risks + blockers;
}

function projectDisplayName(project) {
  if (!project) return "";
  return project.code ? `${project.code} · ${project.name}` : project.name;
}

function statusTitle(status) {
  return status === "SUBMITTED" ? "已提交" : "草稿";
}

function daySummaryText(day) {
  const parts = [];
  if (day.isFuture) {
    if (day.totalCount > 0) {
      parts.push(`计划 ${day.filledCount}/${day.totalCount}`);
      if (day.riskBlockerCount > 0) parts.push(`风险/阻塞 ${day.riskBlockerCount}`);
      if (day.hasTotalHours) parts.push(`工时 ${day.hoursText}`);
      return parts.join(" · ");
    }
    return "还没有计划";
  }
  if (day.totalCount > 0) {
    parts.push(`填报 ${day.filledCount}/${day.totalCount}`);
    if (day.missingCount > 0) parts.push(`未填 ${day.missingCount}`);
    if (day.riskBlockerCount > 0) parts.push(`风险/阻塞 ${day.riskBlockerCount}`);
    if (day.hasTotalHours) parts.push(`工时 ${day.hoursText}`);
    return parts.join(" · ");
  }
  if (day.riskBlockerCount > 0) {
    return `暂无填报记录 · 风险/阻塞 ${day.riskBlockerCount}`;
  }
  return "暂无填报记录";
}

function buildDayItem(date, source, detail) {
  const stats = detail && detail.stats ? detail.stats : {};
  const key = keyFromDate(date);
  const today = dateKey();
  const filledCount = Number.isFinite(Number(stats.filledCount)) ? Number(stats.filledCount) : Number(source && source.filledCount ? source.filledCount : 0);
  const missingCount = Number.isFinite(Number(stats.missingCount)) ? Number(stats.missingCount) : Number(source && source.missingCount ? source.missingCount : 0);
  const risk = Number.isFinite(Number(stats.riskCount)) ? Number(stats.riskCount) : Number(source && source.riskCount ? source.riskCount : 0);
  const blocker = Number.isFinite(Number(stats.blockerCount)) ? Number(stats.blockerCount) : Number(source && source.blockerCount ? source.blockerCount : 0);
  const totalEmployees = Number(stats.totalEmployees || 0);
  const totalCount = filledCount + missingCount > 0 ? filledCount + missingCount : totalEmployees;
  const fillRate = Number.isFinite(Number(stats.fillRate)) ? Number(stats.fillRate) : Number(source && source.fillRate ? source.fillRate : 0);
  const totalHoursNumber = Number(stats.totalHours);
  const hasTotalHours = detail && Number.isFinite(totalHoursNumber);
  const item = {
    id: key,
    dateKey: key,
    dateText: shortDateText(date),
    weekdayText: weekdayText(date),
    isToday: key === today,
    isFuture: key > today,
    filledCount,
    missingCount,
    riskCount: risk,
    blockerCount: blocker,
    riskBlockerCount: risk + blocker,
    totalCount,
    fillRate,
    totalHours: hasTotalHours ? totalHoursNumber : 0,
    hasTotalHours,
    hoursText: hasTotalHours ? `${formatHours(totalHoursNumber)}h` : "--h"
  };
  item.summaryText = daySummaryText(item);
  return item;
}

function buildTodayBrief(day) {
  const riskText = day.riskBlockerCount > 0 ? `${day.riskBlockerCount} 条风险/阻塞` : "无风险/阻塞";
  const hourSummary = day.hasTotalHours ? day.hoursText : "工时待确认";

  if (day.riskBlockerCount > 0) {
    return {
      title: "有风险/阻塞需要关注",
      summary: day.filledCount > 0 ? `已填报 · ${hourSummary} · ${riskText}` : `未填报 · 工时待补齐 · ${riskText}`,
      message: "已发现风险/阻塞信号，建议去记录页查看原始日报。",
      tone: "risk"
    };
  }

  if (day.filledCount === 0) {
    return {
      title: "今天还未填报",
      summary: `未填报 · 工时待补齐 · ${riskText}`,
      message: "底部“填报”可以完成今日日报，提交后这里会自动更新。",
      tone: "warning"
    };
  }

  return {
    title: "今天状态正常",
    summary: `已填报 · ${hourSummary} · ${riskText}`,
    message: "暂未发现需要你处理的问题。",
    tone: "success"
  };
}

function buildWeekMetrics(days) {
  const current = days.filter((day) => !day.isFuture);
  const filledDays = current.filter((day) => day.filledCount > 0).length;
  const missingDays = current.filter((day) => day.filledCount === 0 || day.missingCount > 0).length;
  const risks = current.reduce((sum, day) => sum + day.riskBlockerCount, 0);
  return [
    { value: `${filledDays} 天`, label: "已填", tone: "success" },
    { value: `${missingDays} 天`, label: "未填", tone: missingDays > 0 ? "warning" : "muted" },
    { value: `${risks} 条`, label: "风险/阻塞", tone: risks > 0 ? "risk" : "muted" }
  ];
}

function buildWeekRange(days) {
  if (!days.length) return "";
  return `${days[0].dateText}-${days[days.length - 1].dateText}`;
}

function buildAttentionItems(days) {
  return days
    .filter((day) => !day.isFuture)
    .map((day) => {
      if (day.riskBlockerCount > 0) {
        return {
          id: `risk-${day.dateKey}`,
          dateKey: day.dateKey,
          title: `${day.dateText} 风险/阻塞 ${day.riskBlockerCount} 条`,
          subtitle: day.summaryText,
          tone: "risk",
          priority: 0
        };
      }
      if (day.missingCount > 0 || day.filledCount === 0) {
        return {
          id: `missing-${day.dateKey}`,
          dateKey: day.dateKey,
          title: `${day.dateText} 未填报`,
          subtitle: "本周状态可能不完整，建议补齐日报。",
          tone: "warning",
          priority: 1
        };
      }
      if (day.hasTotalHours && day.totalHours > 0 && day.totalHours < 2) {
        return {
          id: `hours-${day.dateKey}`,
          dateKey: day.dateKey,
          title: `${day.dateText} 工时偏低`,
          subtitle: `${day.hoursText}，建议确认是否漏填。`,
          tone: "warning",
          priority: 2
        };
      }
      return null;
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (left.priority !== right.priority) return left.priority - right.priority;
      return right.dateKey.localeCompare(left.dateKey);
    })
    .slice(0, 2);
}

function normalizeRecentLog(log) {
  const date = dateFromKey(String(log.date || "").slice(0, 10));
  const projectName = projectDisplayName(log.project);
  const hasRisk = riskBlockerCount(log) > 0;
  return {
    id: log.id,
    title: shortDateText(date),
    meta: [`${formatHours(log.hours)}h`, statusTitle(log.status), projectName].filter(Boolean).join(" · "),
    hasRisk
  };
}

Page({
  data: {
    scope: "self",
    homeSubtitle: "",
    weekRange: "",
    todayBrief: {},
    weekMetrics: [],
    attentionItems: [],
    hasAttention: false,
    recentLogs: [],
    hasRecentLogs: false,
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
    this.loadHome();
  },

  onPullDownRefresh() {
    this.loadHome().finally(() => wx.stopPullDownRefresh());
  },

  async loadHome() {
    const today = new Date();
    const dates = weekDates(today);
    const months = Array.from(new Set(dates.concat([today]).map((date) => monthKey(date))));
    this.setData({
      loading: true,
      homeSubtitle: `${shortDateText(today)} ${weekdayText(today)}`
    });
    try {
      const calendarResponses = await Promise.all(
        months.map((month) => request(`/analytics/calendar?month=${month}&scope=${this.data.scope}`))
      );
      const dayMap = new Map(
        calendarResponses.flatMap((item) => item.days || []).map((item) => [item.date, item])
      );
      const detailEntries = await Promise.all(
        dates.map(async (date) => {
          const key = keyFromDate(date);
          try {
            const detail = await request(`/analytics/calendar/day?date=${key}&scope=${this.data.scope}`);
            return [key, detail];
          } catch (error) {
            return [key, null];
          }
        })
      );
      const detailMap = new Map(detailEntries);
      const weekDays = dates.map((date) => buildDayItem(date, dayMap.get(keyFromDate(date)), detailMap.get(keyFromDate(date))));
      const todayItem = buildDayItem(today, dayMap.get(dateKey()), detailMap.get(dateKey()));
      const attentionItems = buildAttentionItems(weekDays);
      this.setData({
        todayBrief: buildTodayBrief(todayItem),
        weekMetrics: buildWeekMetrics(weekDays),
        weekRange: buildWeekRange(weekDays),
        attentionItems,
        hasAttention: attentionItems.length > 0
      });
    } catch (error) {
      wx.showToast({ title: error.message || "日历加载失败", icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  },

  async loadRecentLogs() {
    try {
      const logs = await request("/work-logs");
      return (logs || [])
        .slice()
        .sort((left, right) => {
          if (left.date !== right.date) return String(right.date || "").localeCompare(String(left.date || ""));
          return String(right.submittedAt || "").localeCompare(String(left.submittedAt || ""));
        })
        .slice(0, 3)
        .map(normalizeRecentLog);
    } catch (error) {
      return [];
    }
  },

  openAttention(event) {
    const date = event.currentTarget.dataset.date;
    if (!date) return;
    wx.navigateTo({ url: `/pages/day-detail/day-detail?date=${date}&scope=${this.data.scope}` });
  },

  openLogDetail(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/work-log-detail/work-log-detail?id=${id}` });
  },

  openLogs() {
    wx.switchTab({ url: "/pages/work-logs/work-logs" });
  }
});
