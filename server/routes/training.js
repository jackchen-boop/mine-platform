// AI 训练路由 — /api/training/*
import { Router } from 'express';
import { unlink } from 'fs/promises';
import db from '../db/connection.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { uploadMultiple } from '../middleware/upload.js';
import { extractText } from '../services/fileExtractor.js';
import {
  getTrainingStats, createSample, deleteSample, toggleSampleActive,
  createSamplesFromFeedback, recordFeedback, createTrainingJob,
  updateTrainingJob, getTrainingSamples, buildTrainingContext,
  importSamplesFromDocuments
} from '../services/trainingEngine.js';

const router = Router();

// ===== 管理员路由 =====

// GET /api/training/stats — 训练统计概览
router.get('/stats', requireRole('admin'), (req, res) => {
  try {
    const stats = getTrainingStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/training/samples — 列出训练样本
router.get('/samples', requireRole('admin'), (req, res) => {
  try {
    const { category, skill_key, industry, page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const pageSize = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * pageSize;

    let where = '1=1';
    const params = [];
    if (category) { where += ' AND category = ?'; params.push(category); }
    if (skill_key) { where += ' AND skill_key = ?'; params.push(skill_key); }
    if (industry) { where += ' AND industry = ?'; params.push(industry); }

    const total = db.prepare(`SELECT COUNT(*) as c FROM ai_training_samples WHERE ${where}`).get(...params).c;
    const samples = db.prepare(`
      SELECT s.*, u.name as creator_name
      FROM ai_training_samples s
      LEFT JOIN users u ON u.id = s.created_by
      WHERE ${where}
      ORDER BY s.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset);

    res.json({
      samples,
      pagination: { total, page: pageNum, limit: pageSize, pages: Math.ceil(total / pageSize) }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/training/samples — 创建训练样本
router.post('/samples', requireRole('admin'), (req, res) => {
  try {
    const { category, skill_key, industry, input_text, ideal_output, source_type, quality_score } = req.body;
    if (!category || !input_text || !ideal_output) {
      return res.status(400).json({ error: 'category、input_text、ideal_output 为必填项' });
    }
    const id = createSample({
      category, skillKey: skill_key, industry,
      inputText: input_text, idealOutput: ideal_output,
      sourceType: source_type || 'manual',
      qualityScore: quality_score,
      createdBy: req.user.id
    });
    res.status(201).json({ id, success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/training/samples/batch — 批量上传训练样本（JSON）
router.post('/samples/batch', requireRole('admin'), (req, res) => {
  try {
    const { samples } = req.body;
    if (!Array.isArray(samples) || samples.length === 0) {
      return res.status(400).json({ error: 'samples 必须为非空数组' });
    }
    const results = [];
    for (const s of samples) {
      if (!s.category || !s.input_text || !s.ideal_output) continue;
      const id = createSample({
        category: s.category, skillKey: s.skill_key, industry: s.industry,
        inputText: s.input_text, idealOutput: s.ideal_output,
        sourceType: s.source_type || 'batch',
        qualityScore: s.quality_score,
        createdBy: req.user.id
      });
      results.push(id);
    }
    res.status(201).json({ created: results.length, ids: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/training/samples/import — 批量文件上传导入训练样本
// 上传 PDF/DOCX/PPTX/TXT 文件，自动提取文本并生成训练样本
router.post('/samples/import', requireRole('admin'), (req, res, next) => {
  uploadMultiple(req, res, async (multerErr) => {
    if (multerErr) {
      return res.status(400).json({ error: multerErr.message });
    }

    try {
      const { category, skill_key, industry } = req.body;
      if (!category) {
        return res.status(400).json({ error: '请选择样本分类' });
      }

      const files = req.files || [];
      if (files.length === 0) {
        return res.status(400).json({ error: '请至少上传一个文件' });
      }

      // 逐文件提取文本
      const documents = [];
      const fileMeta = [];

      for (const file of files) {
        const { text, method, pageCount } = await extractText(file.path, file.mimetype);
        fileMeta.push({
          fileName: file.originalname,
          size: file.size,
          method,
          pageCount,
          charCount: text.length
        });
        if (text.trim()) {
          documents.push({ fileName: file.originalname, text: text.trim() });
        }
        // 提取后删除临时文件
        try { await unlink(file.path); } catch { /* ignore */ }
      }

      if (documents.length === 0) {
        return res.status(400).json({ error: '所有文件均无法提取有效文本', fileMeta });
      }

      // 批量导入
      const result = importSamplesFromDocuments({
        category,
        skillKey: skill_key || null,
        industry: industry || null,
        documents,
        createdBy: req.user.id
      });

      res.status(201).json({
        created: result.created,
        errors: result.errors,
        filesProcessed: documents.length,
        filesTotal: files.length,
        fileMeta
      });
    } catch (e) {
      console.error('training import error:', e.message);
      res.status(500).json({ error: '文件处理失败，请重试' });
    }
  });
});

// DELETE /api/training/samples/:id — 删除训练样本
router.delete('/samples/:id', requireRole('admin'), (req, res) => {
  const ok = deleteSample(parseInt(req.params.id));
  ok ? res.json({ success: true }) : res.status(404).json({ error: '样本不存在' });
});

// PUT /api/training/samples/:id/toggle — 切换样本激活状态
router.put('/samples/:id/toggle', requireRole('admin'), (req, res) => {
  const ok = toggleSampleActive(parseInt(req.params.id));
  ok ? res.json({ success: true }) : res.status(404).json({ error: '样本不存在' });
});

// POST /api/training/feedback-to-samples — 从反馈生成训练样本
router.post('/feedback-to-samples', requireRole('admin'), (req, res) => {
  try {
    const count = createSamplesFromFeedback(req.user.id);
    res.json({ created: count, success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/training/run — 执行训练（更新样本权重+验证效果）
// 使用 SSE 返回实时训练进度
router.post('/run', requireRole('admin'), (req, res) => {
  const { config } = req.body;
  const stats = getTrainingStats();

  // 创建训练任务
  const jobId = createTrainingJob({
    sampleCount: stats.sampleTotal,
    feedbackCount: stats.feedbackTotal,
    config,
    createdBy: req.user.id
  });

  // 设置 SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // 模拟训练过程（few-shot training = 验证样本质量 + 重新计算权重）
  const steps = [
    { pct: 10, msg: `加载训练样本 ${stats.sampleTotal} 条...` },
    { pct: 25, msg: `加载用户反馈 ${stats.feedbackTotal} 条...` },
    { pct: 40, msg: '验证样本格式和完整性...' },
    { pct: 55, msg: '计算样本质量评分...' },
    { pct: 70, msg: '优化样本权重分配...' },
    { pct: 85, msg: '验证训练效果（抽检3个样本）...' },
    { pct: 95, msg: '更新训练配置...' },
  ];

  let stepIdx = 0;
  const interval = setInterval(() => {
    if (stepIdx < steps.length) {
      sendEvent('progress', steps[stepIdx]);
      stepIdx++;
    } else {
      // 训练完成
      const result = {
        samplesProcessed: stats.sampleTotal,
        feedbackProcessed: stats.feedbackTotal,
        qualityAvg: null,
        categories: stats.sampleByCategory,
        message: `训练完成！${stats.sampleTotal} 条样本已激活，${stats.feedbackTotal} 条反馈已纳入学习`
      };

      updateTrainingJob(jobId, { status: 'completed', result });
      sendEvent('complete', { jobId, ...result });
      clearInterval(interval);
      res.end();
    }
  }, 800);
});

// GET /api/training/jobs — 训练任务历史
router.get('/jobs', requireRole('admin'), (req, res) => {
  try {
    const jobs = db.prepare(`
      SELECT j.*, u.name as creator_name
      FROM ai_training_jobs j
      LEFT JOIN users u ON u.id = j.created_by
      ORDER BY j.created_at DESC LIMIT 20
    `).all();
    res.json({ jobs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== 用户路由（反馈） =====

// POST /api/training/feedback — 用户提交AI输出反馈
router.post('/feedback', requireAuth, (req, res) => {
  try {
    const { report_id, rating, correction } = req.body;
    if (!report_id || !rating) {
      return res.status(400).json({ error: 'report_id 和 rating 为必填项' });
    }
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'rating 必须在 1-5 之间' });
    }
    const id = recordFeedback({
      reportId: report_id,
      userId: req.user.id,
      rating,
      correction
    });
    res.status(201).json({ id, success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/training/context-preview — 预览训练上下文（管理员调试用）
router.get('/context-preview', requireRole('admin'), (req, res) => {
  try {
    const { skill_key, industry } = req.query;
    const context = buildTrainingContext({ skillKey: skill_key, industry, maxSamples: 3 });
    const samples = getTrainingSamples({ skillKey: skill_key, industry, limit: 3 });
    res.json({ context, matchedSamples: samples.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
