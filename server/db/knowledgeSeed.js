import db from './connection.js';

export function runKnowledgeSeed() {
  const count = db.prepare("SELECT COUNT(*) as c FROM sqlite_master WHERE type='table' AND name='kb_mineral_prices'").get();
  if (count && count.c > 0) {
    const rows = db.prepare('SELECT COUNT(*) as c FROM kb_mineral_prices').get();
    if (rows && rows.c > 0) return;
  }

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS kb_mineral_prices (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        mineral       TEXT    NOT NULL,
        price_usd     TEXT,
        price_cny     TEXT,
        trend         TEXT,
        updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS kb_mine_redlines (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        category      TEXT    NOT NULL,
        rule          TEXT    NOT NULL,
        severity      TEXT    NOT NULL DEFAULT 'high'
      );

      CREATE TABLE IF NOT EXISTS kb_mine_policies (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        policy_name   TEXT    NOT NULL,
        issuer        TEXT,
        summary       TEXT    NOT NULL,
        impact        TEXT,
        effective_date TEXT
      );
    `);
  } catch (e) {}

  const prices = [
    { mineral: 'gold', price_usd: '$3,350/oz', price_cny: '¥780/g', trend: 'up' },
    { mineral: 'silver', price_usd: '$32.5/oz', price_cny: '¥7.6/g', trend: 'up' },
    { mineral: 'copper', price_usd: '$10,200/t', price_cny: '¥75,000/t', trend: 'up' },
    { mineral: 'lead', price_usd: '$2,150/t', price_cny: '¥16,000/t', trend: 'down' },
    { mineral: 'zinc', price_usd: '$2,850/t', price_cny: '¥21,000/t', trend: 'stable' },
  ];

  for (const p of prices) {
    db.prepare('INSERT INTO kb_mineral_prices (mineral, price_usd, price_cny, trend) VALUES (?,?,?,?)')
      .run(p.mineral, p.price_usd, p.price_cny, p.trend);
  }

  const redlines = [
    { category: '证照合规', rule: '采矿许可证/勘查许可证过期或即将过期（6个月内）', severity: 'high' },
    { category: '证照合规', rule: '安全许可证或环保验收未通过', severity: 'high' },
    { category: '产权清晰', rule: '矿权存在抵押、查封或司法纠纷', severity: 'high' },
    { category: '资源核实', rule: '资源储量报告超过5年未核实', severity: 'medium' },
    { category: '资源核实', rule: '品位或储量与官方备案数据差异超过20%', severity: 'medium' },
    { category: '开发条件', rule: '矿区位于生态红线、保护区或军事禁区', severity: 'high' },
    { category: '开发条件', rule: '矿区基础设施严重不足且无改善路径', severity: 'medium' },
    { category: '财务风险', rule: '原矿企存在重大债务或欠薪问题', severity: 'medium' },
  ];

  for (const r of redlines) {
    db.prepare('INSERT INTO kb_mine_redlines (category, rule, severity) VALUES (?,?,?)')
      .run(r.category, r.rule, r.severity);
  }

  const policies = [
    { policy_name: '矿产资源法（2024修订草案）', issuer: '全国人大', summary: '完善矿业权出让制度，扩大竞争性出让范围', impact: '提高矿权取得成本，但增加透明度', effective_date: '2024' },
    { policy_name: '矿山安全法实施条例', issuer: '应急管理部', summary: '强化矿山安全生产责任，提高准入门槛', impact: '合规成本上升，但降低事故风险', effective_date: '2023' },
    { policy_name: '绿色矿山建设规范', issuer: '自然资源部', summary: '要求新建矿山全部按绿色矿山标准建设', impact: '增加环保投入，但提升长期可持续性', effective_date: '2022' },
    { policy_name: '固体废物污染环境防治法', issuer: '生态环境部', summary: '规范尾矿库管理和固体废物处理', impact: '尾矿处理成本增加', effective_date: '2020' },
  ];

  for (const p of policies) {
    db.prepare('INSERT INTO kb_mine_policies (policy_name, issuer, summary, impact, effective_date) VALUES (?,?,?,?,?)')
      .run(p.policy_name, p.issuer, p.summary, p.impact, p.effective_date);
  }

  console.log('✓ 矿业知识库种子数据写入完成');
}
