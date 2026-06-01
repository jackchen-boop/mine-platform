const API_BASE = 'https://minelab.top/api';

function getHeaders() {
  const token = wx.getStorageSync('token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  return headers;
}

function request(options) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: API_BASE + options.url,
      method: options.method || 'GET',
      header: { ...getHeaders(), ...(options.header || {}) },
      data: options.data,
      success(res) {
        if (res.statusCode === 401) {
          wx.removeStorageSync('token');
          wx.removeStorageSync('userInfo');
          wx.redirectTo({ url: '/pages/login/login' });
          return reject(new Error('登录已过期'));
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else {
          reject(new Error(res.data?.error || '请求失败'));
        }
      },
      fail() {
        reject(new Error('网络请求失败'));
      }
    });
  });
}

module.exports = {
  // 登录
  login: (account, password) => request({ url: '/auth/login', method: 'POST', data: { account, password } }),
  
  // 微信登录
  wxLogin: (code) => request({ url: '/auth/wx-login', method: 'POST', data: { code } }),
  
  // 项目列表
  getProjects: (params) => request({ url: '/mine-projects', data: params }),
  
  // 项目详情
  getProject: (id) => request({ url: `/mine-projects/${id}` }),
  
  // 上传文件
  uploadFile: (filePath, formData) => {
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: API_BASE + '/mine-reports/upload',
        filePath: filePath,
        name: 'file',
        formData: formData,
        header: getAuthHeader(),
        success(res) {
          if (res.statusCode === 401) {
            wx.removeStorageSync('token');
            wx.redirectTo({ url: '/pages/login/login' });
            return reject(new Error('登录已过期'));
          }
          try {
            const data = JSON.parse(res.data);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(data);
            } else {
              reject(new Error(data.error || '上传失败'));
            }
          } catch (e) {
            reject(new Error('上传失败'));
          }
        },
        fail() {
          reject(new Error('上传失败'));
        }
      });
    });
  },
  
  // 获取报告列表
  getReports: () => request({ url: '/mine-reports' }),
  
  // 获取用户信息
  getUserInfo: () => request({ url: '/auth/me' }),
  
  // 发送短信验证码
  sendSmsCode: (phone) => request({ url: '/auth/send-sms-code', method: 'POST', data: { phone } }),
  
  // 手机号注册
  register: (data) => request({ url: '/auth/register', method: 'POST', data })
};
  
  // 发送短信验证码
  sendSmsCode: (phone) => request({ url: '/auth/send-sms-code', method: 'POST', data: { phone } }),
  
  // 手机号注册
  register: (data) => request({ url: '/auth/register', method: 'POST', data })
};
