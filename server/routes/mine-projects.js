import { Router } from 'express';
import db from '../db/connection.js';

const router = Router();

// GET /api/mine-projects — 项目列表（支持公开访问，脱敏）
router.get('/', (req, res) => {
  try {
    const { mineral, province, stage, keyword, hot_only, page = 1, limit = 10 } = req.query;
    const isLoggedIn = req.headers.authorization;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let conditions = ['status = ?'];
    let params = ['active'];

    if (mineral) { conditions.push('mineral_types LIKE ?'); params.push(`%${mineral}%`); }
    if (province) { conditions.push('province = ?'); params.push(province); }
    if (stage) { conditions.push('development_stage = ?'); params.push(stage); }
    if (hot_only) { conditions.push('is_hot = 1'); }
    if (keyword) {
      conditions.push('(name LIKE ? OR code LIKE ? OR province LIKE ? OR city LIKE ?)');
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }

    const where = conditions.join(' AND ');

    // 非登录用户只返回脱敏字段
    const publicFields = 'id, code, name, mineral_types, province, city, area_km2, estimated_reserve, reserve_grade, depth_range, mine_type, development_stage, license_status, asking_price, description_masked AS description, highlights, disposal_options, is_hot, is_featured, ai_score';
    const privateFields = 'license_expires, description AS full_description, contact_masked, view_count, ai_summary, created_at';
    const selectFields = isLoggedIn ? `${publicFields}, ${privateFields}` : publicFields;

    const total = db.prepare(`SELECT COUNT(*) as c FROM mine_projects WHERE ${where}`).get(...params).c;
    const projects = db.prepare(`SELECT ${selectFields} FROM mine_projects WHERE ${where} ORDER BY is_featured DESC, is_hot DESC, created_at DESC LIMIT ? OFFSET ?`)
      .all(...params, parseInt(limit), offset);

    res.json({ projects, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mine-projects/:id — 项目详情
router.get('/:id', (req, res) => {
  try {
    const isLoggedIn = req.headers.authorization;
    const project = db.prepare('SELECT * FROM mine_projects WHERE id = ? AND status = ?').get(req.params.id, 'active');
    if (!project) return res.status(404).json({ error: '项目不存在' });

    db.prepare('UPDATE mine_projects SET view_count = view_count + 1 WHERE id = ?').run(req.params.id);

    if (!isLoggedIn) {
      return res.json({
        id: project.id, code: project.code, name: project.name,
        mineral_types: project.mineral_types, province: project.province, city: project.city,
        area_km2: project.area_km2, estimated_reserve: project.estimated_reserve,
        reserve_grade: project.reserve_grade, depth_range: project.depth_range,
        mine_type: project.mine_type, development_stage: project.development_stage,
        license_status: project.license_status, asking_price: project.asking_price,
        description: project.description_masked, highlights: project.highlights,
        disposal_options: project.disposal_options, is_hot: project.is_hot,
        ai_score: project.ai_score, is_confidential: project.is_confidential,
        notice: '登录后可查看完整项目信息'
      });
    }

    const safe = { ...project };
    delete safe.password_hash;
    res.json(safe);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
