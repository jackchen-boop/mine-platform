// 关注路由 — /api/follows/*
import { Router } from 'express';
import db from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/follows — 获取当前用户的关注列表
router.get('/', requireAuth, (req, res) => {
  const follows = db.prepare(`
    SELECT f.id, f.created_at,
      p.id as project_id, p.name, p.name_en, p.code_letter, p.sector, p.sub_sector,
      p.round, p.amount, p.valuation, p.ai_score, p.is_hot, p.location
    FROM follows f
    JOIN projects p ON p.id = f.project_id
    WHERE f.user_id = ? AND p.status != 'deleted'
    ORDER BY f.created_at DESC
  `).all(req.user.id);

  res.json({ follows, total: follows.length });
});

// POST /api/follows/:projectId — 关注项目
router.post('/:projectId', requireAuth, (req, res, next) => {
  try {
    const project = db.prepare("SELECT id FROM projects WHERE id = ? AND status != 'deleted'").get(req.params.projectId);
    if (!project) return res.status(404).json({ error: '项目不存在' });

    const existing = db.prepare('SELECT id FROM follows WHERE user_id = ? AND project_id = ?').get(req.user.id, req.params.projectId);
    if (existing) return res.status(409).json({ error: '已关注该项目' });

    db.prepare('INSERT INTO follows (user_id, project_id) VALUES (?, ?)').run(req.user.id, req.params.projectId);
    // 更新项目粉丝数
    db.prepare('UPDATE projects SET fans_count = fans_count + 1 WHERE id = ?').run(req.params.projectId);

    res.status(201).json({ success: true, message: '关注成功' });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/follows/:projectId — 取消关注
router.delete('/:projectId', requireAuth, (req, res, next) => {
  try {
    const result = db.prepare('DELETE FROM follows WHERE user_id = ? AND project_id = ?').run(req.user.id, req.params.projectId);
    if (result.changes === 0) return res.status(404).json({ error: '未关注该项目' });
    // 更新项目粉丝数
    db.prepare('UPDATE projects SET fans_count = MAX(0, fans_count - 1) WHERE id = ?').run(req.params.projectId);
    res.json({ success: true, message: '已取消关注' });
  } catch (err) {
    next(err);
  }
});

// GET /api/follows/check/:projectId — 检查是否已关注
router.get('/check/:projectId', requireAuth, (req, res) => {
  const follow = db.prepare('SELECT id FROM follows WHERE user_id = ? AND project_id = ?').get(req.user.id, req.params.projectId);
  res.json({ followed: !!follow });
});

export default router;
