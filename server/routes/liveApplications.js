// 直播权限申请路由 — 创业者申请 / 管理员审批
import { Router } from 'express';
import db from '../db/connection.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

// POST /api/live-applications — 创业者提交直播申请
router.post('/', requireAuth, (req, res) => {
  const { roadshowId, reason } = req.body;
  const user = req.user;

  if (!roadshowId) {
    return res.status(400).json({ error: '缺少路演ID' });
  }

  // 检查路演是否存在
  const roadshow = db.prepare('SELECT * FROM roadshows WHERE id = ?').get(roadshowId);
  if (!roadshow) {
    return res.status(404).json({ error: '路演不存在' });
  }

  // 检查是否已有待审批或已通过的申请
  const existing = db.prepare(`
    SELECT * FROM live_applications
    WHERE roadshow_id = ? AND applicant_user_id = ? AND status IN ('pending','approved')
  `).get(roadshowId, user.id);

  if (existing) {
    if (existing.status === 'pending') {
      return res.status(409).json({ error: '已提交申请，请等待管理员审批' });
    }
    if (existing.status === 'approved') {
      return res.status(409).json({ error: '申请已通过，可直接开播' });
    }
  }

  // 创建申请
  db.prepare(`
    INSERT INTO live_applications (roadshow_id, applicant_user_id, applicant_name, applicant_org, reason, status)
    VALUES (?, ?, ?, ?, ?, 'pending')
  `).run(roadshowId, user.id, user.name, user.organization || '', reason || '');

  res.json({ success: true, message: '直播申请已提交，请等待管理员审批' });
});

// GET /api/live-applications/my — 查询当前用户的申请状态
router.get('/my', requireAuth, (req, res) => {
  const userId = req.user.id;
  const rows = db.prepare(`
    SELECT la.*, r.title as roadshow_title, r.presenter as roadshow_presenter
    FROM live_applications la
    LEFT JOIN roadshows r ON r.id = la.roadshow_id
    WHERE la.applicant_user_id = ?
    ORDER BY la.created_at DESC
  `).all(userId);
  res.json({ applications: rows });
});

// GET /api/live-applications/check/:roadshowId — 检查当前用户对某路演的直播权限
router.get('/check/:roadshowId', requireAuth, (req, res) => {
  const user = req.user;
  const { roadshowId } = req.params;

  // 管理员始终有权限
  if (user.role === 'admin') {
    return res.json({ canStream: true, role: 'admin' });
  }

  // 检查是否有已通过的申请
  const app = db.prepare(`
    SELECT * FROM live_applications
    WHERE roadshow_id = ? AND applicant_user_id = ? AND status = 'approved'
  `).get(roadshowId, user.id);

  if (app) {
    return res.json({ canStream: true, role: 'presenter', applicationId: app.id });
  }

  // 检查是否有待审批的申请
  const pending = db.prepare(`
    SELECT * FROM live_applications
    WHERE roadshow_id = ? AND applicant_user_id = ? AND status = 'pending'
  `).get(roadshowId, user.id);

  if (pending) {
    return res.json({ canStream: false, reason: 'pending', applicationId: pending.id });
  }

  res.json({ canStream: false, reason: 'not_applied' });
});

// GET /api/live-applications — 管理员查询所有申请（默认只查待审批）
router.get('/', ...requireRole('admin'), (req, res) => {
  const status = req.query.status || 'pending';
  const rows = db.prepare(`
    SELECT la.*, r.title as roadshow_title, r.presenter as roadshow_presenter, r.scheduled_at
    FROM live_applications la
    LEFT JOIN roadshows r ON r.id = la.roadshow_id
    WHERE la.status = ?
    ORDER BY la.created_at DESC
  `).all(status);
  res.json({ applications: rows });
});

// POST /api/live-applications/:id/approve — 管理员批准申请
router.post('/:id/approve', ...requireRole('admin'), (req, res) => {
  const { id } = req.params;
  const { notes } = req.body;

  const app = db.prepare('SELECT * FROM live_applications WHERE id = ?').get(id);
  if (!app) return res.status(404).json({ error: '申请不存在' });
  if (app.status !== 'pending') return res.status(400).json({ error: '申请已处理，无法重复审批' });

  db.prepare(`
    UPDATE live_applications SET status = 'approved', admin_notes = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(notes || '', id);

  res.json({ success: true, message: '已批准直播申请' });
});

// POST /api/live-applications/:id/reject — 管理员拒绝申请
router.post('/:id/reject', ...requireRole('admin'), (req, res) => {
  const { id } = req.params;
  const { notes } = req.body;

  const app = db.prepare('SELECT * FROM live_applications WHERE id = ?').get(id);
  if (!app) return res.status(404).json({ error: '申请不存在' });
  if (app.status !== 'pending') return res.status(400).json({ error: '申请已处理，无法重复审批' });

  db.prepare(`
    UPDATE live_applications SET status = 'rejected', admin_notes = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(notes || '', id);

  res.json({ success: true, message: '已拒绝直播申请' });
});

export default router;
