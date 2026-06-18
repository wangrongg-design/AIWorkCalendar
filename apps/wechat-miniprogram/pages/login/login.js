const { request } = require("../../utils/request");
const { setSession, getToken } = require("../../utils/storage");

Page({
  data: {
    account: "",
    password: "",
    hasAgreed: false,
    showPassword: false,
    canLogin: false,
    loading: false
  },

  onLoad() {
    if (getToken()) {
      wx.switchTab({ url: "/pages/calendar/calendar" });
    }
  },

  onAccountInput(event) {
    this.setData({ account: event.detail.value.trim() }, () => this.updateLoginState());
  },

  onPasswordInput(event) {
    this.setData({ password: event.detail.value }, () => this.updateLoginState());
  },

  updateLoginState() {
    this.setData({
      canLogin: Boolean(this.data.account && this.data.password)
    });
  },

  toggleAgreement() {
    this.setData({ hasAgreed: !this.data.hasAgreed }, () => this.updateLoginState());
  },

  showUserAgreement() {
    wx.showModal({
      title: "用户服务协议",
      content: "AIWorkCalendar 为企业工作填报与智能汇报工具。你需要使用企业分配的邮箱或手机号和密码登录。我们会根据账号信息完成身份校验、权限判断、日报归属、项目协作和安全审计。请妥善保管账号密码，不得冒用他人账号或上传违法违规内容。",
      showCancel: false,
      confirmText: "知道了"
    });
  },

  openPrivacyContract() {
    if (typeof wx.openPrivacyContract === "function") {
      wx.openPrivacyContract({
        fail: () => this.showPrivacyFallback()
      });
      return;
    }
    this.showPrivacyFallback();
  },

  showPrivacyFallback() {
    wx.showModal({
      title: "隐私政策",
      content: "我们会为登录认证、企业身份校验、日报归属、权限控制和账号安全处理你的邮箱或手机号。我们仅在提供 AIWorkCalendar 工作填报服务所必需的范围内使用相关信息。",
      showCancel: false,
      confirmText: "知道了"
    });
  },

  togglePassword() {
    this.setData({ showPassword: !this.data.showPassword });
  },

  async login() {
    const { account, password, hasAgreed } = this.data;
    if (this.data.loading) return;
    if (!hasAgreed) {
      wx.showToast({ title: "请先阅读并同意协议", icon: "none" });
      return;
    }
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
