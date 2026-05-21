// RAG 知识检索服务 — 从行业知识库检索相关数据注入 AI 上下文
import db from '../db/connection.js';

/**
 * 从输入文本中识别行业，检索知识库，生成 RAG 增强上下文
 * @param {string} inputText - BP文本或用户输入
 * @param {string} sectorHint - 可选的行业提示（如 parse_result.sector）
 * @returns {{ context: string, matchedIndustry: string|null, tier: string|null }}
 */
export function retrieveKnowledgeContext(inputText, sectorHint) {
  const text = (inputText || '').toLowerCase();
  const hint = (sectorHint || '').toLowerCase();

  // 1. 行业匹配
  const industries = db.prepare('SELECT * FROM kb_industries').all();
  const matched = matchIndustry(text + ' ' + hint, industries);

  if (!matched) {
    return { context: '', matchedIndustry: null, tier: null };
  }

  // 2. 检索行业档案
  const industry = db.prepare('SELECT * FROM kb_industries WHERE industry_name = ?').get(matched.industry_name);

  // 3. 检索估值基准（模糊匹配）
  const valBenchmarks = retrieveValuationBenchmarks(text, industry.industry_name);

  // 4. 检索行业红线
  const redlines = db.prepare(
    "SELECT * FROM kb_redlines WHERE industry_name = ? OR industry_name = '通用' ORDER BY severity DESC, category"
  ).all(industry.industry_name);

  // 5. 检索相关政策
  const policies = db.prepare(
    'SELECT * FROM kb_policies WHERE industry_name = ? ORDER BY effective_date DESC'
  ).all(industry.industry_name);

  // 6. 组装 RAG 上下文
  const context = buildRAGContext(industry, valBenchmarks, redlines, policies);

  return {
    context,
    matchedIndustry: industry.industry_name,
    tier: industry.tier
  };
}

/**
 * 行业匹配算法：关键词命中数 + 加权评分
 */
function matchIndustry(text, industries) {
  let bestMatch = null;
  let bestScore = 0;

  for (const ind of industries) {
    const keywords = ind.keywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
    let score = 0;
    for (const kw of keywords) {
      if (text.includes(kw)) {
        // 长关键词权重更高（更具体）
        score += kw.length;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = ind;
    }
  }

  // 至少需要2个关键词命中才算有效匹配
  const minKeywords = 2;
  const matchedKeywords = bestMatch
    ? bestMatch.keywords.split(',').map(k => k.trim().toLowerCase()).filter(kw => text.includes(kw))
    : [];

  return matchedKeywords.length >= minKeywords ? bestMatch : null;
}

/**
 * 检索估值基准：根据行业关键词和文本中的轮次信息匹配
 */
function retrieveValuationBenchmarks(text, industryName) {
  // 从行业名提取搜索关键词
  const sectorKeywords = industryName.split('/').map(s => s.trim()).filter(Boolean);

  // 从文本中识别轮次
  const roundPatterns = [
    { pattern: /天使|pre-?a|种子/, round: '天使/Pre-A' },
    { pattern: /a轮|a\+轮|a\+/, round: 'A轮' },
    { pattern: /b轮|b\+轮|b\+/, round: 'B轮' },
    { pattern: /c轮|c\+轮|pre-?ipo/, round: 'C轮+' },
  ];

  const detectedRounds = roundPatterns
    .filter(r => r.pattern.test(text))
    .map(r => r.round);

  // 查询估值基准
  let benchmarks = [];
  for (const keyword of sectorKeywords) {
    const rows = db.prepare(
      "SELECT * FROM kb_valuation_benchmarks WHERE sector LIKE ?"
    ).all(`%${keyword}%`);
    benchmarks.push(...rows);
  }

  // 如果检测到轮次，优先返回匹配轮次的基准
  if (detectedRounds.length > 0) {
    const roundMatched = benchmarks.filter(b =>
      detectedRounds.some(r => b.round.includes(r.split('轮')[0]))
    );
    if (roundMatched.length > 0) return roundMatched;
  }

  // 去重
  const seen = new Set();
  return benchmarks.filter(b => {
    const key = `${b.sector}|${b.round}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * 组装 RAG 上下文 — 将检索到的知识格式化为可注入 prompt 的文本
 */
function buildRAGContext(industry, valBenchmarks, redlines, policies) {
  const parts = [];

  // 行业档案
  parts.push('## 行业知识库参考数据（以下为真实行业数据，分析时必须对照使用）');
  parts.push(`### 行业：${industry.industry_name}（第${industry.tier}梯队）`);

  if (industry.market_size) parts.push(`- **市场规模**：${industry.market_size}`);
  if (industry.cagr) parts.push(`- **增速(CAGR)**：${industry.cagr}`);
  if (industry.cr3) parts.push(`- **行业集中度 CR3**：${industry.cr3}`);
  if (industry.cr5) parts.push(`- **行业集中度 CR5**：${industry.cr5}`);
  if (industry.value_chain) parts.push(`- **产业链**：${industry.value_chain}`);
  if (industry.key_players) parts.push(`- **关键玩家**：${industry.key_players}`);
  if (industry.key_metrics) parts.push(`- **行业核心指标**：${industry.key_metrics}`);
  if (industry.trends) parts.push(`- **行业趋势**：${industry.trends}`);
  if (industry.risk_factors) parts.push(`- **行业风险**：${industry.risk_factors}`);

  // 估值基准
  if (valBenchmarks.length > 0) {
    parts.push('\n### 估值基准（同赛道同轮次参考）');
    parts.push('| 赛道 | 轮次 | PS倍数 | PE倍数 | EV/EBITDA | 典型估值区间 | 典型稀释比例 | 数据来源 |');
    parts.push('|---|---|---|---|---|---|---|---|');
    for (const v of valBenchmarks) {
      parts.push(`| ${v.sector} | ${v.round} | ${v.ps_range || '-'} | ${v.pe_range || '-'} | ${v.ev_ebitda_range || '-'} | ${v.typical_valuation} | ${v.typical_dilution} | ${v.data_source} |`);
    }
  }

  // 行业红线
  if (redlines.length > 0) {
    parts.push('\n### 行业红线规则（命中即需警惕）');
    for (const r of redlines) {
      const icon = r.severity === 'high' ? '🔴' : '🟡';
      parts.push(`- ${icon} [${r.category}] ${r.rule}（参考：${r.reference || '通用'}）`);
    }
  }

  // 政策法规
  if (policies.length > 0) {
    parts.push('\n### 相关政策法规');
    for (const p of policies) {
      parts.push(`- **${p.policy_name}**（${p.issuer}，${p.effective_date || '待定'}）：${p.summary}`);
      if (p.impact) parts.push(`  - 对行业影响：${p.impact}`);
    }
  }

  // 使用指引
  parts.push('\n### 数据使用指引');
  parts.push('1. 上述行业数据为真实参考数据，分析时必须对照使用，不得编造矛盾数据');
  parts.push('2. 估值基准用于判断BP中估值合理性，如BP估值偏离基准区间，必须在"估值合理性"维度说明原因');
  parts.push('3. 红线规则必须逐条对照BP内容检查，命中项标注🔴/🟡');
  parts.push('4. 如BP数据与知识库数据不一致，以BP原文为准但需标注"与行业基准不一致"');
  parts.push('5. 知识库数据时效性有限，如BP包含更新数据，以BP为准并标注更新');

  return parts.join('\n');
}

/**
 * 获取所有行业列表（供管理API使用）
 */
export function listIndustries() {
  return db.prepare('SELECT id, industry_name, tier, keywords FROM kb_industries ORDER BY tier, industry_name').all();
}

/**
 * 获取指定行业的完整知识（供管理API使用）
 */
export function getIndustryKnowledge(industryName) {
  const industry = db.prepare('SELECT * FROM kb_industries WHERE industry_name = ?').get(industryName);
  if (!industry) return null;

  const valuations = db.prepare("SELECT * FROM kb_valuation_benchmarks WHERE sector LIKE ?").all(`%${industryName.split('/')[0]}%`);
  const redlines = db.prepare("SELECT * FROM kb_redlines WHERE industry_name = ? OR industry_name = '通用'").all(industryName);
  const policies = db.prepare('SELECT * FROM kb_policies WHERE industry_name = ?').all(industryName);

  return { industry, valuations, redlines, policies };
}

/**
 * 更新行业档案（供管理API使用）
 */
export function updateIndustry(id, fields) {
  const allowed = ['market_size', 'cagr', 'cr3', 'cr5', 'value_chain', 'key_players', 'key_metrics', 'trends', 'risk_factors', 'keywords', 'tier'];
  const updates = [];
  const values = [];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      updates.push(`${key} = ?`);
      values.push(fields[key]);
    }
  }
  if (updates.length === 0) return false;
  updates.push("updated_at = datetime('now')");
  values.push(id);
  db.prepare(`UPDATE kb_industries SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  return true;
}
