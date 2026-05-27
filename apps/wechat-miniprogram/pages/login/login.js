const { request } = require("../../utils/request");
const { setSession, getToken } = require("../../utils/storage");

Page({
  data: {
    account: "",
    password: "",
    showPassword: false,
    loading: false
  },

  onLoad() {
    if (getToken()) {
      wx.switchTab({ url: "/pages/calendar/calendar" });
    }
  },

  onAccountInput(event) {
    this.setData({ account: event.detail.value.trim() });
  },

  onPasswordInput(event) {
    this.setData({ password: event.detail.value });
  },

  togglePassword() {
    this.setData({ showPassword: !this.data.showPassword });
  },

  async login() {
    const { account, password } = this.data;
    if (!account || !password) {
      wx.showToast({ title: "请填写登录信息", icon: "none" });
      return;
    }
    this.setData({ loading: true });
    try {
      const result = await request("/auth/login", {
        method: "POST",
        data: {
          account,
          password
        }
      });
      setSession(result.accessToken, result.user);
      wx.switchTab({ url: "/pages/calendar/calendar" });
    } catch (error) {
      wx.showToast({ title: error.message || "登录失败", icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  }
});
