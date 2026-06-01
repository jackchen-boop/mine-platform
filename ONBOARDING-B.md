# Mine Platform — 开发者 B 入门指南

> 你负责产品 UI 和前端交互。本文档是你需要了解的所有信息，读完即可上手。
> 完整技术参考见 `AGENTS.md`（重点看第六章 API 接口速查表）。

---

## 一、这是个什么产品

**矿脉科技（MinePulse）** — 矿权资产交易平台。

**三类用户：**
- **投资人**（investor）：浏览已发布矿权项目，提交投资意向
- **矿企内部**（mine_enterprise）：在工作台管理自己的矿权项目，上传资料，发布挂牌
- **管理员**（admin）：管理所有用户、项目、意向记录

**核心流程：**
```
矿企上传项目资料 → AI 生成分析报告 → 矿企发布项目 → 投资人浏览 → 投资人提交意向 → 管理员跟进
```

---

## 二、你需要的文件

### 拿到项目代码

从 A 处获取项目代码（git clone 或直接拷贝），你只需要关注：

```
mine-platform/
├── public/               ← 你的工作目录（全部在这里）
│   ├── index.html        # 前台：投资人看的项目列表
│   ├── project-detail.html  # 前台：项目详情页
│   ├── workbench.html    # 内部：矿企工作台（看板、发布、文件管理）
│   ├── admin.html        # 内部：管理后台（用户、意向、工作组）
│   ├── auth.html         # 登录/注册
│   ├── dashboard.html    # 仪表盘（含账号设置）
│   ├── upload.html       # 文件上传
│   ├── nav-component.js  # 公共导航（所有页面共用）
│   └── assets/
│       ├── theme.css     # 全局样式变量
│       └── api.js        # 公共 API 工具函数
├── AGENTS.md             ← 完整 API 接口速查表（必读）
└── TEST-PLAN.md          ← 功能测试用例
```

**不需要看、不需要改的：**
```
server/   ← 后端，A 负责，你不需要动
data/     ← 数据库文件
scripts/  ← 部署脚本，A 使用
```

### 你不需要安装任何东西

- 无 npm build，无编译步骤
- 直接用编辑器修改 HTML 文件
- Tailwind CSS 已通过 CDN 引入
- 改好后把文件发给 A，A 负责上传到服务器

---

## 三、线上环境

| 环境 | 地址 |
|------|------|
| 线上服务器 | `http://121.43.127.52:3000` |
| 前台首页 | `http://121.43.127.52:3000/index.html` |
| 工作台 | `http://121.43.127.52:3000/workbench.html` |
| 管理后台 | `http://121.43.127.52:3000/admin.html` |

### 测试账号

| 账号 | 密码 | 角色 | 用途 |
|------|------|------|------|
| admin@mine-cap.com | password | admin | 管理后台、意向管理 |
| ajin-zhang@mine-cap.com | Ajin@2026 | mine_enterprise | 工作台（组长）|
| ajin-li@mine-cap.com | Ajin@2026 | mine_enterprise | 工作台（成员）|

> **登录方式**：支持邮箱登录，也支持手机号登录（格式：1[3-9]xxxxxxxxx）

---

## 四、前端必知技术规范

### 认证
```javascript
// 获取 token（存在 localStorage）
const token = localStorage.getItem('mine_token');

// 所有需要认证的请求都带这个 Header
const headers = { 'Authorization': 'Bearer ' + token };

// 判断当前用户角色（必须调用 API，不能只读 localStorage）
const res = await fetch('/api/auth/me', { headers });
const { user } = await res.json();
const isAdmin = user.role === 'admin';
const isInternal = user.role === 'admin' || user.role === 'mine_enterprise';
```

### 字段显示规范

**项目名称：**
- 对外（投资人看）用 `listing_name` 字段：格式为 `省份**矿种项目`，如"河南**金矿项目"
- 内部（工作台）用 `name` 字段：真实名称

**开发阶段标签必须中文化：**
```javascript
const stageLabels = {
  'exploration': '勘查',
  'early-exploration': '初级勘查',
  'advanced-exploration': '高级勘查',
  'grassroots': '草根勘查',
  'feasibility-study': '可研',
  'unknown': ''  // 不显示
};
```

**矿种标签：** `mineral_types === 'unknown'` 时不显示

**工作台卡片：** 不显示项目编号（`code` 字段）

### AI 报告按钮状态
```javascript
btn.disabled = true;
btn.textContent = '⏳ 生成中，请勿重复点击...';
// 成功后
btn.textContent = '✅ 生成完成';
// 失败后
btn.disabled = false;
btn.textContent = '↻ 重新生成';
```

---

## 五、核心 API 速查（最常用的）

完整接口列表见 `AGENTS.md` 第六章，以下是前端最常调用的：

```javascript
// 前台：获取已发布项目列表
GET /api/mine-projects/published
// 返回：id, name(脱敏), mineral_types, province, city,
//       area_km2, estimated_reserve, reserve_grade,
//       development_stage, asking_price, highlights,
//       ai_score, ai_grade, ai_summary, description(脱敏),
//       report_content(AI分析JSON), published_photos

// 获取项目详情
GET /api/mine-projects/:id

// 提交投资意向
POST /api/mine-inquiries
Body: { project_id, contact, message }

// 当前用户信息（含角色）
GET /api/auth/me   → { user: { id, role, name, email } }

// 工作台：当前用户的工作组列表
GET /api/workgroups

// 工作组下的项目
GET /api/workgroups/:id/projects

// 管理员：意向列表
GET /api/admin/inquiries

// 更新意向状态
PUT /api/admin/inquiries/:id/status
Body: { status: 'contacted' | 'in_progress' | 'closed_won' | 'closed_lost' }
```

---

## 六、页面功能说明

### index.html（前台项目列表）
- 调用 `/api/mine-projects/published` 获取数据
- 支持按矿种、省份、关键词筛选
- 每个项目卡片点击跳转 `project-detail.html?id=xxx`

### project-detail.html（项目详情页）
- 根据登录状态和角色控制可见内容（见下方权限表）
- investor 可以提交投资意向
- mine_enterprise/admin 可以看项目资料和管理入口

**权限控制快速参考：**

| 模块 | 未登录 | investor | mine_enterprise/admin |
|------|--------|----------|----------------------|
| 基本信息 | 显示（脱敏） | 显示 | 显示 |
| AI 摘要评分 | 隐藏 | 显示 | 显示 |
| 投资意向按钮 | 显示（引导登录）| 显示 | 隐藏 |
| 项目资料/文件 | 隐藏 | 隐藏 | 显示 |
| 项目管理入口 | 隐藏 | 隐藏 | 显示 |

### workbench.html（工作台）
- 仅 mine_enterprise 和 admin 可访问
- 项目看板：展示工作组内所有项目，按状态分列
- 项目卡片显示：矿种/阶段标签 + 储量/品位/面积核心数据标签
- 发布状态三态：`active`（已发布）→ 修改+下架按钮；`inactive`有报告 → 发布按钮；`inactive`无报告 → 生成报告按钮
- admin 额外显示"意向管理"入口

### admin.html（管理后台）
- 仅 admin 可访问
- 用户管理、工作组管理、意向管理

---

## 七、当前待做任务

按优先级排列，每次开新对话只取一个任务：

| # | 任务 | 说明 |
|---|------|------|
| B1 | 前台项目列表视觉重设计 | 卡片布局、标签颜色、筛选栏交互优化 |
| B2 | 项目详情页信息架构优化 | 信息层次、AI摘要展示、意向表单位置 |
| B3 | AI 报告可视化呈现 | 需先等 A7（A 整理 JSON 字段结构文档）完成 |
| B4 | 工作台看板体验优化 | 卡片样式、状态颜色、操作按钮布局 |
| B5 | 意向管理界面设计 | 意向列表、状态筛选、跟进状态视觉 |
| B6 | 移动端适配 | index.html 和 project-detail.html 手机端布局 |
| B7 | 登录注册流程优化 | 表单体验、错误提示、手机号登录入口 |
| B8 | 招标公告生成页 | 新页面，需与 A 对齐字段规范后开发 |

---

## 八、开发流程

1. **开新对话** → 用下面的模板启动
2. **只做一个任务** → 每个对话聚焦单一任务，避免 context 膨胀
3. **改好后** → 把修改的文件发给 A，A 负责部署到服务器
4. **测试** → 用 `TEST-PLAN.md` 对应章节验证功能

### B 的对话启动模板（复制给 AI）

```
你是 mine-platform 的前端开发者，擅长产品设计和 UI 交互。
项目本地路径：[你的本地路径]/mine-platform
项目结构和 API 接口详见 AGENTS.md（重点看第六章 API 速查表和第十章前端规范）。
你只需要关注 public/ 目录，不要修改 server/ 下的文件。
技术栈：原生 HTML + Tailwind CSS（CDN），无需构建工具，直接修改 HTML 文件即可。
后端 API 已就绪，按照 AGENTS.md 中的接口速查表调用。
当前任务：[从上面任务清单选一个，粘贴任务说明]
```

---

## 九、需要联系 A 的情况

- 你需要一个新的 API 接口 → 在 `AGENTS.md` 第十一章"待开发接口需求"里描述清楚
- 改好文件需要上线 → 把文件发给 A，A 执行 scp 部署
- 发现后端数据有问题（字段值错误、数据缺失）→ 联系 A 排查数据库

---

> 最后更新：2026-06-01 | 当前版本：v1.0.0
