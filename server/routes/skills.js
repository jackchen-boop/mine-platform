// 技能路由 — POST /api/skill-run
import { Router } from 'express';
import db from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { streamToResponseWithSave } from '../services/minimax.js';
import { SKILL_PROMPTS, resolveSkillKey } from '../services/skillPrompts.js';
import { retrieveKnowledgeContext } from '../services/knowledgeRetriever.js';
import { buildTrainingContext } from '../services/trainingEngine.js';

const router = Router();

// 需要RAG增强的技能集合（涉及行业/估值/市场分析的技能）
const RAG_ENHANCED_SKILLS = [
  'pe-vc:筛项目', 'pe-vc:尽调清单', 'pe-vc:投决备忘录', 'pe-vc:测收益', 'pe-vc:退出分析', 'pe-vc:审条款',
  'equity:深度报告', 'equity:行业研究', 'equity:可比公司分析', 'equity:读年报',
  'ib:招股书', 'ib:财务建模', 'ib:并购方案',
];

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

    // RAG 增强：对需要行业知识的技能注入知识库上下文
    let systemPrompt = skillDef.system;
    if (RAG_ENHANCED_SKILLS.includes(skillKey)) {
      const sectorHint = projectId
        ? (db.prepare('SELECT sector FROM projects WHERE id = ?').get(projectId)?.sector || '')
        : '';
      const ragResult = retrieveKnowledgeContext(finalInput, sectorHint);
      if (ragResult.context) {
        systemPrompt += `\n\n---\n${ragResult.context}`;
      }
      // 注入训练样本 few-shot 上下文
      const trainingCtx = buildTrainingContext({ skillKey, industry: sectorHint, maxSamples: 3 });
      if (trainingCtx) {
        systemPrompt += `\n\n---\n${trainingCtx}`;
      }
    }

    await streamToResponseWithSave(
      res,
      {
        system: systemPrompt,
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
