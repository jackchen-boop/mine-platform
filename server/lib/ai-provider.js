import db from '../db/connection.js';
import { evaluateMineProject } from './mine-evaluation.js';

let settingsCache = null;
let settingsCacheTime = 0;
const CACHE_TTL = 30000; // 30秒缓存

export function getAISettings() {
  const now = Date.now();
  if (settingsCache && (now - settingsCacheTime < CACHE_TTL)) {
    return settingsCache;
  }

  const defaults = {
    ai_provider: 'minimax',
    ai_api_key: process.env.MINIMAX_API_KEY || '',
    ai_api_base: 'https://api.minimaxi.com/v1',
    ai_model: 'MiniMax-M2.7',
    ai_max_tokens: 4096,
    ai_temperature: 0.3,
    ai_enabled: 'true',
  };

  try {
    const rows = db.prepare("SELECT setting_key, setting_value FROM system_settings WHERE setting_key LIKE 'ai_%'").all();
    const fromDb = {};
    for (const row of rows) {
      fromDb[row.setting_key] = row.setting_value;
    }
    settingsCache = { ...defaults, ...fromDb };
  } catch (e) {
    settingsCache = defaults;
  }

  settingsCacheTime = now;
  return settingsCache;
}

export function clearAISettingsCache() {
  settingsCache = null;
  settingsCacheTime = 0;
}

const SYSTEM_PROMPT = `你是一位资深矿业投资分析师，精通紫金矿业五阶段评价体系。请根据提供的矿产项目信息，进行专业分析并返回严格的JSON格式结果。

评价阶段及维度（严格遵循100分制）：
1. 草根勘查项目(grassroots)：成矿背景5分、业主背景5分、区域矿床10分、区域矿山运营20分、矿权面积10分、钻探靶区20分、见矿工程30分
2. 初级勘查项目(early-exploration)：预期勘查意义50分、预期经济意义50分
3. 高级勘查项目(advanced-exploration)：资源量规模10分、露采/崩落20分或地采10分、高品位区10分、可选性30分、扩展意义10分、钻探靶区10分、综合评价10分
4. 技术研究项目(feasibility-study)：资源储量20分、NPV15分、IRR15分、成本优势20分、产能规模15分、矿山寿命15分
5. 矿山运营阶段(production)：剩余生命周期20分、增储潜力15分、成本分位值20分、管理提升空间15分、现有生产规模15分、扩产潜力15分

项目分级标准：
- S级(90-100分)：卓越项目，极具投资价值
- A级(75-89分)：优秀项目，具备良好投资条件
- B级(60-74分)：良好项目，有条件推进
- C级(<60分)：一般项目，需谨慎评估

请按以下JSON格式返回（不要包含任何其他文字，只输出JSON）：
{
  "overallScore": 0-100的评分,
  "grade": "S/A/B/C",
  "gradeLabel": "卓越/优秀/良好/一般",
  "stage": { "code": "阶段代码", "name": "阶段中文名", "phase": 1-5 },
  "dimensions": [
    { "name": "维度名称", "score": 得分, "max": 满分, "weight": 权重, "note": "评分说明" }
  ],
  "financials": {
    "oreTons": 矿石量万吨,
    "annualCapacity": 年产能万吨,
    "mineLife": 服务年限,
    "annualRevenue": 年收入百万美元,
    "annualCashFlow": 年现金流百万美元,
    "totalCapex": 总资本开支百万美元,
    "npv": NPV百万美元,
    "irr": IRR百分比数字,
    "payback": 投资回收期年,
    "cashCost": 现金成本数字,
    "aisc": 全维持成本数字,
    "aiscUnit": "成本单位如USD/oz Au Eq",
    "operatingCostPerTon": 每吨运营成本美元,
    "costQuartile": 成本分位值1-100,
    "primaryMineral": "主矿种gold/copper/silver"
  },
  "risks": [
    { "category": "风险类别", "level": "高/中/低", "detail": "风险说明" }
  ],
  "recommendations": ["建议1", "建议2"],
  "disposalAdvice": [
    { "option": "处置方式", "suitability": "高/中/低", "note": "说明" }
  ],
  "missingData": [
    { "field": "字段名", "label": "中文名称", "phase": "所属阶段", "severity": "high/medium/low" }
  ],
  "summary": "200字以内的综合分析摘要",
  "evaluationModel": "MiniMax AI 大模型分析"
}

注意事项：
- 如果信息不足，基于行业经验合理估算，并在note中注明"估算"
- 财务指标请基于金属价格(Au 2000 USD/oz, Cu 8500 USD/t)进行合理估算
- 评分要客观严谨，严格按照五阶段100分制评分标准打分
- missingData必须列出项目中明显缺失的关键数据字段
- 如提供图像资料，请充分利用图像理解能力分析地质图、剖面图、样品照片等
- 必须严格返回合法JSON，不要包含markdown代码块标记`;

function buildPrompt(project, reportText) {
  let text = '';

  if (reportText && reportText.length > 0) {
    text += `【报告文本】\n${reportText.substring(0, 12000)}\n\n`;
  }

  text += `【项目信息】\n`;
  if (project.name) text += `- 项目名称: ${project.name}\n`;
  if (project.mineral_types) text += `- 矿种: ${project.mineral_types}\n`;
  if (project.province) text += `- 省份: ${project.province}\n`;
  if (project.city) text += `- 城市: ${project.city}\n`;
  if (project.development_stage) text += `- 开发阶段: ${project.development_stage}\n`;
  if (project.mine_type) text += `- 矿山类型: ${project.mine_type}\n`;
  if (project.estimated_reserve && typeof project.estimated_reserve === 'string' && project.estimated_reserve.length < 5000) {
    text += `- 储量信息: ${project.estimated_reserve.substring(0, 2000)}\n`;
  }
  if (project.reserve_grade && typeof project.reserve_grade === 'string' && project.reserve_grade.length < 3000) {
    text += `- 品位信息: ${project.reserve_grade.substring(0, 1500)}\n`;
  }
  if (project.description && typeof project.description === 'string' && project.description.length < 8000) {
    text += `- 项目描述: ${project.description.substring(0, 3000)}\n`;
  }
  if (project.area_km2) text += `- 矿权面积: ${project.area_km2} km²\n`;
  if (project.license_expires) text += `- 许可证到期: ${project.license_expires}\n`;

  text += `\n请基于以上信息，按照系统提示的JSON格式返回专业的矿业项目AI分析报告。`;
  return text;
}

function normalizeAnalysis(raw, project) {
  // 确保所有必要字段存在
  const stageMap = {
    'grassroots': { name: '草根勘查项目', phase: 1 },
    'early-exploration': { name: '初级勘查项目', phase: 2 },
    'advanced-exploration': { name: '高级勘查项目', phase: 3 },
    'feasibility-study': { name: '技术研究项目', phase: 4 },
    'production': { name: '矿山运营/生产阶段', phase: 5 },
  };

  const stageCode = raw.stage?.code || 'advanced-exploration';
  const stageInfo = stageMap[stageCode] || stageMap['advanced-exploration'];

  // 计算或校验grade
  let grade = raw.grade;
  let gradeLabel = raw.gradeLabel;
  const score = typeof raw.overallScore === 'number' ? raw.overallScore : 60;
  if (!grade || !['S','A','B','C'].includes(grade)) {
    if (score >= 90) { grade = 'S'; gradeLabel = '卓越'; }
    else if (score >= 75) { grade = 'A'; gradeLabel = '优秀'; }
    else if (score >= 60) { grade = 'B'; gradeLabel = '良好'; }
    else { grade = 'C'; gradeLabel = '一般'; }
  }

  // 处理missingData
  const missingData = Array.isArray(raw.missingData) ? raw.missingData.map(m => ({
    field: m.field || '',
    label: m.label || m.field || '未命名字段',
    phase: m.phase || 'all',
    severity: ['high','medium','low'].includes(m.severity) ? m.severity : 'medium',
  })) : [];

  return {
    overallScore: score,
    grade,
    gradeLabel,
    stage: {
      code: stageCode,
      name: raw.stage?.name || stageInfo.name,
      phase: raw.stage?.phase || stageInfo.phase,
    },
    dimensions: Array.isArray(raw.dimensions) ? raw.dimensions.map(d => ({
      name: d.name || '未命名维度',
      score: typeof d.score === 'number' ? d.score : 0,
      max: typeof d.max === 'number' ? d.max : 10,
      weight: typeof d.weight === 'number' ? d.weight : 10,
      note: d.note || '',
    })) : [],
    financials: {
      oreTons: typeof raw.financials?.oreTons === 'number' ? raw.financials.oreTons : 0,
      annualCapacity: typeof raw.financials?.annualCapacity === 'number' ? raw.financials.annualCapacity : 0,
      mineLife: typeof raw.financials?.mineLife === 'number' ? raw.financials.mineLife : 0,
      annualRevenue: typeof raw.financials?.annualRevenue === 'number' ? raw.financials.annualRevenue : 0,
      annualCashFlow: typeof raw.financials?.annualCashFlow === 'number' ? raw.financials.annualCashFlow : 0,
      totalCapex: typeof raw.financials?.totalCapex === 'number' ? raw.financials.totalCapex : 0,
      npv: typeof raw.financials?.npv === 'number' ? raw.financials.npv : 0,
      irr: typeof raw.financials?.irr === 'number' ? raw.financials.irr : 0,
      payback: typeof raw.financials?.payback === 'number' ? raw.financials.payback : 0,
      cashCost: typeof raw.financials?.cashCost === 'number' ? raw.financials.cashCost : 0,
      aisc: typeof raw.financials?.aisc === 'number' ? raw.financials.aisc : 0,
      aiscUnit: raw.financials?.aiscUnit || 'USD/oz Au Eq',
      operatingCostPerTon: typeof raw.financials?.operatingCostPerTon === 'number' ? raw.financials.operatingCostPerTon : 30,
      costQuartile: typeof raw.financials?.costQuartile === 'number' ? raw.financials.costQuartile : 50,
      primaryMineral: raw.financials?.primaryMineral || 'gold',
    },
    risks: Array.isArray(raw.risks) ? raw.risks.map(r => ({
      category: r.category || '综合风险',
      level: ['高', '中', '低'].includes(r.level) ? r.level : '中',
      detail: r.detail || '',
    })) : [{ category: '信息风险', level: '中', detail: '基于有限信息分析，建议进一步核实' }],
    recommendations: Array.isArray(raw.recommendations) ? raw.recommendations : ['建议委托第三方机构进行独立资源核实'],
    disposalAdvice: Array.isArray(raw.disposalAdvice) ? raw.disposalAdvice.map(a => ({
      option: a.option || '合作开发',
      suitability: ['高', '中', '低'].includes(a.suitability) ? a.suitability : '中',
      note: a.note || '',
    })) : [{ option: '合作开发', suitability: '中', note: '建议结合更多信息评估' }],
    summary: raw.summary || '已完成AI分析，建议结合具体尽调数据进一步验证。',
    missingData,
    evaluationModel: raw.evaluationModel || 'MiniMax AI 大模型分析',
  };
}

export async function callExternalLLM(project, reportText = '') {
  const settings = getAISettings();

  // 如果AI未启用或没有API密钥，回退到本地评估
  if (settings.ai_enabled !== 'true' || !settings.ai_api_key) {
    return {
      result: evaluateMineProject(project),
      model: 'zijin-evaluation-v1',
      tokenUsage: null,
      error: settings.ai_enabled !== 'true' ? 'AI分析已禁用' : '未配置API密钥',
    };
  }

  const apiBase = settings.ai_api_base || 'https://api.minimaxi.com/v1';
  const model = settings.ai_model || 'MiniMax-M2.7';
  const maxTokens = parseInt(settings.ai_max_tokens) || 4096;
  const temperature = parseFloat(settings.ai_temperature) || 0.3;

  try {
    const prompt = buildPrompt(project, reportText);

    const response = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.ai_api_key}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        max_tokens: maxTokens,
        temperature,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`MiniMax API ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    if (!content) {
      throw new Error('MiniMax返回内容为空');
    }

    // 提取JSON（可能被markdown代码块包裹）
    let jsonStr = content.trim();
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }

    // 有时模型会在JSON前后添加文字，尝试找第一个{和最后一个}
    const firstBrace = jsonStr.indexOf('{');
    const lastBrace = jsonStr.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
    }

    const rawAnalysis = JSON.parse(jsonStr);
    const analysis = normalizeAnalysis(rawAnalysis, project);

    return {
      result: analysis,
      model: model,
      tokenUsage: data.usage || null,
      error: null,
    };
  } catch (err) {
    console.error('[AI Provider] 外部大模型调用失败:', err.message);
    // 失败时回退到本地评估
    return {
      result: evaluateMineProject(project),
      model: 'zijin-evaluation-v1',
      tokenUsage: null,
      error: err.message,
    };
  }
}
