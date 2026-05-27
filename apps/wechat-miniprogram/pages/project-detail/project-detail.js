Page({
  data: {
    project: null
  },

  onLoad() {
    const project = wx.getStorageSync("selectedProjectDetail");
    if (!project) {
      wx.showToast({ title: "项目不存在", icon: "none" });
      return;
    }
    this.setData({ project });
  }
});
