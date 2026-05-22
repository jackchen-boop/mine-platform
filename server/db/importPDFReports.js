// PDF 年报全文批量解析 + 导入上市公司数据
// 用法：node server/db/importPDFReports.js <PDF目录> [报告年度]
// 示例：node server/db/importPDFReports.js "/Users/cyn/Documents/上市公司财报" 2024
//
// 行业分类使用 akshare 获取的申万一级行业映射表（sw_industry_mapping.json）
// 而非从PDF正则提取（PDF中年报的行业字段格式不统一，正则提取准确率极低）

import db from './connection.js';
import pdfParse from 'pdf-parse';
import { readdirSync, readFileSync } from 'fs';
import { join, extname, basename } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载申万行业映射表
let swIndustryMap = {};
try {
  swIndustryMap = JSON.parse(readFileSync(join(__dirname, 'sw_industry_mapping.json'), 'utf-8'));
} catch (e) {
  console.warn('⚠ 未找到 sw_industry_mapping.json，行业分类将为空');
}

// 有效的申万一级行业名称
const VALID_SW_INDUSTRIES = new Set([
  '农林牧渔','基础化工','钢铁','有色金属','电子','汽车','家用电器',
  '食品饮料','纺织服饰','轻工制造','医药生物','公用事业','交通运输',
  '房地产','商贸零售','社会服务','银行','非银金融','综合','建筑材料',
  '建筑装饰','电力设备','机械设备','国防军工','计算机','传媒','通信',
  '煤炭','石油石化','环保','美容护理'
]);

// 确保表存在
db.exec(`CREATE TABLE IF NOT EXISTS kb_listed_companies (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  stock_code      TEXT    NOT NULL UNIQUE,
  company_name    TEXT    NOT NULL,
  industry_sw     TEXT,
  industry_sw_l1  TEXT,
  industry_sw_l2  TEXT,
  industry_sw_l3  TEXT,
  listing_board   TEXT,
  listing_date    TEXT,
  revenue         REAL,
  revenue_yoy     REAL,
  net_profit      REAL,
  net_profit_yoy  REAL,
  gross_margin    REAL,
  net_margin      REAL,
  roe             REAL,
  total_assets    REAL,
  total_liab      REAL,
  equity          REAL,
  debt_ratio      REAL,
  cash            REAL,
  ocf             REAL,
  market_cap      REAL,
  pe_ttm          REAL,
  pb              REAL,
  ps_ttm          REAL,
  ev_ebitda       REAL,
  report_year     TEXT,
  data_source     TEXT,
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
)`);

/**
 * 从文件名提取股票代码和公司名称
 * 格式：600000_浦发银行_2024-04-30_1219910188.PDF
 * 或：  100_TCL科技_2024-04-30_1219922688.PDF
 */
function parseFilename(filename) {
  const name = basename(filename, extname(filename));
  const parts = name.split('_');
  if (parts.length >= 2) {
    return {
      stockCode: parts[0].padStart(6, '0'),
      companyName: parts[1]
    };
  }
  return null;
}

/**
 * 从板块目录名推断上市板块
 */
function inferBoard(dirPath) {
  if (dirPath.includes('科创板')) return '科创板';
  if (dirPath.includes('创业板')) return '创业板';
  if (dirPath.includes('北交')) return '北交所';
  if (dirPath.includes('上海主板') || dirPath.includes('沪市')) return '沪市主板';
  if (dirPath.includes('深圳主板') || dirPath.includes('深市')) return '深市主板';
  return null;
}

/**
 * 从PDF文本中提取关键财务数据
 * 年报PDF的表格被解析器打成碎片化文本，标签和数值经常跨行
 * 例如：
 *   "加权平均净资产收益率（%）\n 2.4239  3.5158"
 *   "归属于上市公司股\n东的净利润\n200,041,171.47"
 *   "营业收入\n11,889,533,658.03"
 *
 * 策略：使用宽松的跨行匹配，允许标签和数值之间有换行和碎片文本
 */
function extractFinancials(text) {
  const result = {};

  // === 营业收入 ===
  // 优先匹配财务报表中的大数值格式（千分位逗号，如 12,069,987,235.58）
  // 这种格式几乎只出现在正式报表中，能排除经营目标等非报表区域的干扰
  // 注意要排除"扣除...后的营业收入"
  result.revenue = extractNumber(text,
    /(?:^|[^扣])[^扣]{0,5}营业收入[\s\S]{0,50}?([\d]{1,3}(?:,\d{3})+\.\d{2})/m
  );
  // 回退：宽松匹配（不带千分位但带小数的较大数值）
  if (!result.revenue) {
    result.revenue = extractNumber(text,
      /营业收入[\s\S]{0,40}?([\d,]{8,}\.\d{2})/
    );
  }

  // === 营收同比 ===
  result.revenue_yoy = extractYoY(text, '营业收入');

  // === 归母净利润 ===
  // 同样优先匹配千分位大数值
  result.net_profit = extractNumber(text,
    /(?:归属于[^的]*?股东的净利润|归母净利润)[\s\S]{0,50}?([-\d]{1,3}(?:,\d{3})+\.\d{2})/
  );
  // 回退
  if (!result.net_profit) {
    result.net_profit = extractNumber(text,
      /(?:归属于[^的]*?股东的净利润|归母净利润)[\s\S]{0,40}?([-\d,]{6,}\.\d{2})/
    );
  }
  // 最后才用"净利润"（太宽泛，容易匹配到其他区域）
  if (!result.net_profit) {
    result.net_profit = extractNumber(text,
      /净利润[\s\S]{0,30}?([-\d]{1,3}(?:,\d{3})+\.\d{2})/
    );
  }

  // === 净利润同比 ===
  result.net_profit_yoy = extractYoY(text, '净利润');

  // === ROE（加权平均净资产收益率）===
  result.roe = extractROE(text);

  // === 总资产 ===
  result.total_assets = extractNumber(text,
    /总资产[\s\S]{0,30}?([\d]{1,3}(?:,\d{3})+\.\d{2})/
  );
  if (!result.total_assets) {
    result.total_assets = extractNumber(text,
      /总资产[\s\S]{0,30}?([\d,]{8,}\.\d{2})/
    );
  }

  // === 负债合计 ===
  result.total_liab = extractNumber(text,
    /(?:负债合计|负债总计|总负债)[\s\S]{0,30}?([\d]{1,3}(?:,\d{3})+\.\d{2})/
  );

  // === 归母净资产 ===
  // 年报PDF常把标签拆成多行: "归属于上市公司股\n东的净资产 \n 8,309,637,417.40"
  // 需排除"差异情况"等非数据区域，用"的净资产"而非宽松的"净资产"
  result.equity = extractNumber(text,
    /归属于[^的]*?股东[\s\S]{0,8}?(?:的净资产|权益合计)[\s\S]{0,50}?([\d]{1,3}(?:,\d{3})+\.\d{2})/
  );
  if (!result.equity) {
    result.equity = extractNumber(text,
      /(?:股东权益合计|所有者权益合计)[\s\S]{0,40}?([\d]{1,3}(?:,\d{3})+\.\d{2})/
    );
  }

  // === 资产负债率 ===
  result.debt_ratio = extractPercent(text,
    /(?:资产负债率)[\s\S]{0,20}?([\d.]+)\s*%/
  );
  if (!result.debt_ratio) {
    result.debt_ratio = extractPercent(text,
      /资产负债率[\s\S]{0,20}?([\d.]{2,6})[\s\n]/
    );
  }

  // === 经营现金流 ===
  result.ocf = extractNumber(text,
    /(?:经营活动产生的现金流量净额|经营活动现金流[\s\S]{0,5}净额|经营性现金流)[\s\S]{0,50}?([-\d]{1,3}(?:,\d{3})+\.\d{2})/
  );
  if (!result.ocf) {
    result.ocf = extractNumber(text,
      /(?:经营活动产生的现金流量净额|经营活动现金流[\s\S]{0,5}净额|经营性现金流)[\s\S]{0,40}?([-\d,]{6,}\.\d{2})/
    );
  }

  // === 毛利率 ===
  result.gross_margin = extractPercent(text,
    /(?:销售毛利率|毛利率)[\s\S]{0,10}?([\d.]+)\s*%/
  );

  // === 净利率 ===
  result.net_margin = extractPercent(text,
    /(?:销售净利率|净利率)[\s\S]{0,10}?([\d.]+)\s*%/
  );

  // === 市值（年报一般不含）===
  result.market_cap = extractNumber(text,
    /(?:总市值|市值)[：:\s]*([\d,]+\.?\d*)/
  );

  // === PE/PB/PS（年报一般不含）===
  result.pe_ttm = extractNumber(text, /(?:市盈率|PE\(TTM\))[：:\s]*([\d.]+)/);
  result.pb = extractNumber(text, /(?:市净率|PB)[：:\s]*([\d.]+)/);
  result.ps_ttm = extractNumber(text, /(?:市销率|PS\(TTM\))[：:\s]*([\d.]+)/);

  return result;
}

/**
 * 专门提取ROE
 * 年报PDF中ROE格式多样：
 * - "加权平均净资产收益率（%） 5.62 11.46" (同行)
 * - "加权平均净资产收益率（%）\n 2.4239  3.5158" (跨行)
 * - "净资产收益率 8.5%" (带%号)
 * 第一个数值是当年值
 */
function extractROE(text) {
  // 方式1: "加权平均净资产收益率" 后跟数值（跨行允许）
  const patterns = [
    // 带百分号的格式
    /加权平均净资产收益率[\s\S]{0,20}?([\d.]+)\s*%/,
    /净资产收益率[\s\S]{0,15}?([\d.]+)\s*%/,
    // 不带百分号的年报格式 - 数值紧随其后
    /加权平均净资产收益率[（(]\s*%\s*[)）][\s\S]{0,20}?(-?[\d.]+)/,
    // 宽松匹配
    /加权平均净资产收益率[\s\S]{0,25}?(-?[\d.]{2,6})[\s\n]/,
    // 净资产收益率（更短的标签）
    /(?:^|\n)[^\n]*净资产收益率[^\d]*?(-?[\d.]{2,6})/m,
  ];

  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const val = parseFloat(m[1]);
      if (!isNaN(val) && Math.abs(val) < 200) {
        // ROE通常在-100%到100%之间
        return Math.abs(val) > 1 ? val / 100 : val;
      }
    }
  }
  return null;
}

/**
 * 提取同比增减百分比
 * 年报格式如: "营业收入 ... -1.65 ..." 或 "营业收入 ... 同比增减 ... 12.02%"
 */
function extractYoY(text, label) {
  // 在"主要财务指标"表中，同比增减通常在同行或附近
  const patterns = [
    // 格式: "科目 ... 本期比上年同期增减(%) ... 数值"
    new RegExp(label + '[\\s\\S]{0,80}?(?:增减|比上年)[^\\d]*?(-?[\\d.]+)\\s*%'),
    // 格式: 同行直接跟百分比
    new RegExp(label + '[\\s\\S]{0,60}?(-?[\\d.]+)\\s*%(?!.*(?:加权|净资))'),
  ];

  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const val = parseFloat(m[1]);
      if (!isNaN(val) && Math.abs(val) < 5000) {
        return Math.abs(val) > 1 ? val / 100 : val;
      }
    }
  }
  return null;
}

/**
 * 提取数值：支持千分位逗号，允许跨行
 */
function extractNumber(text, pattern) {
  const match = text.match(pattern);
  if (!match) return null;
  const numStr = match[1].replace(/,/g, '');
  const num = parseFloat(numStr);
  return isNaN(num) ? null : num;
}

/**
 * 提取百分比
 */
function extractPercent(text, pattern) {
  const match = text.match(pattern);
  if (!match) return null;
  const num = parseFloat(match[1]);
  if (isNaN(num)) return null;
  // 如果>1，认为是百分比格式（如28.5）；否则是小数格式（如0.285）
  return Math.abs(num) > 1 ? num / 100 : num;
}

/**
 * 收集所有PDF文件路径（递归）
 */
function collectPDFFiles(dir) {
  const files = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectPDFFiles(fullPath));
    } else if (/\.(pdf|PDF)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * 按公司去重，只保留每个公司最新的文件（按文件名中日期判断）
 */
function dedupeByCompany(files) {
  const companyMap = new Map();
  for (const f of files) {
    const parsed = parseFilename(basename(f));
    if (!parsed) continue;
    const key = parsed.stockCode;
    if (!companyMap.has(key)) {
      companyMap.set(key, { stockCode: parsed.stockCode, companyName: parsed.companyName, filePath: f, dirPath: f });
    } else {
      // 保留日期更晚的文件
      const existing = companyMap.get(key);
      const existingDate = existing.filePath.match(/(\d{4}-\d{2}-\d{2})/)?.[1] || '';
      const newDate = f.match(/(\d{4}-\d{2}-\d{2})/)?.[1] || '';
      if (newDate > existingDate) {
        companyMap.set(key, { stockCode: parsed.stockCode, companyName: parsed.companyName, filePath: f, dirPath: f });
      }
    }
  }
  return Array.from(companyMap.values());
}

/**
 * 主流程
 */
async function main() {
  const inputPath = process.argv[2];
  const reportYear = process.argv[3] || '2024';

  if (!inputPath) {
    console.log('用法: node importPDFReports.js <PDF目录> [报告年度]');
    console.log('示例: node importPDFReports.js "/Users/cyn/Documents/上市公司财报" 2024');
    process.exit(1);
  }

  console.log('🔍 扫描PDF文件...');
  const allFiles = collectPDFFiles(inputPath);
  console.log(`  找到 ${allFiles.length} 个PDF文件`);

  // 去重：每家公司只取最新文件
  const companies = dedupeByCompany(allFiles);
  console.log(`  去重后 ${companies.length} 家公司`);

  // 按板块分组以推断上市板块
  for (const c of companies) {
    c.board = inferBoard(c.dirPath);
  }

  console.log(`\n📊 开始解析PDF并导入...`);

  let imported = 0;
  let skipped = 0;
  let errors = 0;
  const startTime = Date.now();

  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO kb_listed_companies (
      stock_code, company_name, industry_sw_l1, listing_board,
      revenue, revenue_yoy, net_profit, net_profit_yoy,
      gross_margin, net_margin, roe,
      total_assets, total_liab, equity, debt_ratio, ocf,
      market_cap, pe_ttm, pb, ps_ttm,
      report_year, data_source
    ) VALUES (
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?
    )
  `);

  // 批量提交，每100家commit一次
  let batchCount = 0;

  for (let i = 0; i < companies.length; i++) {
    const c = companies[i];
    const progress = `[${i + 1}/${companies.length}]`;

    try {
      const buf = readFileSync(c.filePath);
      const data = await pdfParse(buf, { max: 10 }); // 只解析前10页，年报关键数据在前几页

      // 行业分类：优先使用申万映射表，回退到PDF文本提取
      let industry = swIndustryMap[c.stockCode] || null;
      if (!industry) {
        const industryMatch = data.text.match(/(?:证监会行业分类|行业类别)[：:\s]*([^\n,，]{2,15})/);
        const rawIndustry = industryMatch ? industryMatch[1].trim() : null;
        if (rawIndustry && VALID_SW_INDUSTRIES.has(rawIndustry)) {
          industry = rawIndustry;
        }
      }

      // 提取财务数据
      const fin = extractFinancials(data.text);

      // 检查是否提取到至少一个有效数据
      const hasData = Object.values(fin).some(v => v !== null);

      if (!hasData) {
        // 即使没提取到财务数据，也记录公司基本信息
        skipped++;
        if ((i + 1) % 500 === 0) {
          console.log(`  ${progress} 跳过 ${c.stockCode} ${c.companyName}（未提取到财务数据）`);
        }
        continue;
      }

      // 插入数据库
      insertStmt.run(
        c.stockCode,
        c.companyName,
        industry,
        c.board,
        fin.revenue,
        fin.revenue_yoy,
        fin.net_profit,
        fin.net_profit_yoy,
        fin.gross_margin,
        fin.net_margin,
        fin.roe,
        fin.total_assets,
        fin.total_liab,
        fin.equity,
        fin.debt_ratio,
        fin.ocf,
        fin.market_cap,
        fin.pe_ttm,
        fin.pb,
        fin.ps_ttm,
        reportYear,
        c.filePath
      );

      imported++;
      batchCount++;

      // 进度显示
      if ((i + 1) % 100 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const rate = ((i + 1) / (Date.now() - startTime) * 1000).toFixed(1);
        const remaining = ((companies.length - i - 1) / rate).toFixed(0);
        console.log(`  ${progress} 已导入 ${imported} 家，跳过 ${skipped} 家，错误 ${errors} | ${elapsed}s，~${remaining}s 剩余`);
      }

    } catch (e) {
      errors++;
      if (errors <= 10) {
        console.log(`  ${progress} ❌ 解析失败 ${c.stockCode} ${c.companyName}: ${e.message.slice(0, 80)}`);
      }
    }
  }

  // 最终统计
  const totalCount = db.prepare('SELECT COUNT(*) as c FROM kb_listed_companies').get();
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n✓ 导入完成！耗时 ${elapsed}s`);
  console.log(`  导入: ${imported} 家，跳过(无数据): ${skipped} 家，解析错误: ${errors} 家`);
  console.log(`  数据库总计: ${totalCount.c} 家上市公司`);

  // 行业分布
  const byIndustry = db.prepare(`
    SELECT industry_sw_l1 as industry, COUNT(*) as cnt
    FROM kb_listed_companies
    WHERE industry_sw_l1 IS NOT NULL
    GROUP BY industry_sw_l1
    ORDER BY cnt DESC
    LIMIT 20
  `).all();

  if (byIndustry.length > 0) {
    console.log('\n行业分布 (Top 20):');
    for (const row of byIndustry) {
      console.log(`  ${row.industry}: ${row.cnt} 家`);
    }
  }

  // 板块分布
  const byBoard = db.prepare(`
    SELECT listing_board as board, COUNT(*) as cnt
    FROM kb_listed_companies
    WHERE listing_board IS NOT NULL
    GROUP BY listing_board
    ORDER BY cnt DESC
  `).all();

  if (byBoard.length > 0) {
    console.log('\n板块分布:');
    for (const row of byBoard) {
      console.log(`  ${row.board}: ${row.cnt} 家`);
    }
  }

  // 数据覆盖率
  const coverage = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN revenue IS NOT NULL THEN 1 ELSE 0 END) as has_revenue,
      SUM(CASE WHEN net_profit IS NOT NULL THEN 1 ELSE 0 END) as has_profit,
      SUM(CASE WHEN roe IS NOT NULL THEN 1 ELSE 0 END) as has_roe,
      SUM(CASE WHEN total_assets IS NOT NULL THEN 1 ELSE 0 END) as has_assets
    FROM kb_listed_companies
  `).get();

  if (coverage) {
    console.log('\n数据覆盖率:');
    console.log(`  营收: ${coverage.has_revenue}/${coverage.total} (${(coverage.has_revenue/coverage.total*100).toFixed(1)}%)`);
    console.log(`  净利润: ${coverage.has_profit}/${coverage.total} (${(coverage.has_profit/coverage.total*100).toFixed(1)}%)`);
    console.log(`  ROE: ${coverage.has_roe}/${coverage.total} (${(coverage.has_roe/coverage.total*100).toFixed(1)}%)`);
    console.log(`  总资产: ${coverage.has_assets}/${coverage.total} (${(coverage.has_assets/coverage.total*100).toFixed(1)}%)`);
  }
}

main().catch(e => {
  console.error('致命错误:', e);
  process.exit(1);
});
