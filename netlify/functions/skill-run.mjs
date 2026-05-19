// 通用 18 技能在线运行：根据 skill key 加载对应 system prompt，转发到 MiniMax
// 端点：POST /.netlify/functions/skill-run
// 流式 SSE 返回

import { checkOrigin, checkRate, jsonError, corsHeaders } from './_lib/guard.mjs';
import { streamMiniMax, transformToSimpleSSE, sseHeaders } from './_lib/minimax.mjs';
import { SKILL_PROMPTS, SKILL_ALIAS } from './_lib/skill-prompts.mjs';

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders(req.headers.get('origin')) });
  }
  if (req.method !== 'POST') return jsonError(405, 'method not allowed');

  const originCheck = checkOrigin(req);
  if (!originCheck.ok) return jsonError(403, 'forbidden', { reason: originCheck.reason });

  const rate = checkRate(req);
  if (!rate.ok) return jsonError(429, 'rate limit exceeded', { perMinute: rate.count });

  let body;
  try { body = await req.json(); } catch { return jsonError(400, 'invalid json'); }

  const { skill = '', input = '' } = body;
  if (!skill) return jsonError(400, 'skill is required');
  if (!input || input.length < 10) return jsonError(400, '请提供至少 10 字的输入内容');
  if (input.length > 80000) return jsonError(413, '输入内容过长（>80k 字符）');

  // 先尝试中文别名，再尝试 fully qualified key
  const skillKey = SKILL_ALIAS[skill] || skill;
  const skillDef = SKILL_PROMPTS[skillKey];
  if (!skillDef) return jsonError(404, 'unknown skill', { skill, available: Object.keys(SKILL_ALIAS) });

  try {
    const upstream = await streamMiniMax({
      system: skillDef.system,
      user: input,
      temperature: skillDef.temp || 0.4,
      maxTokens: 6000
    });
    const stream = transformToSimpleSSE(upstream);
    return new Response(stream, {
      headers: {
        ...sseHeaders(req.headers.get('origin')),
        'X-Skill-Title': encodeURIComponent(skillDef.title)
      }
    });
  } catch (e) {
    return jsonError(502, 'AI upstream failed', { detail: e.message });
  }
};

export const config = { path: '/api/skill-run' };
