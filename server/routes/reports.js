// 报告路由 — /api/reports/*
import { Router } from 'express';
import db from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/reports — 用户的报告列表
router.get('/', requireAuth, (req, res) => {
  const { type, page = 1, limit = 10 } = req.query;
  const pageNum = Math.max(1, parseInt(page));
  const pageSize = Math.min(50, Math.max(1, parseInt(limit)));
  const offset = (pageNum - 1) * pageSize;

  const conditions = ['r.user_id = ?'];
  const params = [req.user.id];
  if (type) { conditions.push('r.report_type = ?'); params.push(type); }

  const where = conditions.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) as cnt FROM reports r WHERE ${where}`).get(...params)?.cnt || 0;

  const rows = db.prepare(`
    SELECT r.id, r.report_type, r.skill_key, r.title, r.ai_score, r.model_used, r.created_at,
      r.bp_upload_id,
      p.name as project_name, p.sector as project_sector,
      bu.original_filename as bp_filename
    FROM reports r
    LEFT JOIN projects p ON p.id = r.project_id
    LEFT JOIN bp_uploads bu ON bu.id = r.bp_upload_id
    WHERE ${where}
    ORDER BY r.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset);

  res.json({
    reports: rows,
    pagination: { total, page: pageNum, limit: pageSize, pages: Math.ceil(total / pageSize) }
  });
});

// GET /api/reports/:id — 报告详情
router.get('/:id', requireAuth, (req, res) => {
  const report = db.prepare(`
    SELECT r.*, p.name as project_name, p.sector as project_sector,
      bu.original_filename as bp_filename
    FROM reports r
    LEFT JOIN projects p ON p.id = r.project_id
    LEFT JOIN bp_uploads bu ON bu.id = r.bp_upload_id
    WHERE r.id = ? AND r.user_id = ?
  `).get(req.params.id, req.user.id);

  if (!report) return res.status(404).json({ error: '报告不存在或无权限' });

  let inputParams = null;
  let tokenUsage = null;
  try { if (report.input_params) inputParams = JSON.parse(report.input_params); } catch {}
  try { if (report.token_usage) tokenUsage = JSON.parse(report.token_usage); } catch {}

  res.json({ report: { ...report, input_params: inputParams, token_usage: tokenUsage } });
});

// DELETE /api/reports/:id — 删除报告
router.delete('/:id', requireAuth, (req, res, next) => {
  try {
    const result = db.prepare('DELETE FROM reports WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    if (result.changes === 0) return res.status(404).json({ error: '报告不存在或无权限' });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
