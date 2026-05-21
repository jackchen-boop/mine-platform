// AI 训练引擎 — 训练样本管理 + Few-Shot 注入 + 反馈学习
import db from '../db/connection.js';

/**
 * 获取训练样本，按技能和行业筛选
 * 用于 AI 调用时注入 few-shot 示例到 prompt
 */
export function getTrainingSamples({ skillKey, industry, category, limit = 5 }) {
  let sql = `SELECT * FROM ai_training_samples WHERE is_active = 1`;
  const params = [];

  if (skillKey) {
    sql += ` AND (skill_key = ? OR skill_key IS NULL)`;
    params.push(skillKey);
  }
  if (industry) {
    sql += ` AND (industry = ? OR industry IS NULL)`;
    params.push(industry);
  }
  if (category) {
    sql += ` AND category = ?`;
    params.push(category);
  }

  sql += ` ORDER BY quality_score DESC NULLS LAST, created_at DESC LIMIT ?`;
  params.push(limit);

  return db.prepare(sql).all(...params);
}

/**
 * 构建 few-shot 训练上下文，注入到 AI system prompt
 * 返回格式化的示例文本
 */
export function buildTrainingContext({ skillKey, industry, maxSamples = 5 }) {
  const samples = getTrainingSamples({ skillKey, industry, limit: maxSamples });
  if (samples.length === 0) return '';

  const parts = ['\n### 参考案例（管理员提供的标准分析范例，分析时请参照其风格和深度）'];

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const catLabel = { 'qa': 'Q&A范例', 'analysis': '分析范例', 'redline': '红线判定范例', 'valuation': '估值判定范例' }[s.category] || '范例';
    parts.push(`\n**${catLabel} ${i + 1}**${s.industry ? `（${s.industry}行业）` : ''}`);
    parts.push(`**输入：**\n${s.input_text.substring(0, 800)}${s.input_text.length > 800 ? '...(省略)' : ''}`);
    parts.push(`**标准输出：**\n${s.ideal_output.substring(0, 2000)}${s.ideal_output.length > 2000 ? '...(省略)' : ''}`);
  }

  return parts.join('\n');
}

/**
 * 获取高质量反馈作为训练素材
 * 将评分≥4的反馈和修正作为正向样本
 */
export function getFeedbackSamples({ minRating = 4, limit = 5 }) {
  return db.prepare(`
    SELECT f.*, r.content as report_content, r.skill_key, r.input_params
    FROM ai_feedback f
    JOIN reports r ON r.id = f.report_id
    WHERE f.rating >= ? AND f.correction IS NOT NULL AND f.correction != ''
    ORDER BY f.created_at DESC
    LIMIT ?
  `).all(minRating, limit);
}

/**
 * 训练统计信息
 */
export function getTrainingStats() {
  const sampleTotal = db.prepare('SELECT COUNT(*) as c FROM ai_training_samples WHERE is_active = 1').get().c;
  const sampleByCategory = db.prepare(`
    SELECT category, COUNT(*) as cnt FROM ai_training_samples WHERE is_active = 1 GROUP BY category ORDER BY cnt DESC
  `).all();
  const sampleBySkill = db.prepare(`
    SELECT skill_key, COUNT(*) as cnt FROM ai_training_samples WHERE is_active = 1 AND skill_key IS NOT NULL GROUP BY skill_key ORDER BY cnt DESC LIMIT 10
  `).all();
  const feedbackTotal = db.prepare('SELECT COUNT(*) as c FROM ai_feedback').get().c;
  const feedbackAvgRating = db.prepare('SELECT AVG(CAST(rating AS REAL)) as avg FROM ai_feedback').get().avg || 0;
  const feedbackByRating = db.prepare('SELECT rating, COUNT(*) as cnt FROM ai_feedback GROUP BY rating ORDER BY rating').all();
  const recentFeedback = db.prepare(`
    SELECT f.id, f.rating, f.correction, f.created_at, f.accepted,
      u.name as user_name, r.skill_key, r.title as report_title
    FROM ai_feedback f
    JOIN users u ON u.id = f.user_id
    JOIN reports r ON r.id = f.report_id
    ORDER BY f.created_at DESC LIMIT 10
  `).all();
  const jobHistory = db.prepare(`
    SELECT j.*, u.name as creator_name
    FROM ai_training_jobs j
    LEFT JOIN users u ON u.id = j.created_by
    ORDER BY j.created_at DESC LIMIT 10
  `).all();

  return {
    sampleTotal, sampleByCategory, sampleBySkill,
    feedbackTotal, feedbackAvgRating, feedbackByRating,
    recentFeedback, jobHistory
  };
}

/**
 * 创建训练样本
 */
export function createSample({ category, skillKey, industry, inputText, idealOutput, sourceType, qualityScore, createdBy }) {
  const result = db.prepare(`
    INSERT INTO ai_training_samples (category, skill_key, industry, input_text, ideal_output, source_type, quality_score, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(category, skillKey || null, industry || null, inputText, idealOutput, sourceType || 'manual', qualityScore || null, createdBy || null);
  return result.lastInsertRowid;
}

/**
 * 批量创建训练样本（从已有报告+反馈中生成）
 */
export function createSamplesFromFeedback(adminUserId) {
  // 找到用户评分>=4且有修正的反馈，将原始报告作为input，修正作为ideal_output
  const goodFeedback = db.prepare(`
    SELECT f.correction, r.content as report_content, r.skill_key, r.input_params
    FROM ai_feedback f
    JOIN reports r ON r.id = f.report_id
    WHERE f.rating >= 4 AND f.correction IS NOT NULL AND f.correction != ''
    AND NOT EXISTS (
      SELECT 1 FROM ai_training_samples s WHERE s.input_text = r.input_params AND s.ideal_output = f.correction
    )
  `).all();

  const stmt = db.prepare(`
    INSERT INTO ai_training_samples (category, skill_key, industry, input_text, ideal_output, source_type, quality_score, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let count = 0;
  for (const fb of goodFeedback) {
    try {
      const inputParams = fb.input_params ? JSON.parse(fb.input_params) : {};
      stmt.run(
        'qa',
        fb.skill_key || null,
        inputParams.sector || null,
        inputParams.input || fb.report_content?.substring(0, 500) || '',
        fb.correction,
        'feedback',
        fb.rating / 5.0,  // 归一化到0-1
        adminUserId
      );
      count++;
    } catch { /* skip parse errors */ }
  }
  return count;
}

/**
 * 删除训练样本
 */
export function deleteSample(id) {
  return db.prepare('DELETE FROM ai_training_samples WHERE id = ?').run(id).changes > 0;
}

/**
 * 切换样本激活状态
 */
export function toggleSampleActive(id) {
  const current = db.prepare('SELECT is_active FROM ai_training_samples WHERE id = ?').get(id);
  if (!current) return false;
  db.prepare('UPDATE ai_training_samples SET is_active = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .run(current.is_active ? 0 : 1, id);
  return true;
}

/**
 * 记录反馈
 */
export function recordFeedback({ reportId, userId, rating, correction }) {
  const result = db.prepare(`
    INSERT INTO ai_feedback (report_id, user_id, rating, correction)
    VALUES (?, ?, ?, ?)
  `).run(reportId, userId, rating, correction || null);
  return result.lastInsertRowid;
}

/**
 * 创建训练任务
 */
export function createTrainingJob({ sampleCount, feedbackCount, config, createdBy }) {
  const result = db.prepare(`
    INSERT INTO ai_training_jobs (status, sample_count, feedback_count, config, created_by)
    VALUES ('running', ?, ?, ?, ?)
  `).run(sampleCount, feedbackCount, config ? JSON.stringify(config) : null, createdBy);
  return result.lastInsertRowid;
}

/**
 * 更新训练任务状态
 */
export function updateTrainingJob(id, { status, result }) {
  const updates = ['status = ?'];
  const params = [status];
  if (status === 'completed') {
    updates.push("completed_at = datetime('now')");
  }
  if (result) {
    updates.push('result = ?');
    params.push(JSON.stringify(result));
  }
  params.push(id);
  db.prepare(`UPDATE ai_training_jobs SET ${updates.join(', ')} WHERE id = ?`).run(...params);
}
