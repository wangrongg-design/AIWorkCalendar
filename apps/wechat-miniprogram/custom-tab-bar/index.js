Component({
  data: {
    selected: 0,
    tabs: [
      { pagePath: "/pages/calendar/calendar", label: "AI日历", icon: "calendar" },
      { pagePath: "/pages/report/report", label: "填报", icon: "edit" },
      { pagePath: "/pages/work-logs/work-logs", label: "记录", icon: "list" },
      { pagePath: "/pages/projects/projects", label: "项目中心", icon: "folder" },
      { pagePath: "/pages/profile/profile", label: "我的", icon: "profile" }
    ]
  },

  methods: {
    switchTab(event) {
      const index = Number(event.currentTarget.dataset.index);
      const target = this.data.tabs[index];
      if (!target) return;
      this.setData({ selected: index });
      wx.switchTab({ url: target.pagePath });
    }
  }
});
