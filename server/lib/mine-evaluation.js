/**
 * 紫金矿业标准 — 矿产项目投资价值评价引擎
 * 基于《矿业项目评价准则》五阶段评价体系 + 财务模型模板关键指标
 */

// ============================================================================
// 阶段映射
// ============================================================================
const STAGE_MAP = {
  'prospecting':          { name: '草根勘查项目',   code: 'grassroots',         phase: 1 },
  'general-exploration':  { name: '初级勘查项目',   code: 'early-exploration',  phase: 2 },
  'detailed-exploration': { name: '高级勘查项目',   code: 'advanced-exploration', phase: 3 },
  'feasibility':          { name: '技术研究项目',   code: 'feasibility-study',  phase: 4 },
  'development':          { name: '技术研究项目',   code: 'feasibility-study',  phase: 4 },
  'production-ready':     { name: '矿山运营/生产阶段', code: 'production',        phase: 5 },
  'production':           { name: '矿山运营/生产阶段', code: 'production',        phase: 5 },
};

// 重点成矿带（中国境内）
const MAJOR_METALLOGENIC_BELTS = [
  '山东', '胶东', '云南', '三江', '西藏', '冈底斯', '江西', '德兴',
  '内蒙古', '东升庙', '甘肃', '阳山', '新疆', '阿尔泰', '湖南', '水口山',
  '河南', '小秦岭', '陕西', '秦岭', '贵州', '黔西南',
];

// 全球重点成矿带关键词
const GLOBAL_MAJOR_BELTS = [
  '安第斯', '环太平洋', '特提斯', '中非', '西澳', '加拿大', '内华达',
  '智利', '秘鲁', '刚果金', '赞比亚', '巴布亚新几内亚', 'kamoa',
];

// ============================================================================
// 工具函数
// ============================================================================

function extractMetalTons(estimatedReserve) {
  if (!estimatedReserve) return { cu: 0, au: 0, ag: 0, pb: 0, zn: 0, other: 0 };
  const text = estimatedReserve;
  const result = { cu: 0, au: 0, ag: 0, pb: 0, zn: 0, other: 0 };

  // Cu: xxx万吨 / xxx万t
  const cuMatch = text.match(/Cu\s*(\d+\.?\d*)\s*万/);
  if (cuMatch) result.cu = parseFloat(cuMatch[1]);

  // Au: xx吨金 / Au xx吨 / xx吨金金属量
  const auMatch = text.match(/Au\s*(\d+\.?\d*)\s*吨/) || text.match(/(\d+\.?\d*)\s*吨\s*金/) || text.match(/金金属量\s*(\d+\.?\d*)/);
  if (auMatch) result.au = parseFloat(auMatch[1]);

  // Ag: Ag xxx吨 / 银 xxx吨
  const agMatch = text.match(/Ag\s*(\d+\.?\d*)\s*吨/) || text.match(/银\s*(\d+\.?\d*)\s*吨/);
  if (agMatch) result.ag = parseFloat(agMatch[1]);

  // Pb/Zn
  const pbMatch = text.match(/Pb\s*(\d+\.?\d*)\s*万/);
  if (pbMatch) result.pb = parseFloat(pbMatch[1]);
  const znMatch = text.match(/Zn\s*(\d+\.?\d*)\s*万/);
  if (znMatch) result.zn = parseFloat(znMatch[1]);

  return result;
}

function extractGrade(reserveGrade) {
  if (!reserveGrade) return { au: 0, cu: 0, ag: 0 };
  const result = { au: 0, cu: 0, ag: 0 };

  const auMatch = reserveGrade.match(/Au\s*(\d+\.?\d*)\s*g\/t/);
  if (auMatch) result.au = parseFloat(auMatch[1]);

  const cuMatch = reserveGrade.match(/Cu\s*(\d+\.?\d*)\s*%/);
  if (cuMatch) result.cu = parseFloat(cuMatch[1]);

  const agMatch = reserveGrade.match(/Ag\s*(\d+\.?\d*)\s*g\/t/);
  if (agMatch) result.ag = parseFloat(agMatch[1]);

  return result;
}

function isInMajorBelt(project) {
  const text = `${project.province || ''} ${project.city || ''} ${project.description || ''}`;
  return MAJOR_METALLOGENIC_BELTS.some(b => text.includes(b)) ||
         GLOBAL_MAJOR_BELTS.some(b => text.toLowerCase().includes(b.toLowerCase()));
}

function isZijinFocusBelt(project) {
  // 紫金聚焦区域
  const text = `${project.province || ''} ${project.city || ''} ${project.description || ''}`;
  const zijinFocus = ['刚果金', '赞比亚', '巴布亚新几内亚', 'kamoa', '哥伦比亚', '阿根廷', '西藏', '巨龙', '塞紫'];
  return zijinFocus.some(b => text.toLowerCase().includes(b.toLowerCase()));
}

function descriptionKeywords(project, keywords) {
  const text = (project.description || '').toLowerCase();
  return keywords.filter(k => text.includes(k.toLowerCase()));
}

function estimateMineLife(oreTons, annualCapacity = 50) {
  // 粗略估算矿山服务年限（万吨规模）
  if (!oreTons || oreTons <= 0) return 0;
  return Math.round(oreTons / annualCapacity * 10) / 10;
}

function estimateAnnualCapacity(oreTons) {
  // 根据储量估算合理年产能（万吨）
  if (oreTons >= 1000) return 150;
  if (oreTons >= 500) return 100;
  if (oreTons >= 200) return 50;
  if (oreTons >= 50) return 30;
  return 10;
}

function estimateRecoverableOre(oreTons, lossRate = 0.15, dilutionRate = 0.15) {
  // 可采出金属量估算 = 矿石量 * (1 - 损失率)
  if (!oreTons) return 0;
  return oreTons * (1 - lossRate);
}

// ============================================================================
// 财务指标估算（基于财务模型模板）
// ============================================================================

function estimateFinancials(project, metals) {
  const grade = extractGrade(project.reserve_grade);
  const oreTons = extractOreTons(project.estimated_reserve, project.reserve_grade, metals);
  const annualCap = estimateAnnualCapacity(oreTons);
  const mineLife = estimateMineLife(oreTons, annualCap);

  // 简化财务模型参数（基于国内矿山经验数据）
  const commodityPrice = { au: 2000, cu: 8500, ag: 25 }; // USD/oz, USD/t, USD/oz
  const recovery = { au: 0.92, cu: 0.88, ag: 0.75 };
  const operatingCostPerTon = project.mine_type === 'open-pit' ? 20 : 38; // USD/t
  const capitalIntensity = project.mine_type === 'open-pit' ? 280 : 420; // USD/t 年产能

  // 年产量估算
  const annualOre = annualCap * 10000; // 转为吨
  const annualAu = annualOre * (grade.au / 1e6) * recovery.au * 32150.7; // 盎司
  const annualCu = annualOre * (grade.cu / 100) * recovery.cu; // 吨
  const annualAg = annualOre * (grade.ag / 1e6) * recovery.ag * 32150.7; // 盎司

  const annualRevenue = (annualAu * commodityPrice.au) + (annualCu * commodityPrice.cu) + (annualAg * commodityPrice.ag);
  const annualOpCost = annualOre * operatingCostPerTon;
  const annualRoyalty = annualRevenue * 0.03;
  const annualTax = Math.max(0, (annualRevenue - annualOpCost - annualRoyalty) * 0.25);

  const totalCapex = annualCap * 10000 * capitalIntensity / 1e6; // 百万美元
  const totalOpex = annualOpCost * mineLife / 1e6;
  const totalRevenue = annualRevenue * mineLife / 1e6;
  const totalTax = annualTax * mineLife / 1e6;

  // 简化NPV估算（5%折现率）
  const annualCashFlow = (annualRevenue - annualOpCost - annualRoyalty - annualTax) / 1e6;
  let npv = -totalCapex;
  for (let y = 1; y <= mineLife; y++) {
    npv += annualCashFlow / Math.pow(1.05, y);
  }

  // 简化IRR估算（牛顿法过于复杂，用线性近似）
  const irrApprox = mineLife > 0 && totalCapex > 0
    ? Math.min(0.50, Math.max(0.05, (annualCashFlow / totalCapex) * 0.8))
    : 0.08;

  // 判断主要矿种及成本计算方式
  const types = (project.mineral_types || '').split(',');
  const isCopperDominant = types.includes('copper') && (annualCu * commodityPrice.cu > annualAu * commodityPrice.au);
  const isSilverDominant = types.includes('silver') && !types.includes('gold') && (annualAg * commodityPrice.ag > annualCu * commodityPrice.cu);

  // Cash Cost & AISC 计算
  let cashCost, aisc, aiscUnit;
  const sustainingCapex = totalCapex * 0.02 * Math.max(1, mineLife);
  const totalCost = annualOpCost + annualRoyalty + sustainingCapex * 1e6 / Math.max(1, mineLife);

  if (isCopperDominant && annualCu > 0) {
    // 铜矿：USD/lb Cu
    const annualCuLbs = annualCu * 2204.62;
    cashCost = annualCuLbs > 0 ? (annualOpCost + annualRoyalty) / annualCuLbs : 0;
    aisc = annualCuLbs > 0 ? totalCost / annualCuLbs : 0;
    aiscUnit = 'USD/lb Cu';
  } else if (isSilverDominant && annualAg > 0) {
    // 银矿：USD/oz Ag
    cashCost = annualAg > 0 ? (annualOpCost + annualRoyalty) / annualAg : 0;
    aisc = annualAg > 0 ? totalCost / annualAg : 0;
    aiscUnit = 'USD/oz Ag';
  } else {
    // 金矿或其他：USD/oz Au Eq
    const totalAuEqOz = annualAu + annualAg * 0.012 + annualCu / 63.5 * 32150.7 * 0.004;
    cashCost = totalAuEqOz > 0 ? (annualOpCost + annualRoyalty) / totalAuEqOz : 0;
    aisc = totalAuEqOz > 0 ? totalCost / totalAuEqOz : 0;
    aiscUnit = 'USD/oz Au Eq';
  }

  return {
    oreTons,
    annualCapacity: annualCap, // 万吨/年
    mineLife, // 年
    annualRevenue: Math.round(annualRevenue / 1e6 * 100) / 100, // 百万美元
    annualCashFlow: Math.round(annualCashFlow * 100) / 100, // 百万美元
    totalCapex: Math.round(totalCapex * 100) / 100, // 百万美元
    npv: Math.round(npv * 100) / 100, // 百万美元
    irr: Math.round(irrApprox * 1000) / 10, // %
    payback: annualCashFlow > 0 ? Math.round(totalCapex / annualCashFlow * 10) / 10 : 0, // 年
    cashCost: Math.round(cashCost * 100) / 100,
    aisc: Math.round(aisc * 100) / 100,
    aiscUnit,
    operatingCostPerTon,
    costQuartile: estimateCostQuartile(aisc, project.mineral_types),
    primaryMineral: isCopperDominant ? 'copper' : (isSilverDominant ? 'silver' : 'gold'),
  };
}

function extractOreTons(estimatedReserve, reserveGrade, metals) {
  if (!estimatedReserve) return 0;

  // 1. 优先匹配明确的矿石量/资源量描述，如"矿石资源量 4560.22 万吨"
  const oreMatch = estimatedReserve.match(/(?:矿石量|矿石资源量|资源量|储量)\s*(\d+\.?\d*)\s*[万]/);
  if (oreMatch) return parseFloat(oreMatch[1]);

  // 2. 若未直接给出矿石量，尝试从金属量和品位反推
  const grade = extractGrade(reserveGrade);

  if (grade.au > 0 && metals.au > 0) {
    // 金属量(吨) -> g; 品位 g/t -> 矿石量(万吨)
    const oreTons = (metals.au * 1000 * 1000) / grade.au / 10000;
    if (oreTons > 0) return Math.round(oreTons * 100) / 100;
  }
  if (grade.cu > 0 && metals.cu > 0) {
    // Cu金属量(万吨) = 矿石量(万吨) * 品位(%) / 100
    const oreTons = metals.cu / (grade.cu / 100);
    if (oreTons > 0) return Math.round(oreTons * 100) / 100;
  }
  if (grade.ag > 0 && metals.ag > 0) {
    // Ag金属量(吨) -> g; 品位 g/t -> 矿石量(万吨)
    const oreTons = (metals.ag * 1000 * 1000) / grade.ag / 10000;
    if (oreTons > 0) return Math.round(oreTons * 100) / 100;
  }
  // Pb+Zn 合计反推
  const gradePbZn = (reserveGrade || '').match(/Pb\+Zn\s*(\d+\.?\d*)\s*%/);
  if (gradePbZn && (metals.pb > 0 || metals.zn > 0)) {
    const totalPbZn = metals.pb + metals.zn;
    const oreTons = totalPbZn / (parseFloat(gradePbZn[1]) / 100);
    if (oreTons > 0) return Math.round(oreTons * 100) / 100;
  }

  return 0;
}

function estimateCostQuartile(aisc, mineralTypes) {
  if (!aisc || aisc <= 0) return 75;
  const isGold = (mineralTypes || '').includes('gold');
  const isCopper = (mineralTypes || '').includes('copper');

  if (isGold) {
    if (aisc < 800) return 15;
    if (aisc < 1000) return 35;
    if (aisc < 1200) return 55;
    if (aisc < 1400) return 75;
    return 90;
  }
  if (isCopper) {
    if (aisc < 1.5) return 15;
    if (aisc < 2.0) return 35;
    if (aisc < 2.5) return 55;
    if (aisc < 3.0) return 75;
    return 90;
  }
  return 50;
}

// ============================================================================
// 各阶段评分引擎
// ============================================================================

function scoreGrassroots(project, metals, fin) {
  const desc = project.description || '';
  const scores = {};

  // 1. 成矿背景条件 (5分)
  if (isZijinFocusBelt(project)) scores.metallogenic = 5;
  else if (isInMajorBelt(project)) scores.metallogenic = 3;
  else scores.metallogenic = 0;

  // 2. 业主公司背景 (5分) — 目前都是平台发布，默认给3分
  scores.ownerBackground = 3;

  // 3. 区域矿床情况 (10分)
  if (metals.cu > 50 || metals.au > 20) scores.nearbyDeposits = 8;
  else if (metals.cu > 20 || metals.au > 10) scores.nearbyDeposits = 5;
  else if (metals.cu > 5 || metals.au > 3) scores.nearbyDeposits = 3;
  else scores.nearbyDeposits = 0;

  // 4. 区域矿山运营情况 (20分)
  const hasOperatingMine = descriptionKeywords(project, ['运营', '生产', '开采', '选厂', '矿山']).length > 0;
  if (hasOperatingMine) scores.nearbyMines = 15;
  else if (isInMajorBelt(project)) scores.nearbyMines = 8;
  else scores.nearbyMines = 2;

  // 5. 矿权面积 (10分)
  const area = project.area_km2 || 0;
  if (area >= 500) scores.licenseArea = 10;
  else if (area >= 200) scores.licenseArea = 7;
  else if (area >= 100) scores.licenseArea = 4;
  else if (area >= 10) scores.licenseArea = 2;
  else scores.licenseArea = 0;

  // 6. 可验证的钻探靶区/靶位 (20分)
  const targetKeywords = ['靶区', '靶位', '异常', '物探', '化探', '钻探', '见矿', '矿化'];
  const targetMatches = descriptionKeywords(project, targetKeywords).length;
  scores.drillTargets = Math.min(20, targetMatches * 5);

  // 7. 见矿工程 (30分)
  const oreKeywords = ['矿体', '矿化', '见矿', '品位', '储量', '资源量', '勘查', '详查'];
  const oreMatches = descriptionKeywords(project, oreKeywords).length;
  scores.intersections = Math.min(30, oreMatches * 6);

  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  const max = 100;

  return {
    dimensions: [
      { name: '成矿背景条件', score: scores.metallogenic, max: 5, weight: 5, note: isZijinFocusBelt(project) ? '位于紫金聚集的重点成矿带' : (isInMajorBelt(project) ? '位于全球重点成矿带' : '非重点成矿带') },
      { name: '业主公司背景', score: scores.ownerBackground, max: 5, weight: 5, note: '平台挂牌项目' },
      { name: '区域矿床情况', score: scores.nearbyDeposits, max: 10, weight: 10, note: metals.cu > 0 ? `Cu ${metals.cu}万吨规模` : `Au ${metals.au}吨规模` },
      { name: '区域矿山运营情况', score: scores.nearbyMines, max: 20, weight: 20, note: hasOperatingMine ? '周边有运营矿山' : '尚无明确运营信息' },
      { name: '矿权面积', score: scores.licenseArea, max: 10, weight: 10, note: `${area} km²` },
      { name: '可验证钻探靶区', score: scores.drillTargets, max: 20, weight: 20, note: `匹配${targetMatches}项关键指标` },
      { name: '见矿工程', score: scores.intersections, max: 30, weight: 30, note: `匹配${oreMatches}项关键指标` },
    ],
    total, max, pct: Math.round(total / max * 100 * 10) / 10,
  };
}

function scoreEarlyExploration(project, metals, fin) {
  const desc = project.description || '';
  const scores = {};

  // 基于发现孔的评价
  // 预期勘查意义 (10-50分)
  const hasTargets = descriptionKeywords(project, ['靶区', '异常', '物探', '化探', '钻探', '矿化']).length > 0;
  const hasOreBodies = descriptionKeywords(project, ['矿体', '见矿', '品位', '储量']).length > 0;
  if (hasOreBodies && isInMajorBelt(project)) scores.explorationSignificance = 45;
  else if (hasTargets && isInMajorBelt(project)) scores.explorationSignificance = 30;
  else if (hasTargets) scores.explorationSignificance = 15;
  else scores.explorationSignificance = 5;

  // 预期经济意义 (0-50分)
  if (metals.cu >= 100 || metals.au >= 50) scores.economicSignificance = 45;
  else if (metals.cu >= 50 || metals.au >= 20) scores.economicSignificance = 30;
  else if (metals.cu >= 20 || metals.au >= 5) scores.economicSignificance = 15;
  else scores.economicSignificance = 5;

  const total = scores.explorationSignificance + scores.economicSignificance;
  const max = 100;

  return {
    dimensions: [
      { name: '预期勘查意义', score: scores.explorationSignificance, max: 50, weight: 50, note: hasOreBodies ? '已发现矿体/见矿，具备明确勘查目标' : (hasTargets ? '有可验证靶区，勘查方向明确' : '勘查目标尚不明确') },
      { name: '预期经济意义', score: scores.economicSignificance, max: 50, weight: 50, note: metals.cu > 0 ? `Cu资源量${metals.cu}万吨级` : `Au资源量${metals.au}吨级` },
    ],
    total, max, pct: Math.round(total / max * 100 * 10) / 10,
  };
}

function scoreAdvancedExploration(project, metals, fin) {
  const grade = extractGrade(project.reserve_grade);
  const desc = project.description || '';
  const scores = {};

  // 1. 定义资源量规模 (10分)
  if (metals.cu >= 100 || metals.au >= 100) scores.resourceScale = 10;
  else if (metals.cu >= 50 || metals.au >= 30) scores.resourceScale = 7;
  else if (metals.cu >= 20 || metals.au >= 10) scores.resourceScale = 4;
  else scores.resourceScale = 1;

  // 2. 可露采或自然崩落法开采 (20分) / 地采 (10分)
  if (project.mine_type === 'open-pit') {
    const stripRatio = desc.includes('剥采比') ? 10 : (project.depth_range && project.depth_range.includes('0-') ? 8 : 12);
    scores.openPit = Math.min(20, Math.round(grade.au * 5 + (15 - stripRatio)));
    scores.underground = 0;
  } else {
    scores.openPit = 0;
    scores.underground = Math.min(10, Math.round(grade.au * 2 + grade.cu * 2));
  }

  // 3. 有高品位区 (10分)
  const avgGrade = grade.au || grade.cu * 30 || 0;
  const highGrade = descriptionKeywords(project, ['高品位', '富矿', '富集', '特高品位']).length > 0;
  scores.highGrade = highGrade ? Math.min(10, Math.round(avgGrade / 2)) : 0;

  // 4. 可选性 (30分)
  const recovery = desc.match(/回收率\s*(\d+\.?\d*)%?/);
  const recov = recovery ? parseFloat(recovery[1]) : 0;
  if (recov >= 90) scores.processability = 28;
  else if (recov >= 80) scores.processability = 22;
  else if (recov >= 70) scores.processability = 15;
  else if (recov >= 50) scores.processability = 8;
  else if (recov > 0) scores.processability = 3;
  else scores.processability = 10; // 无明确数据，基于矿种默认

  // 5. 扩展勘查意义 (10分)
  const expansion = descriptionKeywords(project, ['深部', '外围', '延长', '增储', '扩展', '远景']).length;
  scores.expansion = Math.min(10, expansion * 3);

  // 6. 可验证的钻探靶区/靶位 (10分)
  const targets = descriptionKeywords(project, ['靶区', '靶位', '异常', '物探', '化探', '钻探']).length;
  scores.drillTargets = Math.min(10, targets * 2);

  // 7. 总体综合评价 (10分)
  scores.overall = 5; // 基准分

  const total = scores.resourceScale + scores.openPit + scores.underground + scores.highGrade + scores.processability + scores.expansion + scores.drillTargets + scores.overall;
  const max = 100;

  return {
    dimensions: [
      { name: '资源量规模', score: scores.resourceScale, max: 10, weight: 10, note: `Cu ${metals.cu}万t / Au ${metals.au}t` },
      { name: project.mine_type === 'open-pit' ? '露采条件' : '地采条件', score: project.mine_type === 'open-pit' ? scores.openPit : scores.underground, max: project.mine_type === 'open-pit' ? 20 : 10, weight: project.mine_type === 'open-pit' ? 20 : 10, note: project.mine_type === 'open-pit' ? '露天开采' : '地下开采' },
      { name: '高品位区', score: scores.highGrade, max: 10, weight: 10, note: highGrade ? '存在高品位矿段' : '无明确高品位信息' },
      { name: '可选性', score: scores.processability, max: 30, weight: 30, note: recov > 0 ? `选矿回收率约${recov}%` : '需选矿试验数据支撑' },
      { name: '扩展勘查意义', score: scores.expansion, max: 10, weight: 10, note: expansion > 0 ? `发现${expansion}项增储线索` : '增储潜力待验证' },
      { name: '钻探靶区', score: scores.drillTargets, max: 10, weight: 10, note: `匹配${targets}项靶区指标` },
      { name: '综合评价', score: scores.overall, max: 10, weight: 10, note: '基于整体质量酌情评分' },
    ],
    total, max, pct: Math.round(total / max * 100 * 10) / 10,
  };
}

function scoreFeasibilityStudy(project, metals, fin) {
  const scores = {};

  // 1. 资源储量规模 (20分)
  if (metals.cu >= 200 || metals.au >= 100) scores.resourceScale = 18;
  else if (metals.cu >= 100 || metals.au >= 50) scores.resourceScale = 12;
  else scores.resourceScale = 4;

  // 2. 净现值NPV (15分)
  if (fin.npv >= 500) scores.npv = 14;
  else if (fin.npv >= 200) scores.npv = 10;
  else if (fin.npv >= 50) scores.npv = 6;
  else if (fin.npv > 0) scores.npv = 3;
  else scores.npv = 0;

  // 3. 内部收益率IRR (15分)
  if (fin.irr >= 30) scores.irr = 14;
  else if (fin.irr >= 20) scores.irr = 10;
  else if (fin.irr >= 12) scores.irr = 6;
  else if (fin.irr > 0) scores.irr = 2;
  else scores.irr = 0;

  // 4. 成本优势 (20分) — 基于全球成本曲线分位值
  if (fin.costQuartile <= 25) scores.costAdvantage = 18;
  else if (fin.costQuartile <= 50) scores.costAdvantage = 13;
  else if (fin.costQuartile <= 75) scores.costAdvantage = 7;
  else scores.costAdvantage = 2;

  // 5. 产能规模 (15分)
  if (fin.annualCapacity >= 5) scores.capacity = 13;
  else if (fin.annualCapacity >= 3) scores.capacity = 9;
  else scores.capacity = 4;

  // 6. 矿山寿命 (15分)
  if (fin.mineLife >= 15) scores.mineLife = 14;
  else if (fin.mineLife >= 10) scores.mineLife = 10;
  else if (fin.mineLife >= 5) scores.mineLife = 6;
  else scores.mineLife = 2;

  const total = scores.resourceScale + scores.npv + scores.irr + scores.costAdvantage + scores.capacity + scores.mineLife;
  const max = 100;

  return {
    dimensions: [
      { name: '资源储量规模', score: scores.resourceScale, max: 20, weight: 20, note: `Cu ${metals.cu}万t / Au ${metals.au}t` },
      { name: '净现值NPV', score: scores.npv, max: 15, weight: 15, note: `估算NPV ${fin.npv} 百万美元` },
      { name: '内部收益率IRR', score: scores.irr, max: 15, weight: 15, note: `估算IRR ${fin.irr}%` },
      { name: '成本优势', score: scores.costAdvantage, max: 20, weight: 20, note: `全球成本曲线第${fin.costQuartile}分位` },
      { name: '产能规模', score: scores.capacity, max: 15, weight: 15, note: `年产${fin.annualCapacity}万吨` },
      { name: '矿山寿命', score: scores.mineLife, max: 15, weight: 15, note: `服务年限${fin.mineLife}年` },
    ],
    total, max, pct: Math.round(total / max * 100 * 10) / 10,
  };
}

function scoreProduction(project, metals, fin) {
  const desc = project.description || '';
  const scores = {};

  // 1. 剩余生命周期 (20分)
  const licenseRemaining = project.license_expires
    ? Math.max(0, Math.round((new Date(project.license_expires) - new Date()) / (365.25 * 24 * 3600 * 1000)))
    : 0;
  if (licenseRemaining >= 10) scores.remainingLife = 18;
  else if (licenseRemaining >= 5) scores.remainingLife = 12;
  else if (licenseRemaining > 0) scores.remainingLife = 5;
  else scores.remainingLife = 0;

  // 2. 勘查/增储潜力的年限 (15分)
  const reservePotential = descriptionKeywords(project, ['深部', '外围', '延长', '增储', '接替资源', '二轮']).length;
  if (reservePotential >= 3) scores.reservePotential = 13;
  else if (reservePotential >= 1) scores.reservePotential = 7;
  else scores.reservePotential = 1;

  // 3. 成本位于全球成本的分位值 (20分)
  if (fin.costQuartile <= 25) scores.costPosition = 18;
  else if (fin.costQuartile <= 50) scores.costPosition = 12;
  else if (fin.costQuartile <= 75) scores.costPosition = 6;
  else scores.costPosition = 2;

  // 4. 管理提升空间 (15分)
  const hasMgmtSpace = descriptionKeywords(project, ['管理', '降本', '技改', '优化', '提升']).length > 0;
  scores.mgmtImprovement = hasMgmtSpace ? 10 : 4;

  // 5. 现有生产规模 (15分)
  const prodMatch = desc.match(/(\d+\.?\d*)\s*万?t?\s*\/\s*年/);
  const prodScale = prodMatch ? parseFloat(prodMatch[1]) : fin.annualCapacity;
  if (prodScale >= 5) scores.currentScale = 13;
  else if (prodScale >= 3) scores.currentScale = 9;
  else scores.currentScale = 4;

  // 6. 扩产后生产规模 (15分)
  const expansionMatch = desc.match(/扩产[后至到]\s*(\d+\.?\d*)\s*万/);
  const expansionScale = expansionMatch ? parseFloat(expansionMatch[1]) : prodScale;
  if (expansionScale >= 5) scores.expandedScale = 13;
  else if (expansionScale >= 3) scores.expandedScale = 8;
  else scores.expandedScale = 3;

  const total = scores.remainingLife + scores.reservePotential + scores.costPosition + scores.mgmtImprovement + scores.currentScale + scores.expandedScale;
  const max = 100;

  return {
    dimensions: [
      { name: '剩余生命周期', score: scores.remainingLife, max: 20, weight: 20, note: `采矿许可剩余${licenseRemaining}年` },
      { name: '增储潜力', score: scores.reservePotential, max: 15, weight: 15, note: reservePotential > 0 ? '存在接替资源潜力' : '增储空间待评估' },
      { name: '成本分位值', score: scores.costPosition, max: 20, weight: 20, note: `全球成本曲线第${fin.costQuartile}分位` },
      { name: '管理提升空间', score: scores.mgmtImprovement, max: 15, weight: 15, note: hasMgmtSpace ? '存在降本增效空间' : '管理水平尚可' },
      { name: '现有生产规模', score: scores.currentScale, max: 15, weight: 15, note: `年产约${prodScale}万吨` },
      { name: '扩产潜力', score: scores.expandedScale, max: 15, weight: 15, note: `扩产后可达${expansionScale}万吨` },
    ],
    total, max, pct: Math.round(total / max * 100 * 10) / 10,
  };
}

// ============================================================================
// 风险评价
// ============================================================================

function evaluateRisks(project, fin) {
  const risks = [];
  const desc = project.description || '';

  // 技术风险
  if (desc.includes('基础设施薄弱')) risks.push({ category: '技术风险', level: '高', detail: '矿区基础设施薄弱，开发成本较高' });
  if (project.mine_type === 'underground' && desc.includes('深部')) risks.push({ category: '技术风险', level: '中', detail: '深部开采技术难度及地压管理风险' });

  // 融资风险
  if (fin.totalCapex > 500) risks.push({ category: '融资风险', level: '中', detail: '资本开支较大，需关注融资安排' });

  // 产品价格风险
  const isGold = (project.mineral_types || '').includes('gold');
  const isCopper = (project.mineral_types || '').includes('copper');
  if (isCopper) risks.push({ category: '产品价格风险', level: '中', detail: '铜价周期性波动对项目现金流影响较大' });
  if (isGold) risks.push({ category: '产品价格风险', level: '低', detail: '金价避险属性较强，价格波动相对可控' });

  // 运营风险
  if (desc.includes('海拔')) risks.push({ category: '运营风险', level: '中', detail: '高海拔地区运营，需关注人员效率和物流成本' });
  if (project.license_expires) {
    const years = Math.round((new Date(project.license_expires) - new Date()) / (365.25 * 24 * 3600 * 1000));
    if (years < 5) risks.push({ category: '运营风险', level: '高', detail: `矿权即将到期（剩余${years}年），续期不确定性` });
  }

  // 资源枯竭风险
  if (fin.mineLife < 5) risks.push({ category: '资源枯竭风险', level: '高', detail: '矿山服务年限较短，需尽快规划接替资源' });

  if (risks.length === 0) {
    risks.push({ category: '综合风险', level: '低', detail: '基于现有信息未发现显著风险点，建议尽调阶段重点核实' });
  }

  return risks;
}

// ============================================================================
// 处置建议
// ============================================================================

function generateDisposalAdvice(project, scoreResult, fin) {
  const stage = STAGE_MAP[project.development_stage] || { code: 'advanced-exploration' };
  const advice = [];

  if (stage.code === 'grassroots' || stage.code === 'early-exploration') {
    advice.push({ option: '合作勘查/风险投资', suitability: '高', note: '适合风险容忍度高的勘查基金或战略买家早期介入' });
    advice.push({ option: '技术入股', suitability: '中', note: '以勘查技术换取股权，降低前期现金投入' });
    advice.push({ option: '整体转让', suitability: scoreResult.pct >= 60 ? '中' : '低', note: '勘查阶段项目溢价空间有限' });
  } else if (stage.code === 'advanced-exploration') {
    advice.push({ option: '合作开发', suitability: '高', note: '分摊开发风险，共享增储收益' });
    advice.push({ option: '整体转让', suitability: scoreResult.pct >= 70 ? '高' : '中', note: '适合有完整开发能力的矿业企业收购' });
    advice.push({ option: '引入战略投资人', suitability: '中', note: '获得资金及技术支持，推动项目进入可研阶段' });
  } else if (stage.code === 'feasibility-study') {
    advice.push({ option: '整体转让/控股权转让', suitability: fin.npv > 200 ? '高' : '中', note: '可研完成后项目价值确定性高，适合战略收购' });
    advice.push({ option: '合作开发', suitability: fin.totalCapex > 300 ? '高' : '中', note: '大额资本开支项目适合合作分担' });
    advice.push({ option: '项目融资+自主开发', suitability: fin.irr > 20 ? '高' : '低', note: 'IRR较高的项目具备独立融资条件' });
  } else {
    advice.push({ option: '控股权/整体收购', suitability: fin.irr > 15 && fin.mineLife > 5 ? '高' : '中', note: '成熟运营项目现金流稳定，适合财务投资人' });
    advice.push({ option: '托管运营', suitability: scoreResult.dimensions.find(d => d.name === '管理提升空间')?.score > 7 ? '高' : '低', note: '引入专业运营团队提升效率' });
    advice.push({ option: '技改扩产', suitability: fin.costQuartile < 50 ? '高' : '中', note: '利用现有基础设施扩大产能规模' });
  }

  return advice;
}

// ============================================================================
// 主评估入口
// ============================================================================

export function evaluateMineProject(project) {
  const stageInfo = STAGE_MAP[project.development_stage] || { name: '高级勘查项目', code: 'advanced-exploration', phase: 3 };
  const metals = extractMetalTons(project.estimated_reserve);
  const fin = estimateFinancials(project, metals);

  let scoreResult;
  switch (stageInfo.code) {
    case 'grassroots':           scoreResult = scoreGrassroots(project, metals, fin); break;
    case 'early-exploration':    scoreResult = scoreEarlyExploration(project, metals, fin); break;
    case 'advanced-exploration': scoreResult = scoreAdvancedExploration(project, metals, fin); break;
    case 'feasibility-study':    scoreResult = scoreFeasibilityStudy(project, metals, fin); break;
    case 'production':           scoreResult = scoreProduction(project, metals, fin); break;
    default:                     scoreResult = scoreAdvancedExploration(project, metals, fin);
  }

  const risks = evaluateRisks(project, fin);
  const disposal = generateDisposalAdvice(project, scoreResult, fin);

  // 生成AI摘要
  const summary = generateSummary(project, stageInfo, scoreResult, fin, risks);

  return {
    overallScore: scoreResult.pct,
    stage: {
      code: stageInfo.code,
      name: stageInfo.name,
      phase: stageInfo.phase,
    },
    dimensions: scoreResult.dimensions,
    financials: fin,
    risks,
    recommendations: generateRecommendations(project, scoreResult, fin, risks),
    disposalAdvice: disposal,
    summary,
    evaluationModel: '紫金矿业五阶段评价体系',
  };
}

function generateSummary(project, stageInfo, scoreResult, fin, risks) {
  const highRisks = risks.filter(r => r.level === '高');
  const riskText = highRisks.length > 0 ? `需重点关注${highRisks.length}项高风险因素。` : '整体风险可控。';

  let valueText;
  if (scoreResult.pct >= 80) valueText = '项目质量优秀';
  else if (scoreResult.pct >= 65) valueText = '项目质量良好';
  else if (scoreResult.pct >= 50) valueText = '项目质量一般';
  else valueText = '项目质量偏弱';

  const finText = fin.npv > 0
    ? `估算NPV ${fin.npv}百万美元，IRR ${fin.irr}%，投资回收期约${fin.payback}年。`
    : '';

  return `${stageInfo.name}：${valueText}，综合评分${scoreResult.pct}分。${finText}${riskText}建议${scoreResult.pct >= 70 ? '尽快启动尽调' : '结合更多信息评估'}。`;
}

function generateRecommendations(project, scoreResult, fin, risks) {
  const recs = [];

  recs.push('建议委托具备资质的第三方机构进行独立资源核实与估值');

  if (fin.npv > 0 && fin.irr < 15) {
    recs.push('项目IRR偏低，建议重点评估成本优化空间及扩产潜力');
  }

  const licenseRisk = risks.find(r => r.detail && r.detail.includes('矿权'));
  if (licenseRisk) {
    recs.push('重点关注矿权证照有效期及续期安排，这是交易安全的核心要素');
  }

  if (scoreResult.dimensions.find(d => d.name === '可选性')) {
    recs.push('建议补充选矿试验数据，验证矿石可选性及回收率指标');
  }

  if (project.development_stage === 'prospecting' || project.development_stage === 'general-exploration') {
    recs.push('勘查阶段项目资源不确定性较高，建议分阶段投资并设置里程碑对赌条款');
  }

  return recs;
}

export { STAGE_MAP };
