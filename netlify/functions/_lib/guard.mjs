// 共享中间件：Origin 校验 + IP 速率限制
// 安全策略：禁止硬编码密钥；所有敏感配置走环境变量

const ALLOWED_HOST_SUFFIX = [
  '.netlify.app',
  '.netlify.live',  // Netlify 预览域名
  'localhost',
  '127.0.0.1'
];

// 允许通过 env var 增加自定义域名（如绑定了 qiming-vc.com）
function getAllowedHosts() {
  const extra = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  return [...ALLOWED_HOST_SUFFIX, ...extra];
}

export function checkOrigin(req) {
  const origin = req.headers.get('origin') || req.headers.get('referer') || '';
  if (!origin) return { ok: false, reason: 'missing origin' };
  let host;
  try { host = new URL(origin).hostname; } catch { return { ok: false, reason: 'bad origin' }; }
  const allowed = getAllowedHosts();
  const ok = allowed.some(suffix =>
    host === suffix || host.endsWith(suffix)
  );
  return ok ? { ok: true, host } : { ok: false, reason: `host ${host} not in whitelist` };
}

// 简易内存速率限制（每个 Function 实例独立，足够 Demo 防爆刷）
const RATE_BUCKET = new Map();
const RATE_LIMIT = parseInt(process.env.RATE_LIMIT_PER_MIN || '10', 10);
const WINDOW_MS = 60 * 1000;

export function checkRate(req) {
  const ip = req.headers.get('x-nf-client-connection-ip')
    || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown';
  const now = Date.now();
  const bucket = RATE_BUCKET.get(ip) || [];
  const recent = bucket.filter(t => now - t < WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    return { ok: false, ip, count: recent.length };
  }
  recent.push(now);
  RATE_BUCKET.set(ip, recent);
  // 周期性清理过期 IP（防内存增长）
  if (RATE_BUCKET.size > 1000) {
    for (const [k, v] of RATE_BUCKET) {
      if (v.every(t => now - t > WINDOW_MS)) RATE_BUCKET.delete(k);
    }
  }
  return { ok: true, ip, count: recent.length };
}

export function jsonError(status, message, extra = {}) {
  return new Response(JSON.stringify({ error: message, ...extra }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

export function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}
