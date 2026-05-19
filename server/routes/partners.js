// 合作机构路由 — /api/partners/*
import { Router } from 'express';
import db from '../db/connection.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

// GET /api/partners — 合作机构列表
router.get('/', (req, res) => {
  const { featured, page = 1, limit = 12 } = req.query;
  const pageNum = Math.max(1, parseInt(page));
  const pageSize = Math.min(50, Math.max(1, parseInt(limit)));
  const offset = (pageNum - 1) * pageSize;

  const conditions = [];
  const params = [];
  if (featured === 'true' || featured === '1') {
    conditions.push('is_featured = 1');
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) as cnt FROM partners ${where}`).get(...params)?.cnt || 0;
  const partners = db.prepare(`
    SELECT * FROM partners ${where}
    ORDER BY sort_order ASC, platform_deals DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset);

  res.json({ partners, pagination: { total, page: pageNum, limit: pageSize, pages: Math.ceil(total / pageSize) } });
});

// POST /api/partners — 新增合作机构（管理员）
router.post('/', requireRole('admin'), (req, res, next) => {
  try {
    const { name, name_en, type, stage_preference, sector_count, platform_deals, fund_size, is_featured, sort_order } = req.body;
    if (!name) return res.status(400).json({ error: '机构名称为必填项' });

    const result = db.prepare(`
      INSERT INTO partners (name, name_en, type, stage_preference, sector_count, platform_deals, fund_size, is_featured, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(name, name_en || null, type || 'vc', stage_preference || null, sector_count || 0, platform_deals || 0, fund_size || null, is_featured ? 1 : 0, sort_order || 99);

    const partner = db.prepare('SELECT * FROM partners WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ partner });
  } catch (err) {
    next(err);
  }
});

// PUT /api/partners/:id — 更新机构（管理员）
router.put('/:id', requireRole('admin'), (req, res, next) => {
  try {
    const allowed = ['name', 'name_en', 'type', 'stage_preference', 'sector_count', 'platform_deals', 'fund_size', 'is_featured', 'sort_order'];
    const updates = [];
    const values = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) { updates.push(`${key} = ?`); values.push(req.body[key]); }
    }
    if (updates.length === 0) return res.status(400).json({ error: '无可更新字段' });
    values.push(req.params.id);
    db.prepare(`UPDATE partners SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    const partner = db.prepare('SELECT * FROM partners WHERE id = ?').get(req.params.id);
    res.json({ partner });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/partners/:id — 删除机构（管理员）
router.delete('/:id', requireRole('admin'), (req, res, next) => {
  try {
    db.prepare('DELETE FROM partners WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
