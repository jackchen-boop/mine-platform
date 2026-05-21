import { Router } from 'express';
import db from '../db/connection.js';

const router = Router();

// GET /api/mine-partners — 合作机构列表
router.get('/', (req, res) => {
  try {
    const { type } = req.query;
    let sql = 'SELECT * FROM partners ORDER BY sort_order';
    let params = [];
    if (type) { sql = 'SELECT * FROM partners WHERE type = ? ORDER BY sort_order'; params = [type]; }
    const partners = db.prepare(sql).all(...params);
    res.json({ partners });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
