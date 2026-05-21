import { Router } from 'express';
import db from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// POST /api/mine-inquiries — 提交意向
router.post('/', requireAuth, (req, res) => {
  try {
    const { project_id, message, budget } = req.body;
    if (!project_id) return res.status(400).json({ error: '项目ID必填' });

    const result = db.prepare(`
      INSERT INTO inquiries (user_id, project_id, message, budget, status)
      VALUES (?, ?, ?, ?, 'pending')
    `).run(req.user.id, project_id, message || null, budget || null);

    res.status(201).json({ id: result.lastInsertRowid, message: '意向申请已提交' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mine-inquiries — 我的意向
router.get('/', requireAuth, (req, res) => {
  try {
    const inquiries = db.prepare(`
      SELECT i.*, p.name as project_name, p.code as project_code
      FROM inquiries i
      LEFT JOIN mine_projects p ON i.project_id = p.id
      WHERE i.user_id = ? ORDER BY i.created_at DESC
    `).all(req.user.id);
    res.json({ inquiries });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
