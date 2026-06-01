import { Router } from 'express';
import db from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// ── 工具函数 ──────────────────────────────────────────
function isMember(workgroupId, userId) {
  return !!db.prepare('SELECT 1 FROM workgroup_members WHERE workgroup_id=? AND user_id=?').get(workgroupId, userId);
}
function isOwnerOrAdmin(workgroup, user) {
  return user.role === 'admin' || workgroup.owner_id === user.id;
}

// ── 工作组 CRUD ───────────────────────────────────────

// GET /api/workgroups — 我参与的工作组（管理员看全部）
router.get('/', requireAuth, (req, res) => {
  try {
    let rows;
    if (req.user.role === 'admin') {
      rows = db.prepare(`
        SELECT wg.*, u.name as owner_name,
          (SELECT COUNT(*) FROM workgroup_members WHERE workgroup_id=wg.id) as member_count,
          (SELECT COUNT(*) FROM mine_projects WHERE workgroup_id=wg.id) as project_count
        FROM workgroups wg
        LEFT JOIN users u ON u.id=wg.owner_id
        ORDER BY wg.created_at DESC
      `).all();
    } else {
      rows = db.prepare(`
        SELECT wg.*, u.name as owner_name, wm.role as my_role,
          (SELECT COUNT(*) FROM workgroup_members WHERE workgroup_id=wg.id) as member_count,
          (SELECT COUNT(*) FROM mine_projects WHERE workgroup_id=wg.id) as project_count
        FROM workgroups wg
        JOIN workgroup_members wm ON wm.workgroup_id=wg.id AND wm.user_id=?
        LEFT JOIN users u ON u.id=wg.owner_id
        ORDER BY wg.created_at DESC
      `).all(req.user.id);
    }
    res.json({ workgroups: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/workgroups — 创建工作组
router.post('/', requireAuth, (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: '工作组名称必填' });
    const code = 'WG-' + Date.now().toString(36).toUpperCase();
    const r = db.prepare(
      'INSERT INTO workgroups (name, description, code, owner_id) VALUES (?,?,?,?)'
    ).run(name, description || '', code, req.user.id);
    // 创建者自动加入工作组，role=owner
    db.prepare('INSERT INTO workgroup_members (workgroup_id, user_id, role) VALUES (?,?,?)').run(r.lastInsertRowid, req.user.id, 'owner');
    res.status(201).json({ id: r.lastInsertRowid, code, message: '工作组已创建' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/workgroups/:id — 工作组详情
router.get('/:id', requireAuth, (req, res) => {
  try {
    const wg = db.prepare(`
      SELECT wg.*, u.name as owner_name
      FROM workgroups wg LEFT JOIN users u ON u.id=wg.owner_id
      WHERE wg.id=?
    `).get(req.params.id);
    if (!wg) return res.status(404).json({ error: '工作组不存在' });
    if (req.user.role !== 'admin' && !isMember(wg.id, req.user.id))
      return res.status(403).json({ error: '无权访问' });
    res.json({ workgroup: wg });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/workgroups/:id — 更新工作组
router.put('/:id', requireAuth, (req, res) => {
  try {
    const wg = db.prepare('SELECT * FROM workgroups WHERE id=?').get(req.params.id);
    if (!wg) return res.status(404).json({ error: '工作组不存在' });
    if (!isOwnerOrAdmin(wg, req.user)) return res.status(403).json({ error: '无权操作' });
    const { name, description } = req.body;
    db.prepare('UPDATE workgroups SET name=?, description=?, updated_at=datetime("now") WHERE id=?')
      .run(name || wg.name, description ?? wg.description, wg.id);
    res.json({ message: '已更新' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/workgroups/:id — 解散工作组
router.delete('/:id', requireAuth, (req, res) => {
  try {
    const wg = db.prepare('SELECT * FROM workgroups WHERE id=?').get(req.params.id);
    if (!wg) return res.status(404).json({ error: '工作组不存在' });
    if (!isOwnerOrAdmin(wg, req.user)) return res.status(403).json({ error: '无权操作' });
    db.prepare('DELETE FROM workgroup_members WHERE workgroup_id=?').run(wg.id);
    db.prepare('UPDATE mine_projects SET workgroup_id=NULL WHERE workgroup_id=?').run(wg.id);
    db.prepare('DELETE FROM workgroups WHERE id=?').run(wg.id);
    res.json({ message: '工作组已解散' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── 成员管理 ──────────────────────────────────────────

// GET /api/workgroups/:id/members
router.get('/:id/members', requireAuth, (req, res) => {
  try {
    const wg = db.prepare('SELECT * FROM workgroups WHERE id=?').get(req.params.id);
    if (!wg) return res.status(404).json({ error: '工作组不存在' });
    if (req.user.role !== 'admin' && !isMember(wg.id, req.user.id))
      return res.status(403).json({ error: '无权访问' });
    const members = db.prepare(`
      SELECT wm.role, wm.joined_at, u.id, u.name, u.email, u.organization, u.role as user_role, u.avatar_letter
      FROM workgroup_members wm JOIN users u ON u.id=wm.user_id
      WHERE wm.workgroup_id=? ORDER BY wm.joined_at ASC
    `).all(req.params.id);
    res.json({ members });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/workgroups/:id/members — 邀请成员（by email）
router.post('/:id/members', requireAuth, (req, res) => {
  try {
    const wg = db.prepare('SELECT * FROM workgroups WHERE id=?').get(req.params.id);
    if (!wg) return res.status(404).json({ error: '工作组不存在' });
    if (!isOwnerOrAdmin(wg, req.user)) return res.status(403).json({ error: '无权操作' });
    const { email, role: memberRole } = req.body;
    if (!email) return res.status(400).json({ error: 'email 必填' });
    const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
    if (!user) return res.status(404).json({ error: '用户不存在，请先注册' });
    db.prepare('INSERT OR IGNORE INTO workgroup_members (workgroup_id, user_id, role) VALUES (?,?,?)')
      .run(wg.id, user.id, memberRole || 'member');
    res.json({ message: `${user.name} 已加入工作组` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/workgroups/:id/members/:userId — 移除成员
router.delete('/:id/members/:userId', requireAuth, (req, res) => {
  try {
    const wg = db.prepare('SELECT * FROM workgroups WHERE id=?').get(req.params.id);
    if (!wg) return res.status(404).json({ error: '工作组不存在' });
    if (!isOwnerOrAdmin(wg, req.user) && req.user.id !== Number(req.params.userId))
      return res.status(403).json({ error: '无权操作' });
    db.prepare('DELETE FROM workgroup_members WHERE workgroup_id=? AND user_id=?').run(wg.id, req.params.userId);
    res.json({ message: '已移除' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── 工作组项目 ────────────────────────────────────────

// GET /api/workgroups/:id/projects — 工作组下的项目
router.get('/:id/projects', requireAuth, (req, res) => {
  try {
    const wg = db.prepare('SELECT * FROM workgroups WHERE id=?').get(req.params.id);
    if (!wg) return res.status(404).json({ error: '工作组不存在' });
    if (req.user.role !== 'admin' && !isMember(wg.id, req.user.id))
      return res.status(403).json({ error: '无权访问' });
    const projects = db.prepare(`
      SELECT p.*,
        (SELECT COUNT(*) FROM project_tasks WHERE project_id=p.id) as task_count,
        (SELECT COUNT(*) FROM project_tasks WHERE project_id=p.id AND status='done') as task_done,
        (SELECT COUNT(*) FROM project_activities WHERE project_id=p.id) as activity_count,
        (SELECT stored_name FROM project_photos WHERE project_id=p.id ORDER BY created_at ASC LIMIT 1) as first_photo
      FROM mine_projects p WHERE p.workgroup_id=? AND p.status='active' ORDER BY p.created_at DESC
    `).all(wg.id);
    res.json({ projects });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/workgroups/:id/projects — 将项目加入工作组
router.post('/:id/projects', requireAuth, (req, res) => {
  try {
    const wg = db.prepare('SELECT * FROM workgroups WHERE id=?').get(req.params.id);
    if (!wg) return res.status(404).json({ error: '工作组不存在' });
    if (!isMember(wg.id, req.user.id) && req.user.role !== 'admin')
      return res.status(403).json({ error: '无权操作' });
    const { project_id } = req.body;
    const proj = db.prepare('SELECT * FROM mine_projects WHERE id=?').get(project_id);
    if (!proj) return res.status(404).json({ error: '项目不存在' });
    // 非管理员不能将已属于其他工作组的项目抢走
    if (proj.workgroup_id && proj.workgroup_id !== wg.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: '该项目已属于其他工作组' });
    }
    db.prepare('UPDATE mine_projects SET workgroup_id=? WHERE id=?').run(wg.id, project_id);
    res.json({ message: '项目已加入工作组' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
