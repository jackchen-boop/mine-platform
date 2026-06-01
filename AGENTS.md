# Mine Platform — Agent 配置文档

> 本文件是所有 AI 对话和开发者的唯一权威参考。修改 API 或数据库结构后必须同步更新此文件。

---

## 一、项目概览

- **技术栈**：Node.js >=22.5.0、Express、SQLite (better-sqlite3)、JWT、Tailwind CSS
- **AI 服务**：MiniMax M2.7（OpenAI 兼容接口）
- **端口**：3000
- **数据库**：`/opt/mine-platform/data/mineplatform.db`（SQLite）

---

## 二、服务器 & 部署（仅开发者 A 使用）

```
服务器 IP：121.43.127.52（阿里云）
SSH 用户：root
SSH 密码：^15Atendell
项目路径：/opt/mine-platform
系统服务：systemctl restart mine-platform
```

### 标准部署流程

```bash
# 1. 同步单个文件
sshpass -p '^15Atendell' scp -o StrictHostKeyChecking=no \
  <本地文件路径> root@121.43.127.52:/opt/mine-platform/<对应路径>

# 2. 重启服务
sshpass -p '^15Atendell' ssh -o StrictHostKeyChecking=no root@121.43.127.52 \
  "systemctl restart mine-platform && sleep 2 && systemctl is-active mine-platform"

# 3. 验证
sshpass -p '^15Atendell' ssh -o StrictHostKeyChecking=no root@121.43.127.52 \
  "curl -s http://localhost:3000/api/mine-projects/published | head -c 200"
```

> **注意**：服务器无 rsync，只能用 scp 同步文件。

---

## 三、双角色协同开发分工

> **分工原则**：不是按前端/后端分，而是按"谁更懂这件事"分。
> A 懂矿产交易业务 → 负责业务逻辑正确性；B 懂产品与 UI → 负责用户体验质量。
> 技术边界：A 管 `server/`，B 管 `public/`。

---

### 开发者 A — 矿产业务专家（负责后端 & 业务逻辑）

**负责文件：**
```
server/
├── routes/       # 所有 API 路由
├── db/           # 数据库结构、迁移、种子数据
├── middleware/   # 认证、权限中间件
├── lib/          # AI 分析引擎（mine-evaluation.js）
├── services/     # 业务服务层
└── utils/        # 工具函数
server.js         # Express 主入口
AGENTS.md         # 本文件（API 契约维护）
```

**专属权限：**
- 数据库结构变更（schema.js）
- 服务器部署 & 重启（见第二章）
- 环境变量 (.env) 修改

**当前任务清单（按优先级）：**

| # | 任务 | 核心文件 | 说明 |
|---|------|---------|------|
| A1 | AI 提示词优化 | `server/lib/mine-evaluation.js` | 校准九部分报告的 prompt：DCF 折现率参数、储量分类术语、品位单位是否符合行业规范 |
| A2 | 发布审核规则 | `server/routes/mine-projects.js` | 定义项目可发布的前置条件（有AI报告？有封面？有联系方式？），后端加校验，返回缺失项列表 |
| A3 | 数据完整性规则 | `server/routes/mine-analysis.js` | 哪些字段缺失会影响投资决策，给出专业提示文案 |
| A4 | 意向状态机 | `server/routes/mine-inquiries.js` | 定义意向流转：待处理→已联系→推进中→成交/放弃，各状态的业务含义 |
| A5 | 字段脱敏规则维护 | `server/routes/mine-projects.js` | `listing_name`/`name`、`description_masked`/`description` 的披露策略 |
| A6 | 项目筛选/排序逻辑 | `server/routes/mine-projects.js` | 投资人最关注什么维度？当前排序（ai_score DESC）是否合理 |
| A7 | AI 报告 JSON 结构文档化 | `AGENTS.md` 本文件 | 将 `ai_analyses.content` 的 JSON 字段结构写入接口说明，让 B 能正确渲染 |

**对话启动模板（复制给 AI 使用）：**
```
你是 mine-platform 的后端开发者，熟悉矿产交易业务。
项目本地路径：[你的本地路径]/mine-platform
项目结构、API 接口、部署方式详见 AGENTS.md。
你只需要关注 server/ 目录和 server.js，不要修改 public/ 下的文件。
修改 API 后必须更新 AGENTS.md 中的接口速查表。
当前任务：[具体任务描述]
```

---

### 开发者 B — 产品 UI 专家（负责前端 & 交互体验）

**负责文件：**
```
public/
├── index.html          # 前台项目展示列表（投资人入口）
├── project-detail.html # 项目详情页（对外展示）
├── workbench.html      # 工作台（内部矿企用户）
├── admin.html          # 管理后台（admin专用）
├── auth.html           # 登录/注册
├── upload.html         # 文件上传
├── dashboard.html      # 仪表盘（含账号设置）
├── nav-component.js    # 公共导航组件
└── assets/             # 主题样式、公共 JS
miniprogram/            # 微信小程序端
```

**权限边界：**
- 不操作数据库，不接触服务器密码
- 不修改 `server/` 目录
- 所有数据通过 AGENTS.md 第六章的 API 接口获取
- 完成改动后通知 A 部署（或 A 直接 scp 同步 public/ 目录）

**当前任务清单（按优先级）：**

| # | 任务 | 核心文件 | 说明 |
|---|------|---------|------|
| B1 | 前台项目列表视觉重设计 | `public/index.html` | 卡片布局、标签颜色体系、筛选栏交互，投资人第一印象 |
| B2 | 项目详情页信息架构优化 | `public/project-detail.html` | 信息层次、AI摘要折叠展开、意向表单位置和样式 |
| B3 | AI 报告可视化呈现 | `public/project-detail.html` `public/workbench.html` | 九部分报告如何展示（折叠卡片/进度条/评分环），需配合 A7 的 JSON 结构文档 |
| B4 | 工作台看板体验优化 | `public/workbench.html` | 卡片密度、状态颜色视觉语言统一、操作按钮布局 |
| B5 | 意向管理界面设计 | `public/admin.html` `public/workbench.html` | 意向列表列设计、状态筛选、跟进状态视觉区分 |
| B6 | 移动端适配 | `public/index.html` `public/project-detail.html` | 手机端布局响应式 |
| B7 | 登录/注册流程优化 | `public/auth.html` | 表单体验、错误提示样式、手机号登录入口 |
| B8 | 招标公告生成页（新建） | `public/` 新页面 | 用户填写项目信息 → 生成专业公告的交互流程和输出样式 |

**对话启动模板（复制给 AI 使用）：**
```
你是 mine-platform 的前端开发者，擅长产品设计和 UI 交互。
项目本地路径：[你的本地路径]/mine-platform
项目结构、API 接口说明详见 AGENTS.md（重点看第六章接口速查表和第八章权限规则）。
你只需要关注 public/ 目录，不要修改 server/ 下的文件。
后端 API 已就绪，按照 AGENTS.md 中的接口速查表调用。
技术栈：原生 HTML + Tailwind CSS（CDN），无需构建工具，直接修改 HTML 文件即可。
当前任务：[具体任务描述]
```

---

### 协同规则

1. **A 变更 API** → 必须先更新本文件第六章的接口速查表，再通知 B
2. **B 需要新接口** → 在本文件末尾"待开发接口需求"区域写明需求，A 据此开发
3. **数据库变更** → 只有 A 操作，变更后更新本文件第七章数据库表结构摘要
4. **版本发布** → A 执行 `scripts/release.sh`，B 的改动需先同步给 A
5. **B 的文件同步方式**：B 将改好的文件发送给 A，由 A 执行 scp 部署；或 B 提交 git，A pull 后部署

---

### 需要 A+B 协作的任务

先对齐再分头实现：

| 任务 | A 先做 | B 再做 |
|------|--------|--------|
| AI 报告展示 | A7：文档化 JSON 字段结构 | B3：设计展示组件 |
| 项目发布流程 | A2：定义发布校验规则 | B4：设计"发布前检查清单"UI |
| 招标公告生成 | A：提供公告模板必填字段 | B8：设计生成流程和输出样式 |
| 意向跟进看板 | A4：定义状态机和业务含义 | B5：设计跟进面板交互 |

---

## 四、角色权限体系

| 角色 | role 值 | 说明 |
|------|---------|------|
| 全局管理员 | `admin` | 所有权限 |
| 矿企内部 | `mine_enterprise` | 可管理己方项目、工作台 |
| 投资人 | `investor` | 只读浏览、提交意向 |

**isInternalUser 判断**：调用 `/api/auth/me` 服务端验证，`role === 'admin' || role === 'mine_enterprise'` 为内部用户，默认为 `false`。

### 测试账号

| 账号 | 密码 | 角色 |
|------|------|------|
| admin@mine-cap.com | password | admin |
| ajin-zhang@mine-cap.com | Ajin@2026 | mine_enterprise（组长）|
| ajin-li@mine-cap.com | Ajin@2026 | mine_enterprise |
| ajin-wang@mine-cap.com | Ajin@2026 | mine_enterprise |

---

## 五、项目状态机

```
inactive（未发布）→ active（已发布）→ deleted（软删除）
```

- 发布：`PUT /api/mine-projects/:id` 设置 `status: 'active'`
- 下架：`POST /api/mine-projects/:id/unpublish`
- 删除：`DELETE /api/mine-projects/:id`（软删除，status = 'deleted'）

---

## 六、API 接口速查表

> 所有接口 base URL：`http://服务器IP:3000`（或域名）
> 需要认证的接口请在 Header 中携带：`Authorization: Bearer <token>`

### 认证 `/api/auth`

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| POST | `/api/auth/login` | 否 | 登录，返回 token 和 user 对象 |
| POST | `/api/auth/register` | 否 | 注册新用户 |
| GET | `/api/auth/me` | 是 | 获取当前登录用户信息（含 role） |
| PUT | `/api/auth/profile` | 是 | 更新个人资料 |
| POST | `/api/auth/send-sms-code` | 否 | 发送短信验证码 |
| POST | `/api/auth/wx-login` | 否 | 微信小程序登录 |
| POST | `/api/auth/wx-bind` | 否 | 微信账号绑定 |

**登录响应示例：**
```json
{ "token": "eyJ...", "user": { "id": 1, "role": "admin", "email": "..." } }
```

---

### 项目 `/api/mine-projects`

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/api/mine-projects/published` | 否 | 前台展示的已发布项目列表（脱敏） |
| GET | `/api/mine-projects` | 可选 | 项目列表（支持筛选，内部用户可见更多字段） |
| GET | `/api/mine-projects/:id` | 可选 | 项目详情（未登录返回脱敏版） |
| POST | `/api/mine-projects` | 是 | 新建项目 |
| PUT | `/api/mine-projects/:id` | 是 | 更新项目信息 |
| DELETE | `/api/mine-projects/:id` | 是 | 软删除项目 |
| POST | `/api/mine-projects/:id/unpublish` | 是 | 下架项目（status → inactive） |
| POST | `/api/mine-projects/:id/cover` | 是 | 上传项目封面图 |
| GET | `/api/mine-projects/:id/photos` | 是 | 获取项目图片列表 |
| POST | `/api/mine-projects/:id/photos` | 是 | 上传项目图片 |
| DELETE | `/api/mine-projects/:id/photos/:photoId` | 是 | 删除项目图片 |

**`/published` 返回字段：**
`id, code, name(脱敏), mineral_types, province, city, area_km2, estimated_reserve, reserve_grade, development_stage, asking_price, highlights, is_hot, is_featured, ai_score, ai_grade, ai_summary, description(脱敏), report_content(AI分析JSON), published_photos`

**列表筛选参数：**
`mineral`, `province`, `stage`, `keyword`, `hot_only`, `page`, `limit`, `mine_only`, `unassigned`

---

### AI 分析 `/api/mine-analysis`

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| POST | `/api/mine-analysis/analyze` | 是 | 对项目执行 AI 分析（生成报告） |
| POST | `/api/mine-analysis/analyze-text` | 是 | 分析文本内容 |
| POST | `/api/mine-analysis/chat` | 是 | AI 对话（SSE 流式） |
| GET | `/api/mine-analysis/project/:id` | 是 | 获取指定项目的 AI 分析报告 |
| GET | `/api/mine-analysis/history` | 是 | 获取分析历史 |
| GET | `/api/mine-analysis/missing-data` | 是 | 获取数据缺失提示 |
| GET | `/api/mine-analysis/stage-criteria` | 否 | 获取阶段评判标准 |

---

### 项目报告（文件）`/api/mine-reports`

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| POST | `/api/mine-reports/upload` | 是 | 上传单个文件（关联项目） |
| POST | `/api/mine-reports/upload-batch` | 是 | 批量上传文件（最多20个） |
| POST | `/api/mine-reports` | 是 | 新建报告记录 |
| GET | `/api/mine-reports` | 是 | 获取报告列表 |
| GET | `/api/mine-reports/project/:id` | 是 | 获取指定项目的所有报告 |
| GET | `/api/mine-reports/:id/download` | 是 | 下载报告文件 |
| DELETE | `/api/mine-reports/:id` | 是 | 删除报告 |
| PUT | `/api/mine-reports/link-project` | 是 | 将报告关联到项目 |

---

### 投资意向 `/api/mine-inquiries`

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| POST | `/api/mine-inquiries` | 否 | 提交投资意向（投资人填写） |
| GET | `/api/mine-inquiries` | 是 | 获取意向列表（admin 可见全部） |

---

### 工作组 `/api/workgroups`

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/api/workgroups` | 是 | 获取当前用户的工作组列表 |
| POST | `/api/workgroups` | 是 | 创建工作组 |
| GET | `/api/workgroups/:id` | 是 | 获取工作组详情 |
| PUT | `/api/workgroups/:id` | 是 | 更新工作组信息 |
| DELETE | `/api/workgroups/:id` | 是 | 删除工作组 |
| GET | `/api/workgroups/:id/members` | 是 | 获取成员列表 |
| POST | `/api/workgroups/:id/members` | 是 | 添加成员 |
| DELETE | `/api/workgroups/:id/members/:userId` | 是 | 移除成员 |
| GET | `/api/workgroups/:id/projects` | 是 | 获取工作组项目列表 |
| POST | `/api/workgroups/:id/projects` | 是 | 向工作组添加项目 |

---

### 项目任务 `/api/project-tasks`

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/api/project-tasks/phases` | 否 | 获取阶段定义列表 |
| GET | `/api/project-tasks` | 是 | 获取任务列表（按项目筛选） |
| POST | `/api/project-tasks` | 是 | 创建任务 |
| PUT | `/api/project-tasks/:id` | 是 | 更新任务状态 |
| DELETE | `/api/project-tasks/:id` | 是 | 删除任务 |
| GET | `/api/project-tasks/activities` | 是 | 获取活动记录 |
| POST | `/api/project-tasks/activities` | 是 | 新增活动记录 |
| GET | `/api/project-tasks/deliverables` | 是 | 获取交付物列表 |
| POST | `/api/project-tasks/deliverables` | 是 | 新增交付物 |
| DELETE | `/api/project-tasks/deliverables/:id` | 是 | 删除交付物 |
| GET | `/api/project-tasks/progress` | 是 | 获取项目进度概览 |

---

### 项目优先级 `/api/project-priority`

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/api/project-priority` | 是 | 获取优先级排序列表 |
| GET | `/api/project-priority/:projectId` | 是 | 获取指定项目优先级 |
| PUT | `/api/project-priority/:projectId` | 是 | 更新项目优先级 |
| GET | `/api/project-priority/:projectId/participants` | 是 | 获取项目参与人 |
| POST | `/api/project-priority/:projectId/participants` | 是 | 添加参与人 |
| PUT | `/api/project-priority/:projectId/participants/:userId` | 是 | 更新参与人角色 |
| DELETE | `/api/project-priority/:projectId/participants/:userId` | 是 | 移除参与人 |

---

### 管理后台 `/api/admin`（需 admin 角色）

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/api/admin/dashboard` | admin | 获取统计概览数据 |
| GET | `/api/admin/users` | admin | 用户列表 |
| GET | `/api/admin/users/:id` | admin | 用户详情 |
| POST | `/api/admin/users` | admin | 创建用户 |
| PUT | `/api/admin/users/:id` | admin | 更新用户信息 |
| PUT | `/api/admin/users/:id/password` | admin | 重置用户密码 |
| DELETE | `/api/admin/users/:id` | admin | 删除用户 |
| GET | `/api/admin/workgroups` | admin | 工作组列表 |
| POST | `/api/admin/workgroups` | admin | 创建工作组 |
| PUT | `/api/admin/workgroups/:id` | admin | 更新工作组 |
| DELETE | `/api/admin/workgroups/:id` | admin | 删除工作组 |
| POST | `/api/admin/workgroups/:id/members` | admin | 添加工作组成员 |
| DELETE | `/api/admin/workgroups/:id/members/:userId` | admin | 移除工作组成员 |
| GET | `/api/admin/projects` | admin | 所有项目列表（含未发布） |
| GET | `/api/admin/settings` | admin | 系统配置 |
| GET | `/api/admin/inquiries` | admin | 获取所有投资意向 |
| PUT | `/api/admin/inquiries/:id/status` | admin | 更新意向状态 |

---

### 其他接口

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/api/mine-stats` | 否 | 平台统计数据（项目数量等） |
| GET | `/api/mine-partners` | 否 | 合作伙伴列表 |
| GET | `/api/credits` | 是 | 查询积分余额 |
| GET | `/api/credits/transactions` | 是 | 积分流水 |
| POST | `/api/credits/recharge` | 是 | 积分充值 |
| POST | `/api/credits/consume` | 是 | 积分消费 |

---

## 七、数据库表结构摘要

> 完整 DDL 见 `server/db/schema.js`

| 表名 | 关键字段 | 说明 |
|------|---------|------|
| `users` | id, email, role, password_hash, name | 用户表 |
| `mine_projects` | id, code, name, listing_name, status, owner_id, workgroup_id, report_id, ai_score, ai_grade | 矿权项目主表 |
| `ai_analyses` | id, project_id, content(JSON), created_at | AI 分析报告（content 字段为 JSON） |
| `mine_reports` | id, project_id, filename, stored_name, user_id | 项目上传文件 |
| `project_photos` | id, project_id, user_id, filename, stored_name | 项目图片 |
| `project_tasks` | id, project_id, phase, title, status, priority | 项目任务 |
| `workgroups` | id, name, owner_id | 工作组 |
| `workgroup_members` | workgroup_id, user_id, role | 工作组成员 |
| `inquiries` | id, project_id, user_id, contact, message, status | 投资意向 |
| `credits` | user_id, balance | 用户积分 |

**重要关联：**
- `mine_projects.report_id` → `ai_analyses.id`（最新 AI 报告）
- `mine_projects.owner_id` → `users.id`
- `mine_projects.workgroup_id` → `workgroups.id`

**项目 status 值：** `inactive`（未发布）| `active`（已发布）| `deleted`（软删除）

---

## 八、项目详情页权限规则

| 模块 | 未登录 | investor | mine_enterprise | admin |
|------|--------|----------|-----------------|-------|
| 基本信息（矿种/省市/阶段） | 脱敏显示 | 完整显示 | 完整显示 | 完整显示 |
| AI 评分摘要 | 隐藏 | 显示 | 显示 | 显示 |
| 项目描述 | 脱敏 | 脱敏 | 完整 | 完整 |
| 投资意向提交 | 显示（引导登录） | 显示 | 隐藏 | 隐藏 |
| 项目资料/文件列表 | 隐藏 | 隐藏 | 显示 | 显示 |
| 数据完整性提示 | 隐藏 | 隐藏 | 显示 | 显示 |
| 项目管理入口 | 隐藏 | 隐藏 | 显示 | 显示 |
| AI 投资价值分析 | 隐藏 | 隐藏 | 显示 | 显示 |

---

## 九、版本管理

详见 `VERSION` 文件（当前版本）和 `scripts/release.sh`（发布脚本）。

**回滚流程：**
```bash
# 查看版本历史
git log --oneline

# 回滚到指定版本（在服务器执行）
cd /opt/mine-platform
git checkout <commit-hash>
systemctl restart mine-platform
```

详见 `CHANGELOG.md` 中的版本记录。

---

## 十、前端开发规范（B 必读）

### 技术约束
- **无构建工具**：直接修改 HTML 文件，Tailwind CSS 通过 CDN 引入，无需 npm build
- **公共导航**：`nav-component.js` 是所有页面共用的顶部导航，修改需注意影响范围
- **认证方式**：`localStorage.getItem('mine_token')` 获取 token，所有需认证接口在 Header 加 `Authorization: Bearer <token>`
- **角色判断**：必须调用 `/api/auth/me` 服务端验证，不能只依赖 localStorage 缓存的角色字段

### 字段显示规范
- **项目名称**：对外展示用 `listing_name`（脱敏名），内部用 `name`（真实名）。脱敏格式：`省份**矿种项目`，例如"河南**金矿项目"
- **开发阶段中文映射**（全部用中文，禁止显示英文原始值）：

  | 英文值 | 中文显示 |
  |--------|---------|
  | `exploration` | 勘查 |
  | `early-exploration` | 初级勘查 |
  | `advanced-exploration` | 高级勘查 |
  | `grassroots` | 草根勘查 |
  | `feasibility-study` | 可研 |
  | `unknown` | 不显示 |

- **mineral_types**：值为 `unknown` 时不显示该标签
- **项目编号**（code 字段）：工作台看板卡片中不显示

### AI 报告按钮状态规范
- 生成中：按钮立即禁用，显示 `⏳ 生成中，请勿重复点击...`
- 生成成功：保持禁用，显示 `✅ 生成完成`
- 生成失败：恢复可点击，显示 `↻ 重新生成`

### AI 输出清洗规范
- AI 生成的公告/报告内容必须去除 `<think>...</think>` 思维链块，不向用户展示模型推理过程

---

## 十一、待开发接口需求

> B 在此区域描述需要 A 新增的接口，A 开发完成后更新接口速查表并删除对应需求条目。

| 提出方 | 需求描述 | 优先级 | 状态 |
|--------|---------|--------|------|
| - | - | - | - |

---

## 十二、Lint & Typecheck

暂无配置。验证语法：`node --check server.js`
