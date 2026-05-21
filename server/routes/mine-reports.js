import { Router } from 'express';
import db from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// POST /api/mine-reports — 上传报告记录
router.post('/', requireAuth, (req, res) => {
  try {
    const { project_id, report_type, original_filename, stored_filename, file_size, file_type } = req.body;
    if (!original_filename) return res.status(400).json({ error: '文件名必填' });

    const result = db.prepare(`
      INSERT INTO mine_reports (user_id, project_id, report_type, original_filename, stored_filename, file_size, file_type, parse_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(req.user.id, project_id || null, report_type || 'exploration', original_filename, stored_filename || original_filename, file_size || 0, file_type || 'unknown');

    res.status(201).json({ id: result.lastInsertRowid, message: '报告记录已创建' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mine-reports — 当前用户的报告列表
router.get('/', requireAuth, (req, res) => {
  try {
    const reports = db.prepare('SELECT * FROM mine_reports WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
    res.json({ reports });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
