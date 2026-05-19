// BP 解析：用户上传 BP 文本 / 项目描述 → AI 抽取 8 要素结构化输出
// 端点：POST /.netlify/functions/bp-parse
// 流式 SSE 返回，前端 EventSource 实时渲染

import { checkOrigin, checkRate, jsonError, corsHeaders } from './_lib/guard.mjs';
import { streamMiniMax, transformToSimpleSSE, sseHeaders } from './_lib/minimax.mjs';

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

  const { text = '', filename = '', mode = 'extract' } = body;
  if (!text || text.length < 50) return jsonError(400, '请提供至少 50 字的 BP 文本');
  if (text.length > 50000) return jsonError(413, 'BP 文本过长（>50k 字符），请精简后再传');

  const systemPrompt = `你是顶级 VC 投资经理，擅长在 5 分钟内从一份 BP 中抽取核心信息。
请从用户提供的 BP 文本中抽取以下 8 个要素，并用 markdown 表格输出，每个要素都要有"原文依据"列（引用 BP 中的原文片段，不超过 50 字）：

| 要素 | 抽取内容 | 原文依据 |
|---|---|---|
| 公司名称 |  |  |
| 所属赛道 |  |  |
| 融资轮次 |  |  |
| 融资金额 |  |  |
| 投后估值 |  |  |
| 核心团队（创始人 + 关键高管） |  |  |
| 财务概况（近三年营收/净利润） |  |  |
| 商业模式（一句话概括） |  |  |

抽取完成后，再用 100-200 字给出"AI 投资官初步判断"：
- 该项目最大的亮点是什么？
- 最值得追问的 3 个问题是什么？
- 是否值得进入下一轮尽调？（推荐 / 观察 / PASS）

如果 BP 中某要素信息缺失，明确写"未提及"，不要编造。`;

  const userPrompt = filename
    ? `BP 文件名：${filename}\n\nBP 内容：\n${text}`
    : `BP 内容：\n${text}`;

  try {
    const upstream = await streamMiniMax({
      system: systemPrompt,
      user: userPrompt,
      temperature: 0.3,
      maxTokens: 3000
    });
    const stream = transformToSimpleSSE(upstream);
    return new Response(stream, { headers: sseHeaders(req.headers.get('origin')) });
  } catch (e) {
    return jsonError(502, 'AI upstream failed', { detail: e.message });
  }
};

export const config = { path: '/api/bp-parse' };
