import { Router } from 'express';
import db from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { evaluateMineProject, STAGE_MAP, detectMissingData } from '../lib/mine-evaluation.js';
import { callExternalLLM, getAISettings } from '../lib/ai-provider.js';

const router = Router();

// POST /api/mine-analysis/analyze — AI分析矿产项目
router.post('/analyze', requireAuth, async (req, res) => {
  try {
    const { project_id, report_text, analysis_type = 'value_assessment' } = req.body;

    let project = null;
    if (project_id) {
      project = db.prepare('SELECT * FROM mine_projects WHERE id = ? AND status = ?').get(project_id, 'active');
      if (!project) return res.status(404).json({ error: '项目不存在' });
    }

    // 使用外部大模型或本地评价体系进行AI分析
    let llmResult;
    if (project) {
      llmResult = await callExternalLLM(project, report_text || '');
    } else {
      llmResult = {
        result: generateGenericAnalysis(report_text || '', analysis_type),
        model: 'local-generic',
        tokenUsage: null,
        error: null,
      };
    }
    const analysis = llmResult.result;
    const modelUsed = llmResult.model;

    const result = db.prepare(`
      INSERT INTO ai_analyses (user_id, project_id, analysis_type, content, ai_score, model_used, token_usage)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id,
      project_id || null,
      analysis_type,
      JSON.stringify(analysis),
      analysis.overallScore,
      modelUsed,
      JSON.stringify(llmResult.tokenUsage || { input: report_text ? report_text.length : 500, output: JSON.stringify(analysis).length })
    );

    // 同步更新项目表的AI评分和分级
    if (project_id) {
      try {
        db.prepare(`UPDATE mine_projects SET ai_score = ?, ai_grade = ?, ai_summary = ?, updated_at = datetime('now') WHERE id = ?`)
          .run(analysis.overallScore, analysis.grade || null, analysis.summary || null, project_id);
      } catch (e) { console.error('[mine-analysis] 更新项目AI评分失败:', e.message); }
    }

    res.json({ id: result.lastInsertRowid, analysis, model: modelUsed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/mine-analysis/analyze-text — 基于文本的AI分析（不上传项目）
router.post('/analyze-text', requireAuth, async (req, res) => {
  try {
    const { report_text, mineral_type, development_stage, extract_mode, report_ids, project_id } = req.body;

    // 如果是提取模式且有报告ID，从数据库获取已提取的PDF文本
    let combinedText = report_text || '';

    if (report_ids && Array.isArray(report_ids) && report_ids.length > 0) {
      const placeholders = report_ids.map(() => '?').join(',');
      const reports = db.prepare(
        `SELECT id, original_filename, extracted_text FROM mine_reports WHERE id IN (${placeholders})`
      ).all(...report_ids);

      const textParts = [];
      for (const report of reports) {
        if (report.extracted_text) {
          textParts.push(`=== ${report.original_filename} ===\n${report.extracted_text.substring(0, 10000)}`);
        } else {
          textParts.push(`=== ${report.original_filename} ===\n（该文件未能提取文本内容）`);
        }
      }
      if (textParts.length > 0) {
        combinedText = textParts.join('\n\n');
      }
    }

    if (!combinedText) return res.status(400).json({ error: '报告文本不能为空' });

    // 提取模式：专门用于从资料中提取结构化核心信息
    if (extract_mode) {
      const extractResult = await performExtraction(combinedText, mineral_type);
      return res.json({ id: 0, analysis: extractResult, model: 'minimax-extract' });
    }

    // 构造虚拟项目对象进行评价
    const mockProject = {
      development_stage: development_stage || 'detailed-exploration',
      mineral_types: mineral_type || 'gold',
      estimated_reserve: combinedText,
      reserve_grade: combinedText,
      description: combinedText,
      mine_type: 'underground',
      area_km2: 0,
      province: '',
      license_expires: null,
    };

    const llmResult = await callExternalLLM(mockProject, combinedText);
    const analysis = llmResult.result;

    const result = db.prepare(`
      INSERT INTO ai_analyses (user_id, project_id, analysis_type, content, ai_score, model_used, token_usage)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id,
      project_id || null,
      'text_analysis',
      JSON.stringify(analysis),
      analysis.overallScore,
      llmResult.model,
      JSON.stringify(llmResult.tokenUsage || { input: combinedText.length, output: JSON.stringify(analysis).length })
    );

    // 同步更新项目表的AI评分
    if (project_id) {
      try {
        db.prepare(`UPDATE mine_projects SET ai_score = ?, ai_grade = ?, ai_summary = ?, updated_at = datetime('now') WHERE id = ? AND status = 'active'`)
          .run(analysis.overallScore, analysis.grade || null, analysis.summary || null, project_id);
      } catch (e) { console.error('[mine-analysis] 更新项目AI评分失败:', e.message); }
    }

    res.json({ id: result.lastInsertRowid, analysis, model: llmResult.model });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/mine-analysis/chat — AI咨询对话
router.post('/chat', requireAuth, (req, res) => {
  try {
    const { project_id, message } = req.body;
    if (!message) return res.status(400).json({ error: '消息不能为空' });

    db.prepare('INSERT INTO ai_conversations (user_id, project_id, role, content) VALUES (?, ?, ?, ?)')
      .run(req.user.id, project_id || null, 'user', message);

    const reply = generateChatReply(message, project_id);
    db.prepare('INSERT INTO ai_conversations (user_id, project_id, role, content) VALUES (?, ?, ?, ?)')
      .run(req.user.id, project_id || null, 'assistant', reply);

    res.json({ reply });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mine-analysis/project/:id — 查询某个项目的最新AI分析结果
router.get('/project/:id', requireAuth, (req, res) => {
  try {
    const projectId = req.params.id;
    const project = db.prepare('SELECT * FROM mine_projects WHERE id = ? AND status = ?').get(projectId, 'active');
    if (!project) return res.status(404).json({ error: '项目不存在' });
    // 权限：非管理员需为项目创建者或工作组成员
    if (req.user.role !== 'admin' && project.owner_id !== req.user.id) {
      const inWg = db.prepare('SELECT 1 FROM workgroup_members WHERE workgroup_id = ? AND user_id = ?').get(project.workgroup_id, req.user.id);
      if (!inWg) return res.status(403).json({ error: '无权访问' });
    }
    // 取最新一条分析记录
    const analysis = db.prepare(
      'SELECT * FROM ai_analyses WHERE project_id = ? ORDER BY created_at DESC LIMIT 1'
    ).get(projectId);
    res.json({ analysis: analysis || null, project });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mine-analysis/history — 分析历史
router.get('/history', requireAuth, (req, res) => {
  try {
    const analyses = db.prepare('SELECT * FROM ai_analyses WHERE user_id = ? ORDER BY created_at DESC LIMIT 20').all(req.user.id);
    res.json({ analyses });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mine-analysis/missing-data?project_id=xxx — 返回项目缺失数据清单
router.get('/missing-data', requireAuth, (req, res) => {
  try {
    const { project_id } = req.query;
    if (!project_id) return res.status(400).json({ error: 'project_id 必填' });
    const project = db.prepare('SELECT * FROM mine_projects WHERE id = ? AND status = ?').get(project_id, 'active');
    if (!project) return res.status(404).json({ error: '项目不存在' });
    // 权限检查：非管理员只能访问自己所在工作组或自己创建的项目
    if (req.user.role !== 'admin') {
      if (project.owner_id !== req.user.id) {
        const inWg = db.prepare('SELECT 1 FROM workgroup_members WHERE workgroup_id = ? AND user_id = ?').get(project.workgroup_id, req.user.id);
        if (!inWg) return res.status(403).json({ error: '无权访问' });
      }
    }
    const missing = detectMissingData(project);
    res.json({ missingData: missing, count: missing.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mine-analysis/stage-criteria — 返回紫金矿业评价准则
router.get('/stage-criteria', (req, res) => {
  try {
    const criteria = {
      grassroots: {
        name: '草根勘查项目',
        code: 'grassroots',
        dimensions: [
          { name: '成矿背景条件', max: 5, desc: '项目是否位于全球重点成矿带上' },
          { name: '业主公司背景', max: 5, desc: '业主是否为上市公司' },
          { name: '区域矿床情况', max: 10, desc: '周边是否有大型矿床（Cu>50万t或Au>20t）' },
          { name: '区域矿山运营情况', max: 20, desc: '周边是否有运营矿山及协同情况' },
          { name: '矿权面积', max: 10, desc: '有效探矿权面积大小' },
          { name: '可验证的钻探靶区/靶位', max: 20, desc: '地质/物探/化探异常验证程度' },
          { name: '见矿工程', max: 30, desc: '有经济意义的见矿工程数量' },
        ],
      },
      'early-exploration': {
        name: '初级勘查项目',
        code: 'early-exploration',
        dimensions: [
          { name: '预期勘查意义', max: 50, desc: '是否可生成勘查目标及目标质量' },
          { name: '预期经济意义', max: 50, desc: '预期资源量的经济价值判断' },
        ],
      },
      'advanced-exploration': {
        name: '高级勘查项目',
        code: 'advanced-exploration',
        dimensions: [
          { name: '定义资源量规模', max: 10, desc: 'Cu≥100万t或Au≥100t为基本要求' },
          { name: '开采方式', max: 20, desc: '露采/自然崩落条件（折Au品位、剥采比）' },
          { name: '地采条件', max: 10, desc: '地采品位及米克吨值' },
          { name: '高品位区', max: 10, desc: '是否有连续高品位矿块（>平均品位3倍）' },
          { name: '可选性', max: 30, desc: '选矿难易程度及回收率' },
          { name: '扩展勘查意义', max: 10, desc: '预期新增资源与已定义资源比值' },
          { name: '钻探靶区', max: 10, desc: '可验证异常及见矿概率' },
        ],
      },
      'feasibility-study': {
        name: '技术研究项目',
        code: 'feasibility-study',
        dimensions: [
          { name: '资源储量规模', max: 20, desc: '报告/核实的资源储量大小' },
          { name: '净现值NPV', max: 15, desc: '（预）可研报告的净现值，>5亿美元为佳' },
          { name: '内部收益率IRR', max: 15, desc: '（预）可研报告的IRR，>30%为佳' },
          { name: '成本优势', max: 20, desc: '在全球同类矿山成本曲线中的分位值' },
          { name: '产能规模', max: 15, desc: '年产量规模（折算为铜）' },
          { name: '矿山寿命', max: 15, desc: '报告或排产的矿山寿命，≥10年为佳' },
        ],
      },
      production: {
        name: '矿山运营/生产阶段',
        code: 'production',
        dimensions: [
          { name: '剩余生命周期', max: 20, desc: '预期或排产的矿山剩余寿命' },
          { name: '勘查/增储潜力', max: 15, desc: '剩余增储年限及潜力' },
          { name: '成本分位值', max: 20, desc: '在全球同类矿山成本曲线中的位置' },
          { name: '管理提升空间', max: 15, desc: '矿山经营管理是否有降本空间' },
          { name: '现有生产规模', max: 15, desc: '设计产能或实际生产规模' },
          { name: '扩产潜力', max: 15, desc: '通过技改的扩产潜力' },
        ],
      },
    };
    res.json({ criteria });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

function generateGenericAnalysis(text, type) {
  const baseScore = Math.round((55 + (text.length % 30)) * 10) / 10;
  return {
    overallScore: baseScore,
    stage: { code: 'advanced-exploration', name: '高级勘查项目', phase: 3 },
    dimensions: [
      { name: '资源量规模', score: Math.round(baseScore * 0.1), max: 10, weight: 10, note: '基于文本估算' },
      { name: '开采条件', score: Math.round(baseScore * 0.15), max: 20, weight: 20, note: '基于文本估算' },
      { name: '可选性', score: Math.round(baseScore * 0.2), max: 30, weight: 30, note: '基于文本估算' },
      { name: '高品位区', score: Math.round(baseScore * 0.08), max: 10, weight: 10, note: '基于文本估算' },
      { name: '扩展勘查意义', score: Math.round(baseScore * 0.08), max: 10, weight: 10, note: '基于文本估算' },
      { name: '综合评价', score: Math.round(baseScore * 0.15), max: 20, weight: 20, note: '基于文本估算' },
    ],
    financials: {
      oreTons: 0, annualCapacity: 0, mineLife: 0,
      annualRevenue: 0, annualCashFlow: 0, totalCapex: 0,
      npv: 0, irr: 0, payback: 0, cashCost: 0, aisc: 0,
      operatingCostPerTon: 0, costQuartile: 50,
    },
    risks: [
      { category: '信息风险', level: '中', detail: '基于文本分析，未关联具体项目数据，建议进一步核实' },
    ],
    recommendations: [
      '建议将报告上传至具体项目，获取更精准的五阶段评价分析',
      '重点关注资源储量核实、选矿试验数据及矿权证照完整性',
    ],
    disposalAdvice: [
      { option: '整体转让', suitability: '中', note: '适合有完整开发能力的矿业企业' },
      { option: '合作开发', suitability: '高', note: '分摊风险，共享收益' },
      { option: '引入战略投资人', suitability: '中', note: '获得资金及技术支持' },
    ],
    summary: `基于文本的初步分析，项目评分${baseScore}分。由于缺乏具体项目参数，财务指标未估算。建议关联具体项目以获取完整的紫金矿业五阶段评价。`,
    evaluationModel: '紫金矿业五阶段评价体系（文本模式）',
  };
}

function generateChatReply(message, projectId) {
  const msg = message.toLowerCase();

  if (msg.includes('npv') || msg.includes('净现值')) {
    return '净现值（NPV）是矿业项目财务评价的核心指标。根据紫金矿业标准，技术研究阶段项目NPV超过5亿美元可获得满分评价。NPV计算需基于合理的金属价格假设（如Au 2000 USD/oz、Cu 8500 USD/t）和折现率（通常5%-8%）。';
  }
  if (msg.includes('irr') || msg.includes('收益率') || msg.includes('内部收益率')) {
    return '内部收益率（IRR）反映项目的投资回报水平。紫金矿业评价标准中，IRR超过30%为优秀。对于成熟运营项目，IRR高于15%即具备较好的投资价值。需注意IRR对投产时间和成本超支较为敏感。';
  }
  if (msg.includes('成本') || msg.includes('aisc') || msg.includes('cash cost')) {
    return 'All-In Sustaining Cost（AISC）是衡量矿山综合成本竞争力的关键指标。紫金矿业要求项目成本位于全球同类矿山成本曲线的前50%分位。对于金矿，AISC低于1000 USD/oz为优秀；对于铜矿，低于2.0 USD/lb为良好。';
  }
  if (msg.includes('阶段') || msg.includes('评价') || msg.includes('评分')) {
    return '紫金矿业五阶段评价体系覆盖项目全生命周期：1）草根勘查项目（100分制，侧重成矿背景和靶区）；2）初级勘查项目（侧重发现孔价值）；3）高级勘查项目（侧重资源量和开采条件）；4）技术研究项目（侧重NPV/IRR和成本）；5）矿山运营阶段（侧重剩余寿命和成本分位）。每个阶段评价维度不同，建议根据项目实际阶段选择对应标准。';
  }
  if (msg.includes('风险')) {
    return '矿业项目主要风险包括：技术风险（地质条件、开采难度）、融资风险（资本开支规模）、产品价格风险（金属价格波动）、运营风险（基础设施、物流、人员）和资源枯竭风险。紫金矿业评价标准建议在不同阶段重点关注不同风险：勘查阶段关注资源不确定性，运营阶段关注成本控制和接替资源。';
  }
  if (msg.includes('处置') || msg.includes('转让') || msg.includes('合作') || msg.includes('开发')) {
    return '矿产项目常见处置方式包括：整体转让（适合可研后项目，价值确定性高）、合作开发（适合大额资本开支项目，分摊风险）、技术入股（适合勘查阶段，降低前期投入）、控股权转让（适合运营期项目，保留一定权益）、托管运营（适合管理提升空间大的项目）。具体选择需结合项目阶段、评分结果和买方资源禀赋综合判断。';
  }

  const responses = [
    '根据紫金矿业评价标准，该项目可参照五阶段评价体系进行系统评估。建议重点关注资源储量核实、开采技术条件及财务指标（NPV/IRR/AISC）。',
    '从成矿背景看，若项目位于重点成矿带（如胶东、三江、冈底斯等），草根勘查阶段的成矿背景条件可获得较高评分。',
    '对于高级勘查项目，选矿回收率是关键指标。难选冶矿石（回收率<50%）在可选性维度将被判为0分，需格外关注。',
    '建议结合财务模型进行敏感性分析，重点关注金属价格波动对NPV和IRR的影响，以及成本超支情景下的项目韧性。',
  ];
  return responses[Math.floor(Math.random() * responses.length)];
}

// ---------------------------------------------------------------------------
// 核心信息提取函数
// ---------------------------------------------------------------------------

async function performExtraction(textContent, mineralType) {
  const settings = getAISettings();

  // 如果AI未启用，直接返回错误
  if (settings.ai_enabled !== 'true' || !settings.ai_api_key) {
    throw new Error('AI服务未启用或未配置API密钥，无法进行智能提取。请在管理后台配置AI服务。');
  }

  const apiBase = settings.ai_api_base || 'https://api.minimaxi.com/v1';
  const model = settings.ai_model || 'MiniMax-M2.7';

  const extractSystemPrompt = `你是一位矿业数据提取专家。请从提供的矿业资料文本中精确提取核心结构化信息。
只输出JSON格式，不要包含任何其他文字或markdown代码块标记。
返回格式如下：
{
  "extractedFields": {
    "project_name": "项目名称（从标题或正文中提取）",
    "mineral_types": "矿种（如金矿、铜矿、铅锌矿等）",
    "province": "省份",
    "city": "城市/州/县",
    "area_km2": "矿权面积（数字，单位km²）",
    "estimated_reserve": "估算储量（含单位，如'金金属量12.5吨'）",
    "reserve_grade": "品位（含单位，如'3.52 g/t'）",
    "depth_range": "矿体深度范围",
    "mine_type": "矿山类型（露天open-pit/地下underground/联合combined）",
    "development_stage": "开发阶段",
    "license_status": "证照状态",
    "asking_price": "报价或交易对价",
    "description": "项目简要描述（100字以内）"
  },
  "summary": "50字以内的资料核心内容摘要"
}
注意：
- 如果某个字段无法从资料中提取到，该字段值设为null，不要编造
- 矿种、储量、品位是关键信息，务必仔细查找
- 企业名称、地区信息通常出现在报告开头
- 储量和品位可能以表格或正文形式出现
- 必须严格返回合法JSON`;

  const userPrompt = mineralType
    ? `已知矿种提示：${mineralType}\n\n请从以下矿业资料中提取核心信息：\n\n${textContent.substring(0, 8000)}`
    : `请从以下矿业资料中提取核心信息：\n\n${textContent.substring(0, 8000)}`;

  try {
    const response = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.ai_api_key}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: extractSystemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 4096,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`API ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    if (!content) throw new Error('AI返回内容为空');

    // 提取JSON
    let jsonStr = content.trim();
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();

    const firstBrace = jsonStr.indexOf('{');
    const lastBrace = jsonStr.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
    }

    const parsed = JSON.parse(jsonStr);

    return {
      extractedFields: parsed.extractedFields || parsed.fields || {},
      summary: parsed.summary || '',
    };
  } catch (err) {
    console.error('[mine-analysis] AI提取失败:', err.message);
    throw new Error('AI服务连接失败：' + err.message + '。请检查AI服务配置或稍后重试。');
  }
}

export default router;
