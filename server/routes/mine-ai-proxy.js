// 矿产 AI 分析代理路由 — 将 /api/mine-ai/* 请求转发到 mine-ai-workbench
// 默认指向本地 mine-ai-workbench (http://localhost:3200)
import { Router } from 'express';

const router = Router();

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:3200';

console.log(`[mineAiProxy] 矿产AI分析代理已启用 → ${AI_SERVICE_URL}`);

// ─── 代理 SSE 流式请求：POST /api/mine-ai/analyze ────────────────────
router.post('/analyze', async (req, res) => {
  const targetUrl = `${AI_SERVICE_URL}/api/integration/mine-analysis/analyze`;
  const headers = { 'Content-Type': 'application/json' };
  if (req.headers.authorization) headers['Authorization'] = req.headers.authorization;

  try {
    const resp = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(300000),
    });

    if (!resp.ok) {
      let detail = '';
      try { detail = (await resp.json()).error || ''; } catch {}
      return res.status(resp.status).json({ error: detail || `AI 微服务返回 ${resp.status}` });
    }

    // 检查响应类型：SSE 流式 或 JSON
    const contentType = resp.headers.get('content-type') || '';
    if (contentType.includes('text/event-stream')) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          res.write(chunk);
        }
      } catch (streamErr) {
        console.error('[mineAiProxy] SSE 流中断:', streamErr.message);
      }
      res.end();
    } else {
      const data = await resp.json();
      res.json(data);
    }
  } catch (err) {
    console.error('[mineAiProxy] 代理 /analyze 失败:', err.message);
    if (!res.headersSent) {
      res.status(502).json({ error: '矿产AI分析微服务不可达' });
    } else {
      res.end();
    }
  }
});

// ─── 代理决策报告请求 ──────────────────────────────────────────────
router.post('/decision-report', async (req, res) => {
  const targetUrl = `${AI_SERVICE_URL}/api/integration/mine-analysis/decision-report`;
  const headers = { 'Content-Type': 'application/json' };
  if (req.headers.authorization) headers['Authorization'] = req.headers.authorization;

  try {
    const resp = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(300000),
    });

    if (!resp.ok) {
      let detail = '';
      try { detail = (await resp.json()).error || ''; } catch {}
      return res.status(resp.status).json({ error: detail || `AI 微服务返回 ${resp.status}` });
    }

    const contentType = resp.headers.get('content-type') || '';
    if (contentType.includes('text/event-stream')) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(decoder.decode(value, { stream: true }));
        }
      } catch (e) {
        console.error('[mineAiProxy] 决策报告SSE中断:', e.message);
      }
      res.end();
    } else {
      const data = await resp.json();
      res.json(data);
    }
  } catch (err) {
    console.error('[mineAiProxy] 决策报告代理失败:', err.message);
    if (!res.headersSent) res.status(502).json({ error: 'AI微服务不可达' });
    else res.end();
  }
});

// ─── 代理 GET 请求 ─────────────────────────────────────────────────
router.get('/*', async (req, res) => {
  const targetUrl = `${AI_SERVICE_URL}/api/integration${req.path}`;
  const headers = {};
  if (req.headers.authorization) headers['Authorization'] = req.headers.authorization;

  try {
    const resp = await fetch(targetUrl, { headers, signal: AbortSignal.timeout(30000) });
    if (!resp.ok) {
      let detail = '';
      try { detail = (await resp.json()).error || ''; } catch {}
      return res.status(resp.status).json({ error: detail || `AI 微服务返回 ${resp.status}` });
    }
    const data = await resp.json();
    res.json(data);
  } catch (err) {
    console.error(`[mineAiProxy] 代理 GET ${req.path} 失败:`, err.message);
    res.status(502).json({ error: '矿产AI分析微服务不可达' });
  }
});

export default router;
