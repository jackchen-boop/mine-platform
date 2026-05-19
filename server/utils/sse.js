// Express SSE 响应助手
export function sseInit(res) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  // 心跳，防止连接超时
  res.write(': ping\n\n');
}

export function sseSend(res, text) {
  // 多行文本每行加 'data: ' 前缀
  const lines = text.replace(/\r/g, '').split('\n').map(l => `data: ${l}`).join('\n');
  res.write(lines + '\n\n');
}

export function sseEvent(res, event, data) {
  res.write(`event: ${event}\ndata: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`);
}

export function sseDone(res) {
  sseEvent(res, 'done', '');
  res.end();
}

export function sseError(res, message) {
  sseEvent(res, 'error', { message });
  res.end();
}
