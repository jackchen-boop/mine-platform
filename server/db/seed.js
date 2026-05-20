import db from './connection.js';
import bcrypt from 'bcryptjs';

export function runSeed() {
  // 已有数据则跳过
  const row = db.prepare('SELECT COUNT(*) as c FROM users').get();
  if (row && row.c > 0) return;

  console.log('⏳ 初始化种子数据...');

  // 管理员账号 (密码: Admin@2026)
  const adminHash = bcrypt.hashSync('Admin@2026', 10);
  db.prepare(`INSERT INTO users (name, email, password_hash, role, organization, avatar_letter) VALUES (?, ?, ?, 'admin', '星链创投', '管')`
  ).run('系统管理员', 'admin@starlink-vc.com', adminHash);

  // 演示投资人账号 (密码: Demo@2026)
  const demoHash = bcrypt.hashSync('Demo@2026', 10);
  db.prepare(`INSERT INTO users (name, email, password_hash, role, organization, avatar_letter) VALUES (?, ?, ?, 'investor', '红杉中国', '张')`
  ).run('张明远', 'demo@starlink-vc.com', demoHash);

  // 快速体验账号 (密码: 12345678)
  const testHash = bcrypt.hashSync('12345678', 10);
  db.prepare(`INSERT INTO users (name, email, password_hash, role, organization, avatar_letter) VALUES (?, ?, ?, 'investor', '体验机构', '体')`
  ).run('体验用户', 'test@test.com', testHash);

  // 12 个融资项目种子数据
  const projects = [
    {
      name: '星瀚智算', name_en: 'XingHan Compute', code_letter: '星',
      sector: 'AI大模型', sub_sector: '算力基础设施', location: '上海',
      round: 'A+轮', amount: '¥3.2 亿', amount_raw: 3.2,
      valuation: '¥28 亿', valuation_raw: 28, ai_score: 8.6, progress_pct: 68,
      fans_count: 14, is_hot: 1,
      description: '面向行业大模型的国产化训练与推理一体机，已交付头部金融与运营商客户。',
      team_info: JSON.stringify([
        { name: '李宇航', role: 'CEO', background: '前华为昇腾团队负责人' },
        { name: '陈静波', role: 'CTO', background: '北大人工智能博士' }
      ]),
      financial_summary: JSON.stringify({ revenue_2023: '4200万', revenue_2024: '1.8亿', gross_margin: '42%' }),
      business_model: '算力一体机硬件销售 + 模型推理服务订阅'
    },
    {
      name: '凌芯半导体', name_en: 'LingCore Semi', code_letter: '芯',
      sector: '芯片半导体', sub_sector: '车规级MCU', location: '苏州',
      round: 'B轮', amount: '¥5 亿', amount_raw: 5,
      valuation: '¥45 亿', valuation_raw: 45, ai_score: 9.1, progress_pct: 82,
      fans_count: 22, is_hot: 1,
      description: '车规级高性能MCU国产替代，已通过AEC-Q100认证，进入吉利、比亚迪供应链。',
      team_info: JSON.stringify([
        { name: '王立', role: 'CEO', background: '前NXP资深架构师' },
        { name: '陈浩', role: 'CTO', background: '中科院微电子所博士' },
        { name: '周敏', role: 'CFO', background: '前安永合伙人' }
      ]),
      financial_summary: JSON.stringify({ revenue_2023: '8420万', revenue_2024: '2.13亿', gross_margin: '34.2%' }),
      business_model: '车规MCU芯片销售 + 配套软件栈授权'
    },
    {
      name: '天衢航天', name_en: 'Tianqu Aerospace', code_letter: '航',
      sector: '商业航天', sub_sector: '液氧甲烷火箭', location: '北京',
      round: 'Pre-B轮', amount: '¥6 亿', amount_raw: 6,
      valuation: '¥60 亿', valuation_raw: 60, ai_score: 8.4, progress_pct: 54,
      fans_count: 9, is_hot: 1,
      description: '可回收商业运载火箭，首飞成功，年内计划完成4次入轨发射。',
      team_info: JSON.stringify([
        { name: '赵天宇', role: 'CEO', background: '前航天院总师' },
        { name: '孙磊', role: 'CTO', background: '北航航天工程博士' }
      ]),
      financial_summary: JSON.stringify({ revenue_2024: '订单3亿', gross_margin: '预计55%' }),
      business_model: '卫星发射服务 + 载荷搭载分包'
    },
    {
      name: '蓝藻生物', name_en: 'BluAlgae Bio', code_letter: '合',
      sector: '合成生物', sub_sector: '绿色化工', location: '杭州',
      round: 'A轮', amount: '¥1.8 亿', amount_raw: 1.8,
      valuation: '¥15 亿', valuation_raw: 15, ai_score: 7.9, progress_pct: 46,
      fans_count: 11, is_hot: 0,
      description: '基于工程藻类的可持续蛋白与生物制造平台，绑定头部食品集团LOI订单8亿。',
      team_info: JSON.stringify([
        { name: '林晓薇', role: 'CEO', background: '浙大生物工程教授' },
        { name: '苏明', role: 'COO', background: '前康师傅供应链总监' }
      ]),
      financial_summary: JSON.stringify({ revenue_2024: '3200万', gross_margin: '61%' }),
      business_model: '生物原料B2B销售 + 白标产品授权'
    },
    {
      name: '擎云机器人', name_en: 'Qinyun Robot', code_letter: '机',
      sector: '智能机器人', sub_sector: '人形机器人', location: '深圳',
      round: 'B+轮', amount: '¥4.5 亿', amount_raw: 4.5,
      valuation: '¥50 亿', valuation_raw: 50, ai_score: 8.8, progress_pct: 73,
      fans_count: 18, is_hot: 1,
      description: '通用人形机器人本体+VLA大模型自研，工业巡检与汽车装配场景已商业化。',
      team_info: JSON.stringify([
        { name: '吴擎', role: 'CEO', background: '前大疆机器人部门负责人' },
        { name: '张远', role: 'CTO', background: '斯坦福机器人博士' }
      ]),
      financial_summary: JSON.stringify({ revenue_2024: '6800万', gross_margin: '38%' }),
      business_model: '机器人本体销售 + VLA模型订阅服务'
    },
    {
      name: '恒锂储能', name_en: 'HengLi Energy', code_letter: '储',
      sector: '新能源/储能', sub_sector: '工商储', location: '宁德',
      round: 'Pre-IPO', amount: '¥8 亿', amount_raw: 8,
      valuation: '¥80 亿', valuation_raw: 80, ai_score: 9.0, progress_pct: 91,
      fans_count: 27, is_hot: 1,
      description: '工商业储能系统集成商，2025年出货4.2GWh，海外营收占比47%。',
      team_info: JSON.stringify([
        { name: '钟恒', role: 'CEO', background: '前宁德时代储能事业部VP' },
        { name: '李凯', role: 'CFO', background: '高盛大中华区MD' }
      ]),
      financial_summary: JSON.stringify({ revenue_2024: '32亿', revenue_2025e: '58亿', gross_margin: '22%' }),
      business_model: '储能系统EPC + 运营增值服务'
    },
    {
      name: '灵犀医疗', name_en: 'LingXi Medical', code_letter: '医',
      sector: '医疗健康', sub_sector: 'AI医学影像', location: '上海',
      round: 'C轮', amount: '¥3 亿', amount_raw: 3,
      valuation: '¥35 亿', valuation_raw: 35, ai_score: 8.2, progress_pct: 61,
      fans_count: 16, is_hot: 0,
      description: 'AI辅助诊断平台，覆盖肺结节、乳腺癌、眼底病变三大场景，三甲医院装机2000+。',
      team_info: JSON.stringify([
        { name: '刘灵', role: 'CEO', background: '前飞利浦医疗AI负责人' },
        { name: '王欣', role: 'CTO', background: '协和医院影像科主任' }
      ]),
      financial_summary: JSON.stringify({ revenue_2024: '1.2亿', gross_margin: '78%' }),
      business_model: 'SaaS订阅 + 硬件嵌入 + 科室合作'
    },
    {
      name: '晴天碳中和', name_en: 'ClearSky Carbon', code_letter: '碳',
      sector: '绿色科技', sub_sector: '碳资产管理', location: '北京',
      round: 'A轮', amount: '¥1.2 亿', amount_raw: 1.2,
      valuation: '¥10 亿', valuation_raw: 10, ai_score: 7.5, progress_pct: 35,
      fans_count: 8, is_hot: 0,
      description: '企业碳账户SaaS+自愿碳市场交易平台，服务500强企业30家，年碳交易额超5亿元。',
      team_info: JSON.stringify([
        { name: '孟晴', role: 'CEO', background: '前生态环境部官员' },
        { name: '高远', role: 'CTO', background: '清华环境工程博士' }
      ]),
      financial_summary: JSON.stringify({ revenue_2024: '4500万', gross_margin: '65%' }),
      business_model: '碳账户SaaS + 碳交易撮合佣金'
    },
    {
      name: '超维量子', name_en: 'HyperQ Tech', code_letter: '量',
      sector: '量子计算', sub_sector: '量子纠错', location: '合肥',
      round: 'Pre-A轮', amount: '¥8000万', amount_raw: 0.8,
      valuation: '¥8 亿', valuation_raw: 8, ai_score: 7.3, progress_pct: 28,
      fans_count: 6, is_hot: 0,
      description: '专注量子纠错芯片研发，突破50量子比特稳定操控，与中科大量子信息国家实验室深度合作。',
      team_info: JSON.stringify([
        { name: '程超', role: 'CEO', background: '中科大量子信息博士后' },
        { name: '魏维', role: 'CTO', background: 'MIT量子计算博士' }
      ]),
      financial_summary: JSON.stringify({ stage: '研发阶段', grant: '国家重点研发项目3000万' }),
      business_model: '量子计算云服务 + 行业解决方案授权'
    },
    {
      name: '璟行科技', name_en: 'JingXing Auto', code_letter: '驾',
      sector: '自动驾驶', sub_sector: 'L4商业落地', location: '广州',
      round: 'B轮', amount: '¥5.5 亿', amount_raw: 5.5,
      valuation: '¥52 亿', valuation_raw: 52, ai_score: 8.0, progress_pct: 67,
      fans_count: 20, is_hot: 1,
      description: '城市自动驾驶出行平台，广深佛三城运营，累计无安全员运营里程超200万公里。',
      team_info: JSON.stringify([
        { name: '柯景', role: 'CEO', background: '前Waymo中国总经理' },
        { name: '薛行', role: 'CTO', background: 'CMU机器人博士' }
      ]),
      financial_summary: JSON.stringify({ revenue_2024: '9600万', gross_margin: '45%' }),
      business_model: 'Robotaxi里程收费 + OEM技术授权'
    },
    {
      name: '链动供应链', name_en: 'ChainFlow SCM', code_letter: '链',
      sector: '企业服务', sub_sector: '供应链金融', location: '深圳',
      round: 'C轮', amount: '¥4 亿', amount_raw: 4,
      valuation: '¥38 亿', valuation_raw: 38, ai_score: 8.1, progress_pct: 79,
      fans_count: 14, is_hot: 0,
      description: '供应链金融SaaS平台，服务核心企业500+，累计撮合融资额超1200亿，不良率<0.3%。',
      team_info: JSON.stringify([
        { name: '侯链', role: 'CEO', background: '前招商银行供应链金融部总经理' },
        { name: '唐动', role: 'CTO', background: '蚂蚁集团风控算法专家' }
      ]),
      financial_summary: JSON.stringify({ revenue_2024: '2.8亿', gross_margin: '58%' }),
      business_model: '撮合服务费 + 风控SaaS年费'
    },
    {
      name: '原力农业', name_en: 'Origin AgriTech', code_letter: '农',
      sector: '农业科技', sub_sector: '垂直农场', location: '成都',
      round: 'A+轮', amount: '¥2 亿', amount_raw: 2,
      valuation: '¥18 亿', valuation_raw: 18, ai_score: 7.7, progress_pct: 43,
      fans_count: 10, is_hot: 0,
      description: '工厂化垂直农场+AI种植系统，叶菜单位成本降低40%，已与盒马鲜生签订长期供应协议。',
      team_info: JSON.stringify([
        { name: '谢原', role: 'CEO', background: '前拼多多农业事业部总经理' },
        { name: '余力', role: 'CTO', background: '荷兰瓦赫宁根大学农业工程博士' }
      ]),
      financial_summary: JSON.stringify({ revenue_2024: '7500万', gross_margin: '35%' }),
      business_model: '工厂化叶菜B2B批发 + AI种植系统SaaS'
    }
  ];

  const insertProject = db.prepare(`
    INSERT INTO projects (name, name_en, code_letter, sector, sub_sector, location, round,
      amount, amount_raw, valuation, valuation_raw, ai_score, progress_pct, fans_count,
      description, is_hot, team_info, financial_summary, business_model)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const p of projects) {
    insertProject.run(
      p.name, p.name_en, p.code_letter, p.sector, p.sub_sector, p.location, p.round,
      p.amount, p.amount_raw, p.valuation, p.valuation_raw, p.ai_score, p.progress_pct,
      p.fans_count, p.description, p.is_hot, p.team_info, p.financial_summary, p.business_model
    );
  }

  // 路演数据
  const roadshows = [
    { project_id: 2, type: 'live',     title: '凌芯半导体 B轮路演 · 直播中',         presenter: 'CEO 王立',   status: 'live',      scheduled_at: null,              viewer_count: 247,  reservation_count: 0 },
    { project_id: 1, type: 'upcoming', title: '星瀚智算 A+轮融资路演',               presenter: 'CEO 李宇航', status: 'scheduled', scheduled_at: datetimeOffset(3),  viewer_count: 0,    reservation_count: 89 },
    { project_id: 5, type: 'upcoming', title: '擎云机器人 B+轮投资人交流',           presenter: 'CEO 吴擎',   status: 'scheduled', scheduled_at: datetimeOffset(5),  viewer_count: 0,    reservation_count: 134 },
    { project_id: 3, type: 'recorded', title: '天衢航天首飞成功汇报暨Pre-B路演',     presenter: 'CEO 赵天宇', status: 'completed', scheduled_at: datetimeOffset(-7), viewer_count: 1823, reservation_count: 0 },
    { project_id: 6, type: 'recorded', title: '恒锂储能2025年业绩发布 & Pre-IPO路演', presenter: 'CEO 钟恒',  status: 'completed', scheduled_at: datetimeOffset(-3), viewer_count: 3412, reservation_count: 0 },
    { project_id: 10,type: 'upcoming', title: '璟行科技广深佛商业化路演',            presenter: 'CEO 柯景',   status: 'scheduled', scheduled_at: datetimeOffset(7),  viewer_count: 0,    reservation_count: 76 }
  ];

  const insertRoadshow = db.prepare(`
    INSERT INTO roadshows (project_id, type, title, presenter, status, viewer_count, reservation_count, scheduled_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const r of roadshows) {
    insertRoadshow.run(r.project_id, r.type, r.title, r.presenter, r.status, r.viewer_count, r.reservation_count, r.scheduled_at);
  }

  // 合作机构
  const partners = [
    { name: '红杉中国',  name_en: 'Sequoia China',          type: 'gp', stage_preference: 'A,B,C',         sector_count: 12, platform_deals: 17, fund_size: '¥3500 亿', is_featured: 1, sort_order: 1 },
    { name: '高瓴资本',  name_en: 'Hillhouse Capital',       type: 'gp', stage_preference: 'B,C,Pre-IPO',   sector_count: 9,  platform_deals: 12, fund_size: '¥6000 亿', is_featured: 1, sort_order: 2 },
    { name: '中金资本',  name_en: 'CICC Capital',            type: 'lp', stage_preference: 'A,B,C,Pre-IPO', sector_count: 14, platform_deals: 21, fund_size: '¥1200 亿', is_featured: 1, sort_order: 3 },
    { name: '深创投',    name_en: 'Shenzhen Capital Group',  type: 'gp', stage_preference: 'A,B',           sector_count: 8,  platform_deals: 9,  fund_size: null,       is_featured: 0, sort_order: 4 },
    { name: 'IDG资本',   name_en: 'IDG Capital',             type: 'gp', stage_preference: 'Angel,A,B',     sector_count: 11, platform_deals: 8,  fund_size: null,       is_featured: 0, sort_order: 5 },
    { name: '启明创投',  name_en: 'Qiming Ventures',         type: 'gp', stage_preference: 'A,B',           sector_count: 7,  platform_deals: 6,  fund_size: null,       is_featured: 0, sort_order: 6 },
    { name: '经纬创投',  name_en: 'Matrix Partners',         type: 'gp', stage_preference: 'A,B',           sector_count: 9,  platform_deals: 11, fund_size: null,       is_featured: 0, sort_order: 7 },
    { name: '真格基金',  name_en: 'Zhenfund',                type: 'gp', stage_preference: 'Angel,Pre-A',   sector_count: 6,  platform_deals: 4,  fund_size: null,       is_featured: 0, sort_order: 8 },
    { name: '君联资本',  name_en: 'Legend Capital',          type: 'gp', stage_preference: 'A,B,C',         sector_count: 10, platform_deals: 13, fund_size: null,       is_featured: 0, sort_order: 9 },
    { name: '毅达资本',  name_en: 'Yida Capital',            type: 'gp', stage_preference: 'A,B',           sector_count: 7,  platform_deals: 7,  fund_size: null,       is_featured: 0, sort_order: 10 },
    { name: '达晨财智',  name_en: 'Dasen Capital',           type: 'gp', stage_preference: 'A,B,C',         sector_count: 8,  platform_deals: 10, fund_size: null,       is_featured: 0, sort_order: 11 },
    { name: '华兴资本',  name_en: 'China Renaissance',       type: 'fa', stage_preference: 'B,C,Pre-IPO',   sector_count: 6,  platform_deals: 15, fund_size: null,       is_featured: 0, sort_order: 12 }
  ];

  const insertPartner = db.prepare(`
    INSERT INTO partners (name, name_en, type, stage_preference, sector_count, platform_deals, fund_size, is_featured, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const p of partners) {
    insertPartner.run(p.name, p.name_en, p.type, p.stage_preference, p.sector_count, p.platform_deals, p.fund_size, p.is_featured, p.sort_order);
  }

  // 平台 KPI 统计
  const stats = [
    ['total_projects',   3826,  '3,826+', '↑ 12.4% MoM'],
    ['total_partners',   286,   '286',    '头部 GP 38 家'],
    ['total_matched_bn', 427.6, '427.6',  '↑ 8.2% YoY'],
    ['total_reports',    11240, '11,240', '平均响应 6.8s']
  ];
  const insertStat = db.prepare(
    `INSERT OR REPLACE INTO system_stats (stat_key, stat_value, display_value, description) VALUES (?, ?, ?, ?)`
  );
  for (const [key, val, disp, desc] of stats) {
    insertStat.run(key, val, disp, desc);
  }

  console.log(`✓ 种子数据写入完成：${projects.length} 个项目，${partners.length} 家机构，2 个演示账号`);
  console.log('  管理员: admin@starlink-vc.com / Admin@2026');
  console.log('  演示用: demo@starlink-vc.com  / Demo@2026');
}

function datetimeOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(14, 0, 0, 0);
  return d.toISOString().replace('T', ' ').slice(0, 19);
}
