const app = getApp();

Page({
  data: {
    userInfo: {},
    roleText: '',
    userInitial: '',
    stats: {
      projects: 0,
      reports: 0
    }
  },

  onLoad() {
    this.loadUserInfo();
  },

  onShow() {
    this.loadUserInfo();
  },

  loadUserInfo() {
    const userInfo = wx.getStorageSync('userInfo') || {};
    const name = userInfo.name || userInfo.email || '';
    const initial = name.charAt(0).toUpperCase() || '?';

    let roleText = '用户';
    if (userInfo.role === 'admin') roleText = '管理员';
    else if (userInfo.role === 'investor') roleText = '投资人';
    else if (userInfo.role === 'uploader') roleText = '上传者';

    this.setData({
      userInfo: userInfo,
      userInitial: initial,
      roleText: roleText
    });

    // 加载统计数据
    this.loadStats();
  },

  loadStats() {
    // 从本地缓存获取统计数据
    const app = getApp();
    app.request({ url: '/mine-projects', data: { page: 1, pageSize: 1 } }).then(res => {
      const total = res.total || res.count || 0;
      this.setData({ 'stats.projects': total });
    }).catch(() => {});

    app.request({ url: '/mine-reports', data: { page: 1, pageSize: 1 } }).then(res => {
      const total = res.total || res.count || 0;
      this.setData({ 'stats.reports': total });
    }).catch(() => {});
  },

  goMyReports() {
    wx.showToast({ title: '功能开发中', icon: 'none' });
  },

  goSettings() {
    wx.showToast({ title: '功能开发中', icon: 'none' });
  },

  showAbout() {
    wx.showModal({
      title: '关于矿脉科技',
      content: '矿脉科技 MinePulse v1.0\n\n专注于矿产资源项目信息平台',
      showCancel: false
    });
  },

  doLogout() {
    wx.showModal({
      title: '确认退出',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          app.clearAuth();
          wx.reLaunch({ url: '/pages/login/login' });
        }
      }
    });
  }
});
