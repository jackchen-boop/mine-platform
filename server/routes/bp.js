// BP 上传与解析路由 — /api/bp/*
import { Router } from 'express';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { unlink } from 'fs/promises';
import db from '../db/connection.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { uploadSingle } from '../middleware/upload.js';
import { extractText, buildBPPrompt } from '../services/fileExtractor.js';
import { streamToResponseWithSave } from '../services/minimax.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const UPLOAD_DIR = process.env.UPLOAD_DIR || join(__dirname, '../../public/uploads');

const router = Router();

// POST /api/bp/upload — 上传 BP 文件
router.post('/upload', requireAuth, uploadSingle, async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '未收到文件' });
    }

    // 修复 multer 中文文件名编码问题（latin1 → utf8）
    const originalname = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const { filename, size, mimetype } = req.file;
    const filePath = join(UPLOAD_DIR, filename);

    // 提取文本
    const { text, pageCount, method, message } = await extractText(filePath, mimetype);

    // 写入数据库
    const result = db.prepare(`
      INSERT INTO bp_uploads (user_id, original_filename, stored_filename, file_size, file_type, extracted_text, parse_status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id,
      originalname,
      filename,
      size,
      mimetype,
      text || null,
      text ? 'extracted' : 'pending'
    );

    res.status(201).json({
      id: result.lastInsertRowid,
      originalFilename: originalname,
      storedFilename: filename,
      fileSize: size,
      pageCount: pageCount || null,
      extractMethod: method,
      hasText: !!text,
      textLength: text?.length || 0,
      message: message || null
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/bp/parse — AI 解析 BP（SSE 流式）
router.post('/parse', requireAuth, async (req, res, next) => {
  try {
    const { bpId, pastedText } = req.body;

    let text = '';
    let fileName = 'BP文档';
    let uploadId = null;

    if (bpId) {
      const upload = db.prepare('SELECT * FROM bp_uploads WHERE id = ? AND user_id = ?').get(bpId, req.user.id);
      if (!upload) return res.status(404).json({ error: 'BP 文件不存在或无权限' });
      text = upload.extracted_text || '';
      fileName = upload.original_filename;
      uploadId = upload.id;

      // 更新状态
      db.prepare("UPDATE bp_uploads SET parse_status = 'parsing' WHERE id = ?").run(uploadId);
    } else if (pastedText) {
      text = pastedText.trim();
      fileName = '粘贴的BP内容';
    } else {
      return res.status(400).json({ error: '请提供 BP 文件 ID 或粘贴文本' });
    }

    if (!text) {
      return res.status(400).json({ error: 'BP 内容为空，请粘贴文本后再解析' });
    }

    const userPrompt = buildBPPrompt(text, fileName);

    await streamToResponseWithSave(
      res,
      {
        system: '你是顶级 VC 投资经理和 AI 分析师，擅长分析商业计划书。请严格按照用户要求的 JSON 格式输出，确保 JSON 有效。',
        user: userPrompt,
        temperature: 0.3,
        maxTokens: 4000
      },
      async (fullText, usageData, model) => {
        // 尝试解析 JSON 结果
        let parseResult = null;
        try {
          const jsonMatch = fullText.match(/\{[\s\S]*\}/);
          if (jsonMatch) parseResult = JSON.parse(jsonMatch[0]);
        } catch { /* 保存原始文本 */ }

        if (uploadId) {
          db.prepare(`
            UPDATE bp_uploads SET
              parse_result = ?,
              parse_status = 'done'
            WHERE id = ?
          `).run(JSON.stringify(parseResult || { raw: fullText }), uploadId);
        }
      }
    );
  } catch (err) {
    if (!res.headersSent) next(err);
    else console.error('BP parse stream error:', err.message);
  }
});

// GET /api/bp/list — 用户的 BP 上传列表（含分析状态）
router.get('/list', requireAuth, (req, res) => {
  const uploads = db.prepare(`
    SELECT bu.id, bu.original_filename, bu.stored_filename, bu.file_size, bu.file_type,
      bu.parse_status, bu.created_at,
      CASE WHEN bu.extracted_text IS NOT NULL THEN length(bu.extracted_text) ELSE 0 END as text_length,
      r.id as report_id, r.title as report_title, r.ai_score, r.created_at as report_created_at
    FROM bp_uploads bu
    LEFT JOIN (
      SELECT bp_upload_id, MAX(id) as rid FROM reports WHERE bp_upload_id IS NOT NULL GROUP BY bp_upload_id
    ) latest ON latest.bp_upload_id = bu.id
    LEFT JOIN reports r ON r.id = latest.rid
    WHERE bu.user_id = ?
    ORDER BY bu.created_at DESC
    LIMIT 20
  `).all(req.user.id);

  res.json({ uploads });
});

// GET /api/bp/list-all — 管理员查看所有 BP 上传列表（含分析状态）
router.get('/list-all', requireRole('admin'), (req, res) => {
  const uploads = db.prepare(`
    SELECT bu.id, bu.original_filename, bu.stored_filename, bu.file_size, bu.file_type,
      bu.parse_status, bu.created_at,
      CASE WHEN bu.extracted_text IS NOT NULL THEN length(bu.extracted_text) ELSE 0 END as text_length,
      u.name as user_name, u.email as user_email,
      r.id as report_id, r.title as report_title, r.ai_score, r.created_at as report_created_at
    FROM bp_uploads bu
    LEFT JOIN users u ON u.id = bu.user_id
    LEFT JOIN (
      SELECT bp_upload_id, MAX(id) as rid FROM reports WHERE bp_upload_id IS NOT NULL GROUP BY bp_upload_id
    ) latest ON latest.bp_upload_id = bu.id
    LEFT JOIN reports r ON r.id = latest.rid
    ORDER BY bu.created_at DESC
    LIMIT 100
  `).all();

  res.json({ uploads });
});

// GET /api/bp/:id — 获取 BP 解析结果
router.get('/:id', requireAuth, (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const upload = isAdmin
    ? db.prepare(`
        SELECT bu.*, r.id as report_id, r.content as report_content, r.title as report_title,
          r.ai_score, r.created_at as report_created_at
        FROM bp_uploads bu
        LEFT JOIN (
          SELECT bp_upload_id, MAX(id) as rid FROM reports WHERE bp_upload_id IS NOT NULL GROUP BY bp_upload_id
        ) latest ON latest.bp_upload_id = bu.id
        LEFT JOIN reports r ON r.id = latest.rid
        WHERE bu.id = ?
      `).get(req.params.id)
    : db.prepare(`
        SELECT bu.*, r.id as report_id, r.content as report_content, r.title as report_title,
          r.ai_score, r.created_at as report_created_at
        FROM bp_uploads bu
        LEFT JOIN (
          SELECT bp_upload_id, MAX(id) as rid FROM reports WHERE bp_upload_id IS NOT NULL GROUP BY bp_upload_id
        ) latest ON latest.bp_upload_id = bu.id
        LEFT JOIN reports r ON r.id = latest.rid
        WHERE bu.id = ? AND bu.user_id = ?
      `).get(req.params.id, req.user.id);

  if (!upload) return res.status(404).json({ error: 'BP 不存在或无权限' });

  // 分离 BP 数据和报告数据
  const reportData = upload.report_id ? {
    id: upload.report_id,
    title: upload.report_title,
    content: upload.report_content,
    ai_score: upload.ai_score,
    created_at: upload.report_created_at
  } : null;

  let parseResult = null;
  if (upload.parse_result) {
    try { parseResult = JSON.parse(upload.parse_result); } catch { parseResult = { raw: upload.parse_result }; }
  }

  res.json({
    id: upload.id,
    original_filename: upload.original_filename,
    stored_filename: upload.stored_filename,
    file_size: upload.file_size,
    file_type: upload.file_type,
    parse_status: upload.parse_status,
    parse_result: parseResult,
    text_length: upload.extracted_text ? upload.extracted_text.length : 0,
    has_text: !!upload.extracted_text,
    created_at: upload.created_at,
    report: reportData
  });
});

// PATCH /api/bp/:id — 重命名 BP 文件
router.patch('/:id', requireAuth, (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: '文件名不能为空' });

    const isAdmin = req.user.role === 'admin';
    const upload = isAdmin
      ? db.prepare('SELECT id FROM bp_uploads WHERE id = ?').get(req.params.id)
      : db.prepare('SELECT id FROM bp_uploads WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);

    if (!upload) return res.status(404).json({ error: 'BP 不存在或无权限' });

    db.prepare('UPDATE bp_uploads SET original_filename = ? WHERE id = ?')
      .run(name.trim(), req.params.id);

    res.json({ success: true, name: name.trim() });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/bp/:id — 删除 BP 及其关联报告和物理文件
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const upload = isAdmin
      ? db.prepare('SELECT * FROM bp_uploads WHERE id = ?').get(req.params.id)
      : db.prepare('SELECT * FROM bp_uploads WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);

    if (!upload) return res.status(404).json({ error: 'BP 不存在或无权限' });

    // 删除关联的所有报告
    const deletedReports = db.prepare('DELETE FROM reports WHERE bp_upload_id = ?').run(req.params.id);

    // 删除 BP 记录
    db.prepare('DELETE FROM bp_uploads WHERE id = ?').run(req.params.id);

    // 删除物理文件（忽略文件不存在的错误）
    if (upload.stored_filename) {
      const filePath = join(UPLOAD_DIR, upload.stored_filename);
      await unlink(filePath).catch(() => {});
    }

    res.json({ success: true, deletedReports: deletedReports.changes });
  } catch (err) {
    next(err);
  }
});

export default router;
