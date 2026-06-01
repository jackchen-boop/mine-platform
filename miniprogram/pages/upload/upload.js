const api = require('../../utils/api');

Page({
  data: {
    projectOptions: [{ id: '__new__', name: '+ 创建新项目' }],
    projectIndex: -1,
    isNewProject: false,
    newProjectName: '',
    filePath: '',
    fileName: '',
    description: '',
    uploading: false,
    reports: []
  },

  onLoad() {
    this.loadProjects();
    this.loadReports();
  },

  onShow() {
    this.loadProjects();
    this.loadReports();
  },

  loadProjects() {
    api.getProjects({ page: 1, pageSize: 100 }).then(res => {
      const list = res.projects || res.data || res;
      const projects = Array.isArray(list) ? list : [];
      this.setData({
        projectOptions: [
          { id: '__new__', name: '+ 创建新项目' },
          ...projects.map(p => ({ id: p.id, name: p.name }))
        ]
      });
    }).catch(() => {
      // ignore
    });
  },

  loadReports() {
    api.getReports().then(res => {
      const list = res.reports || res.data || res;
      if (Array.isArray(list)) {
        this.setData({ reports: list.slice(0, 10) });
      }
    }).catch(() => {
      // ignore
    });
  },

  onProjectChange(e) {
    const index = e.detail.value;
    const option = this.data.projectOptions[index];
    this.setData({
      projectIndex: index,
      isNewProject: option.id === '__new__'
    });
  },

  onNewProjectNameInput(e) {
    this.setData({ newProjectName: e.detail.value });
  },

  onDescInput(e) {
    this.setData({ description: e.detail.value });
  },

  chooseFile() {
    wx.chooseMessageFile({
      count: 1,
      type: 'all',
      success: (res) => {
        const file = res.tempFiles[0];
        this.setData({
          filePath: file.path,
          fileName: file.name
        });
      }
    });
  },

  doUpload() {
    const { projectIndex, projectOptions, isNewProject, newProjectName, filePath, description } = this.data;

    if (projectIndex < 0) {
      wx.showToast({ title: '请选择项目', icon: 'none' });
      return;
    }
    if (isNewProject && !newProjectName.trim()) {
      wx.showToast({ title: '请输入新项目名', icon: 'none' });
      return;
    }
    if (!filePath) {
      wx.showToast({ title: '请选择文件', icon: 'none' });
      return;
    }

    const project = projectOptions[projectIndex];
    const formData = {
      project_id: isNewProject ? '' : project.id,
      new_project_name: isNewProject ? newProjectName : '',
      description: description || ''
    };

    this.setData({ uploading: true });

    api.uploadFile(filePath, formData)
      .then(() => {
        wx.showToast({ title: '上传成功', icon: 'success' });
        this.setData({
          filePath: '',
          fileName: '',
          description: '',
          newProjectName: '',
          isNewProject: false,
          projectIndex: -1
        });
        this.loadReports();
      })
      .catch(err => {
        wx.showToast({ title: err.message || '上传失败', icon: 'none' });
      })
      .finally(() => {
        this.setData({ uploading: false });
      });
  }
});
