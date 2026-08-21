const BASE = 'https://minelab.top';

Page({
  data: {
    activeTool: 'assessment',
    currentUrl: BASE + '/insurance',
    tools: [
      { key: 'assessment', name: '方案测评', path: '/insurance' },
      { key: 'ci', name: '重疾对比', path: '/insurance/compare' },
      { key: 'savings', name: '储蓄对比', path: '/savings/compare' },
      { key: 'life', name: '寿险对比', path: '/life/compare' }
    ]
  },

  onLoad(options) {
    const tool = options.tool || 'assessment';
    this.switchToolByKey(tool);
  },

  switchTool(e) {
    const key = e.currentTarget.dataset.key;
    this.switchToolByKey(key);
  },

  switchToolByKey(key) {
    const tool = this.data.tools.find(t => t.key === key);
    if (!tool) return;
    this.setData({
      activeTool: key,
      currentUrl: BASE + tool.path
    });
  },

  onLoadWebview(e) {
    console.log('webview loaded', e.detail);
  },

  onError(e) {
    console.error('webview error', e.detail);
    wx.showToast({ title: '页面加载失败，请重试', icon: 'none' });
  },

  onMessage(e) {
    console.log('webview message', e.detail);
  }
});
