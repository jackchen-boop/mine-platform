import { Router } from 'express';
import { createRequire } from 'module';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';
import db from '../db/connection.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';

const require = createRequire(import.meta.url);
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const UPLOAD_DIR = process.env.UPLOAD_DIR || join(__dirname, '../../public/uploads');
if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });

// 图片上传专用 multer（只允许图片）
const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = file.originalname.split('.').pop().toLowerCase();
    cb(null, `cover-${uuidv4()}.${ext}`);
  }
});
const imageUpload = multer({
  storage: imageStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
    const ext = file.originalname.split('.').pop().toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('仅支持图片格式：jpg/png/webp/gif'));
  }
});

// 运行时迁移：为 mine_projects 添加 cover_image 字段
try { db.exec('ALTER TABLE mine_projects ADD COLUMN cover_image TEXT'); } catch(e) {}
try { db.exec('ALTER TABLE mine_projects ADD COLUMN highlights TEXT'); } catch(e) {}
try { db.exec('ALTER TABLE mine_projects ADD COLUMN disposal_options TEXT'); } catch(e) {}
try { db.exec('ALTER TABLE mine_projects ADD COLUMN depth_range TEXT'); } catch(e) {}
try { db.exec('ALTER TABLE mine_projects ADD COLUMN license_expires TEXT'); } catch(e) {}
try { db.exec('ALTER TABLE mine_projects ADD COLUMN contact_masked TEXT'); } catch(e) {}

const router = Router();

// 每个阶段的默认任务
const DEFAULT_TASKS = [
  { phase: 'info_collection',    title: '收集项目基础信息及联系方式' },
  { phase: 'due_diligence',      title: '审查地质报告及证照资料' },
  { phase: 'ai_evaluation',      title: 'AI智能评价分析' },
  { phase: 'report_preparation', title: '整理并上传完整项目材料' },
  { phase: 'listing',            title: '完成项目挂牌发布' },
  { phase: 'investor_matching',  title: '匹配目标投资机构' },
  { phase: 'roadshow',           title: '安排路演推介' },
  { phase: 'negotiation',        title: '推进价格及条款谈判' },
  { phase: 'deal_closing',       title: '完成协议签署与交割' },
];

function createDefaultTasks(projectId, userId) {
  const stmt = db.prepare(
    `INSERT INTO project_tasks (project_id, phase, title, status, priority, created_by, created_at)
     VALUES (?, ?, ?, 'pending', 'normal', ?, datetime('now'))`
  );
  for (const t of DEFAULT_TASKS) {
    stmt.run(projectId, t.phase, t.title, userId);
  }
}

// 所有项目列表接口都使用 optionalAuth，以便有token时识别用户身份
router.use(optionalAuth);

// GET /api/mine-projects — 项目列表（支持公开访问，脱敏）
router.get('/', (req, res) => {
  try {
    const { mineral, province, stage, keyword, hot_only, page = 1, limit = 10, mine_only, unassigned } = req.query;
    const isLoggedIn = req.headers.authorization;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let conditions = ['mp.status = ?'];
    let params = ['active'];

    // mine_only=1 时只返回当前用户所在工作组的项目
    if (mine_only === '1' && isLoggedIn && req.user) {
      const userWgs = db.prepare('SELECT workgroup_id FROM workgroup_members WHERE user_id = ?').all(req.user.id);
      if (userWgs.length > 0) {
        const placeholders = userWgs.map(() => '?').join(',');
        conditions.push(`(mp.workgroup_id IN (${placeholders}) OR mp.owner_id = ?)`);
        params.push(...userWgs.map(w => w.workgroup_id), req.user.id);
      } else {
        // 用户没有工作组，只能看到自己创建的项目
        conditions.push('mp.owner_id = ?');
        params.push(req.user.id);
      }
    }

    // unassigned=1 时只返回未分配工作组的项目（用于工作组分配）
    if (unassigned === '1' && isLoggedIn && req.user) {
      conditions.push('mp.workgroup_id IS NULL');
    }

    if (mineral) { conditions.push('mp.mineral_types LIKE ?'); params.push(`%${mineral}%`); }
    if (province) { conditions.push('mp.province = ?'); params.push(province); }
    if (stage) { conditions.push('mp.development_stage = ?'); params.push(stage); }
    if (hot_only) { conditions.push('mp.is_hot = 1'); }
    if (keyword) {
      conditions.push('(mp.name LIKE ? OR mp.code LIKE ? OR mp.province LIKE ? OR mp.city LIKE ?)');
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }

    const where = conditions.join(' AND ');

    // 非登录用户只返回脱敏字段
    const publicFields = 'mp.id, mp.code, mp.name, mp.mineral_types, mp.province, mp.city, mp.area_km2, mp.estimated_reserve, mp.reserve_grade, mp.depth_range, mp.mine_type, mp.development_stage, mp.license_status, mp.asking_price, mp.description_masked AS description, mp.highlights, mp.disposal_options, mp.is_hot, mp.is_featured, mp.ai_score, mp.ai_grade';
    const privateFields = 'mp.license_expires, mp.description AS full_description, mp.contact_masked, mp.view_count, mp.ai_summary, mp.ai_missing_data, mp.created_at, wg.name AS workgroup_name';
    const selectFields = isLoggedIn ? `${publicFields}, ${privateFields}` : publicFields;

    const total = db.prepare(`SELECT COUNT(*) as c FROM mine_projects mp WHERE ${where}`).get(...params).c;
    const projects = db.prepare(`SELECT ${selectFields} FROM mine_projects mp LEFT JOIN workgroups wg ON wg.id = mp.workgroup_id WHERE ${where} ORDER BY mp.is_featured DESC, mp.is_hot DESC, mp.created_at DESC LIMIT ? OFFSET ?`)
      .all(...params, parseInt(limit), offset);

    res.json({ projects, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mine-projects/published — 前台展示的已发布项目（必须在 /:id 之前注册）
router.get('/published', (req, res) => {
  try {
    const projects = db.prepare(`
      SELECT mp.id, mp.code, COALESCE(mp.listing_name, mp.name) AS name, mp.mineral_types,
             mp.province, mp.city, mp.area_km2, mp.estimated_reserve, mp.reserve_grade,
             mp.development_stage, mp.asking_price, mp.highlights, mp.is_hot, mp.is_featured,
             mp.ai_score, mp.ai_grade, mp.ai_summary,
             mp.description_masked AS description,
             aa.content AS report_content,
             (SELECT json_group_array(json_object('filename', pp.filename, 'stored_name', pp.stored_name))
              FROM project_photos pp WHERE pp.project_id = mp.id
              LIMIT 3) AS published_photos
      FROM mine_projects mp
      LEFT JOIN ai_analyses aa ON aa.id = mp.report_id
      WHERE mp.status = 'active'
      ORDER BY mp.ai_score DESC, mp.is_featured DESC, mp.is_hot DESC
    `).all();

    // 解析 report_content JSON
    const result = projects.map(p => {
      try { p.report_content = JSON.parse(p.report_content || 'null'); } catch(e) { p.report_content = null; }
      return p;
    });

    res.json({ projects: result });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mine-projects/:id — 项目详情
router.get('/:id', (req, res) => {
  try {
    const isLoggedIn = req.headers.authorization;
    const project = db.prepare(`
      SELECT mp.*, wg.name as workgroup_name
      FROM mine_projects mp
      LEFT JOIN workgroups wg ON wg.id = mp.workgroup_id
      WHERE mp.id = ? AND mp.status = ?
    `).get(req.params.id, 'active');
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
        workgroup_name: project.workgroup_name,
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

// POST /api/mine-projects — 创建新项目
router.post('/', requireAuth, (req, res) => {
  try {
    const { name, mineral_types, province, city, area_km2, estimated_reserve, reserve_grade, development_stage, mine_type, description } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: '项目名称不能为空' });

    const code = `PROJ-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const userWg = db.prepare('SELECT workgroup_id FROM workgroup_members WHERE user_id = ? LIMIT 1').get(req.user.id);
    const workgroupId = userWg ? userWg.workgroup_id : null;

    const result = db.prepare(`
      INSERT INTO mine_projects (code, name, mineral_types, province, city, area_km2, estimated_reserve, reserve_grade, development_stage, mine_type, description, description_masked, owner_id, workgroup_id, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', datetime('now'))
    `).run(
      code, name.trim(),
      mineral_types || 'unknown',
      province || null, city || null,
      area_km2 || null, estimated_reserve || null, reserve_grade || null,
      development_stage || null, mine_type || null,
      description || null, description || null,
      req.user.id, workgroupId
    );

    const projectId = result.lastInsertRowid;
    createDefaultTasks(projectId, req.user.id);
    const project = db.prepare('SELECT * FROM mine_projects WHERE id = ?').get(projectId);

    res.status(201).json({ id: projectId, code, project });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/mine-projects/:id — 更新项目信息
router.put('/:id', requireAuth, (req, res) => {
  try {
    const project = db.prepare('SELECT * FROM mine_projects WHERE id = ? AND status = ?').get(req.params.id, 'active');
    if (!project) return res.status(404).json({ error: '项目不存在' });

    const allowed = ['name', 'mineral_types', 'province', 'city', 'area_km2', 'estimated_reserve',
      'reserve_grade', 'development_stage', 'mine_type', 'description', 'description_masked',
      'asking_price', 'license_status', 'highlights', 'disposal_options', 'depth_range',
      'license_expires', 'contact_masked', 'cover_image'];
    const updates = [];
    const values = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updates.push(`${key} = ?`);
        values.push(req.body[key]);
      }
    }
    if (updates.length === 0) return res.status(400).json({ error: '没有可更新的字段' });

    updates.push("updated_at = datetime('now')");
    values.push(req.params.id);
    db.prepare(`UPDATE mine_projects SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    res.json({ success: true, id: parseInt(req.params.id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/mine-projects/:id — 软删除项目（仅项目创建人或管理员）
router.delete('/:id', requireAuth, (req, res) => {
  try {
    const project = db.prepare('SELECT * FROM mine_projects WHERE id = ? AND status = ?').get(req.params.id, 'active');
    if (!project) return res.status(404).json({ error: '项目不存在' });

    // 权限：项目创建人或管理员
    if (req.user.role !== 'admin' && project.owner_id !== req.user.id) {
      return res.status(403).json({ error: '无权删除此项目，仅项目创建人或管理员可删除' });
    }

    // 软删除：将 status 改为 deleted
    db.prepare("UPDATE mine_projects SET status = 'deleted', updated_at = datetime('now') WHERE id = ?").run(req.params.id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/mine-projects/:id/unpublish — 下架项目
router.post('/:id/unpublish', requireAuth, (req, res) => {
  try {
    const project = db.prepare("SELECT id, owner_id FROM mine_projects WHERE id = ? AND status != 'deleted'").get(req.params.id);
    if (!project) return res.status(404).json({ error: '项目不存在' });
    if (req.user.role !== 'admin' && project.owner_id !== req.user.id) return res.status(403).json({ error: '无权限' });
    db.prepare("UPDATE mine_projects SET status = 'inactive' WHERE id = ?").run(req.params.id);
    res.json({ message: '已下架' });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/mine-projects/:id/cover — 上传封面图
router.post('/:id/cover', requireAuth, (req, res) => {
  imageUpload.single('cover')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: '请选择图片' });

    const project = db.prepare('SELECT id, owner_id FROM mine_projects WHERE id = ? AND status = ?').get(req.params.id, 'active');
    if (!project) return res.status(404).json({ error: '项目不存在' });

    const imageUrl = '/uploads/' + req.file.filename;
    db.prepare("UPDATE mine_projects SET cover_image = ?, updated_at = datetime('now') WHERE id = ?")
      .run(imageUrl, req.params.id);

    res.json({ success: true, cover_image: imageUrl });
  });
});

// ── 项目照片 API ──────────────────────────────────────

// 照片上传 multer
const photoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = file.originalname.split('.').pop().toLowerCase();
    cb(null, `photo-${uuidv4()}.${ext}`);
  }
});
const photoUpload = multer({
  storage: photoStorage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const allowed = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'];
    const ext = file.originalname.split('.').pop().toLowerCase();
    cb(null, allowed.includes(ext));
  }
});

// GET /api/mine-projects/:id/photos
router.get('/:id/photos', requireAuth, (req, res) => {
  try {
    const photos = db.prepare('SELECT * FROM project_photos WHERE project_id=? ORDER BY created_at DESC').all(req.params.id);
    res.json({ photos });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/mine-projects/:id/photos — 上传照片
router.post('/:id/photos', requireAuth, (req, res) => {
  photoUpload.single('photo')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: '请选择图片' });
    const { caption } = req.body;
    const url = '/uploads/' + req.file.filename;
    const r = db.prepare(
      'INSERT INTO project_photos (project_id, user_id, filename, stored_name, caption) VALUES (?,?,?,?,?)'
    ).run(req.params.id, req.user.id, req.file.originalname, url, caption || '');
    res.status(201).json({ id: r.lastInsertRowid, url, filename: req.file.originalname, caption: caption || '' });
  });
});

// DELETE /api/mine-projects/:id/photos/:photoId
router.delete('/:id/photos/:photoId', requireAuth, (req, res) => {
  try {
    db.prepare('DELETE FROM project_photos WHERE id=? AND project_id=?').run(req.params.photoId, req.params.id);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

export default router;
