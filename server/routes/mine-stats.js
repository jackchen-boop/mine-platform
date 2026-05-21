import { Router } from 'express';
import db from '../db/connection.js';

const router = Router();

// GET /api/mine-stats — 平台统计
router.get('/', (req, res) => {
  try {
    const stats = db.prepare('SELECT * FROM system_stats ORDER BY id').all();
    const projects = db.prepare('SELECT COUNT(*) as c FROM mine_projects WHERE status = ?').get('active');
    const users = db.prepare('SELECT COUNT(*) as c FROM users WHERE status = ?').get('active');
    const totalValue = db.prepare('SELECT SUM(asking_price_raw) as v FROM mine_projects WHERE status = ?').get('active');

    res.json({
      stats,
      overview: {
        totalProjects: projects.c,
        totalUsers: users.c,
        totalValue: totalValue.v || 0,
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
