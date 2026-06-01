import { Router } from 'express';
import db from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// 矿业项目工作流阶段定义（项目简介 → 交易完成）
export const WORKFLOW_PHASES = [
  { phase: 'info_collection',   label: '项目简介',   icon: '📌', desc: '项目基本信息、AI智能评价、资源概况' },
  { phase: 'project_files',     label: '项目文件',   icon: '📁', desc: '上传地质报告、勘查报告、证照资料等项目文件' },
  { phase: 'project_photos',    label: '项目照片',   icon: '🖼️', desc: '上传矿区现场照片、地形图、实景图等影像资料' },
  { phase: 'due_diligence',     label: '尽职调查',   icon: '📋', desc: '地质报告审查、现场踏勘、环保/证照核查、法律尽调' },
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

// ── 工作成果（deliverables）────────────────────────────

// GET /api/project-tasks/deliverables?project_id=xxx
router.get('/deliverables', requireAuth, (req, res) => {
  try {
    const { project_id } = req.query;
    if (!project_id) return res.status(400).json({ error: 'project_id 必填' });
    if (!canAccessProject(Number(project_id), req.user))
      return res.status(403).json({ error: '无权访问' });

    const items = db.prepare(`
      SELECT pd.*, u.name as user_name, u.avatar_letter
      FROM project_deliverables pd
      JOIN users u ON u.id = pd.user_id
      WHERE pd.project_id = ?
      ORDER BY pd.created_at DESC
    `).all(project_id);
    res.json({ deliverables: items });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/project-tasks/deliverables — 添加工作成果
router.post('/deliverables', requireAuth, (req, res) => {
  try {
    const { project_id, phase, title, description, file_url, deliverable_type } = req.body;
    if (!project_id || !title) return res.status(400).json({ error: 'project_id、title 必填' });
    if (!canAccessProject(Number(project_id), req.user))
      return res.status(403).json({ error: '无权操作' });

    const r = db.prepare(`
      INSERT INTO project_deliverables (project_id, user_id, phase, title, description, file_url, deliverable_type)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(project_id, req.user.id, phase || 'info_collection', title, description || '', file_url || '', deliverable_type || 'document');

    // 自动记录动态
    db.prepare(`INSERT INTO project_activities (project_id, user_id, activity_type, content)
      VALUES (?,?,?,?)`).run(project_id, req.user.id, 'deliverable_created', `提交工作成果「${title}」（${phase || 'info_collection'}）`);

    res.status(201).json({ id: r.lastInsertRowid, message: '工作成果已添加' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/project-tasks/deliverables/:id
router.delete('/deliverables/:id', requireAuth, (req, res) => {
  try {
    const item = db.prepare('SELECT * FROM project_deliverables WHERE id=?').get(req.params.id);
    if (!item) return res.status(404).json({ error: '不存在' });
    if (!canAccessProject(item.project_id, req.user))
      return res.status(403).json({ error: '无权操作' });
    db.prepare('DELETE FROM project_deliverables WHERE id=?').run(req.params.id);
    res.json({ message: '已删除' });
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
    const deliverables = db.prepare('SELECT phase FROM project_deliverables WHERE project_id=?').all(project_id);
    // 项目文件数（mine_reports 关联）
    const fileCount = db.prepare('SELECT COUNT(*) as cnt FROM mine_reports WHERE project_id=?').get(project_id)?.cnt || 0;
    // 项目照片数
    const photoCount = db.prepare("SELECT COUNT(*) as cnt FROM project_photos WHERE project_id=?").get(project_id)?.cnt || 0;

    const phaseMap = {};
    for (const p of WORKFLOW_PHASES) phaseMap[p.phase] = { ...p, total: 0, done: 0, deliverables: 0 };
    for (const t of tasks) {
      if (phaseMap[t.phase]) {
        phaseMap[t.phase].total++;
        if (t.status === 'done') phaseMap[t.phase].done++;
      }
    }
    for (const d of deliverables) {
      if (phaseMap[d.phase]) phaseMap[d.phase].deliverables++;
    }
    // 文件/照片阶段使用专属计数
    if (phaseMap['project_files']) {
      phaseMap['project_files'].fileCount = fileCount;
    }
    if (phaseMap['project_photos']) {
      phaseMap['project_photos'].photoCount = photoCount;
    }
    // 推断当前阶段（第一个有任务或未全完成的阶段，或有工作成果的阶段）
    let currentPhase = WORKFLOW_PHASES[0].phase;
    for (const p of WORKFLOW_PHASES) {
      const pm = phaseMap[p.phase];
      if (pm.total > 0 && pm.done < pm.total) {
        currentPhase = p.phase; break;
      } else if (pm.deliverables > 0 || pm.done > 0) {
        currentPhase = p.phase;
      }
    }
    // 有文件则文件阶段算已进入
    if (fileCount > 0 && currentPhase === WORKFLOW_PHASES[0].phase) {
      currentPhase = 'project_files';
    }
    res.json({ phases: Object.values(phaseMap), currentPhase });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
