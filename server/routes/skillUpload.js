// 技能文件上传 + AI 信息充分性校验路由
// POST /api/skill-upload  — 多文件上传并提取文本，返回 uploadId
// POST /api/skill-validate — 根据 uploadId + skillKey 调用 AI 校验信息充分性

import { Router } from 'express';
import { join } from 'path';
import { unlink } from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadMultiple } from '../middleware/upload.js';
import { extractText } from '../services/fileExtractor.js';
import { validateSkill } from '../services/skillValidator.js';
import { SKILL_PROMPTS, resolveSkillKey } from '../services/skillPrompts.js';

const router = Router();

// ─── POST /api/skill-upload ──────────────────────────────────────────────────
// 上传最多10个文件，提取文本合并，存入 skill_uploads，返回 uploadId
router.post('/skill-upload', requireAuth, (req, res, next) => {
  uploadMultiple(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    try {
      const { skillKey: rawSkillKey } = req.body;
      if (!rawSkillKey) {
        return res.status(400).json({ error: '请指定技能 key' });
      }

      const skillKey = resolveSkillKey(rawSkillKey);
      if (!skillKey || !SKILL_PROMPTS[skillKey]) {
        return res.status(400).json({ error: `未找到技能: ${rawSkillKey}` });
      }

      const files = req.files || [];
      if (files.length === 0) {
        return res.status(400).json({ error: '请至少上传一个文件' });
      }

      // 逐文件提取文本并合并
      const fileMeta = [];
      const textParts = [];

      for (const file of files) {
        const { text, method, pageCount } = await extractText(file.path, file.mimetype);
        fileMeta.push({
          originalname: file.originalname,
          size: file.size,
          method,
          pageCount: pageCount || null,
          charCount: text.length
        });
        if (text.trim()) {
          textParts.push(`===== ${file.originalname} =====\n${text}`);
        }
        // 提取后删除临时文件，节省磁盘
        try { await unlink(file.path); } catch { /* 忽略删除失败 */ }
      }

      const extractedText = textParts.join('\n\n');
      const uploadId = uuidv4();

      db.prepare(`
        INSERT INTO skill_uploads (id, user_id, skill_key, extracted_text, file_count, file_meta, created_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        uploadId,
        req.user.id,
        skillKey,
        extractedText,
        files.length,
        JSON.stringify(fileMeta)
      );

      return res.json({
        uploadId,
        skillKey,
        fileCount: files.length,
        totalChars: extractedText.length,
        fileMeta
      });
    } catch (e) {
      console.error('skill-upload error:', e.message);
      return res.status(500).json({ error: '文件处理失败，请重试' });
    }
  });
});

// ─── POST /api/skill-validate ────────────────────────────────────────────────
// 根据 uploadId + skillKey 调用 AI 校验信息是否充分
router.post('/skill-validate', requireAuth, async (req, res) => {
  try {
    const { uploadId, skillKey: rawSkillKey } = req.body;

    if (!uploadId) return res.status(400).json({ error: '请提供 uploadId' });
    if (!rawSkillKey) return res.status(400).json({ error: '请提供 skillKey' });

    const skillKey = resolveSkillKey(rawSkillKey);
    if (!skillKey || !SKILL_PROMPTS[skillKey]) {
      return res.status(400).json({ error: `未找到技能: ${rawSkillKey}` });
    }

    // 权限验证：只能校验自己上传的记录
    const row = db.prepare('SELECT user_id FROM skill_uploads WHERE id = ?').get(uploadId);
    if (!row) return res.status(404).json({ error: '上传记录不存在或已过期' });
    if (row.user_id !== req.user.id) return res.status(403).json({ error: '无权访问此上传记录' });

    const skillDef = SKILL_PROMPTS[skillKey];
    const result = await validateSkill(db, uploadId, skillKey, skillDef);

    return res.json(result);
  } catch (e) {
    console.error('skill-validate error:', e.message);
    return res.status(500).json({ error: '校验服务暂时不可用，请重试' });
  }
});

// ─── DELETE /api/skill-upload/:id ────────────────────────────────────────────
// 手动清理上传记录（可选）
router.delete('/skill-upload/:id', requireAuth, (req, res) => {
  try {
    const row = db.prepare('SELECT user_id FROM skill_uploads WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: '记录不存在' });
    if (row.user_id !== req.user.id) return res.status(403).json({ error: '无权操作' });

    db.prepare('DELETE FROM skill_uploads WHERE id = ?').run(req.params.id);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;
