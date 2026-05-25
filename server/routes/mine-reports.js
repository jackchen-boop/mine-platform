import { Router } from 'express';
import db from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const uploadDir = process.env.UPLOAD_DIR || join(__dirname, '../../public/uploads');
if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });

// 归档存储目录：/data/archive/{年}/{月}/{日}/{category}/
const archiveBase = process.env.DATA_DIR || join(__dirname, '../../data');
const archiveDir = join(archiveBase, 'archive');
if (!existsSync(archiveDir)) mkdirSync(archiveDir, { recursive: true });

function getArchivePath(category) {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const cat = category || 'other';
  const dir = join(archiveDir, String(y), m, d, cat);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const category = req.body.report_type || req.body.report_category || 'other';
    const dest = getArchivePath(category);
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    const ext = file.originalname.split('.').pop();
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const uid = req.user ? req.user.id : 0;
    cb(null, `${ts}_uid${uid}_${randomUUID().slice(0, 8)}.${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.zip', '.rar', '.7z', '.jpg', '.png', '.csv'];
    const ext = '.' + file.originalname.split('.').pop().toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('不支持的文件格式，允许：' + allowed.join(', ')));
  }
});

const router = Router();

// POST /api/mine-reports/upload — 文件上传
router.post('/upload', requireAuth, upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请选择文件' });

    const { project_id, report_type, report_category } = req.body;

    const category = req.body.report_type || req.body.report_category || 'other';
    const archiveSubPath = req.file.path.replace(archiveDir + '/', '');

    const result = db.prepare(`
      INSERT INTO mine_reports (user_id, project_id, report_type, original_filename, stored_filename, file_size, file_type, parse_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'uploaded')
    `).run(
      req.user.id,
      project_id || null,
      category,
      req.file.originalname,
      archiveSubPath,
      req.file.size,
      req.file.mimetype
    );

    res.status(201).json({
      id: result.lastInsertRowid,
      filename: req.file.originalname,
      size: req.file.size,
      message: '文件上传成功'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/mine-reports/upload-batch — 批量上传
router.post('/upload-batch', requireAuth, upload.array('files', 20), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: '请选择文件' });

    const { project_id, report_type, report_category } = req.body;
    const category = req.body.report_type || req.body.report_category || 'other';
    const results = [];

    for (const file of req.files) {
      const archiveSubPath = file.path.replace(archiveDir + '/', '');
      const result = db.prepare(`
        INSERT INTO mine_reports (user_id, project_id, report_type, original_filename, stored_filename, file_size, file_type, parse_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'uploaded')
      `).run(
        req.user.id,
        project_id || null,
        category,
        file.originalname,
        archiveSubPath,
        file.size,
        file.mimetype
      );
      results.push({ id: result.lastInsertRowid, filename: file.originalname });
    }

    res.status(201).json({ count: results.length, reports: results, message: `${results.length}个文件上传成功` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/mine-reports — 创建报告记录（无文件）
router.post('/', requireAuth, (req, res) => {
  try {
    const { project_id, report_type, original_filename, stored_filename, file_size, file_type } = req.body;
    if (!original_filename) return res.status(400).json({ error: '文件名必填' });

    const result = db.prepare(`
      INSERT INTO mine_reports (user_id, project_id, report_type, original_filename, stored_filename, file_size, file_type, parse_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(req.user.id, project_id || null, report_type || 'exploration', original_filename, stored_filename || original_filename, file_size || 0, file_type || 'unknown');

    res.status(201).json({ id: result.lastInsertRowid, message: '报告记录已创建' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mine-reports — 当前用户的报告列表
router.get('/', requireAuth, (req, res) => {
  try {
    const reports = db.prepare('SELECT * FROM mine_reports WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
    res.json({ reports });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mine-reports/project/:id — 某项目的报告列表
router.get('/project/:id', requireAuth, (req, res) => {
  try {
    const reports = db.prepare('SELECT * FROM mine_reports WHERE project_id = ? ORDER BY created_at DESC').all(req.params.id);
    res.json({ reports });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/mine-reports/:id — 删除报告
router.delete('/:id', requireAuth, (req, res) => {
  try {
    const report = db.prepare('SELECT * FROM mine_reports WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!report) return res.status(404).json({ error: '报告不存在' });
    db.prepare('DELETE FROM mine_reports WHERE id = ?').run(req.params.id);
    res.json({ message: '已删除' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 错误处理中间件
router.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: '文件大小超过限制（最大50MB）' });
  }
  if (err.message && err.message.includes('不支持的文件格式')) {
    return res.status(400).json({ error: err.message });
  }
  res.status(500).json({ error: err.message || '上传失败' });
});

export default router;
