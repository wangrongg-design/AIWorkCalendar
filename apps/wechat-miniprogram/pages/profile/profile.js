const { getToken, getUser, clearSession } = require("../../utils/storage");

function roleTitle(role) {
  if (role === "SUPER_ADMIN") return "平台超管";
  if (role === "COMPANY_ADMIN") return "企业管理员";
  if (role === "DEPARTMENT_MANAGER") return "部门经理";
  return "员工";
}

Page({
  data: {
    user: {},
    departmentText: "未分配部门",
    emailText: "-",
    rolesText: ""
  },

  onShow() {
    if (!getToken()) {
      wx.reLaunch({ url: "/pages/login/login" });
      return;
    }
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 4 });
    }
    const user = getUser() || {};
    this.setData({
      user,
      departmentText: user.departmentName || "未分配部门",
      emailText: user.email || "-",
      rolesText: Array.isArray(user.roles) ? user.roles.map(roleTitle).join("、") : ""
    });
  },

  logout() {
    clearSession();
    wx.reLaunch({ url: "/pages/login/login" });
  }
});
