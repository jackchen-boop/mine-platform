// 管理员路由 — /api/admin/*
import { Router } from 'express';
import db from '../db/connection.js';
import { requireRole } from '../middleware/auth.js';
import { recalcStats, getAllStats } from '../services/stats.js';

const router = Router();

// 所有管理员路由都需要 admin 角色
router.use(requireRole('admin'));

// GET /api/admin/dashboard — 管理控制台汇总
router.get('/dashboard', (req, res) => {
  const userTotal = db.prepare("SELECT COUNT(*) as cnt FROM users WHERE status = 'active'").get()?.cnt || 0;
  const projectTotal = db.prepare("SELECT COUNT(*) as cnt FROM projects WHERE status = 'active'").get()?.cnt || 0;
  const reportTotal = db.prepare("SELECT COUNT(*) as cnt FROM reports").get()?.cnt || 0;
  const bpTotal = db.prepare("SELECT COUNT(*) as cnt FROM bp_uploads").get()?.cnt || 0;
  const bpAnalyzed = db.prepare("SELECT COUNT(DISTINCT bp_upload_id) as cnt FROM reports WHERE bp_upload_id IS NOT NULL").get()?.cnt || 0;
  const roadshowTotal = db.prepare("SELECT COUNT(*) as cnt FROM roadshows").get()?.cnt || 0;
  const partnerTotal = db.prepare("SELECT COUNT(*) as cnt FROM partners").get()?.cnt || 0;

  // 今日新增
  const todayUsers = db.prepare("SELECT COUNT(*) as cnt FROM users WHERE date(created_at) = date('now')").get()?.cnt || 0;
  const todayReports = db.prepare("SELECT COUNT(*) as cnt FROM reports WHERE date(created_at) = date('now')").get()?.cnt || 0;
  const todayBPs = db.prepare("SELECT COUNT(*) as cnt FROM bp_uploads WHERE date(created_at) = date('now')").get()?.cnt || 0;

  // 最近注册用户
  const recentUsers = db.prepare(`
    SELECT id, name, email, role, organization, status, created_at
    FROM users ORDER BY created_at DESC LIMIT 10
  `).all();

  // 最近 AI 报告
  const recentReports = db.prepare(`
    SELECT r.id, r.title, r.report_type, r.skill_key, r.created_at,
      u.name as user_name, p.name as project_name, b.original_filename as bp_filename
    FROM reports r
    LEFT JOIN users u ON u.id = r.user_id
    LEFT JOIN projects p ON p.id = r.project_id
    LEFT JOIN bp_uploads b ON b.id = r.bp_upload_id
    ORDER BY r.created_at DESC LIMIT 10
  `).all();

  // 各行业项目分布
  const sectorDist = db.prepare(`
    SELECT sector, COUNT(*) as cnt FROM projects WHERE status = 'active'
    GROUP BY sector ORDER BY cnt DESC LIMIT 8
  `).all();

  res.json({
    overview: { userTotal, projectTotal, reportTotal, bpTotal, bpAnalyzed, roadshowTotal, partnerTotal },
    today: { users: todayUsers, reports: todayReports, bps: todayBPs },
    recentUsers,
    recentReports,
    sectorDist
  });
});

// GET /api/admin/logs — 操作日志
router.get('/logs', (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const pageNum = Math.max(1, parseInt(page));
  const pageSize = Math.min(100, Math.max(1, parseInt(limit)));
  const offset = (pageNum - 1) * pageSize;

  const total = db.prepare('SELECT COUNT(*) as cnt FROM admin_logs').get()?.cnt || 0;
  const logs = db.prepare(`
    SELECT l.*, u.name as admin_name
    FROM admin_logs l
    LEFT JOIN users u ON u.id = l.admin_user_id
    ORDER BY l.created_at DESC
    LIMIT ? OFFSET ?
  `).all(pageSize, offset);

  res.json({ logs, pagination: { total, page: pageNum, limit: pageSize, pages: Math.ceil(total / pageSize) } });
});

// POST /api/admin/logs — 写入操作日志（供管理界面调用）
router.post('/logs', (req, res, next) => {
  try {
    const { action, target_type, target_id, detail } = req.body;
    db.prepare('INSERT INTO admin_logs (admin_user_id, action, target_type, target_id, detail) VALUES (?, ?, ?, ?, ?)')
      .run(req.user.id, action, target_type || null, target_id || null, detail ? JSON.stringify(detail) : null);
    res.status(201).json({ success: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/stats — 管理端详细统计
router.get('/stats', (req, res) => {
  recalcStats();
  const stats = getAllStats();

  // 按角色统计用户
  const userByRole = db.prepare('SELECT role, COUNT(*) as cnt FROM users GROUP BY role').all();

  // 按赛道统计项目
  const projectBySector = db.prepare(`
    SELECT sector, COUNT(*) as total,
      SUM(CASE WHEN is_hot = 1 THEN 1 ELSE 0 END) as hot_count
    FROM projects WHERE status = 'active'
    GROUP BY sector ORDER BY total DESC
  `).all();

  // 月度报告趋势（近 6 个月）
  const reportTrend = db.prepare(`
    SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as cnt
    FROM reports
    WHERE created_at >= date('now', '-6 months')
    GROUP BY month ORDER BY month ASC
  `).all();

  res.json({ stats, userByRole, projectBySector, reportTrend });
});

// PUT /api/admin/system-stats/:key — 手动更新某个统计值
router.put('/system-stats/:key', (req, res, next) => {
  try {
    const { value, displayValue } = req.body;
    db.prepare(`
      INSERT INTO system_stats (stat_key, stat_value, display_value, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(stat_key) DO UPDATE SET
        stat_value = excluded.stat_value,
        display_value = excluded.display_value,
        updated_at = excluded.updated_at
    `).run(req.params.key, value, displayValue || String(value));
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
