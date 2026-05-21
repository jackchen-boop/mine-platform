// 直播路由 — /api/live/*
import { Router } from 'express';
import db from '../db/connection.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getRoomInfo, getAllLiveRooms } from '../services/liveSignaling.js';

const router = Router();

// GET /api/live/rooms — 获取所有活跃直播房间
router.get('/rooms', (req, res) => {
  const liveRooms = getAllLiveRooms();
  // 附加项目信息
  const result = liveRooms.map(r => {
    const roadshow = db.prepare(`
      SELECT r.*, p.name as project_name, p.sector as project_sector
      FROM roadshows r
      LEFT JOIN projects p ON p.id = r.project_id
      WHERE r.id = ?
    `).get(r.roomId);
    return { ...r, roadshow: roadshow || null };
  });
  res.json({ rooms: result });
});

// GET /api/live/:roomId — 获取房间详情
router.get('/:roomId', (req, res) => {
  const info = getRoomInfo(req.params.roomId);
  if (!info) return res.status(404).json({ error: '直播房间不存在或已结束' });

  const roadshow = db.prepare(`
    SELECT r.*, p.name as project_name, p.sector as project_sector, p.description as project_description
    FROM roadshows r
    LEFT JOIN projects p ON p.id = r.project_id
    WHERE r.id = ?
  `).get(req.params.roomId);

  res.json({ room: info, roadshow: roadshow || null });
});

// POST /api/live/:roadshowId/start — 开始直播（主播/管理员）
router.post('/:roadshowId/start', requireRole('admin'), (req, res) => {
  const { roadshowId } = req.params;
  const roadshow = db.prepare('SELECT * FROM roadshows WHERE id = ?').get(roadshowId);
  if (!roadshow) return res.status(404).json({ error: '路演不存在' });

  // 更新路演状态为直播中
  db.prepare("UPDATE roadshows SET status = 'live' WHERE id = ?").run(roadshowId);

  res.json({ success: true, roomId: roadshowId, message: '直播已开始' });
});

// POST /api/live/:roadshowId/end — 结束直播（管理员）
router.post('/:roadshowId/end', requireRole('admin'), (req, res) => {
  const { roadshowId } = req.params;

  // 更新路演状态
  db.prepare("UPDATE roadshows SET status = 'completed' WHERE id = ?").run(roadshowId);

  res.json({ success: true, message: '直播已结束' });
});

// POST /api/live/:roadshowId/record-viewer — 记录观众数
router.post('/:roadshowId/record-viewer', requireAuth, (req, res) => {
  const { roadshowId } = req.params;
  db.prepare('UPDATE roadshows SET viewer_count = viewer_count + 1 WHERE id = ?').run(roadshowId);
  res.json({ success: true });
});

export default router;
