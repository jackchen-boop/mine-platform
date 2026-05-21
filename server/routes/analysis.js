// AI 分析路由 — POST /api/ai-analyze
import { Router } from 'express';
import db from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { streamToResponseWithSave } from '../services/minimax.js';
import { SKILL_PROMPTS } from '../services/skillPrompts.js';
import { retrieveKnowledgeContext } from '../services/knowledgeRetriever.js';

const router = Router();

// POST /api/ai-analyze — 对指定 BP 或项目进行 AI 投资分析（SSE 流式）
router.post('/ai-analyze', requireAuth, async (req, res, next) => {
  try {
    const { bpUploadId, projectId, customPrompt } = req.body;

    if (!bpUploadId && !projectId) {
      return res.status(400).json({ error: '请指定要分析的 BP ID 或项目 ID' });
    }

    let contextText = '';
    let reportTitle = '';
    let bpId = null;
    let projId = null;

    if (bpUploadId) {
      // BP 驱动分析
      const isAdmin = req.user.role === 'admin';
      const upload = isAdmin
        ? db.prepare('SELECT * FROM bp_uploads WHERE id = ?').get(bpUploadId)
        : db.prepare('SELECT * FROM bp_uploads WHERE id = ? AND user_id = ?').get(bpUploadId, req.user.id);

      if (!upload) {
        return res.status(404).json({ error: 'BP 文件不存在或无权限' });
      }
      if (!upload.extracted_text) {
        return res.status(400).json({ error: '该 BP 未提取到文本内容，请先上传含文本的 BP' });
      }

      contextText = buildBPAnalysisContext(upload);
      reportTitle = `${upload.original_filename} - AI 投资分析报告`;
      bpId = upload.id;
      projId = upload.project_id || null;
    } else {
      // 向后兼容：项目驱动分析
      const project = db.prepare('SELECT * FROM projects WHERE id = ? AND status != ?').get(projectId, 'deleted');
      if (!project) {
        return res.status(404).json({ error: '项目不存在' });
      }
      contextText = buildProjectContext(project);
      reportTitle = `${project.name} - AI 投资分析报告`;
      projId = projectId;
    }

    const userPrompt = customPrompt
      ? `${contextText}\n\n额外分析要求：${customPrompt}`
      : contextText;

    // RAG 检索：根据 BP 行业匹配知识库数据
    let sectorHint = '';
    if (bpUploadId) {
      const uploadRec = db.prepare('SELECT parse_result FROM bp_uploads WHERE id = ?').get(bpUploadId);
      if (uploadRec?.parse_result) {
        try {
          const parsed = typeof uploadRec.parse_result === 'string' ? JSON.parse(uploadRec.parse_result) : uploadRec.parse_result;
          sectorHint = parsed.sector || '';
        } catch { /* ignore */ }
      }
    } else if (projectId) {
      const proj = db.prepare('SELECT sector FROM projects WHERE id = ?').get(projectId);
      sectorHint = proj?.sector || '';
    }
    const ragResult = retrieveKnowledgeContext(contextText, sectorHint);

    // 构建 system prompt：基础技能 prompt + RAG 知识库上下文 + 补充分析
    let systemPrompt = SKILL_PROMPTS['pe-vc:筛项目'].system;

    if (ragResult.context) {
      systemPrompt += `\n\n---\n${ragResult.context}`;
    }

    systemPrompt += `

---
在完成上述筛选备忘录后，请继续输出以下补充分析：

## 深度投资分析

### 市场分析
- 市场规模（TAM/SAM/SOM）与增速
- 核心增长驱动因素
- 竞争格局与差异化壁垒

### 团队评估
- 创始团队背景与行业经验
- 执行力与互补性评分

### 财务分析
- 历史营收与增速趋势
- 关键财务指标（毛利率 / 现金流 / 烧钱率）
- 估值合理性（对比同赛道可比公司）

### 投资建议
- 综合评级：强烈推荐 / 推荐 / 观察 / PASS
- 关键决策依据（3条）
- 建议下一步行动`;

    await streamToResponseWithSave(
      res,
      {
        system: systemPrompt,
        user: userPrompt,
        temperature: 0.4,
        maxTokens: 6000
      },
      async (fullText, usageData, model) => {
        try {
          db.prepare(`
            INSERT INTO reports (user_id, project_id, bp_upload_id, report_type, skill_key, input_params, content, model_used, token_usage, title)
            VALUES (?, ?, ?, 'ai-analyze', 'ai-analyze', ?, ?, ?, ?, ?)
          `).run(
            req.user.id,
            projId,
            bpId,
            JSON.stringify({ bpUploadId: bpId, projectId: projId, customPrompt }),
            fullText,
            model,
            usageData ? JSON.stringify(usageData) : null,
            reportTitle
          );
        } catch (e) {
          console.error('保存分析报告失败:', e.message);
        }
      }
    );
  } catch (err) {
    if (!res.headersSent) next(err);
    else console.error('AI analyze stream error:', err.message);
  }
});

function buildBPAnalysisContext(upload) {
  let header = '商业计划书（BP）信息：';
  let fileName = upload.original_filename || 'BP文档';

  // 从 parse_result 提取结构化信息作为头部
  if (upload.parse_result) {
    try {
      const parsed = typeof upload.parse_result === 'string' ? JSON.parse(upload.parse_result) : upload.parse_result;
      const parts = [];
      if (parsed.company_name) parts.push(`公司名称：${parsed.company_name}`);
      if (parsed.sector) parts.push(`行业/赛道：${parsed.sector}`);
      if (parsed.stage) parts.push(`融资轮次：${parsed.stage}`);
      if (parsed.amount_seeking) parts.push(`融资金额：${parsed.amount_seeking}`);
      if (parsed.valuation) parts.push(`估值：${parsed.valuation}`);
      if (parsed.team_summary) parts.push(`团队摘要：${parsed.team_summary}`);
      if (parts.length > 0) {
        header = parts.join('\n');
      }
    } catch { /* 解析失败则用默认 header */ }
  }

  // 截断文本以控制 token 用量
  const maxChars = 20000;
  const text = upload.extracted_text.length > maxChars
    ? upload.extracted_text.substring(0, maxChars) + '\n\n[... 文本已截断 ...]'
    : upload.extracted_text;

  return `文件名：${fileName}\n\n${header}\n\n--- BP 正文 ---\n${text}`;
}

function buildProjectContext(project) {
  const team = tryParseJSON(project.team_info);
  const financial = tryParseJSON(project.financial_summary);

  const teamText = Array.isArray(team)
    ? team.map(m => `${m.name}（${m.role}）：${m.background || ''}`).join('；')
    : '暂无团队信息';

  const financialText = financial
    ? Object.entries(financial).map(([k, v]) => `${k}: ${v}`).join('，')
    : '暂无财务信息';

  return `项目信息：
- 项目名称：${project.name}${project.name_en ? `（${project.name_en}）` : ''}
- 行业/赛道：${project.sector || '未知'}${project.sub_sector ? ` / ${project.sub_sector}` : ''}
- 融资轮次：${project.round || '未披露'}
- 融资金额：${project.amount || '未披露'}
- 估值：${project.valuation || '未披露'}
- 地区：${project.location || '未知'}
- AI 评分：${project.ai_score || '待评分'}/100
- 项目描述：${project.description || '暂无'}
- 商业模式：${project.business_model || '暂无'}
- 团队：${teamText}
- 财务数据：${financialText}`;
}

function tryParseJSON(val) {
  if (!val) return null;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return null; }
}

export default router;
