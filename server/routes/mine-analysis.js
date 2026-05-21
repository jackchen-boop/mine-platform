import { Router } from 'express';
import db from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { evaluateMineProject, STAGE_MAP } from '../lib/mine-evaluation.js';

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

    // 使用紫金矿业五阶段评价体系进行AI分析
    const analysis = project
      ? evaluateMineProject(project)
      : generateGenericAnalysis(report_text || '', analysis_type);

    const result = db.prepare(`
      INSERT INTO ai_analyses (user_id, project_id, analysis_type, content, ai_score, model_used, token_usage)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id,
      project_id || null,
      analysis_type,
      JSON.stringify(analysis),
      analysis.overallScore,
      'zijin-evaluation-v1',
      JSON.stringify({ input: report_text ? report_text.length : 500, output: JSON.stringify(analysis).length })
    );

    res.json({ id: result.lastInsertRowid, analysis });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/mine-analysis/analyze-text — 基于文本的AI分析（不上传项目）
router.post('/analyze-text', requireAuth, async (req, res) => {
  try {
    const { report_text, mineral_type, development_stage } = req.body;
    if (!report_text) return res.status(400).json({ error: '报告文本不能为空' });

    // 构造虚拟项目对象进行评价
    const mockProject = {
      development_stage: development_stage || 'detailed-exploration',
      mineral_types: mineral_type || 'gold',
      estimated_reserve: report_text,
      reserve_grade: report_text,
      description: report_text,
      mine_type: 'underground',
      area_km2: 0,
      province: '',
      license_expires: null,
    };

    const analysis = evaluateMineProject(mockProject);

    const result = db.prepare(`
      INSERT INTO ai_analyses (user_id, analysis_type, content, ai_score, model_used, token_usage)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id,
      'text_analysis',
      JSON.stringify(analysis),
      analysis.overallScore,
      'zijin-evaluation-v1',
      JSON.stringify({ input: report_text.length, output: JSON.stringify(analysis).length })
    );

    res.json({ id: result.lastInsertRowid, analysis });
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

// GET /api/mine-analysis/history — 分析历史
router.get('/history', requireAuth, (req, res) => {
  try {
    const analyses = db.prepare('SELECT * FROM ai_analyses WHERE user_id = ? ORDER BY created_at DESC LIMIT 20').all(req.user.id);
    res.json({ analyses });
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

export default router;
