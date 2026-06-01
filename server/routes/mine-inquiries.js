import { Router } from 'express';
import db from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { verifyToken } from '../utils/token.js';

const router = Router();

// 迁移：为旧表新增字段（如已存在则忽略）
try { db.exec('ALTER TABLE inquiries ADD COLUMN contact_name TEXT'); } catch(e) {}
try { db.exec('ALTER TABLE inquiries ADD COLUMN contact_phone TEXT'); } catch(e) {}
try { db.exec('ALTER TABLE inquiries ADD COLUMN contact_org TEXT'); } catch(e) {}
try { db.exec('ALTER TABLE inquiries ADD COLUMN remark TEXT'); } catch(e) {}

// POST /api/mine-inquiries — 提交意向（支持登录/匿名）
router.post('/', (req, res) => {
  try {
    const { project_id, contact_name, contact_phone, contact_org, message, budget, remark } = req.body;
    if (!project_id) return res.status(400).json({ error: '项目ID必填' });
    if (!contact_phone) return res.status(400).json({ error: '联系电话必填' });

    // 尝试从 token 获取用户 id（可选，支持匿名提交）
    let userId = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const payload = verifyToken(authHeader.slice(7));
        if (payload?.id) userId = payload.id;
      } catch(e) { /* token无效，匿名提交 */ }
    }

    const result = db.prepare(`
      INSERT INTO inquiries (user_id, project_id, contact_name, contact_phone, contact_org, message, budget, remark, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(userId, project_id, contact_name || null, contact_phone, contact_org || null, message || null, budget || null, remark || null);

    res.status(201).json({ id: result.lastInsertRowid, message: '意向已提交，工作人员将与您联系' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mine-inquiries — 我的意向（需登录）
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
