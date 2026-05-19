// AI 投研报告生成：项目信息 → AI 生成完整 8 章节投资分析报告
// 端点：POST /.netlify/functions/ai-analyze
// 流式 SSE 返回

import { checkOrigin, checkRate, jsonError, corsHeaders } from './_lib/guard.mjs';
import { streamMiniMax, transformToSimpleSSE, sseHeaders } from './_lib/minimax.mjs';

const SYSTEM_PROMPT = `你是头部 VC 基金的投资总监，曾主导过多个独角兽项目投资。
现在你需要为投委会撰写一份完整的 AI 投研分析报告。

请严格按以下 8 章节结构输出 markdown，每章节字数饱满（不少于 200 字）：

# {{公司名}} · AI 投研分析报告

## 一、投资摘要
- 给出一个 1-10 分的 AI 综合评分（如 9.1）
- 4 个关键指标：估值合理度 / 团队评分 / 市场吸引力 / 风险等级
- 一段话核心结论

## 二、团队评估
- 创始人画像（背景 / 经历 / 适配度）
- 核心高管阵容
- 团队短板

## 三、市场分析
- 当前市场规模（亿元）
- 5 年 CAGR 预测
- 政策驱动 / 技术拐点
- 龙头格局与目标公司位置

## 四、产品与技术
- 产品矩阵
- 技术壁垒（专利 / 论文 / 算法）
- 客户案例

## 五、财务建模（5 年预测）
| 年份 | 营收（亿元）| 增速 | 毛利率 | 净利率 | 经营现金流 |
|---|---|---|---|---|---|
| 2024 |  |  |  |  |  |
| 2025E |  |  |  |  |  |
| 2026E |  |  |  |  |  |
| 2027E |  |  |  |  |  |
| 2028E |  |  |  |  |  |

## 六、估值分析
- 三种估值方法（DCF / 可比公司 / 风险调整 NPV）
- 综合估值区间
- 本轮估值是否合理

## 七、风险扫描
列出 8 大风险维度（团队稳定性 / 技术路线 / 市场竞争 / 监管合规 / 客户集中度 / 供应链 / 财务健康 / 退出路径），每个标注 PASS / WARN / FAIL。

## 八、投决建议
- 综合评级（A 强烈推荐 / B 推荐 / C 观察 / D PASS）
- 5 项建议投资条款
- 5 项下一步行动清单

注意：所有数据若用户未提供，请基于行业常识合理假设并标注"基于行业基准估算"。不要编造原文不存在的信息当成事实陈述。`;

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

  const {
    company = '',
    sector = '',
    stage = '',
    valuation = '',
    description = '',
    financial = '',
    team = ''
  } = body;

  if (!company) return jsonError(400, 'company is required');

  const userPrompt = `请为以下项目撰写完整的投研分析报告：
- 公司名称：${company}
- 赛道：${sector || '未指定'}
- 融资轮次：${stage || '未指定'}
- 拟估值：${valuation || '未指定'}
- 团队信息：${team || '未提供'}
- 财务概况：${financial || '未提供'}
- 业务描述：${description || '未提供'}

请严格按 8 章节结构输出 markdown 报告。`;

  try {
    const upstream = await streamMiniMax({
      system: SYSTEM_PROMPT,
      user: userPrompt,
      temperature: 0.5,
      maxTokens: 8000
    });
    const stream = transformToSimpleSSE(upstream);
    return new Response(stream, { headers: sseHeaders(req.headers.get('origin')) });
  } catch (e) {
    return jsonError(502, 'AI upstream failed', { detail: e.message });
  }
};

export const config = { path: '/api/ai-analyze' };
