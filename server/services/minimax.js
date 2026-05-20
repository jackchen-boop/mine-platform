// 星链 AI 引擎 · 流式客户端（内部实现，对外屏蔽第三方信息）
// API Key 仅从 process.env 读取，绝不入代码 / 日志 / 响应体

import { sseInit, sseSend, sseEvent, sseDone, sseError } from '../utils/sse.js';

const MINIMAX_ENDPOINT = 'https://api.minimax.chat/v1/text/chatcompletion_v2';

export async function streamToResponse(res, { system, user, model, temperature = 0.6, maxTokens = 6000 }) {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    throw new Error('星链 AI 引擎未配置，请联系管理员');
  }

  const usedModel = model || process.env.MINIMAX_MODEL || 'MiniMax-M2.7';

  const payload = {
    model: usedModel,
    stream: true,
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      { role: 'user', content: user }
    ],
    temperature,
    max_tokens: maxTokens
  };

  const upstream = await fetch(MINIMAX_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => '');
    throw new Error(`星链 AI 服务异常 ${upstream.status}，请稍后重试`);
  }

  // 初始化 SSE 响应头
  sseInit(res);

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let lastUsage = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') {
          sseEvent(res, 'done', '');
          continue;
        }
        try {
          const obj = JSON.parse(data);
          // 检测业务层错误
          if (obj?.base_resp?.status_code && obj.base_resp.status_code !== 0) {
            const code = obj.base_resp.status_code;
            const hint = code === 1008 ? '账户余额不足，请联系管理员' :
                         code === 2061 ? '当前套餐不支持此功能' : '星链 AI 服务异常，请稍后重试';
            sseError(res, hint);
            return { fullText, model: '星链 AI' };
          }
          const delta = obj?.choices?.[0]?.delta?.content
            || obj?.choices?.[0]?.message?.content
            || '';
          if (delta) {
            fullText += delta;
            sseSend(res, delta);
          }
          if (obj?.usage && obj.usage.total_tokens > 0) {
            lastUsage = obj.usage;
            sseEvent(res, 'usage', obj.usage);
          }
        } catch {
          // 解析失败的 chunk 跳过
        }
      }
    }
  } finally {
    sseDone(res);
  }

  return { fullText, model: '星链 AI' };
}

export async function streamToResponseWithSave(res, options, onComplete) {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    throw new Error('星链 AI 引擎未配置，请联系管理员');
  }

  const usedModel = options.model || process.env.MINIMAX_MODEL || 'MiniMax-M2.7';

  const payload = {
    model: usedModel,
    stream: true,
    messages: [
      ...(options.system ? [{ role: 'system', content: options.system }] : []),
      { role: 'user', content: options.user }
    ],
    temperature: options.temperature || 0.6,
    max_tokens: options.maxTokens || 6000
  };

  const upstream = await fetch(MINIMAX_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => '');
    throw new Error(`星链 AI 服务异常 ${upstream.status}，请稍后重试`);
  }

  sseInit(res);

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let usageData = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') continue;
        try {
          const obj = JSON.parse(data);
          // 检测业务层错误
          if (obj?.base_resp?.status_code && obj.base_resp.status_code !== 0) {
            const code = obj.base_resp.status_code;
            const hint = code === 1008 ? '账户余额不足，请联系管理员' :
                         code === 2061 ? '当前套餐不支持此功能' : '星链 AI 服务异常，请稍后重试';
            sseError(res, hint);
            return { fullText, model: '星链 AI' };
          }
          const delta = obj?.choices?.[0]?.delta?.content || '';
          if (delta) {
            fullText += delta;
            sseSend(res, delta);
          }
          if (obj?.usage && obj.usage.total_tokens > 0) {
            usageData = obj.usage;
            sseEvent(res, 'usage', obj.usage);
          }
        } catch { /* skip */ }
      }
    }
  } finally {
    sseDone(res);
    if (onComplete && fullText) {
      try { await onComplete(fullText, usageData, '星链 AI'); } catch (e) { console.error('保存报告失败:', e.message); }
    }
  }

  return { fullText, model: '星链 AI' };
}
