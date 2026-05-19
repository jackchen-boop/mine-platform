// 平台统计数据服务 — 从 system_stats 表读取 KPI

import db from '../db/connection.js';

/**
 * 获取所有平台 KPI 统计
 * @returns {object} key → { value, displayValue, description }
 */
export function getAllStats() {
  const rows = db.prepare('SELECT stat_key, stat_value, display_value, description FROM system_stats').all();
  const result = {};
  for (const row of rows) {
    result[row.stat_key] = {
      value: row.stat_value,
      displayValue: row.display_value,
      description: row.description
    };
  }
  return result;
}

/**
 * 更新单个统计值
 */
export function updateStat(key, value, displayValue) {
  db.prepare(`
    INSERT INTO system_stats (stat_key, stat_value, display_value, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(stat_key) DO UPDATE SET
      stat_value = excluded.stat_value,
      display_value = excluded.display_value,
      updated_at = excluded.updated_at
  `).run(key, value, displayValue);
}

/**
 * 重新计算动态统计（从实时数据库数据计算）
 */
export function recalcStats() {
  const projectCount = db.prepare("SELECT COUNT(*) as cnt FROM projects WHERE status = 'active'").get()?.cnt || 0;
  const partnerCount = db.prepare("SELECT COUNT(*) as cnt FROM partners").get()?.cnt || 0;
  const reportCount = db.prepare("SELECT COUNT(*) as cnt FROM reports").get()?.cnt || 0;
  const userCount = db.prepare("SELECT COUNT(*) as cnt FROM users WHERE status = 'active'").get()?.cnt || 0;

  updateStat('projects_total', projectCount, projectCount.toLocaleString());
  updateStat('partners_total', partnerCount, partnerCount.toLocaleString());
  updateStat('reports_total', reportCount, reportCount.toLocaleString());
  updateStat('users_total', userCount, userCount.toLocaleString());
}
