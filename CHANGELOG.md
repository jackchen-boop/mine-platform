# Changelog

## v1.0.0 — 2026-06-01

### 前台展示
- 项目列表页（index.html）展示已发布项目，含矿种/省市/阶段/AI评分标签
- 项目详情页（project-detail.html）按角色区分可见内容
- 投资人屏蔽内部数据（项目资料/数据完整性提示/项目管理/AI分析）

### 工作台（workbench.html）
- 项目看板卡片显示核心数据标签（储量/品位/面积），隐藏项目编号
- 阶段标签全中文化，修复 exploration/unknown 英文显示问题
- 发布状态三态：已发布（修改+下架）/ 有报告（发布）/ 无报告（生成报告）
- 下架功能：点击下架 → 确认 → status 变为 inactive → 前台下线
- admin 登录后左侧显示意向管理入口

### 管理后台（admin.html）
- 意向管理页面：查看所有投资意向记录，可更新状态

### 后端 API
- 新增 `GET /api/mine-projects/published`（前台专用，JOIN ai_analyses 获取报告内容）
- 新增 `POST /api/mine-projects/:id/unpublish`（下架接口）
- 新增 `GET /api/admin/inquiries` 和 `PUT /api/admin/inquiries/:id/status`
- 修复 project_photos 表字段名（filename/stored_name，无 url/thumb_url）

### 工程化
- 建立 AGENTS.md 协同开发规范（API 速查表、分工职责、部署流程）
- 建立 TEST-PLAN.md 功能测试方案（T01~T08 初始测试用例）
- 建立版本管理机制（VERSION 文件 + scripts/release.sh + scripts/rollback.sh）
