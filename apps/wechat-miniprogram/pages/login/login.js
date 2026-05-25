const { request, apiBaseUrl } = require("../../utils/request");
const { setSession, getToken } = require("../../utils/storage");

Page({
  data: {
    apiBaseUrl: "http://localhost:3001",
    tenantCode: "demo",
    account: "admin@example.com",
    password: "Passw0rd!",
    loading: false
  },

  onLoad() {
    this.setData({
      apiBaseUrl: apiBaseUrl()
    });
    if (getToken()) {
      wx.switchTab({ url: "/pages/report/report" });
    }
  },

  onApiBaseUrlInput(event) {
    this.setData({ apiBaseUrl: event.detail.value.trim() });
  },

  onTenantCodeInput(event) {
    this.setData({ tenantCode: event.detail.value.trim() });
  },

  onAccountInput(event) {
    this.setData({ account: event.detail.value.trim() });
  },

  onPasswordInput(event) {
    this.setData({ password: event.detail.value });
  },

  async login() {
    const { apiBaseUrl: baseUrl, tenantCode, account, password } = this.data;
    if (!baseUrl || !account || !password) {
      wx.showToast({ title: "请填写登录信息", icon: "none" });
      return;
    }
    wx.setStorageSync("apiBaseUrl", baseUrl.replace(/\/$/, ""));
    getApp().globalData.apiBaseUrl = baseUrl.replace(/\/$/, "");
    this.setData({ loading: true });
    try {
      const result = await request("/auth/login", {
        method: "POST",
        data: {
          tenantCode,
          account,
          password
        }
      });
      setSession(result.accessToken, result.user);
      wx.switchTab({ url: "/pages/report/report" });
    } catch (error) {
      wx.showToast({ title: error.message || "登录失败", icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  }
});
