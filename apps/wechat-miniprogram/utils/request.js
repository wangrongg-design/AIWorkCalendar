const { getToken, clearSession } = require("./storage");

function apiBaseUrl() {
  const app = getApp();
  return wx.getStorageSync("apiBaseUrl") || app.globalData.apiBaseUrl || "http://localhost:3001";
}

function request(path, options = {}) {
  const token = getToken();
  const headers = {
    "content-type": "application/json",
    ...(options.header || {})
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${apiBaseUrl()}${path}`,
      method: options.method || "GET",
      data: options.data,
      header: headers,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
          return;
        }
        const message = Array.isArray(res.data && res.data.message)
          ? res.data.message.join("; ")
          : (res.data && res.data.message) || `请求失败 ${res.statusCode}`;
        if (res.statusCode === 401) {
          clearSession();
          wx.reLaunch({ url: "/pages/login/login" });
        }
        reject(new Error(message));
      },
      fail(error) {
        reject(new Error(error.errMsg || "网络请求失败"));
      }
    });
  });
}

module.exports = {
  request,
  apiBaseUrl
};
