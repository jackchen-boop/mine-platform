// 服务端数据脱敏 — 未登录用户只能看到脱敏数据，防止前端绕过

/**
 * 脱敏单个项目（用于列表）
 * @param {object} project - 原始项目对象
 * @param {boolean} isAuth - 是否已登录
 */
export function desensitizeProject(project, isAuth) {
  if (isAuth) return project;

  return {
    ...project,
    // 金额显示脱敏
    amount: '¥*** 亿',
    amount_raw: null,
    valuation: '估值保密',
    valuation_raw: null,
    // 团队信息脱敏
    team_info: maskTeamInfo(project.team_info),
    // 财务摘要脱敏
    financial_summary: maskFinancialSummary(project.financial_summary),
    // 联系信息完全隐藏
    business_model: project.business_model ? maskText(project.business_model, 0.5) : null,
    // 标记为脱敏数据
    _masked: true
  };
}

/**
 * 脱敏项目列表
 */
export function desensitizeProjects(projects, isAuth) {
  return projects.map(p => desensitizeProject(p, isAuth));
}

/**
 * 脱敏项目详情（更严格）
 */
export function desensitizeProjectDetail(project, isAuth) {
  if (isAuth) return project;

  const base = desensitizeProject(project, isAuth);
  return {
    ...base,
    description: project.description ? maskText(project.description, 0.3) : null,
    _masked: true,
    _message: '注册登录后可查看完整项目信息'
  };
}

/**
 * 脱敏路演信息
 */
export function desensitizeRoadshow(roadshow, isAuth) {
  if (isAuth) return roadshow;
  return {
    id: roadshow.id,
    type: roadshow.type,
    title: maskText(roadshow.title, 0.4),
    presenter: '***',
    scheduled_at: roadshow.scheduled_at,
    duration_min: roadshow.duration_min,
    viewer_count: roadshow.viewer_count,
    reservation_count: roadshow.reservation_count,
    status: roadshow.status,
    project_id: roadshow.project_id,
    _masked: true
  };
}

// ——— 内部辅助函数 ———

function maskTeamInfo(teamInfo) {
  if (!teamInfo) return null;
  let parsed = teamInfo;
  if (typeof teamInfo === 'string') {
    try { parsed = JSON.parse(teamInfo); } catch { return null; }
  }
  if (!Array.isArray(parsed)) return null;
  return parsed.map(member => ({
    ...member,
    name: member.name ? maskName(member.name) : '***',
    contact: undefined,
    linkedin: undefined,
    email: undefined
  }));
}

function maskFinancialSummary(financialSummary) {
  if (!financialSummary) return null;
  let parsed = financialSummary;
  if (typeof financialSummary === 'string') {
    try { parsed = JSON.parse(financialSummary); } catch { return null; }
  }
  // 将所有数值替换为 ***
  return maskObjectValues(parsed);
}

function maskObjectValues(obj) {
  if (typeof obj !== 'object' || obj === null) return '***';
  if (Array.isArray(obj)) return obj.map(maskObjectValues);
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'number') result[k] = '***';
    else if (typeof v === 'string') result[k] = maskText(v, 0.6);
    else result[k] = maskObjectValues(v);
  }
  return result;
}

/**
 * 中文姓名脱敏：姓保留，名替换为 *
 * 例：张三 → 张*，欧阳修 → 欧*修 → 欧**
 */
function maskName(name) {
  if (!name || name.length === 0) return '***';
  if (name.length === 1) return '*';
  if (name.length === 2) return name[0] + '*';
  return name[0] + '*'.repeat(name.length - 1);
}

/**
 * 文本部分脱敏：按 ratio 比例替换字符为 *
 * @param {string} text
 * @param {number} ratio - 0~1，脱敏比例
 */
function maskText(text, ratio = 0.5) {
  if (!text) return text;
  // 保留前 (1-ratio) 部分，后 ratio 部分替换为 *
  const keepLen = Math.max(10, Math.floor(text.length * (1 - ratio)));
  return text.slice(0, keepLen) + '...[登录查看完整内容]';
}
