import { Router } from 'express';
import db from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// 矿业项目工作流阶段定义（信息获取 → 找到买家的完整流程）
export const WORKFLOW_PHASES = [
  { phase: 'info_collection',   label: '信息获取',   icon: '🔍', desc: '收集项目基础信息、联系矿权方、初步了解出让意向' },
  { phase: 'due_diligence',     label: '尽职调查',   icon: '📋', desc: '地质报告审查、现场踏勘、环保/证照核查、法律尽调' },
  { phase: 'ai_evaluation',     label: 'AI评价',     icon: '🤖', desc: 'AI估值分析、资源量测算、AISC/NPV/IRR财务评估' },
  { phase: 'report_preparation',label: '材料准备',   icon: '📄', desc: '整理勘查报告、选矿报告、证照资料、上传完整项目材料' },
  { phase: 'listing',           label: '挂牌发布',   icon: '📢', desc: '完成项目挂牌，设定价格，发布至平台' },
  { phase: 'investor_matching', label: '投资方匹配', icon: '🤝', desc: '定向推送匹配投资机构，安排投资人接触' },
  { phase: 'roadshow',          label: '路演推介',   icon: '🎤', desc: '直播路演/线下路演，展示项目亮点' },
  { phase: 'negotiation',       label: '谈判磋商',   icon: '💬', desc: '价格谈判，交易结构设计，条款确认' },
  { phase: 'deal_closing',      label: '交易完成',   icon: '✅', desc: '签署协议，交割，完成交易' },
];

// 检查项目访问权限（工作组成员 or 管理员 or 项目 owner）
function canAccessProject(projectId, user) {
  if (user.role === 'admin') return true;
  const p = db.prepare('SELECT owner_id, workgroup_id FROM mine_projects WHERE id=?').get(projectId);
  if (!p) return false;
  if (p.owner_id === user.id) return true;
  if (p.workgroup_id) {
    return !!db.prepare('SELECT 1 FROM workgroup_members WHERE workgroup_id=? AND user_id=?').get(p.workgroup_id, user.id);
  }
  return false;
}

// ── 工作流阶段定义 ─────────────────────────────────────
// GET /api/project-tasks/phases — 返回阶段定义
router.get('/phases', (req, res) => {
  res.json({ phases: WORKFLOW_PHASES });
});

// ── 任务 CRUD ──────────────────────────────────────────

// GET /api/project-tasks?project_id=xxx
router.get('/', requireAuth, (req, res) => {
  try {
    const { project_id, phase } = req.query;
    if (!project_id) return res.status(400).json({ error: 'project_id 必填' });
    if (!canAccessProject(Number(project_id), req.user))
      return res.status(403).json({ error: '无权访问' });

    let sql = `
      SELECT pt.*, u.name as assignee_name, cu.name as created_by_name
      FROM project_tasks pt
      LEFT JOIN users u ON u.id=pt.assignee_id
      LEFT JOIN users cu ON cu.id=pt.created_by
      WHERE pt.project_id=?
    `;
    const params = [project_id];
    if (phase) { sql += ' AND pt.phase=?'; params.push(phase); }
    sql += ' ORDER BY pt.phase, pt.created_at ASC';
    const tasks = db.prepare(sql).all(...params);
    res.json({ tasks });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/project-tasks — 创建任务
router.post('/', requireAuth, (req, res) => {
  try {
    const { project_id, phase, title, description, assignee_id, priority, due_date } = req.body;
    if (!project_id || !phase || !title) return res.status(400).json({ error: 'project_id、phase、title 必填' });
    if (!canAccessProject(Number(project_id), req.user))
      return res.status(403).json({ error: '无权操作' });

    const r = db.prepare(`
      INSERT INTO project_tasks (project_id, phase, title, description, assignee_id, priority, due_date, created_by)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(project_id, phase, title, description || '', assignee_id || null, priority || 'normal', due_date || null, req.user.id);

    // 自动记录动态
    db.prepare(`INSERT INTO project_activities (project_id, user_id, activity_type, content)
      VALUES (?,?,?,?)`).run(project_id, req.user.id, 'task_created', `创建任务「${title}」（阶段: ${phase}）`);

    res.status(201).json({ id: r.lastInsertRowid, message: '任务已创建' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/project-tasks/:id — 更新任务（状态/负责人/备注）
router.put('/:id', requireAuth, (req, res) => {
  try {
    const task = db.prepare('SELECT * FROM project_tasks WHERE id=?').get(req.params.id);
    if (!task) return res.status(404).json({ error: '任务不存在' });
    if (!canAccessProject(task.project_id, req.user))
      return res.status(403).json({ error: '无权操作' });

    const { status, title, description, assignee_id, priority, due_date, notes } = req.body;
    const newStatus = status || task.status;
    const completedAt = (newStatus === 'done' && task.status !== 'done') ? new Date().toISOString() : task.completed_at;

    db.prepare(`UPDATE project_tasks SET
      status=?, title=?, description=?, assignee_id=?, priority=?, due_date=?, notes=?,
      completed_at=?, updated_at=datetime('now')
      WHERE id=?`
    ).run(
      newStatus,
      title || task.title,
      description ?? task.description,
      assignee_id ?? task.assignee_id,
      priority || task.priority,
      due_date ?? task.due_date,
      notes ?? task.notes,
      completedAt,
      task.id
    );

    if (status && status !== task.status) {
      const statusLabel = { pending:'待处理', in_progress:'进行中', done:'已完成', blocked:'阻塞' }[status] || status;
      db.prepare(`INSERT INTO project_activities (project_id, user_id, activity_type, content) VALUES (?,?,?,?)`)
        .run(task.project_id, req.user.id, 'task_updated', `任务「${task.title}」状态更新为 ${statusLabel}`);
    }
    res.json({ message: '已更新' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/project-tasks/:id
router.delete('/:id', requireAuth, (req, res) => {
  try {
    const task = db.prepare('SELECT * FROM project_tasks WHERE id=?').get(req.params.id);
    if (!task) return res.status(404).json({ error: '任务不存在' });
    if (!canAccessProject(task.project_id, req.user))
      return res.status(403).json({ error: '无权操作' });
    db.prepare('DELETE FROM project_tasks WHERE id=?').run(task.id);
    res.json({ message: '已删除' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── 项目动态 ───────────────────────────────────────────

// GET /api/project-tasks/activities?project_id=xxx
router.get('/activities', requireAuth, (req, res) => {
  try {
    const { project_id } = req.query;
    if (!project_id) return res.status(400).json({ error: 'project_id 必填' });
    if (!canAccessProject(Number(project_id), req.user))
      return res.status(403).json({ error: '无权访问' });
    const activities = db.prepare(`
      SELECT pa.*, u.name as user_name, u.avatar_letter
      FROM project_activities pa JOIN users u ON u.id=pa.user_id
      WHERE pa.project_id=? ORDER BY pa.created_at DESC LIMIT 50
    `).all(project_id);
    res.json({ activities });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/project-tasks/activities — 发布评论/动态
router.post('/activities', requireAuth, (req, res) => {
  try {
    const { project_id, content } = req.body;
    if (!project_id || !content) return res.status(400).json({ error: 'project_id、content 必填' });
    if (!canAccessProject(Number(project_id), req.user))
      return res.status(403).json({ error: '无权操作' });
    const r = db.prepare(`INSERT INTO project_activities (project_id, user_id, activity_type, content) VALUES (?,?,?,?)`)
      .run(project_id, req.user.id, 'comment', content);
    res.status(201).json({ id: r.lastInsertRowid, message: '已发布' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── 项目进度汇总 ──────────────────────────────────────

// GET /api/project-tasks/progress?project_id=xxx — 返回各阶段任务进度
router.get('/progress', requireAuth, (req, res) => {
  try {
    const { project_id } = req.query;
    if (!project_id) return res.status(400).json({ error: 'project_id 必填' });
    if (!canAccessProject(Number(project_id), req.user))
      return res.status(403).json({ error: '无权访问' });

    const tasks = db.prepare('SELECT phase, status FROM project_tasks WHERE project_id=?').all(project_id);
    const phaseMap = {};
    for (const p of WORKFLOW_PHASES) phaseMap[p.phase] = { ...p, total: 0, done: 0 };
    for (const t of tasks) {
      if (phaseMap[t.phase]) {
        phaseMap[t.phase].total++;
        if (t.status === 'done') phaseMap[t.phase].done++;
      }
    }
    // 推断当前阶段（第一个有任务但未全完成的阶段）
    let currentPhase = WORKFLOW_PHASES[0].phase;
    for (const p of WORKFLOW_PHASES) {
      if (phaseMap[p.phase].total > 0 && phaseMap[p.phase].done < phaseMap[p.phase].total) {
        currentPhase = p.phase; break;
      } else if (phaseMap[p.phase].done > 0) {
        currentPhase = p.phase;
      }
    }
    res.json({ phases: Object.values(phaseMap), currentPhase });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
