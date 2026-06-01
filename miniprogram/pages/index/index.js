const api = require('../../utils/api');

Page({
  data: {
    projects: [],
    keyword: '',
    currentFilter: 'all',
    page: 1,
    pageSize: 10,
    hasMore: true,
    loading: false
  },

  onLoad() {
    this.loadProjects();
  },

  onShow() {
    this.loadProjects(true);
  },

  onPullDownRefresh() {
    this.setData({ page: 1, hasMore: true }, () => {
      this.loadProjects(true).then(() => {
        wx.stopPullDownRefresh();
      });
    });
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadProjects();
    }
  },

  loadProjects(reset = false) {
    if (this.data.loading) return Promise.resolve();

    this.setData({ loading: true });
    const page = reset ? 1 : this.data.page;

    return api.getProjects({
      page: page,
      pageSize: this.data.pageSize,
      keyword: this.data.keyword,
      filter: this.data.currentFilter === 'all' ? '' : this.data.currentFilter
    }).then(res => {
      const list = res.projects || res.data || res;
      const projects = Array.isArray(list) ? list : [];

      this.setData({
        projects: reset ? projects : [...this.data.projects, ...projects],
        page: page + 1,
        hasMore: projects.length >= this.data.pageSize,
        loading: false
      });
    }).catch(err => {
      this.setData({ loading: false });
      wx.showToast({ title: err.message || '加载失败', icon: 'none' });
    });
  },

  onSearchInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  doSearch() {
    this.setData({ page: 1, hasMore: true }, () => {
      this.loadProjects(true);
    });
  },

  setFilter(e) {
    const filter = e.currentTarget.dataset.filter;
    this.setData({ currentFilter: filter, page: 1, hasMore: true }, () => {
      this.loadProjects(true);
    });
  },

  goProjectDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.showToast({ title: '项目详情页开发中', icon: 'none' });
    // wx.navigateTo({ url: '/pages/project-detail/project-detail?id=' + id });
  }
});
