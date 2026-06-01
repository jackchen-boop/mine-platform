const api = require('../../utils/api');

Page({
  data: {
    account: '',
    password: '',
    errorMsg: ''
  },

  onAccountInput(e) {
    this.setData({ account: e.detail.value });
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value });
  },

  doLogin() {
    const { account, password } = this.data;
    if (!account || !password) {
      this.setData({ errorMsg: '请输入账号和密码' });
      return;
    }
    api.login(account, password)
      .then(res => {
        wx.setStorageSync('token', res.token);
        wx.setStorageSync('userInfo', res.user);
        wx.switchTab({ url: '/pages/index/index' });
      })
      .catch(err => {
        this.setData({ errorMsg: err.message });
      });
  },

  doWxLogin() {
    wx.login({
      success: (res) => {
        if (res.code) {
          api.wxLogin(res.code)
            .then(data => {
              if (data.bound) {
                wx.setStorageSync('token', data.token);
                wx.setStorageSync('userInfo', data.user);
                wx.switchTab({ url: '/pages/index/index' });
              } else {
                wx.showModal({
                  title: '提示',
                  content: '首次微信登录需要绑定已有账号',
                  confirmText: '去绑定',
                  success: (modalRes) => {
                    if (modalRes.confirm) {
                      wx.navigateTo({ url: '/pages/login/login?openid=' + data.openid });
                    }
                  }
                });
              }
            })
            .catch(err => {
              this.setData({ errorMsg: err.message });
            });
        }
      }
    });
  },

  goRegister() {
    wx.navigateTo({ url: '/pages/login/login' });
  }
});
