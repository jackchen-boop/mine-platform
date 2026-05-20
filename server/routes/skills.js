// 技能路由 — POST /api/skill-run
import { Router } from 'express';
import db from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { streamToResponseWithSave } from '../services/minimax.js';
import { SKILL_PROMPTS, resolveSkillKey } from '../services/skillPrompts.js';

const router = Router();

// POST /api/skill-run — 运行指定技能（SSE 流式）
router.post('/skill-run', requireAuth, async (req, res, next) => {
  try {
    const { skill, input, projectId, uploadId } = req.body;

    if (!skill) return res.status(400).json({ error: '请指定技能 key' });

    // uploadId 优先：从 skill_uploads 读取文本作为输入
    let finalInput = input;
    if (uploadId) {
      const row = db.prepare('SELECT extracted_text, user_id FROM skill_uploads WHERE id = ?').get(uploadId);
      if (!row) return res.status(404).json({ error: '上传记录不存在或已过期' });
      if (row.user_id !== req.user.id) return res.status(403).json({ error: '无权访问此上传记录' });
      finalInput = row.extracted_text || '';
    }

    if (!finalInput) return res.status(400).json({ error: '请提供输入内容或上传文件' });

    const skillKey = resolveSkillKey(skill);
    if (!skillKey || !SKILL_PROMPTS[skillKey]) {
      return res.status(400).json({ error: `未找到技能: ${skill}` });
    }

    const skillDef = SKILL_PROMPTS[skillKey];

    await streamToResponseWithSave(
      res,
      {
        system: skillDef.system,
        user: finalInput,
        temperature: skillDef.temp || 0.4,
        maxTokens: 6000
      },
      async (fullText, usageData, model) => {
        try {
          db.prepare(`
            INSERT INTO reports (user_id, project_id, report_type, skill_key, input_params, content, model_used, token_usage, title)
            VALUES (?, ?, 'skill', ?, ?, ?, ?, ?, ?)
          `).run(
            req.user.id,
            projectId || null,
            skillKey,
            JSON.stringify({ skill, input: finalInput.slice(0, 500), uploadId: uploadId || null }),
            fullText,
            model,
            usageData ? JSON.stringify(usageData) : null,
            skillDef.title
          );
        } catch (e) {
          console.error('保存技能报告失败:', e.message);
        }
      }
    );
  } catch (err) {
    if (!res.headersSent) next(err);
    else console.error('skill-run stream error:', err.message);
  }
});

// GET /api/skills — 获取所有技能列表
router.get('/skills', (req, res) => {
  const skills = Object.entries(SKILL_PROMPTS).map(([key, val]) => ({
    key,
    title: val.title,
    suite: key.split(':')[0]
  }));
  res.json({ skills });
});

export default router;
