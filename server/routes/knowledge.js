// 知识库管理路由
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { listIndustries, getIndustryKnowledge, updateIndustry, retrieveKnowledgeContext } from '../services/knowledgeRetriever.js';
import db from '../db/connection.js';

const router = Router();

// GET /api/knowledge/industries — 获取行业列表
router.get('/knowledge/industries', requireAuth, (req, res) => {
  const industries = listIndustries();
  res.json({ industries });
});

// GET /api/knowledge/industries/:name — 获取行业完整知识
router.get('/knowledge/industries/:name', requireAuth, (req, res) => {
  const knowledge = getIndustryKnowledge(decodeURIComponent(req.params.name));
  if (!knowledge) return res.status(404).json({ error: '行业不存在' });
  res.json(knowledge);
});

// PUT /api/knowledge/industries/:id — 更新行业档案（仅管理员）
router.put('/knowledge/industries/:id', requireAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: '仅管理员可编辑知识库' });
  const id = parseInt(req.params.id);
  const ok = updateIndustry(id, req.body);
  if (!ok) return res.status(400).json({ error: '无有效更新字段' });
  res.json({ success: true });
});

// GET /api/knowledge/valuations — 获取估值基准
router.get('/knowledge/valuations', requireAuth, (req, res) => {
  const { sector } = req.query;
  const rows = sector
    ? db.prepare("SELECT * FROM kb_valuation_benchmarks WHERE sector LIKE ?").all(`%${sector}%`)
    : db.prepare('SELECT * FROM kb_valuation_benchmarks ORDER BY sector, round').all();
  res.json({ valuations: rows });
});

// GET /api/knowledge/redlines — 获取红线规则
router.get('/knowledge/redlines', requireAuth, (req, res) => {
  const { industry } = req.query;
  const rows = industry
    ? db.prepare("SELECT * FROM kb_redlines WHERE industry_name = ? OR industry_name = '通用' ORDER BY severity DESC").all(industry)
    : db.prepare('SELECT * FROM kb_redlines ORDER BY industry_name, severity DESC').all();
  res.json({ redlines: rows });
});

// GET /api/knowledge/policies — 获取政策法规
router.get('/knowledge/policies', requireAuth, (req, res) => {
  const { industry } = req.query;
  const rows = industry
    ? db.prepare('SELECT * FROM kb_policies WHERE industry_name = ? ORDER BY effective_date DESC').all(industry)
    : db.prepare('SELECT * FROM kb_policies ORDER BY industry_name, effective_date DESC').all();
  res.json({ policies: rows });
});

// POST /api/knowledge/test-retrieval — 测试RAG检索效果
router.post('/knowledge/test-retrieval', requireAuth, (req, res) => {
  const { text, sectorHint } = req.body;
  if (!text) return res.status(400).json({ error: '请提供测试文本' });
  const result = retrieveKnowledgeContext(text, sectorHint);
  res.json({
    matchedIndustry: result.matchedIndustry,
    tier: result.tier,
    contextLength: result.context.length,
    contextPreview: result.context.slice(0, 500)
  });
});

export default router;
