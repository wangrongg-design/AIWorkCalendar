const appConfig = require("./app.config");

App({
  globalData: {
    apiBaseUrl: appConfig.apiBaseUrl
  },
  onLaunch() {
    const apiBaseUrl = wx.getStorageSync("apiBaseUrl");
    if (apiBaseUrl) {
      this.globalData.apiBaseUrl = apiBaseUrl;
    }
  }
});
