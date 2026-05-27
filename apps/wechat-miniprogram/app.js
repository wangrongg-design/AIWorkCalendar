const appConfig = require("./app.config");

App({
  globalData: {
    apiBaseUrl: appConfig.apiBaseUrl
  }
});
