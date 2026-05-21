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

// GET /api/knowledge/listed-companies — 查询上市公司数据
router.get('/knowledge/listed-companies', requireAuth, (req, res) => {
  const { industry, keyword, limit } = req.query;
  const maxRows = Math.min(parseInt(limit) || 20, 100);

  let rows;
  if (keyword) {
    rows = db.prepare(
      'SELECT * FROM kb_listed_companies WHERE company_name LIKE ? OR stock_code LIKE ? ORDER BY market_cap DESC LIMIT ?'
    ).all(`%${keyword}%`, `%${keyword}%`, maxRows);
  } else if (industry) {
    rows = db.prepare(
      'SELECT * FROM kb_listed_companies WHERE industry_sw_l1 LIKE ? OR industry_sw_l2 LIKE ? ORDER BY market_cap DESC LIMIT ?'
    ).all(`%${industry}%`, `%${industry}%`, maxRows);
  } else {
    rows = db.prepare(
      'SELECT * FROM kb_listed_companies ORDER BY market_cap DESC LIMIT ?'
    ).all(maxRows);
  }

  const total = db.prepare('SELECT COUNT(*) as c FROM kb_listed_companies').get();
  res.json({ companies: rows, total: total?.c || 0 });
});

// GET /api/knowledge/listed-companies/stats — 上市公司数据统计
router.get('/knowledge/listed-companies/stats', requireAuth, (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as c FROM kb_listed_companies').get();
  const byIndustry = db.prepare(
    'SELECT industry_sw_l1 as industry, COUNT(*) as cnt FROM kb_listed_companies WHERE industry_sw_l1 IS NOT NULL GROUP BY industry_sw_l1 ORDER BY cnt DESC'
  ).all();
  const byBoard = db.prepare(
    'SELECT listing_board as board, COUNT(*) as cnt FROM kb_listed_companies WHERE listing_board IS NOT NULL GROUP BY listing_board'
  ).all();
  res.json({ total: total?.c || 0, byIndustry, byBoard });
});

// POST /api/knowledge/import-listed — 触发上市公司数据导入（管理员）
router.post('/knowledge/import-listed', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: '仅管理员可导入数据' });
  const { filePath, reportYear } = req.body;
  if (!filePath) return res.status(400).json({ error: '请提供文件路径' });
  // 导入是同步操作，可能较慢
  try {
    const { importListedCompaniesFromFile } = await import('../services/listedCompanyImporter.js');
    const result = importListedCompaniesFromFile(filePath, reportYear || '2024');
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ error: `导入失败: ${e.message}` });
  }
});

export default router;
