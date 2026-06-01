App({
  globalData: {
    apiBase: 'https://minelab.top/api',
    token: null,
    userInfo: null
  },

  onLaunch() {
    // 从本地存储恢复登录态
    const token = wx.getStorageSync('token');
    const userInfo = wx.getStorageSync('userInfo');
    if (token) {
      this.globalData.token = token;
      this.globalData.userInfo = userInfo;
    } else {
      // 未登录，延迟跳转登录页（避免和首页同时加载冲突）
      setTimeout(() => {
        wx.redirectTo({ url: '/pages/login/login' });
      }, 0);
    }
  },

  // 获取请求头
  getHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (this.globalData.token) {
      headers['Authorization'] = 'Bearer ' + this.globalData.token;
    }
    return headers;
  },

  // 封装请求
  request(options) {
    const app = this;
    return new Promise((resolve, reject) => {
      wx.request({
        url: app.globalData.apiBase + options.url,
        method: options.method || 'GET',
        header: { ...app.getHeaders(), ...(options.header || {}) },
        data: options.data,
        success(res) {
          if (res.statusCode === 401) {
            // Token 过期，清除并跳登录
            app.clearAuth();
            wx.redirectTo({ url: '/pages/login/login' });
            reject(new Error('登录已过期'));
            return;
          }
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(res.data);
          } else {
            reject(new Error(res.data?.error || '请求失败'));
          }
        },
        fail(err) {
          reject(new Error('网络请求失败'));
        }
      });
    });
  },

  // 保存登录态
  setAuth(token, user) {
    this.globalData.token = token;
    this.globalData.userInfo = user;
    wx.setStorageSync('token', token);
    wx.setStorageSync('userInfo', user);
  },

  // 清除登录态
  clearAuth() {
    this.globalData.token = null;
    this.globalData.userInfo = null;
    wx.removeStorageSync('token');
    wx.removeStorageSync('userInfo');
  }
});
