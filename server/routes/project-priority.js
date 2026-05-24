/**
 * /api/project-priority — 项目优先级评分与参与人管理
 *
 * 评分维度（满分100）：
 *   AI分析得分     40分  ← ai_score(0-100) × 0.4
 *   资源方决策人   25分  ← score_decision_maker(0/1) × 25，或部分分0-25
 *   资金方参与概率 20分  ← score_funding_prob(0-100) × 0.2
 *   工作组参与人数 15分  ← min(参与人数/5, 1) × 15
 *
 * 优先级等级：S≥80 / A≥60 / B≥40 / C<40
 */

import { Router } from 'express';
import db from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// ── 工具 ──────────────────────────────────────────────

function calcPriority(project, participantCount) {
  const aiRaw     = parseFloat(project.ai_score) || 0;           // 0-100
  const dmScore   = Math.min(Math.max(parseInt(project.score_decision_maker) || 0, 0), 25); // 0-25
  const fundRaw   = Math.min(Math.max(parseInt(project.score_funding_prob)   || 0, 0), 100);// 0-100
  const pCount    = Math.min(participantCount || 0, 5);           // cap at 5

  const s_ai     = aiRaw   * 0.4;          // max 40
  const s_dm     = dmScore;                // max 25
  const s_fund   = fundRaw * 0.2;          // max 20
  const s_people = (pCount / 5) * 15;      // max 15

  const total = Math.round(s_ai + s_dm + s_fund + s_people);
  const level = total >= 80 ? 'S' : total >= 60 ? 'A' : total >= 40 ? 'B' : 'C';
  return { total, level, breakdown: { ai: Math.round(s_ai), dm: Math.round(s_dm), fund: Math.round(s_fund), people: Math.round(s_people) } };
}

function canAccess(projectId, user) {
  if (user.role === 'admin') return true;
  const proj = db.prepare('SELECT owner_id, workgroup_id FROM mine_projects WHERE id=?').get(projectId);
  if (!proj) return false;
  if (proj.owner_id === user.id) return true;
  if (proj.workgroup_id) {
    return !!db.prepare('SELECT 1 FROM workgroup_members WHERE workgroup_id=? AND user_id=?').get(proj.workgroup_id, user.id);
  }
  return false;
}

// ── 获取项目优先级信息 ─────────────────────────────────

// GET /api/project-priority/:projectId
router.get('/:projectId', requireAuth, (req, res) => {
  try {
    const pid = parseInt(req.params.projectId);
    if (!canAccess(pid, req.user)) return res.status(403).json({ error: '无权访问' });

    const proj = db.prepare(`
      SELECT id, name, ai_score, priority_score, priority_level,
             score_decision_maker, score_funding_prob, priority_notes, priority_updated_at
      FROM mine_projects WHERE id=?
    `).get(pid);
    if (!proj) return res.status(404).json({ error: '项目不存在' });

    const participants = db.prepare(`
      SELECT pp.*, u.name as user_name, u.email, u.organization, u.avatar_letter, u.role as user_role
      FROM project_participants pp
      JOIN users u ON u.id = pp.user_id
      WHERE pp.project_id = ?
      ORDER BY pp.joined_at ASC
    `).all(pid);

    const { total, level, breakdown } = calcPriority(proj, participants.length);

    res.json({
      project_id: pid,
      priority_score: total,
      priority_level: level,
      breakdown,
      score_decision_maker: proj.score_decision_maker || 0,
      score_funding_prob:   proj.score_funding_prob   || 0,
      ai_score:             proj.ai_score             || 0,
      priority_notes:       proj.priority_notes       || '',
      participants
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── 更新优先级评分参数 ────────────────────────────────

// PUT /api/project-priority/:projectId
router.put('/:projectId', requireAuth, (req, res) => {
  try {
    const pid = parseInt(req.params.projectId);
    if (!canAccess(pid, req.user)) return res.status(403).json({ error: '无权访问' });

    const proj = db.prepare('SELECT * FROM mine_projects WHERE id=?').get(pid);
    if (!proj) return res.status(404).json({ error: '项目不存在' });

    const {
      score_decision_maker, // 0-25
      score_funding_prob,   // 0-100
      priority_notes
    } = req.body;

    const updated = {
      score_decision_maker: score_decision_maker !== undefined ? Math.min(Math.max(parseInt(score_decision_maker), 0), 25) : (proj.score_decision_maker || 0),
      score_funding_prob:   score_funding_prob   !== undefined ? Math.min(Math.max(parseInt(score_funding_prob),   0), 100): (proj.score_funding_prob   || 0),
      priority_notes:       priority_notes       !== undefined ? priority_notes : (proj.priority_notes || '')
    };

    // 重新计算
    const participants = db.prepare('SELECT COUNT(*) as c FROM project_participants WHERE project_id=?').get(pid);
    const merged = { ...proj, ...updated };
    const { total, level } = calcPriority(merged, participants.c);

    db.prepare(`
      UPDATE mine_projects
      SET score_decision_maker=?, score_funding_prob=?, priority_notes=?,
          priority_score=?, priority_level=?, priority_updated_at=datetime('now')
      WHERE id=?
    `).run(updated.score_decision_maker, updated.score_funding_prob, updated.priority_notes, total, level, pid);

    res.json({ priority_score: total, priority_level: level, message: '评分已更新' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── 参与人管理 ────────────────────────────────────────

// GET /api/project-priority/:projectId/participants
router.get('/:projectId/participants', requireAuth, (req, res) => {
  try {
    const pid = parseInt(req.params.projectId);
    if (!canAccess(pid, req.user)) return res.status(403).json({ error: '无权访问' });
    const list = db.prepare(`
      SELECT pp.*, u.name as user_name, u.email, u.organization, u.avatar_letter, u.role as user_role
      FROM project_participants pp
      JOIN users u ON u.id = pp.user_id
      WHERE pp.project_id = ? ORDER BY pp.joined_at ASC
    `).all(pid);
    res.json({ participants: list });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/project-priority/:projectId/participants — 添加参与人
router.post('/:projectId/participants', requireAuth, (req, res) => {
  try {
    const pid = parseInt(req.params.projectId);
    if (!canAccess(pid, req.user)) return res.status(403).json({ error: '无权访问' });

    const { email, role, is_decision_contact, funding_confidence, notes } = req.body;
    if (!email) return res.status(400).json({ error: 'email 必填' });

    const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
    if (!user) return res.status(404).json({ error: '用户不存在，请先注册' });

    db.prepare(`
      INSERT OR REPLACE INTO project_participants
        (project_id, user_id, role, is_decision_contact, funding_confidence, notes)
      VALUES (?,?,?,?,?,?)
    `).run(
      pid, user.id,
      role               || 'member',
      is_decision_contact ? 1 : 0,
      Math.min(Math.max(parseInt(funding_confidence) || 0, 0), 100),
      notes || ''
    );

    // 重新计算优先级
    _recalcAndSave(pid);

    res.status(201).json({ message: `${user.name} 已加入项目` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/project-priority/:projectId/participants/:userId — 更新参与人信息
router.put('/:projectId/participants/:userId', requireAuth, (req, res) => {
  try {
    const pid = parseInt(req.params.projectId);
    const uid = parseInt(req.params.userId);
    if (!canAccess(pid, req.user)) return res.status(403).json({ error: '无权访问' });

    const { role, is_decision_contact, funding_confidence, notes } = req.body;
    const pp = db.prepare('SELECT * FROM project_participants WHERE project_id=? AND user_id=?').get(pid, uid);
    if (!pp) return res.status(404).json({ error: '参与人不存在' });

    db.prepare(`
      UPDATE project_participants
      SET role=?, is_decision_contact=?, funding_confidence=?, notes=?
      WHERE project_id=? AND user_id=?
    `).run(
      role               !== undefined ? role                : pp.role,
      is_decision_contact !== undefined ? (is_decision_contact ? 1 : 0) : pp.is_decision_contact,
      funding_confidence  !== undefined ? Math.min(Math.max(parseInt(funding_confidence), 0), 100) : pp.funding_confidence,
      notes               !== undefined ? notes : pp.notes,
      pid, uid
    );

    _recalcAndSave(pid);
    res.json({ message: '已更新' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/project-priority/:projectId/participants/:userId
router.delete('/:projectId/participants/:userId', requireAuth, (req, res) => {
  try {
    const pid = parseInt(req.params.projectId);
    const uid = parseInt(req.params.userId);
    if (!canAccess(pid, req.user)) return res.status(403).json({ error: '无权访问' });
    db.prepare('DELETE FROM project_participants WHERE project_id=? AND user_id=?').run(pid, uid);
    _recalcAndSave(pid);
    res.json({ message: '已移除' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── 批量获取（工作组看板用） ───────────────────────────

// GET /api/project-priority?project_ids=1,2,3
router.get('/', requireAuth, (req, res) => {
  try {
    const ids = (req.query.project_ids || '').split(',').map(Number).filter(Boolean);
    if (!ids.length) return res.json({ priorities: [] });

    const placeholders = ids.map(() => '?').join(',');
    const rows = db.prepare(`
      SELECT p.id, p.name, p.ai_score, p.priority_score, p.priority_level,
             p.score_decision_maker, p.score_funding_prob, p.priority_notes,
             (SELECT COUNT(*) FROM project_participants WHERE project_id=p.id) as participant_count
      FROM mine_projects p
      WHERE p.id IN (${placeholders})
    `).all(...ids);

    const priorities = rows.map(p => {
      const { total, level, breakdown } = calcPriority(p, p.participant_count);
      return { ...p, priority_score: total, priority_level: level, breakdown };
    });

    res.json({ priorities });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── 内部：重新计算并保存 ──────────────────────────────
function _recalcAndSave(pid) {
  const proj = db.prepare('SELECT * FROM mine_projects WHERE id=?').get(pid);
  if (!proj) return;
  const cnt = db.prepare('SELECT COUNT(*) as c FROM project_participants WHERE project_id=?').get(pid);
  const { total, level } = calcPriority(proj, cnt.c);
  db.prepare(`UPDATE mine_projects SET priority_score=?, priority_level=?, priority_updated_at=datetime('now') WHERE id=?`)
    .run(total, level, pid);
}

export default router;
