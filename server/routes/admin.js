import { Router } from 'express';
import db from '../db/connection.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();
router.use(requireRole('admin'));

router.get('/dashboard', (req, res) => {
  try {
    const userTotal = db.prepare("SELECT COUNT(*) as cnt FROM users WHERE status = 'active'").get()?.cnt || 0;
    const projectTotal = db.prepare("SELECT COUNT(*) as cnt FROM mine_projects WHERE status = 'active'").get()?.cnt || 0;
    const reportTotal = db.prepare("SELECT COUNT(*) as cnt FROM ai_analyses").get()?.cnt || 0;
    const inquiryTotal = db.prepare("SELECT COUNT(*) as cnt FROM inquiries").get()?.cnt || 0;
    const mineReportTotal = db.prepare("SELECT COUNT(*) as cnt FROM mine_reports").get()?.cnt || 0;

    const todayUsers = db.prepare("SELECT COUNT(*) as cnt FROM users WHERE date(created_at) = date('now')").get()?.cnt || 0;
    const todayInquiries = db.prepare("SELECT COUNT(*) as cnt FROM inquiries WHERE date(created_at) = date('now')").get()?.cnt || 0;

    const recentUsers = db.prepare('SELECT id, name, email, role, org_type, organization, status, created_at FROM users ORDER BY created_at DESC LIMIT 10').all();
    const recentInquiries = db.prepare(`
      SELECT i.*, u.name as user_name, p.name as project_name
      FROM inquiries i
      LEFT JOIN users u ON u.id = i.user_id
      LEFT JOIN mine_projects p ON p.id = i.project_id
      ORDER BY i.created_at DESC LIMIT 10
    `).all();

    const mineralDist = db.prepare(`
      SELECT mineral_types, COUNT(*) as cnt FROM mine_projects WHERE status = 'active'
      GROUP BY mineral_types ORDER BY cnt DESC LIMIT 8
    `).all();

    res.json({
      summary: { userTotal, projectTotal, reportTotal, inquiryTotal, mineReportTotal },
      today: { users: todayUsers, inquiries: todayInquiries },
      recentUsers, recentInquiries, mineralDist
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/users', (req, res) => {
  try {
    const users = db.prepare('SELECT id, name, email, phone, role, org_type, organization, status, verified, created_at FROM users ORDER BY created_at DESC').all();
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/projects', (req, res) => {
  try {
    const projects = db.prepare('SELECT * FROM mine_projects ORDER BY created_at DESC').all();
    res.json({ projects });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/projects', (req, res) => {
  try {
    const { code, name, mineral_types, province, city, asking_price, description, description_masked } = req.body;
    const result = db.prepare(`
      INSERT INTO mine_projects (code, name, mineral_types, province, city, asking_price, description, description_masked, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(code, name, mineral_types, province, city, asking_price, description, description_masked);
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
