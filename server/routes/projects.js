// 项目路由 — /api/projects/*
import { Router } from 'express';
import db from '../db/connection.js';
import { optionalAuth, requireAuth, requireRole } from '../middleware/auth.js';
import { desensitizeProjects, desensitizeProjectDetail } from '../services/desensitize.js';

const router = Router();

// GET /api/projects — 项目列表（支持过滤、分页）
router.get('/', optionalAuth, (req, res) => {
  const { sector, round, status = 'active', hot, page = 1, limit = 12, search } = req.query;
  const pageNum = Math.max(1, parseInt(page));
  const pageSize = Math.min(50, Math.max(1, parseInt(limit)));
  const offset = (pageNum - 1) * pageSize;

  const conditions = ["p.status = ?"];
  const params = [status];

  if (sector) { conditions.push("p.sector = ?"); params.push(sector); }
  if (round) { conditions.push("p.round = ?"); params.push(round); }
  if (hot === 'true' || hot === '1') { conditions.push("p.is_hot = 1"); }
  if (search) {
    conditions.push("(p.name LIKE ? OR p.description LIKE ? OR p.sector LIKE ?)");
    const q = `%${search}%`;
    params.push(q, q, q);
  }

  const where = conditions.join(' AND ');

  const total = db.prepare(`SELECT COUNT(*) as cnt FROM projects p WHERE ${where}`).get(...params)?.cnt || 0;
  const rows = db.prepare(`
    SELECT p.*, 
      CASE WHEN f.id IS NOT NULL THEN 1 ELSE 0 END as is_followed
    FROM projects p
    LEFT JOIN follows f ON f.project_id = p.id AND f.user_id = ?
    WHERE ${where}
    ORDER BY p.is_hot DESC, p.ai_score DESC, p.created_at DESC
    LIMIT ? OFFSET ?
  `).all(req.user?.id || null, ...params, pageSize, offset);

  const isAuth = !!req.user;
  const projects = desensitizeProjects(rows, isAuth);

  res.json({
    projects,
    pagination: {
      total,
      page: pageNum,
      limit: pageSize,
      pages: Math.ceil(total / pageSize)
    },
    authenticated: isAuth
  });
});

// GET /api/projects/hot — 热门项目（首页用）
router.get('/hot', optionalAuth, (req, res) => {
  const limit = Math.min(20, parseInt(req.query.limit) || 8);
  const rows = db.prepare(`
    SELECT p.*, 
      CASE WHEN f.id IS NOT NULL THEN 1 ELSE 0 END as is_followed
    FROM projects p
    LEFT JOIN follows f ON f.project_id = p.id AND f.user_id = ?
    WHERE p.is_hot = 1 AND p.status = 'active'
    ORDER BY p.ai_score DESC
    LIMIT ?
  `).all(req.user?.id || null, limit);

  const isAuth = !!req.user;
  res.json({ projects: desensitizeProjects(rows, isAuth), authenticated: isAuth });
});

// GET /api/projects/:id — 项目详情
router.get('/:id', optionalAuth, (req, res) => {
  const project = db.prepare(`
    SELECT p.*,
      CASE WHEN f.id IS NOT NULL THEN 1 ELSE 0 END as is_followed
    FROM projects p
    LEFT JOIN follows f ON f.project_id = p.id AND f.user_id = ?
    WHERE p.id = ? AND p.status != 'deleted'
  `).get(req.user?.id || null, req.params.id);

  if (!project) return res.status(404).json({ error: '项目不存在' });

  const isAuth = !!req.user;
  res.json({ project: desensitizeProjectDetail(project, isAuth), authenticated: isAuth });
});

// POST /api/projects — 创建项目（管理员）
router.post('/', requireRole('admin'), (req, res, next) => {
  try {
    const {
      name, name_en, code_letter, sector, sub_sector, location, round, amount,
      amount_raw, valuation, valuation_raw, ai_score, progress_pct,
      description, is_hot, status, team_info, financial_summary, business_model
    } = req.body;

    if (!name || !sector) {
      return res.status(400).json({ error: '项目名称和行业为必填项' });
    }

    const result = db.prepare(`
      INSERT INTO projects (name, name_en, code_letter, sector, sub_sector, location, round, amount,
        amount_raw, valuation, valuation_raw, ai_score, progress_pct, description, is_hot, status,
        team_info, financial_summary, business_model)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name, name_en || null, code_letter || name.charAt(0), sector,
      sub_sector || null, location || null, round || null, amount || null,
      amount_raw || null, valuation || null, valuation_raw || null,
      ai_score || null, progress_pct || 0, description || null,
      is_hot ? 1 : 0, status || 'active',
      team_info ? JSON.stringify(team_info) : null,
      financial_summary ? JSON.stringify(financial_summary) : null,
      business_model || null
    );

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ project });
  } catch (err) {
    next(err);
  }
});

// PUT /api/projects/:id — 更新项目（管理员）
router.put('/:id', requireRole('admin'), (req, res, next) => {
  try {
    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(req.params.id);
    if (!project) return res.status(404).json({ error: '项目不存在' });

    const allowed = ['name', 'name_en', 'code_letter', 'sector', 'sub_sector', 'location', 'round',
      'amount', 'amount_raw', 'valuation', 'valuation_raw', 'ai_score', 'progress_pct',
      'description', 'is_hot', 'status', 'business_model'];

    const updates = [];
    const values = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updates.push(`${key} = ?`);
        values.push(req.body[key]);
      }
    }
    if (['team_info', 'financial_summary'].some(k => req.body[k] !== undefined)) {
      for (const k of ['team_info', 'financial_summary']) {
        if (req.body[k] !== undefined) {
          updates.push(`${k} = ?`);
          values.push(JSON.stringify(req.body[k]));
        }
      }
    }

    if (updates.length === 0) return res.status(400).json({ error: '无可更新字段' });
    values.push(req.params.id);
    db.prepare(`UPDATE projects SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const updated = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    res.json({ project: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/projects/:id — 软删除（管理员）
router.delete('/:id', requireRole('admin'), (req, res, next) => {
  try {
    db.prepare("UPDATE projects SET status = 'deleted' WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
