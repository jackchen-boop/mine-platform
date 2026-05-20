// 用户路由 — /api/users/*（用户自管理 + 管理员用户管理）
import { Router } from 'express';
import db from '../db/connection.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { hashPassword } from '../utils/password.js';

const router = Router();

// GET /api/users/dashboard — 用户控制台汇总数据
router.get('/dashboard', requireAuth, (req, res) => {
  const userId = req.user.id;

  const followCount = db.prepare('SELECT COUNT(*) as cnt FROM follows WHERE user_id = ?').get(userId)?.cnt || 0;
  const reportCount = db.prepare('SELECT COUNT(*) as cnt FROM reports WHERE user_id = ?').get(userId)?.cnt || 0;
  const bpCount = db.prepare('SELECT COUNT(*) as cnt FROM bp_uploads WHERE user_id = ?').get(userId)?.cnt || 0;

  const recentReports = db.prepare(`
    SELECT r.id, r.title, r.report_type, r.skill_key, r.created_at,
      p.name as project_name
    FROM reports r
    LEFT JOIN projects p ON p.id = r.project_id
    WHERE r.user_id = ?
    ORDER BY r.created_at DESC LIMIT 5
  `).all(userId);

  const recentFollows = db.prepare(`
    SELECT f.id, f.created_at,
      p.id as project_id, p.name, p.code_letter, p.sector, p.round, p.amount, p.ai_score
    FROM follows f
    JOIN projects p ON p.id = f.project_id
    WHERE f.user_id = ? AND p.status != 'deleted'
    ORDER BY f.created_at DESC LIMIT 5
  `).all(userId);

  res.json({
    stats: { followCount, reportCount, bpCount },
    recentReports,
    recentFollows
  });
});

// GET /api/users — 用户列表（管理员）
router.get('/', requireRole('admin'), (req, res) => {
  const { status, page = 1, limit = 20, search } = req.query;
  const pageNum = Math.max(1, parseInt(page));
  const pageSize = Math.min(100, Math.max(1, parseInt(limit)));
  const offset = (pageNum - 1) * pageSize;

  const conditions = [];
  const params = [];
  if (status) { conditions.push('status = ?'); params.push(status); }
  if (search) {
    conditions.push('(name LIKE ? OR email LIKE ? OR organization LIKE ?)');
    const q = `%${search}%`;
    params.push(q, q, q);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) as cnt FROM users ${where}`).get(...params)?.cnt || 0;
  const users = db.prepare(`
    SELECT id, name, email, phone, role, organization, avatar_letter, status, created_at
    FROM users ${where}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset);

  res.json({ users, pagination: { total, page: pageNum, limit: pageSize, pages: Math.ceil(total / pageSize) } });
});

// PUT /api/users/:id/status — 更新用户状态（管理员）
router.put('/:id/status', requireRole('admin'), (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['active', 'suspended'].includes(status)) {
      return res.status(400).json({ error: 'status 只能是 active 或 suspended' });
    }
    // 防止封禁自己
    if (parseInt(req.params.id) === req.user.id) {
      return res.status(400).json({ error: '不能修改自己的状态' });
    }
    db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, req.params.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// PUT /api/users/:id/role — 更新用户角色（管理员）
router.put('/:id/role', requireRole('admin'), (req, res, next) => {
  try {
    const { role } = req.body;
    if (!['admin', 'investor', 'entrepreneur'].includes(role)) {
      return res.status(400).json({ error: '无效的角色' });
    }
    if (parseInt(req.params.id) === req.user.id) {
      return res.status(400).json({ error: '不能修改自己的角色' });
    }
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/users — 管理员创建用户
router.post('/', requireRole('admin'), async (req, res, next) => {
  try {
    const { name, email, password, phone, organization, role } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: '姓名、邮箱和密码为必填项' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: '密码至少 8 位' });
    }
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(400).json({ error: '该邮箱已被注册' });
    }
    const password_hash = await hashPassword(password);
    const avatar_letter = name.charAt(0);
    const userRole = ['admin', 'investor', 'entrepreneur'].includes(role) ? role : 'investor';
    const result = db.prepare(`
      INSERT INTO users (name, email, password_hash, phone, organization, role, avatar_letter, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(name, email, password_hash, phone || null, organization || null, userRole, avatar_letter);
    const user = db.prepare('SELECT id, name, email, phone, role, organization, avatar_letter, status, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ user });
  } catch (err) {
    next(err);
  }
});

// PUT /api/users/:id — 管理员编辑用户基本信息
router.put('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    if (parseInt(req.params.id) === req.user.id) {
      return res.status(400).json({ error: '不能编辑自己，请使用账号设置' });
    }
    const allowed = ['name', 'email', 'phone', 'organization', 'role', 'status'];
    const updates = [];
    const values = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) { updates.push(`${key} = ?`); values.push(req.body[key]); }
    }
    if (req.body.password && req.body.password.trim()) {
      if (req.body.password.length < 8) {
        return res.status(400).json({ error: '密码至少 8 位' });
      }
      updates.push('password_hash = ?');
      values.push(await hashPassword(req.body.password));
    }
    if (updates.length === 0) return res.status(400).json({ error: '无可更新字段' });
    if (req.body.name) {
      updates.push('avatar_letter = ?');
      values.push(req.body.name.charAt(0));
    }
    values.push(req.params.id);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    const user = db.prepare('SELECT id, name, email, phone, role, organization, avatar_letter, status, created_at FROM users WHERE id = ?').get(req.params.id);
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/users/:id — 管理员删除用户（软删除）
router.delete('/:id', requireRole('admin'), (req, res, next) => {
  try {
    if (parseInt(req.params.id) === req.user.id) {
      return res.status(400).json({ error: '不能删除自己' });
    }
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: '用户不存在' });
    db.prepare("UPDATE users SET status = 'deleted' WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
