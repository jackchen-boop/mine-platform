// 上市公司财报数据批量导入脚本
// 支持格式：单个汇总Excel（推荐）或目录下的多个Excel/CSV文件
// 用法：
//   node server/db/importListedCompanies.js <Excel文件或目录路径>
//   node server/db/importListedCompanies.js ./data/listed_companies_2024.xlsx
//   node server/db/importListedCompanies.js ./data/financials/   (目录下所有xlsx文件)

import db from './connection.js';
import xlsx from 'xlsx';
import { readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

// 字段映射：Excel列名 → 数据库字段
// 支持多种常见列名写法，导入时自动匹配
const FIELD_ALIASES = {
  stock_code:      ['股票代码', '证券代码', '股票代码(申万)', 'code', 'stock_code', '证券代码'],
  company_name:    ['公司名称', '证券简称', '公司简称', 'name', 'company_name', '股票简称'],
  industry_sw_l1:  ['申万一级', '行业(申万一级)', '行业一级', '行业(一级行业)', 'sw_l1', 'industry_l1', '一级行业'],
  industry_sw_l2:  ['申万二级', '行业(申万二级)', '行业二级', '行业(二级行业)', 'sw_l2', 'industry_l2', '二级行业'],
  industry_sw_l3:  ['申万三级', '行业(申万三级)', '行业三级', '行业(三级行业)', 'sw_l3', 'industry_l3', '三级行业'],
  listing_board:   ['上市板块', '板块', '交易所', 'board', 'listing_board'],
  listing_date:    ['上市日期', '上市时间', 'list_date', 'listing_date'],
  revenue:         ['营业收入', '营收', '营业总收入', 'revenue', 'total_revenue', '营业收人'],
  revenue_yoy:     ['营收同比', '营收增速', '营业收入同比增长', 'revenue_yoy', 'rev_growth', '营收增长'],
  net_profit:      ['净利润', '归母净利润', '归属净利润', 'net_profit', 'net_income', '归母净利'],
  net_profit_yoy:  ['净利润同比', '净利润增速', '归母净利润同比增长', 'net_profit_yoy', 'np_growth', '净利润增长'],
  gross_margin:    ['毛利率', '销售毛利率', 'gross_margin', 'gm', '毛利率(%)'],
  net_margin:      ['净利率', '销售净利率', 'net_margin', 'nm', '净利率(%)'],
  roe:             ['ROE', '净资产收益率', 'roe', 'return_on_equity', 'ROE(%)'],
  total_assets:    ['总资产', '资产总计', 'total_assets', 'assets'],
  total_liab:      ['总负债', '负债合计', 'total_liabilities', 'total_liab', 'liabilities'],
  equity:          ['净资产', '所有者权益', '股东权益', 'equity', 'owners_equity', '归属母公司股东权益'],
  debt_ratio:      ['资产负债率', '负债率', 'debt_ratio', 'leverage', '资产负债率(%)'],
  cash:            ['货币资金', '现金', 'cash', 'cash_equivalents'],
  ocf:             ['经营性现金流', '经营活动现金流', 'ocf', 'operating_cash_flow', '经营现金流净额'],
  market_cap:      ['总市值', '市值', 'market_cap', 'market_value', '总市值(亿元)'],
  pe_ttm:          ['PE(TTM)', '市盈率TTM', 'PE', 'pe', 'pe_ttm', '滚动市盈率'],
  pb:              ['PB', '市净率', 'pb', 'price_to_book'],
  ps_ttm:          ['PS(TTM)', '市销率TTM', 'PS', 'ps', 'ps_ttm'],
  ev_ebitda:       ['EV/EBITDA', '企业价值倍数', 'ev_ebitda'],
};

/**
 * 自动匹配列名到数据库字段
 */
function mapColumns(headers) {
  const mapping = {};
  const normalizedHeaders = headers.map(h => String(h).trim());

  for (const [dbField, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const alias of aliases) {
      const idx = normalizedHeaders.findIndex(h =>
        h === alias || h.includes(alias) || alias.includes(h)
      );
      if (idx >= 0) {
        mapping[dbField] = normalizedHeaders[idx];
        break;
      }
    }
  }
  return mapping;
}

/**
 * 清洗股票代码（确保6位数字）
 */
function cleanStockCode(code) {
  if (!code) return null;
  const str = String(code).replace(/[^0-9]/g, '');
  return str.length >= 6 ? str.slice(0, 6) : str.padStart(6, '0');
}

/**
 * 百分比转小数（如 "25.3%" → 0.253，25.3 → 0.253）
 */
function parsePercent(val) {
  if (val == null || val === '' || val === '-') return null;
  if (typeof val === 'string') {
    val = val.replace(/[%,％]/g, '').trim();
  }
  const num = parseFloat(val);
  if (isNaN(num)) return null;
  // 如果绝对值>1，认为是百分比形式
  if (Math.abs(num) > 1 && Math.abs(num) < 200) return num / 100;
  return num;
}

/**
 * 解析数值字段
 */
function parseNumber(val) {
  if (val == null || val === '' || val === '-') return null;
  if (typeof val === 'number') return val;
  const str = String(val).replace(/[,，亿万]/g, '').trim();
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

/**
 * 导入单个Excel文件
 */
function importExcel(filePath, reportYear = '2024') {
  console.log(`  读取文件: ${filePath}`);

  const workbook = xlsx.readFile(filePath, { cellDates: true });
  let totalInserted = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });

    if (rows.length === 0) continue;

    // 自动匹配列名
    const colMapping = mapColumns(Object.keys(rows[0]));
    console.log(`  工作表 "${sheetName}": ${rows.length} 行, 匹配字段: ${Object.keys(colMapping).join(', ')}`);

    if (!colMapping.stock_code) {
      console.log(`  ⚠ 跳过工作表 "${sheetName}"：未找到股票代码列`);
      continue;
    }

    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO kb_listed_companies (
        stock_code, company_name, industry_sw_l1, industry_sw_l2, industry_sw_l3,
        listing_board, listing_date, revenue, revenue_yoy, net_profit, net_profit_yoy,
        gross_margin, net_margin, roe, total_assets, total_liab, equity, debt_ratio,
        cash, ocf, market_cap, pe_ttm, pb, ps_ttm, ev_ebitda, report_year, data_source
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `);

    const insertMany = (records) => {
      db.exec('BEGIN');
      for (const rec of records) {
        try {
          insertStmt.run(...rec);
        } catch (e) {
          totalSkipped++;
        }
      }
      db.exec('COMMIT');
    };

    const records = [];
    for (const row of rows) {
      const stockCode = cleanStockCode(row[colMapping.stock_code]);
      if (!stockCode || stockCode.length !== 6) {
        totalSkipped++;
        continue;
      }

      const companyName = colMapping.company_name ? String(row[colMapping.company_name] || '').trim() : '';

      const rec = [
        stockCode,
        companyName,
        colMapping.industry_sw_l1  ? String(row[colMapping.industry_sw_l1] || '') : null,
        colMapping.industry_sw_l2  ? String(row[colMapping.industry_sw_l2] || '') : null,
        colMapping.industry_sw_l3  ? String(row[colMapping.industry_sw_l3] || '') : null,
        colMapping.listing_board   ? String(row[colMapping.listing_board] || '') : null,
        colMapping.listing_date    ? String(row[colMapping.listing_date] || '') : null,
        colMapping.revenue         ? parseNumber(row[colMapping.revenue]) : null,
        colMapping.revenue_yoy     ? parsePercent(row[colMapping.revenue_yoy]) : null,
        colMapping.net_profit      ? parseNumber(row[colMapping.net_profit]) : null,
        colMapping.net_profit_yoy  ? parsePercent(row[colMapping.net_profit_yoy]) : null,
        colMapping.gross_margin    ? parsePercent(row[colMapping.gross_margin]) : null,
        colMapping.net_margin      ? parsePercent(row[colMapping.net_margin]) : null,
        colMapping.roe             ? parsePercent(row[colMapping.roe]) : null,
        colMapping.total_assets    ? parseNumber(row[colMapping.total_assets]) : null,
        colMapping.total_liab      ? parseNumber(row[colMapping.total_liab]) : null,
        colMapping.equity          ? parseNumber(row[colMapping.equity]) : null,
        colMapping.debt_ratio      ? parsePercent(row[colMapping.debt_ratio]) : null,
        colMapping.cash            ? parseNumber(row[colMapping.cash]) : null,
        colMapping.ocf             ? parseNumber(row[colMapping.ocf]) : null,
        colMapping.market_cap      ? parseNumber(row[colMapping.market_cap]) : null,
        colMapping.pe_ttm          ? parseNumber(row[colMapping.pe_ttm]) : null,
        colMapping.pb              ? parseNumber(row[colMapping.pb]) : null,
        colMapping.ps_ttm          ? parseNumber(row[colMapping.ps_ttm]) : null,
        colMapping.ev_ebitda       ? parseNumber(row[colMapping.ev_ebitda]) : null,
        reportYear,
        filePath
      ];
      records.push(rec);
    }

    insertMany(records);
    totalInserted += records.length - totalSkipped;
    console.log(`  ✓ 工作表 "${sheetName}": 导入 ${records.length} 条`);
  }

  return { totalInserted, totalSkipped };
}

/**
 * 导入CSV文件
 */
function importCsv(filePath, reportYear = '2024') {
  // 用xlsx库也能读csv
  const workbook = xlsx.readFile(filePath, { type: 'file', raw: false });
  return importExcel(filePath, reportYear);
}

/**
 * 主入口
 */
function main() {
  const inputPath = process.argv[2];
  const reportYear = process.argv[3] || '2024';

  if (!inputPath) {
    console.log('用法: node importListedCompanies.js <Excel文件或目录> [报告年度]');
    console.log('示例: node importListedCompanies.js ./data/financials/2024.xlsx 2024');
    console.log('      node importListedCompanies.js ./data/financials/ 2024');
    process.exit(1);
  }

  // 确保 schema 存在
  db.exec(`CREATE TABLE IF NOT EXISTS kb_listed_companies (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_code      TEXT    NOT NULL UNIQUE,
    company_name    TEXT    NOT NULL,
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

  let files = [];
  const stat = statSync(inputPath);

  if (stat.isDirectory()) {
    files = readdirSync(inputPath)
      .filter(f => /\.(xlsx?|csv)$/i.test(f))
      .map(f => join(inputPath, f));
    console.log(`发现 ${files.length} 个Excel/CSV文件`);
  } else {
    files = [inputPath];
  }

  if (files.length === 0) {
    console.log('未找到可导入的文件');
    process.exit(1);
  }

  console.log(`开始导入 ${reportYear} 年度财报数据...`);

  let totalAll = 0;
  let skippedAll = 0;

  for (const file of files) {
    const ext = extname(file).toLowerCase();
    const result = ext === '.csv'
      ? importCsv(file, reportYear)
      : importExcel(file, reportYear);
    totalAll += result.totalInserted;
    skippedAll += result.totalSkipped;
  }

  // 汇总统计
  const countRow = db.prepare('SELECT COUNT(*) as c FROM kb_listed_companies').get();
  console.log(`\n✓ 导入完成：总计 ${totalAll} 条，跳过 ${skippedAll} 条`);
  console.log(`  数据库中共 ${countRow.c} 家上市公司`);

  // 按行业统计
  const byIndustry = db.prepare(`
    SELECT industry_sw_l1 as industry, COUNT(*) as cnt
    FROM kb_listed_companies
    WHERE industry_sw_l1 IS NOT NULL
    GROUP BY industry_sw_l1
    ORDER BY cnt DESC
    LIMIT 15
  `).all();
  console.log('\n行业分布 (申万一级):');
  for (const row of byIndustry) {
    console.log(`  ${row.industry}: ${row.cnt} 家`);
  }
}

main();
