// 路演路由 — /api/roadshow/*
import { Router } from 'express';
import db from '../db/connection.js';
import { optionalAuth, requireAuth, requireRole } from '../middleware/auth.js';
import { desensitizeRoadshow } from '../services/desensitize.js';

const router = Router();

// GET /api/roadshow — 路演列表
router.get('/', optionalAuth, (req, res) => {
  const { status, page = 1, limit = 10 } = req.query;
  const pageNum = Math.max(1, parseInt(page));
  const pageSize = Math.min(20, Math.max(1, parseInt(limit)));
  const offset = (pageNum - 1) * pageSize;

  const conditions = [];
  const params = [];
  if (status) { conditions.push('r.status = ?'); params.push(status); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) as cnt FROM roadshows r ${where}`).get(...params)?.cnt || 0;

  const rows = db.prepare(`
    SELECT r.*, p.name as project_name, p.sector as project_sector, p.code_letter
    FROM roadshows r
    LEFT JOIN projects p ON p.id = r.project_id
    ${where}
    ORDER BY r.scheduled_at ASC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset);

  const isAuth = !!req.user;
  const roadshows = rows.map(r => desensitizeRoadshow(r, isAuth));

  res.json({
    roadshows,
    pagination: { total, page: pageNum, limit: pageSize, pages: Math.ceil(total / pageSize) },
    authenticated: isAuth
  });
});

// GET /api/roadshow/live — 直播中的路演
router.get('/live', optionalAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT r.*, p.name as project_name, p.sector as project_sector, p.code_letter
    FROM roadshows r
    LEFT JOIN projects p ON p.id = r.project_id
    WHERE r.status = 'live'
    ORDER BY r.scheduled_at DESC
  `).all();

  const isAuth = !!req.user;
  res.json({ roadshows: rows.map(r => desensitizeRoadshow(r, isAuth)), authenticated: isAuth });
});

// GET /api/roadshow/:id — 路演详情（需登录才能看完整信息）
router.get('/:id', optionalAuth, (req, res) => {
  const row = db.prepare(`
    SELECT r.*, p.name as project_name, p.sector as project_sector, p.code_letter, p.description as project_description
    FROM roadshows r
    LEFT JOIN projects p ON p.id = r.project_id
    WHERE r.id = ?
  `).get(req.params.id);

  if (!row) return res.status(404).json({ error: '路演不存在' });

  const isAuth = !!req.user;
  res.json({ roadshow: desensitizeRoadshow(row, isAuth), authenticated: isAuth });
});

// POST /api/roadshow/:id/reserve — 预约路演（需登录）
router.post('/:id/reserve', requireAuth, (req, res, next) => {
  try {
    const roadshow = db.prepare('SELECT * FROM roadshows WHERE id = ?').get(req.params.id);
    if (!roadshow) return res.status(404).json({ error: '路演不存在' });
    if (roadshow.status === 'completed') return res.status(400).json({ error: '路演已结束' });

    db.prepare('UPDATE roadshows SET reservation_count = reservation_count + 1 WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: '预约成功' });
  } catch (err) {
    next(err);
  }
});

// POST /api/roadshow — 创建路演（管理员）
router.post('/', requireRole('admin'), (req, res, next) => {
  try {
    const { project_id, type, title, presenter, scheduled_at, duration_min, status } = req.body;
    if (!project_id || !title || !scheduled_at) {
      return res.status(400).json({ error: '项目、标题和时间为必填项' });
    }

    const result = db.prepare(`
      INSERT INTO roadshows (project_id, type, title, presenter, scheduled_at, duration_min, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(project_id, type || 'online', title, presenter || null, scheduled_at, duration_min || 60, status || 'upcoming');

    const roadshow = db.prepare('SELECT * FROM roadshows WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ roadshow });
  } catch (err) {
    next(err);
  }
});

// PUT /api/roadshow/:id — 更新路演（管理员）
router.put('/:id', requireRole('admin'), (req, res, next) => {
  try {
    const allowed = ['type', 'title', 'presenter', 'scheduled_at', 'duration_min', 'status', 'viewer_count'];
    const updates = [];
    const values = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) { updates.push(`${key} = ?`); values.push(req.body[key]); }
    }
    if (updates.length === 0) return res.status(400).json({ error: '无可更新字段' });
    values.push(req.params.id);
    db.prepare(`UPDATE roadshows SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    const roadshow = db.prepare('SELECT * FROM roadshows WHERE id = ?').get(req.params.id);
    res.json({ roadshow });
  } catch (err) {
    next(err);
  }
});

export default router;
