import db from './connection.js';

export function runSeed() {
  const count = db.prepare('SELECT COUNT(*) as c FROM mine_projects').get().c;
  if (count > 0) return;

  const now = new Date().toISOString();

  // 默认管理员
  db.prepare(`INSERT OR IGNORE INTO users (id, name, email, password_hash, role, org_type, organization, avatar_letter, status, verified, created_at)
    VALUES (1, '管理员', 'admin@mine-cap.com',
      '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
      'admin', 'admin', '矿资资本', '管', 'active', 1, ?)`,
  ).run(now);

  // 示例投资人
  db.prepare(`INSERT INTO users (name, email, password_hash, role, org_type, organization, avatar_letter, status, verified, created_at)
    VALUES (?, ?, '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', ?, ?, ?, ?, 'active', 1, ?)`
  ).run('王振华', 'demo@mine-cap.com', 'investor', 'investor', '紫金矿业投资', '王', now);

  // 示例矿产项目
  const projects = [
    {
      code: 'JK-GOLD-001',
      name: '金岭金矿详查项目',
      name_en: 'Jinling Gold Exploration',
      mineral_types: 'gold',
      province: '山东', city: '烟台市',
      area_km2: 12.5,
      estimated_reserve: '约12.3吨金金属量',
      reserve_grade: 'Au 3.2g/t',
      depth_range: '0-800m',
      mine_type: 'underground',
      development_stage: 'detailed-exploration',
      license_status: 'valid',
      license_expires: '2032-06-15',
      asking_price: '6.8亿',
      asking_price_raw: 680000000,
      description: '金岭金矿位于胶东半岛金矿带核心区域，已完成详查工作。矿体走向北东，倾向南东，倾角40-60度，主要受断裂构造控制。矿石类型以石英脉型为主，含少量蚀变岩型。选矿试验表明金回收率可达92%。矿区交通方便，水电供应充足。',
      description_masked: '金矿位于胶东半岛金矿带，已完成详查。矿体走向北东，受断裂控制。选矿回收率可达XX%。交通方便，水电充足。',
      highlights: '胶东金矿带核心区|Au 3.2g/t|回收率92%|交通便利',
      disposal_options: '整体转让,合作开发,技术入股',
      contact_masked: '保密——注册会员可见',
      is_hot: 1, is_featured: 1, is_confidential: 1,
      ai_score: 82.5,
      ai_summary: '项目资源储量明确，品位中等偏高，开发条件成熟，适合中型矿业企业收购开发。',
      status: 'active', owner_id: 1,
    },
    {
      code: 'YN-COPPER-002',
      name: '云岭铜多金属矿普查项目',
      name_en: 'Yunling Copper Polymetallic',
      mineral_types: 'copper,silver,gold',
      province: '云南', city: '丽江市',
      area_km2: 28.6,
      estimated_reserve: 'Cu 45万吨，Ag 200吨',
      reserve_grade: 'Cu 1.8%，Ag 80g/t',
      depth_range: '0-600m',
      mine_type: 'open-pit',
      development_stage: 'prospecting',
      license_status: 'valid',
      license_expires: '2030-03-20',
      asking_price: '12.5亿',
      asking_price_raw: 1250000000,
      description: '云岭铜多金属矿位于三江成矿带中段，勘查面积28.6平方公里。已发现斑岩型铜钼矿体3个，矽卡岩型铜银矿体2个。矿区海拔2200-3600m，气候适宜，具备露天开采条件。伴生金、银、钼等有用组分综合利用价值高。',
      description_masked: '铜多金属矿位于三江成矿带，勘查面积XX平方公里。已发现多个矿体，具备露天开采条件。伴生金、银、钼。',
      highlights: '三江成矿带|Cu+Ag+Au多金属|露天开采条件好|综合利用价值高',
      disposal_options: '整体转让,战略合作,引入战略投资人',
      contact_masked: '保密——注册会员可见',
      is_hot: 1, is_featured: 1, is_confidential: 1,
      ai_score: 78.0,
      ai_summary: '多金属伴生特征突出，资源综合利用价值高，适合大型矿业集团整合开发。',
      status: 'active', owner_id: 1,
    },
    {
      code: 'NM-SILVER-003',
      name: '银都银铅锌矿开发项目',
      name_en: 'Yindu Silver-Lead-Zinc',
      mineral_types: 'silver,lead,zinc',
      province: '内蒙古', city: '赤峰市',
      area_km2: 8.3,
      estimated_reserve: 'Ag 680吨，Pb+Zn 30万吨',
      reserve_grade: 'Ag 210g/t，Pb+Zn 4.5%',
      depth_range: '0-500m',
      mine_type: 'underground',
      development_stage: 'production-ready',
      license_status: 'valid',
      license_expires: '2035-11-08',
      asking_price: '9.2亿',
      asking_price_raw: 920000000,
      description: '银都银铅锌矿已完成全部开发前期手续，取得采矿许可证，设计产能50万吨/年。矿区距铁路站12km，公路直达，电力由110KV变电站供应。选矿厂已完成建设，设备齐全。产品以银精矿、铅精矿、锌精矿为主。',
      description_masked: '银铅锌矿已取得采矿许可证，设计产能XX万吨/年。距铁路站XX公里，选矿厂已建成。',
      highlights: '采矿证在手|年产50万吨|选矿厂建成|交通电力完善',
      disposal_options: '整体转让,控股权转让,托管运营',
      contact_masked: '保密——注册会员可见',
      is_hot: 0, is_featured: 1, is_confidential: 1,
      ai_score: 85.0,
      ai_summary: '证照齐全、基建完成，投产风险低，适合快速回报的财务投资人或战略收购。',
      status: 'active', owner_id: 1,
    },
    {
      code: 'XZ-GOLD-004',
      name: '藏金矿业金银矿勘探项目',
      name_en: 'Zangjin Gold-Silver Exploration',
      mineral_types: 'gold,silver',
      province: '西藏', city: '那曲市',
      area_km2: 45.0,
      estimated_reserve: '初步估算Au 8吨，Ag 150吨',
      reserve_grade: 'Au 2.5g/t，Ag 45g/t',
      depth_range: '0-1000m',
      mine_type: 'open-pit',
      development_stage: 'general-exploration',
      license_status: 'valid',
      license_expires: '2029-08-30',
      asking_price: '3.5亿',
      asking_price_raw: 350000000,
      description: '藏金矿业项目位于冈底斯成矿带东段，海拔4200-5000m。已完成普查工作，发现构造蚀变岩型金矿产3处，石英脉型银矿化点5处。矿区基础设施薄弱，需新建道路和供电设施，开发成本较高但资源潜力巨大。',
      description_masked: '项目位于冈底斯成矿带东段，海拔较高。已完成普查，发现多处金矿化和银矿化点。资源潜力较大。',
      highlights: '冈底斯成矿带|大型勘查靶区|金银组合|潜力巨大',
      disposal_options: '合作勘查,风险投资,技术入股',
      contact_masked: '保密——注册会员可见',
      is_hot: 0, is_featured: 0, is_confidential: 1,
      ai_score: 65.5,
      ai_summary: '勘查阶段项目，资源潜力巨大但开发风险高，适合风险容忍度高的资本介入。',
      status: 'active', owner_id: 1,
    },
    {
      code: 'JX-COPPER-005',
      name: '铜岭铜矿深部找矿项目',
      name_en: 'Tongling Copper Deep Exploration',
      mineral_types: 'copper,gold',
      province: '江西', city: '上饶市',
      area_km2: 6.2,
      estimated_reserve: '新增Cu 20万吨',
      reserve_grade: 'Cu 1.2%，伴生Au 0.3g/t',
      depth_range: '500-1200m',
      mine_type: 'underground',
      development_stage: 'detailed-exploration',
      license_status: 'valid',
      license_expires: '2031-01-15',
      asking_price: '4.8亿',
      asking_price_raw: 480000000,
      description: '铜岭铜矿为老矿山深部找矿项目，原有矿山已开采30年。近年通过深部物化探在-500米以下发现新矿体，延长矿山服务年限15年以上。矿山现有选矿厂和尾矿库可共用，大幅降低基建投资。',
      description_masked: '老矿山深部找矿项目，近年发现新矿体。现有选厂和尾矿库可共用，降低基建投资。',
      highlights: '老矿山深部增储|设施可共用|Cu+Au伴生|延长15年',
      disposal_options: '合作开发,技术入股,整体转让',
      contact_masked: '保密——注册会员可见',
      is_hot: 1, is_featured: 0, is_confidential: 1,
      ai_score: 79.5,
      ai_summary: '深部增储项目，基础设施可复用，投资成本低，回收期短，适合稳健投资者。',
      status: 'active', owner_id: 1,
    },
  ];

  const insertProject = db.prepare(`
    INSERT INTO mine_projects (
      code, name, name_en, mineral_types, province, city, area_km2, estimated_reserve, reserve_grade,
      depth_range, mine_type, development_stage, license_status, license_expires, asking_price, asking_price_raw,
      description, description_masked, highlights, disposal_options, contact_masked,
      is_hot, is_featured, is_confidential, ai_score, ai_summary, status, owner_id
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);

  for (const p of projects) {
    insertProject.run(
      p.code, p.name, p.name_en, p.mineral_types, p.province, p.city, p.area_km2, p.estimated_reserve, p.reserve_grade,
      p.depth_range, p.mine_type, p.development_stage, p.license_status, p.license_expires, p.asking_price, p.asking_price_raw,
      p.description, p.description_masked, p.highlights, p.disposal_options, p.contact_masked,
      p.is_hot, p.is_featured, p.is_confidential, p.ai_score, p.ai_summary, p.status, p.owner_id
    );
  }

  // 合作机构
  const partners = [
    { name: '中矿资源集团', type: 'mine_enterprise', description: '中国领先的综合性矿业企业', sort_order: 1 },
    { name: '紫金矿业投资', type: 'investor', description: '全球知名矿业投资机构', sort_order: 2 },
    { name: '五矿勘查开发', type: 'mine_enterprise', description: '央企矿业勘查开发平台', sort_order: 3 },
    { name: '高瓴矿业基金', type: 'investor', description: '专注矿产能源领域股权投资', sort_order: 4 },
    { name: '中国黄金集团', type: 'mine_enterprise', description: '中国黄金行业龙头企业', sort_order: 5 },
    { name: '天图资本', type: 'investor', description: '全产业链消费与矿业投资', sort_order: 6 },
  ];

  for (const p of partners) {
    db.prepare('INSERT INTO partners (name, type, description, sort_order) VALUES (?,?,?,?)')
      .run(p.name, p.type, p.description, p.sort_order);
  }

  // KPI 数据
  const stats = [
    { stat_key: 'total_projects', stat_value: 5, display_value: '5', description: '平台矿产项目数' },
    { stat_key: 'total_reserve_tons', stat_value: 200, display_value: '200+', description: '累计资源储量吨' },
    { stat_key: 'registered_users', stat_value: 120, display_value: '120+', description: '注册会员数' },
    { stat_key: 'total_value_billion', stat_value: 36.8, display_value: '36.8亿', description: '挂牌资产总价值' },
  ];

  for (const s of stats) {
    db.prepare('INSERT INTO system_stats (stat_key, stat_value, display_value, description) VALUES (?,?,?,?)')
      .run(s.stat_key, s.stat_value, s.display_value, s.description);
  }

  // 示例直播
  const streams = [
    {
      title: '金岭金矿详查项目线上路演',
      project_id: 1,
      presenter_id: 1,
      presenter_name: '矿资资本管理员',
      status: 'live',
      description: '详细介绍金岭金矿的资源储量、开发条件及合作方式，欢迎各投资机构参会交流。',
      room_token: 'room-jk-gold-001'
    },
    {
      title: '云岭铜多金属矿项目推介',
      project_id: 2,
      presenter_id: 1,
      presenter_name: '矿资资本管理员',
      status: 'scheduled',
      scheduled_at: new Date(Date.now() + 86400000 * 2).toISOString(),
      description: '三江成矿带中段大型铜多金属矿项目推介，欢迎预约观看。',
      room_token: 'room-yn-copper-002'
    },
    {
      title: '银都银铅锌矿开发项目答疑',
      project_id: 3,
      presenter_id: 1,
      presenter_name: '矿资资本管理员',
      status: 'ended',
      description: '采矿证在手、选矿厂建成的优质银铅锌项目，已结束可回看（模拟）。',
      room_token: 'room-nm-silver-003'
    }
  ];

  const insertStream = db.prepare(`
    INSERT INTO live_streams (title, project_id, presenter_id, presenter_name, status, scheduled_at, description, room_token)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const s of streams) {
    insertStream.run(s.title, s.project_id, s.presenter_id, s.presenter_name, s.status, s.scheduled_at || null, s.description, s.room_token);
  }

  console.log('✓ 矿业平台种子数据写入完成');
}
