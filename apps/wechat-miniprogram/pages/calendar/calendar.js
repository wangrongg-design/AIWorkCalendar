const { request } = require("../../utils/request");
const { getToken, getUser } = require("../../utils/storage");
const { addMonths, buildMonthGrid, dateKey, monthKey } = require("../../utils/date");

function roleScopes(user) {
  const roles = user && Array.isArray(user.roles) ? user.roles : [];
  if (roles.includes("COMPANY_ADMIN") || roles.includes("SUPER_ADMIN")) {
    return [
      { value: "company", label: "全公司" },
      { value: "self", label: "只看自己" }
    ];
  }
  if (roles.includes("DEPARTMENT_MANAGER")) {
    return [
      { value: "department", label: "本部门" },
      { value: "self", label: "只看自己" }
    ];
  }
  return [{ value: "self", label: "只看自己" }];
}

Page({
  data: {
    month: monthKey(),
    weekdays: ["日", "一", "二", "三", "四", "五", "六"],
    grid: [],
    days: [],
    totalEmployees: 0,
    todayData: {},
    scopeOptions: [{ value: "self", label: "只看自己" }],
    scopeIndex: 0,
    scopeLabel: "只看自己",
    loading: false
  },

  onShow() {
    if (!getToken()) {
      wx.reLaunch({ url: "/pages/login/login" });
      return;
    }
    const scopes = roleScopes(getUser());
    this.setData({
      scopeOptions: scopes,
      scopeLabel: scopes[this.data.scopeIndex] ? scopes[this.data.scopeIndex].label : scopes[0].label,
      scopeIndex: scopes[this.data.scopeIndex] ? this.data.scopeIndex : 0
    });
    this.loadCalendar();
  },

  onPullDownRefresh() {
    this.loadCalendar().finally(() => wx.stopPullDownRefresh());
  },

  async loadCalendar() {
    const scope = this.data.scopeOptions[this.data.scopeIndex].value;
    this.setData({ loading: true });
    try {
      const result = await request(`/analytics/calendar?month=${this.data.month}&scope=${scope}`);
      const grid = buildMonthGrid(this.data.month, result.days || []);
      const today = dateKey();
      this.setData({
        days: result.days || [],
        grid,
        totalEmployees: result.totalEmployees || 0,
        todayData: (result.days || []).find((item) => item.date === today) || {},
        scopeLabel: this.data.scopeOptions[this.data.scopeIndex].label
      });
    } catch (error) {
      wx.showToast({ title: error.message || "日历加载失败", icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  },

  prevMonth() {
    this.setData({ month: addMonths(this.data.month, -1) });
    this.loadCalendar();
  },

  nextMonth() {
    this.setData({ month: addMonths(this.data.month, 1) });
    this.loadCalendar();
  },

  onScopeChange(event) {
    const index = Number(event.detail.value);
    this.setData({
      scopeIndex: index,
      scopeLabel: this.data.scopeOptions[index].label
    });
    this.loadCalendar();
  },

  openDay(event) {
    const date = event.currentTarget.dataset.date;
    if (!date) return;
    const scope = this.data.scopeOptions[this.data.scopeIndex].value;
    wx.navigateTo({
      url: `/pages/day-detail/day-detail?date=${date}&scope=${scope}`
    });
  }
});
