// MiniMax SSE 客户端：调用 chatcompletion_v2 流式接口，转发为 SSE 给前端
// 安全策略：API Key 仅从 process.env 读取，绝不入代码 / 日志 / 响应体

const MINIMAX_ENDPOINT = 'https://api.minimax.chat/v1/text/chatcompletion_v2';

export async function streamMiniMax({ system, user, model, temperature = 0.7, maxTokens = 4096 }) {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    throw new Error('MINIMAX_API_KEY is not configured. 请在 Netlify 后台 Site settings → Environment variables 添加');
  }
  const usedModel = model || process.env.MINIMAX_MODEL || 'abab6.5s-chat';

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
    // 不要把 apiKey 任何片段回显，仅返回 status + minimax message
    throw new Error(`MiniMax upstream ${upstream.status}: ${text.slice(0, 500)}`);
  }
  return upstream.body; // ReadableStream of bytes (SSE)
}

// 把 MiniMax SSE 流（OpenAI 格式 chunks）转成简化 SSE 给前端：每行 data: <delta-text>
export function transformToSimpleSSE(upstreamBody) {
  const reader = upstreamBody.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';

  return new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(': ping\n\n'));
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
              controller.enqueue(encoder.encode('event: done\ndata: \n\n'));
              continue;
            }
            try {
              const obj = JSON.parse(data);
              const delta = obj?.choices?.[0]?.delta?.content
                || obj?.choices?.[0]?.message?.content
                || '';
              if (delta) {
                // 转义换行：SSE 以双换行分隔事件
                const safe = delta.replace(/\r/g, '').split('\n').map(l => `data: ${l}`).join('\n');
                controller.enqueue(encoder.encode(safe + '\n\n'));
              }
              // 透传 usage（如果在最后一个 chunk）
              if (obj?.usage) {
                controller.enqueue(encoder.encode(`event: usage\ndata: ${JSON.stringify(obj.usage)}\n\n`));
              }
            } catch (e) {
              // 解析失败的 chunk 跳过，不阻断流
            }
          }
        }
        controller.enqueue(encoder.encode('event: done\ndata: \n\n'));
      } catch (e) {
        controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ message: e.message })}\n\n`));
      } finally {
        controller.close();
      }
    }
  });
}

export function sseHeaders(origin) {
  return {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': origin || '*'
  };
}
