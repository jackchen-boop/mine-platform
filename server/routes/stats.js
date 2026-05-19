// 统计路由 — /api/stats/*
import { Router } from 'express';
import { getAllStats, recalcStats } from '../services/stats.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

// GET /api/stats — 平台 KPI 统计（公开）
router.get('/', (req, res) => {
  try {
    const stats = getAllStats();
    res.json({ stats });
  } catch (err) {
    res.status(500).json({ error: '统计数据获取失败' });
  }
});

// POST /api/stats/recalc — 重新计算统计（管理员）
router.post('/recalc', requireRole('admin'), (req, res, next) => {
  try {
    recalcStats();
    const stats = getAllStats();
    res.json({ success: true, stats });
  } catch (err) {
    next(err);
  }
});

export default router;
