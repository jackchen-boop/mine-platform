import { Router } from 'express';
import db from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { randomUUID } from 'crypto';

const router = Router();

// GET /api/live — 直播列表（公开）
router.get('/', (req, res) => {
  try {
    const { status } = req.query;
    let sql = `
      SELECT s.*, p.name as project_name, p.code as project_code
      FROM live_streams s
      LEFT JOIN mine_projects p ON s.project_id = p.id
      WHERE 1=1
    `;
    const params = [];
    if (status) { sql += ' AND s.status = ?'; params.push(status); }
    sql += " ORDER BY CASE s.status WHEN 'live' THEN 0 WHEN 'scheduled' THEN 1 ELSE 2 END, s.scheduled_at DESC";

    const streams = db.prepare(sql).all(...params);
    res.json({ streams });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/live/:id — 直播详情
router.get('/:id', (req, res) => {
  try {
    const stream = db.prepare(`
      SELECT s.*, p.name as project_name, p.code as project_code
      FROM live_streams s
      LEFT JOIN mine_projects p ON s.project_id = p.id
      WHERE s.id = ?
    `).get(req.params.id);
    if (!stream) return res.status(404).json({ error: '直播不存在' });
    res.json({ stream });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/live — 创建直播（管理员/项目方）
router.post('/', requireAuth, (req, res) => {
  try {
    const { title, project_id, description, scheduled_at } = req.body;
    if (!title) return res.status(400).json({ error: '直播标题必填' });

    const roomToken = 'room-' + randomUUID().slice(0, 8);
    const result = db.prepare(`
      INSERT INTO live_streams (title, project_id, presenter_id, presenter_name, status, description, scheduled_at, room_token)
      VALUES (?, ?, ?, ?, 'scheduled', ?, ?, ?)
    `).run(title, project_id || null, req.user.id, req.user.name, description || null, scheduled_at || null, roomToken);

    res.status(201).json({ id: result.lastInsertRowid, room_token: roomToken });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/live/:id/start — 开始直播
router.post('/:id/start', requireAuth, (req, res) => {
  try {
    const stream = db.prepare('SELECT * FROM live_streams WHERE id = ?').get(req.params.id);
    if (!stream) return res.status(404).json({ error: '直播不存在' });
    if (stream.presenter_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权操作' });
    }
    db.prepare("UPDATE live_streams SET status = 'live', started_at = datetime('now') WHERE id = ?").run(req.params.id);
    res.json({ success: true, status: 'live' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/live/:id/end — 结束直播
router.post('/:id/end', requireAuth, (req, res) => {
  try {
    const stream = db.prepare('SELECT * FROM live_streams WHERE id = ?').get(req.params.id);
    if (!stream) return res.status(404).json({ error: '直播不存在' });
    if (stream.presenter_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权操作' });
    }
    db.prepare("UPDATE live_streams SET status = 'ended', ended_at = datetime('now') WHERE id = ?").run(req.params.id);
    res.json({ success: true, status: 'ended' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/live/:id/request-speaker — 申请发言
router.post('/:id/request-speaker', requireAuth, (req, res) => {
  try {
    const streamId = req.params.id;
    const existing = db.prepare('SELECT id, status FROM live_speaker_requests WHERE stream_id = ? AND user_id = ?').get(streamId, req.user.id);
    if (existing) {
      if (existing.status === 'approved') return res.json({ success: true, already: true, status: 'approved' });
      if (existing.status === 'pending') return res.json({ success: true, already: true, status: 'pending' });
    }
    db.prepare(`
      INSERT INTO live_speaker_requests (stream_id, user_id, user_name, status)
      VALUES (?, ?, ?, 'pending')
    `).run(streamId, req.user.id, req.user.name);
    res.json({ success: true, status: 'pending' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/live/:id/speaker-requests — 查看发言申请（主播/管理员）
router.get('/:id/speaker-requests', requireAuth, (req, res) => {
  try {
    const stream = db.prepare('SELECT * FROM live_streams WHERE id = ?').get(req.params.id);
    if (!stream) return res.status(404).json({ error: '直播不存在' });
    if (stream.presenter_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权查看' });
    }
    const requests = db.prepare(`
      SELECT r.*, u.name, u.organization
      FROM live_speaker_requests r
      LEFT JOIN users u ON u.id = r.user_id
      WHERE r.stream_id = ? ORDER BY r.created_at DESC
    `).all(req.params.id);
    res.json({ requests });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/live/:id/approve-speaker/:reqId — 批准发言
router.post('/:id/approve-speaker/:reqId', requireAuth, (req, res) => {
  try {
    const stream = db.prepare('SELECT * FROM live_streams WHERE id = ?').get(req.params.id);
    if (!stream) return res.status(404).json({ error: '直播不存在' });
    if (stream.presenter_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权操作' });
    }
    db.prepare('UPDATE live_speaker_requests SET status = "approved", approved_by = ? WHERE id = ? AND stream_id = ?')
      .run(req.user.id, req.params.reqId, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/live/:id/deny-speaker/:reqId — 拒绝发言
router.post('/:id/deny-speaker/:reqId', requireAuth, (req, res) => {
  try {
    const stream = db.prepare('SELECT * FROM live_streams WHERE id = ?').get(req.params.id);
    if (!stream) return res.status(404).json({ error: '直播不存在' });
    if (stream.presenter_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权操作' });
    }
    db.prepare('UPDATE live_speaker_requests SET status = "denied", approved_by = ? WHERE id = ? AND stream_id = ?')
      .run(req.user.id, req.params.reqId, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
