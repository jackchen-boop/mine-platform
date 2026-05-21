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

  // 6. 检索可比上市公司
  const comparableCompanies = retrieveComparableCompanies(text, industry.industry_name);

  // 7. 组装 RAG 上下文
  const context = buildRAGContext(industry, valBenchmarks, redlines, policies, comparableCompanies);

  return {
    context,
    matchedIndustry: industry.industry_name,
    tier: industry.tier
  };
}

/**
 * 检索可比上市公司：根据行业匹配 + 营收规模排序
 * 申万行业分类与知识库行业名称的映射
 */
const SW_INDSTRY_MAPPING = {
  'AI/具身智能/机器人': ['计算机', '通信', '电子', '机械设备'],
  '半导体/芯片': ['电子', '计算机'],
  '生物制造/创新药': ['医药生物', '化工'],
  '低空经济/eVTOL': ['国防军工', '机械设备', '通信'],
  '新能源/新型储能': ['电力设备', '有色金属', '汽车'],
  '航空航天/商业航天': ['国防军工', '通信', '计算机'],
  'SaaS/企服': ['计算机', '通信'],
  '消费品牌': ['食品饮料', '美容护理', '纺织服饰', '家用电器', '商贸零售', '轻工制造'],
  '先进制造/工业自动化': ['机械设备', '电力设备', '电子', '计算机'],
};

function retrieveComparableCompanies(text, industryName) {
  // 检查是否有上市公司数据
  const countRow = db.prepare('SELECT COUNT(*) as c FROM kb_listed_companies').get();
  if (!countRow || countRow.c === 0) return [];

  const swIndustries = SW_INDSTRY_MAPPING[industryName] || [];

  if (swIndustries.length === 0) {
    // 尝试从行业名关键词模糊匹配
    const keywords = industryName.split('/').map(s => s.trim()).filter(Boolean);
    for (const kw of keywords) {
      const rows = db.prepare(
        "SELECT * FROM kb_listed_companies WHERE industry_sw_l1 LIKE ? OR industry_sw_l2 LIKE ? ORDER BY market_cap DESC LIMIT 10"
      ).all(`%${kw}%`, `%${kw}%`);
      if (rows.length > 0) return rows;
    }
    return [];
  }

  // 按申万一级行业匹配，取市值前10名
  const placeholders = swIndustries.map(() => '?').join(',');
  return db.prepare(
    `SELECT stock_code, company_name, industry_sw_l1, industry_sw_l2, listing_board,
            revenue, revenue_yoy, net_profit, net_profit_yoy,
            gross_margin, net_margin, roe, debt_ratio,
            market_cap, pe_ttm, pb, ps_ttm, ev_ebitda
     FROM kb_listed_companies
     WHERE industry_sw_l1 IN (${placeholders})
     ORDER BY market_cap DESC
     LIMIT 10`
  ).all(...swIndustries);
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
function buildRAGContext(industry, valBenchmarks, redlines, policies, comparableCompanies) {
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

  // 可比上市公司（真实财报数据）
  if (comparableCompanies && comparableCompanies.length > 0) {
    parts.push('\n### 可比上市公司参考（真实财报数据，估值锚定必用）');
    parts.push('| 公司 | 代码 | 行业 | 板块 | 营收(亿) | 营收增速 | 净利润(亿) | 毛利率 | ROE | 市值(亿) | PE(TTM) | PB | PS(TTM) |');
    parts.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const c of comparableCompanies) {
      // 智能判断营收单位：>1e8认为原始单位是元，否则认为是亿元
      const rev = c.revenue != null
        ? (c.revenue > 1e8 ? (c.revenue / 1e8).toFixed(1) : c.revenue.toFixed(1))
        : '-';
      const revYoy = c.revenue_yoy != null
        ? (Math.abs(c.revenue_yoy) <= 5 ? (c.revenue_yoy * 100).toFixed(1) : c.revenue_yoy.toFixed(1)) + '%'
        : '-';
      const np = c.net_profit != null
        ? (c.net_profit > 1e8 ? (c.net_profit / 1e8).toFixed(1) : (c.net_profit < -1e8 ? (c.net_profit / 1e8).toFixed(1) : c.net_profit.toFixed(1)))
        : '-';
      const gm = c.gross_margin != null
        ? (Math.abs(c.gross_margin) <= 1 ? (c.gross_margin * 100).toFixed(1) : c.gross_margin.toFixed(1)) + '%'
        : '-';
      const roe = c.roe != null
        ? (Math.abs(c.roe) <= 1 ? (c.roe * 100).toFixed(1) : c.roe.toFixed(1)) + '%'
        : '-';
      const mcap = c.market_cap != null
        ? (c.market_cap > 1e8 ? (c.market_cap / 1e8).toFixed(0) : c.market_cap.toFixed(0))
        : '-';
      const pe = c.pe_ttm != null ? c.pe_ttm.toFixed(1) : '-';
      const pb = c.pb != null ? c.pb.toFixed(2) : '-';
      const ps = c.ps_ttm != null ? c.ps_ttm.toFixed(1) : '-';
      parts.push(`| ${c.company_name} | ${c.stock_code} | ${c.industry_sw_l2 || c.industry_sw_l1 || '-'} | ${c.listing_board || '-'} | ${rev} | ${revYoy} | ${np} | ${gm} | ${roe} | ${mcap} | ${pe} | ${pb} | ${ps} |`);
    }

    // 计算行业估值中位数
    const peValues = comparableCompanies.filter(c => c.pe_ttm != null && c.pe_ttm > 0).map(c => c.pe_ttm).sort((a, b) => a - b);
    const psValues = comparableCompanies.filter(c => c.ps_ttm != null && c.ps_ttm > 0).map(c => c.ps_ttm).sort((a, b) => a - b);
    const pbValues = comparableCompanies.filter(c => c.pb != null && c.pb > 0).map(c => c.pb).sort((a, b) => a - b);

    if (peValues.length > 0 || psValues.length > 0) {
      parts.push('\n**行业估值中位数**（基于上述上市公司计算）：');
      if (peValues.length > 0) {
        const mid = Math.floor(peValues.length / 2);
        parts.push(`- PE(TTM) 中位数：${peValues[mid].toFixed(1)}（范围 ${peValues[0].toFixed(1)} ~ ${peValues[peValues.length - 1].toFixed(1)}）`);
      }
      if (psValues.length > 0) {
        const mid = Math.floor(psValues.length / 2);
        parts.push(`- PS(TTM) 中位数：${psValues[mid].toFixed(1)}（范围 ${psValues[0].toFixed(1)} ~ ${psValues[psValues.length - 1].toFixed(1)}）`);
      }
      if (pbValues.length > 0) {
        const mid = Math.floor(pbValues.length / 2);
        parts.push(`- PB 中位数：${pbValues[mid].toFixed(2)}（范围 ${pbValues[0].toFixed(2)} ~ ${pbValues[pbValues.length - 1].toFixed(2)}）`);
      }
    }
  }
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
