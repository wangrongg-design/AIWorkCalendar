const TOKEN_KEY = "workCalendarToken";
const USER_KEY = "workCalendarUser";

function getToken() {
  return wx.getStorageSync(TOKEN_KEY) || "";
}

function getUser() {
  return wx.getStorageSync(USER_KEY) || null;
}

function setSession(accessToken, user) {
  wx.setStorageSync(TOKEN_KEY, accessToken);
  wx.setStorageSync(USER_KEY, user);
}

function clearSession() {
  wx.removeStorageSync(TOKEN_KEY);
  wx.removeStorageSync(USER_KEY);
}

module.exports = {
  getToken,
  getUser,
  setSession,
  clearSession
};
