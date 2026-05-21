// RAG 知识库种子数据 — 行业档案/估值基准/红线规则/政策法规
import db from './connection.js';

export function runKnowledgeSeed() {
  const row = db.prepare('SELECT COUNT(*) as c FROM kb_industries').get();
  if (row && row.c > 0) return;

  console.log('⏳ 初始化知识库数据...');

  // ===== 行业档案 =====
  const industries = [
    {
      industry_name: 'AI/具身智能/机器人',
      tier: '1',
      keywords: 'AI,人工智能,大模型,LLM,具身智能,机器人,人形机器人,VLA,AI应用,AIGC,生成式AI,深度学习,机器学习,智能体,Agent',
      market_size: '中国AI核心产业2025年约5800亿元，带动的相关产业规模超1.8万亿元；具身智能/人形机器人市场2025年约120亿元，2028E预计超600亿元',
      cagr: 'AI核心产业CAGR 2024-2028E 约28%；人形机器人CAGR 2025-2028E 约70%',
      cr3: 'AI大模型：百度/阿里/字节（CR3约55%）；人形机器人：优必选/智元机器人/宇树科技（CR3约40%，格局未定）',
      cr5: 'AI应用层CR5约35%，高度分散；具身智能CR5约50%但仍在快速变化',
      value_chain: '上游：算力芯片(英伟达/昇腾)→数据标注→框架(PyTorch/自研) | 中游：大模型训练(百模大战)→推理优化→AI Agent | 下游：行业应用(金融/医疗/教育/制造)→终端硬件(机器人/手机/汽车)',
      key_players: '大模型：百度文心/阿里通义/字节豆包/Moonshot/DeepSeek/智谱 | 人形机器人：优必选/智元/宇树/擎云/傅利叶 | AI应用：商汤/旷视/第四范式',
      key_metrics: '大模型：参数量/推理成本(元/千token)/API调用量/日活用户 | 机器人：自由度/续航/操控精度/商业化场景落地数 | 通用：ARR/NRR/毛利率/烧钱率',
      trends: '1) 从通用大模型转向行业垂直模型(金融/医疗/法律) 2) AI Agent从概念到产品化，多Agent协作框架兴起 3) 具身智能从实验室走向工厂，工业场景优先落地 4) 推理成本持续下降(年降50%+)，端侧AI普及 5) 数据合规/版权争议加剧',
      risk_factors: '1) 大模型同质化严重，价格战加剧(部分API已免费) 2) AI+伪需求项目大量出现，缺乏真实PMF 3) 算力成本与英伟达供应不确定性 4) 数据安全/隐私监管趋严 5) 机器人场景落地节奏不及预期 6) 开源模型冲击闭源商业模型定价权'
    },
    {
      industry_name: '半导体/芯片',
      tier: '1',
      keywords: '半导体,芯片,集成电路,IC设计,MCU,GPU,FPGA,车规芯片,功率半导体,国产替代,晶圆,封测,EDA,光刻,存储芯片',
      market_size: '中国集成电路市场2025年约1.4万亿元(含进口)；国产芯片自给率约30%，2025E目标70%(先进制程约20%)；车规MCU市场约280亿元',
      cagr: '国产芯片CAGR 2024-2028E 约22%；车规芯片CAGR约18%；AI算力芯片CAGR约35%',
      cr3: '晶圆代工：中芯国际/华虹/晶合（国内CR3约75%）；IC设计：韦尔/紫光/华为海思（CR3约40%）；车规MCU：NXP/英飞凌/瑞萨占国内80%+份额',
      cr5: '封测CR5约65%(长电/通富/华天/晶方/伟测)；EDA CR5约90%(海外垄断，华大九天国产率<10%)',
      value_chain: '上游：EDA/IP/材料(光刻胶/硅片/靶材)→设备(光刻机/刻蚀/薄膜) | 中游：IC设计(Fabless)→晶圆代工(Foundry)→封测(OSAT) | 下游：消费电子/汽车/工控/通信/算力',
      key_players: 'IC设计：华为海思/韦尔/紫光国微/寒武纪/壁仞 | 代工：中芯国际/华虹 | 封测：长电/通富/华天 | 设备：北方华创/中微/拓荆 | EDA：华大九天/概伦',
      key_metrics: '制程节点(nm)/良率(%)/流片次数/客户验证周期(月)/Design-in数量/出货量(万颗)/单价($)/毛利率 | 车规：AEC-Q100认证/功能安全ASIL等级/零缺陷PPM',
      trends: '1) 成熟制程(28nm+)国产替代加速，先进制程受制裁仍受限 2) 车规芯片国产化率从5%向20%突破 3) Chiplet/先进封装成为绕过制程限制的关键路径 4) RISC-V生态在IoT/车规领域快速成长 5) AI算力芯片需求爆发(训练+推理)',
      risk_factors: '1) 美国出口管制持续加码，先进制程设备和EDA获取受限 2) 成熟制程产能即将过剩，价格战已现端倪 3) 车规芯片认证周期长(2-3年)，且对可靠性要求极高 4) 国产材料/设备配套率低，供应链断链风险 5) 人才短缺(IC设计/工艺工程师)'
    },
    {
      industry_name: '生物制造/创新药',
      tier: '1',
      keywords: '生物制造,创新药,生物医药,合成生物,CXO,CDMO,临床,管线,靶点,抗体,基因治疗,细胞治疗,mRNA,ADC,GLP-1',
      market_size: '中国创新药市场2025年约1.2万亿元；合成生物制造市场约600亿元；GLP-1类药物中国市场2025E约200亿元',
      cagr: '创新药CAGR 2024-2028E 约15%；合成生物CAGR约30%；GLP-1类药物CAGR约45%',
      cr3: '创新药(按研发投入)：恒瑞/百济/信达（CR3约25%）；CXO：药明康德/药明生物/康龙化成（CR3约50%）；GLP-1：诺和诺德/礼来/信达（国内CR3约80%）',
      cr5: '创新药CR5约35%；CXO CR5约65%；ADC领域海外授权交易活跃，格局快速变化',
      value_chain: '上游：培养基/试剂/生物反应器→细胞株构建→基因编辑工具 | 中游：药物发现(CRO)→临床前研究→临床试验(I/II/III期)→注册申报→商业化生产(CDMO) | 下游：医院/药店/DTP/商保',
      key_players: '创新药：恒瑞/百济/信达/荣昌/康方 | CXO：药明康德/药明生物/康龙化成/凯莱英/博腾 | 合成生物：华熙生物/凯赛生物/蓝晶微生物 | GLP-1：信达/恒瑞/博瑞',
      key_metrics: '管线数量/临床阶段/靶点首创(First-in-class)比例/IND/NDA获批数/出海授权(License-out)金额/研发费用率/商业化营收/毛利率 | 合成生物：菌株产能(g/L)/发酵周期/转化率/产品纯度',
      trends: '1) ADC/双抗成为最热方向，海外授权交易频发(单笔超$1B) 2) GLP-1减重药竞争白热化，口服剂型成下一焦点 3) 基因/细胞治疗从血液瘤向实体瘤突破 4) AI辅助药物发现(AIDD)加速，缩短研发周期30%+ 5) 合成生物从医药扩展到化工/食品/材料 6) FDA/NMPA审批趋严，临床终点要求提高',
      risk_factors: '1) 临床失败率高(III期约50%)，单条管线押注风险大 2) 集采常态化，医保谈判价格持续走低 3) 管线同质化严重(如PD-1超20家)，me-too无定价权 4) 专利悬崖(2025-2030大批重磅药到期) 5) FDA对中国临床数据认可度有限 6) CXO地缘政治风险(美国生物安全法案)'
    },
    {
      industry_name: '低空经济/eVTOL',
      tier: '2',
      keywords: '低空经济,eVTOL,飞行汽车,无人机,适航,空域,通航,城市空中交通,UAM,工业无人机,物流无人机',
      market_size: '中国低空经济2025年约5800亿元(含传统通航)；eVTOL市场2025年约50亿元，2028E预计超300亿元；工业无人机市场约800亿元',
      cagr: '低空经济CAGR 2024-2028E 约25%；eVTOL CAGR 2025-2028E 约80%；工业无人机CAGR约20%',
      cr3: 'eVTOL：亿航/峰飞/时的科技（CR3约60%，取证进度领先）；工业无人机：大疆/纵横/极飞（CR3约70%）',
      cr5: 'eVTOL参与者超20家，但取得TC(型号合格证)的仅亿航1家(2024)；CR5约75%',
      value_chain: '上游：动力电机/电池(高比能)/复合材料/飞控系统/传感器 | 中游：eVTOL整机/工业无人机/通航飞行器 | 下游：载人运输/物流配送/巡检/农林植保/应急救援',
      key_players: 'eVTOL：亿航智能/峰飞航空/时的科技/沃飞长空/御风未来 | 工业无人机：大疆/纵横股份/极飞科技 | 基础设施：中信海直/顺丰无人机',
      key_metrics: 'eVTOL：适航取证进度(TC/PC/AC)/航程(km)/载客数/巡航速度/噪音(dB)/充换电时间 | 无人机：续航(min)/载荷(kg)/作业效率(亩/h)/自主飞行等级 | 通用：订单量/意向单转化率/场景经济性(元/公里)',
      trends: '1) 2024-2025适航取证破冰(亿航EH216-S获TC)，2026-2027商业化试运营 2) 政策密集出台(低空司成立/空域分类改革/地方补贴) 3) eVTOL从载人优先转向载物先行(物流/应急场景确定性更高) 4) 城市空中交通(UAM)需配套基础设施(起降场/空管系统) 5) 固定翼eVTOL(更远航程)vs多旋翼(更灵活)路线分化',
      risk_factors: '1) 适航取证进度不确定(历史超预期延后) 2) 场景经济性未验证(元/公里成本vs替代方案) 3) 空域管制政策落地节奏不确定 4) 安全事故可能引发监管收紧 5) 电池能量密度瓶颈(当前约260Wh/kg，需要400+) 6) 基础设施建设(起降场/空管)需大量投资 7) 政策驱动型市场，退坡风险高'
    },
    {
      industry_name: '新能源/新型储能',
      tier: '2',
      keywords: '新能源,储能,光伏,风电,锂电,钠电,固态电池,工商储,大储,氢能,充电桩,电池回收,新能源车',
      market_size: '中国光伏2025年装机约280GW，市场超5000亿元；新型储能装机2025E约80GWh，市场约2400亿元；动力电池出货约900GWh',
      cagr: '光伏CAGR 2024-2028E 约15%(量增价跌)；新型储能CAGR约40%；钠电池CAGR约100%(基数低)',
      cr3: '光伏组件：隆基/晶科/天合（CR3约45%）；动力电池：宁德时代/比亚迪/中创新航（CR3约75%）；储能系统集成：宁德/比亚迪/阳光电源（CR3约55%）',
      cr5: '光伏CR5约60%；动力电池CR5约85%；储能CR5约65%',
      value_chain: '上游：硅料/硅片/正负极材料/隔膜/电解液→电池电芯→BMS/PCS/EMS | 中游：组件/逆变器/储能系统集成→充电桩/换电站 | 下游：电站投资运营/电网/工商业/户用/新能源车',
      key_players: '光伏：隆基/晶科/天合/晶澳/通威 | 电池：宁德时代/比亚迪/中创新航/国轩/亿纬 | 储能：阳光电源/宁德/比亚迪/南都/派能 | 氢能：亿华通/重塑/国鸿',
      key_metrics: '光伏：转换效率(%)/单瓦成本(元/W)/产能利用率/组件价格(元/W) | 电池：能量密度(Wh/kg)/循环寿命(次)/成本(元/Wh)/产能利用率 | 储能：系统成本(元/Wh)/充放电效率/度电成本/LCOS | 通用：订单可见性/海外占比/毛利率',
      trends: '1) 光伏组件价格触底(0.7-0.8元/W)，行业洗牌加速，N型TOPCon/HJT替代P型 2) 储能从强配走向市场化，工商储经济性已跑通(IRR 12-18%) 3) 钠电池从0到1量产，低温/安全性优势但能量密度劣势 4) 固态电池2027年前后小批量装车 5) 欧美贸易壁垒(CBAM/反补贴)加速中国企业出海本土化 6) 氢能商业化仍处早期，政策依赖度高',
      risk_factors: '1) 光伏产能严重过剩，全行业亏损，可能持续2-3年 2) 储能价格战激烈(系统已降至0.5元/Wh)，盈利压力巨大 3) 动力电池增速放缓(新能源车渗透率超45%) 4) 海外贸易壁垒加剧(欧盟关税/美国IRA限制) 5) 政策补贴退坡(新能源车购置税优惠缩窄) 6) 技术路线不确定性(钠电/固态/钙钛矿颠覆可能)'
    },
    {
      industry_name: '航空航天/商业航天',
      tier: '2',
      keywords: '商业航天,火箭,卫星,星座,航天,发射,太空,载荷,轨道,遥感,通信卫星,导航,空间站,深空',
      market_size: '中国商业航天2025年约5000亿元(含卫星应用)；运载发射服务市场约200亿元；卫星互联网市场约300亿元',
      cagr: '商业航天CAGR 2024-2028E 约20%；发射服务CAGR约30%；卫星互联网CAGR约35%',
      cr3: '商业火箭：天兵/蓝箭/星河动力（CR3约60%）；卫星制造：长光/微纳/银河航天（CR3约50%）；卫星应用：中国卫通/航天宏图/中科星图',
      cr5: '火箭CR5约80%；卫星制造CR5约70%',
      value_chain: '上游：发动机/推进剂/复合材料/电子元器件→卫星平台/载荷 | 中游：火箭研制/总装/发射服务→卫星制造/组网 | 下游：遥感数据服务/通信服务/导航增强/太空资源开发',
      key_players: '火箭：天兵科技/蓝箭航天/星河动力/星际荣耀/天衢航天 | 卫星：长光卫星/银河航天/微纳星空/时空道宇 | 应用：航天宏图/中科星图/中国卫通',
      key_metrics: '火箭：运力(kg/LEO)/发射成功率(%)/发射单价($/kg)/年发射次数/回收能力 | 卫星：在轨数量/星座规模/频段/分辨率/重访周期 | 通用：订单金额/政府vs商业占比/里程碑交付率',
      trends: '1) 可回收火箭技术突破(2024-2025多家验证)，发射成本有望降80% 2) 卫星互联网(G60/GW星座)组网加速，2025-2027密集发射期 3) 遥感数据从政府驱动走向商业应用(金融/保险/ESG) 4) 商业空间站/太空旅游概念兴起但距商业化远 5) 军民融合政策持续推动，军用订单是重要收入来源',
      risk_factors: '1) 火箭发射失败风险(一次失败可能致命) 2) 超长研发周期(3-5年)，资金消耗巨大 3) 政府订单占比较高，商业订单不确定性大 4) 技术门槛极高，人才极度稀缺 5) 国际太空竞赛加剧，频轨资源争夺 6) 监管/安全审批周期长 7) 回收技术可靠性需大量验证'
    },
    {
      industry_name: 'SaaS/企服',
      tier: '3',
      keywords: 'SaaS,企服,企业服务,ERP,CRM,HR SaaS,协同办公,低代码,PaaS,云服务,B2B,数字化,信创',
      market_size: '中国企业级SaaS市场2025年约1200亿元(增速明显放缓)；信创市场约3500亿元',
      cagr: 'SaaS CAGR 2024-2028E 约12%(从30%+大幅下降)；信创CAGR约20%',
      cr3: '通用SaaS：钉钉/企业微信/飞书（CR3约60%协同办公）；ERP：用友/金蝶/SAP（CR3约55%）；垂直SaaS高度分散',
      cr5: '通用SaaS CR5约70%；垂直SaaS CR5<30%各细分领域差异大',
      value_chain: '上游：IaaS(阿里云/腾讯云/华为云)→PaaS(数据库/中间件/低代码) | 中游：通用SaaS(协同/HR/财务/营销)→垂直SaaS(金融/医疗/制造/零售) | 下游：大客户定制化部署/中小企业订阅/信创替换',
      key_players: '通用：钉钉/企微/飞书/用友/金蝶/北森 | 垂直：明源云(地产)/有赞(零售)/百融(金融)/医渡云(医疗) | 信创：金山办公/麒麟/统信/达梦',
      key_metrics: 'ARR(年化经常性收入)/NRR(净收入留存率)/LTV/CAC/续费率/毛利/Gross Margin/现金流/获客成本回收月数',
      trends: '1) 增长降速，资本市场不再为增长买单，要求盈利(PS估值→PE估值) 2) AI+SaaS成为标配，纯工具型SaaS被AI原生产品冲击 3) 信创替换带来结构性机会(党政/金融/电信) 4) 从中小客户转向大客户(客单价高/续费好但交付重) 5) 出海成为增长第二曲线(东南亚/中东)',
      risk_factors: '1) 资本退潮，融资困难，烧钱换增长模式终结 2) AI原生产品颠覆传统SaaS(如Cursor vs传统IDE) 3) 大客户定制化交付重，标准化与定制化矛盾 4) 续费率下降(经济下行客户缩减预算) 5) 人才成本高(研发/实施) 6) 同质化竞争激烈，价格战频发'
    },
    {
      industry_name: '消费品牌',
      tier: '3',
      keywords: '消费,品牌,新消费,食品,饮料,美妆,服装,餐饮,零售,连锁,线下,电商,DTC,出海消费',
      market_size: '中国社会消费品零售总额2025年约48万亿元；线上零售约15万亿元；餐饮约5.5万亿元',
      cagr: '社零CAGR 2024-2028E 约4-5%；线上CAGR约8%；餐饮CAGR约6%',
      cr3: '各细分差异大：美妆(欧莱雅/雅诗兰黛/珀莱雅CR3约25%)；饮料(农夫/娃哈哈/康师傅CR3约40%)；咖啡(瑞幸/星巴克/库迪CR3约70%)',
      cr5: '各细分CR5普遍30-50%，品牌集中度中等，新品牌仍有突围机会但难度加大',
      value_chain: '上游：原料/包材→OEM/ODM代工 | 中游：品牌运营/产品研发→供应链管理 | 下游：线上(天猫/京东/抖音/小红书)→线下(商超/便利店/专卖店)→出海',
      key_players: '美妆：珀莱雅/华熙/贝泰妮/巨子生物 | 餐饮：瑞幸/蜜雪/海底捞 | 休闲零食：三只松鼠/良品/卫龙 | 出海：SHEIN/Temu/名创优品',
      key_metrics: 'GMV/营收增速/毛利率/净利率/复购率/客单价/店效/坪效/库存周转天数/获客成本(CAC)/ROAS/同店增长',
      trends: '1) 消费降级+品质升级并存，性价比品牌崛起 2) 抖音/小红书成为新品主阵地，流量成本持续上升 3) 线下连锁复苏，加盟模式轻资产扩张 4) 出海成为必选项而非可选项(东南亚/中东/拉美) 5) 供应链能力>营销能力成为核心竞争力 6) AI赋能运营(选品/定价/投放/客服)',
      risk_factors: '1) 消费信心不足，大环境疲软 2) 流量红利消退，获客成本持续攀升 3) 同质化严重，品牌忠诚度下降 4) 线上流量平台政策变化风险 5) 食品安全/质量事故可能致命 6) 估值体系从PS回归PE，纯线上流量品牌大幅折价'
    },
    {
      industry_name: '先进制造/工业自动化',
      tier: '3',
      keywords: '先进制造,工业自动化,工业互联网,智能制造,工业机器人,数控机床,3D打印,传感器,PLC,机器视觉,工业软件',
      market_size: '中国工业自动化市场2025年约3500亿元；工业机器人市场约900亿元；工业软件约3500亿元',
      cagr: '工业自动化CAGR 2024-2028E 约10%；工业机器人CAGR约12%；工业软件CAGR约15%',
      cr3: '工业自动化：西门子/ABB/汇川（CR3约35%）；PLC：西门子/三菱/欧姆龙（CR3约60%）；工业机器人：发那科/ABB/安川（CR3约45%）',
      cr5: '工业自动化CR5约50%；国产替代中低压变频器CR5约55%(汇川/英威腾/信捷)；伺服CR5约40%',
      value_chain: '上游：核心零部件(减速器/伺服电机/控制器/传感器)→工业软件(CAD/CAE/EDA/MES) | 中游：工业机器人/数控机床/PLC/DCS→系统集成/产线集成 | 下游：汽车/3C/新能源/半导体/物流',
      key_players: '国产替代：汇川技术/信捷电气/埃斯顿/绿的谐波/双环传动 | 工业软件：中望/华天软件/数码大方 | 机器视觉：奥普特/海康机器人/凌云光',
      key_metrics: '国产化率(%)/订单可见性(月)/产能利用率(%)/回款周期(天)/毛利率/大客户占比/研发费用率 | 核心部件：精度/寿命/响应速度/故障率',
      trends: '1) 国产替代从低压/中低端向高压/高端突破 2) 人形机器人带动精密减速器/力传感器需求 3) 工业软件(设计/仿真/管理)国产化空间大 4) AI+机器视觉提升检测效率10倍+ 5) 柔性制造/小批量多品种需求增长 6) 新能源/半导体产线投资拉动自动化需求',
      risk_factors: '1) 核心零部件(高端减速器/光栅尺/轴承)仍依赖进口 2) 大客户依赖度高，议价能力弱 3) 回款周期长(60-120天)，现金流压力大 4) 经济下行时资本开支收缩，订单波动大 5) 技术追赶需要长期投入，短期难见回报 6) 价格竞争激烈(中低端同质化)'
    }
  ];

  const insertIndustry = db.prepare(`
    INSERT INTO kb_industries (industry_name, tier, keywords, market_size, cagr, cr3, cr5, value_chain, key_players, key_metrics, trends, risk_factors)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const ind of industries) {
    insertIndustry.run(ind.industry_name, ind.tier, ind.keywords, ind.market_size, ind.cagr, ind.cr3, ind.cr5, ind.value_chain, ind.key_players, ind.key_metrics, ind.trends, ind.risk_factors);
  }

  // ===== 估值基准 =====
  const valuations = [
    // AI/具身智能
    { sector: 'AI/大模型', round: '天使/Pre-A', ps_range: '30-80x', pe_range: 'N/A(亏损)', ev_ebitda_range: 'N/A', typical_valuation: '2-8亿', typical_dilution: '15-25%', data_source: 'IT桔子/公开融资数据2025', effective_date: '2025-03' },
    { sector: 'AI/大模型', round: 'A轮', ps_range: '15-40x', pe_range: 'N/A(亏损)', ev_ebitda_range: 'N/A', typical_valuation: '8-25亿', typical_dilution: '15-20%', data_source: 'IT桔子/公开融资数据2025', effective_date: '2025-03' },
    { sector: 'AI/大模型', round: 'B轮', ps_range: '8-20x', pe_range: 'N/A(亏损)', ev_ebitda_range: 'N/A', typical_valuation: '25-80亿', typical_dilution: '10-15%', data_source: 'IT桔子/公开融资数据2025', effective_date: '2025-03' },
    { sector: 'AI应用/SaaS', round: 'A轮', ps_range: '8-20x', pe_range: 'N/A', ev_ebitda_range: 'N/A', typical_valuation: '3-12亿', typical_dilution: '15-20%', data_source: '公开融资数据2025', effective_date: '2025-03' },
    { sector: 'AI应用/SaaS', round: 'B轮', ps_range: '5-12x', pe_range: '30-60x(盈利)', ev_ebitda_range: '20-40x', typical_valuation: '12-35亿', typical_dilution: '10-15%', data_source: '公开融资数据2025', effective_date: '2025-03' },
    { sector: '人形机器人', round: '天使/Pre-A', ps_range: 'N/A(无收入)', pe_range: 'N/A', ev_ebitda_range: 'N/A', typical_valuation: '3-10亿', typical_dilution: '15-25%', data_source: '公开融资数据2025', effective_date: '2025-03' },
    { sector: '人形机器人', round: 'A轮', ps_range: '20-50x', pe_range: 'N/A', ev_ebitda_range: 'N/A', typical_valuation: '10-30亿', typical_dilution: '15-20%', data_source: '公开融资数据2025', effective_date: '2025-03' },
    { sector: '人形机器人', round: 'B轮', ps_range: '10-25x', pe_range: 'N/A', ev_ebitda_range: 'N/A', typical_valuation: '30-60亿', typical_dilution: '10-15%', data_source: '公开融资数据2025', effective_date: '2025-03' },
    // 半导体
    { sector: '芯片/IC设计', round: '天使/Pre-A', ps_range: 'N/A(无收入)', pe_range: 'N/A', ev_ebitda_range: 'N/A', typical_valuation: '3-8亿', typical_dilution: '15-25%', data_source: '半导体投融资报告2025', effective_date: '2025-03' },
    { sector: '芯片/IC设计', round: 'A轮(流片前)', ps_range: 'N/A', pe_range: 'N/A', ev_ebitda_range: 'N/A', typical_valuation: '8-20亿', typical_dilution: '15-20%', data_source: '半导体投融资报告2025', effective_date: '2025-03' },
    { sector: '芯片/IC设计', round: 'A轮(流片后)', ps_range: '15-30x', pe_range: 'N/A', ev_ebitda_range: 'N/A', typical_valuation: '15-35亿', typical_dilution: '10-15%', data_source: '半导体投融资报告2025', effective_date: '2025-03' },
    { sector: '芯片/IC设计', round: 'B轮(量产出货)', ps_range: '8-15x', pe_range: '40-80x(盈利)', ev_ebitda_range: '25-50x', typical_valuation: '30-60亿', typical_dilution: '10-15%', data_source: '半导体投融资报告2025', effective_date: '2025-03' },
    // 创新药
    { sector: '创新药', round: '天使/Pre-A(临床前)', ps_range: 'N/A', pe_range: 'N/A', ev_ebitda_range: 'N/A', typical_valuation: '3-10亿', typical_dilution: '20-30%', data_source: '医药投融资报告2025', effective_date: '2025-03' },
    { sector: '创新药', round: 'A轮(I期临床)', ps_range: 'N/A', pe_range: 'N/A', ev_ebitda_range: 'N/A', typical_valuation: '10-25亿', typical_dilution: '15-20%', data_source: '医药投融资报告2025', effective_date: '2025-03' },
    { sector: '创新药', round: 'B轮(II期)', ps_range: 'N/A', pe_range: 'N/A', ev_ebitda_range: 'N/A', typical_valuation: '25-60亿', typical_dilution: '10-15%', data_source: '医药投融资报告2025', effective_date: '2025-03' },
    { sector: '创新药', round: 'C轮+(III期/NDA)', ps_range: 'N/A', pe_range: 'N/A', ev_ebitda_range: 'N/A', typical_valuation: '60-150亿', typical_dilution: '5-10%', data_source: '医药投融资报告2025', effective_date: '2025-03' },
    // eVTOL
    { sector: 'eVTOL/低空经济', round: '天使/Pre-A', ps_range: 'N/A', pe_range: 'N/A', ev_ebitda_range: 'N/A', typical_valuation: '5-15亿', typical_dilution: '15-25%', data_source: '低空经济投融资报告2025', effective_date: '2025-03' },
    { sector: 'eVTOL/低空经济', round: 'A轮(研发中)', ps_range: 'N/A', pe_range: 'N/A', ev_ebitda_range: 'N/A', typical_valuation: '15-30亿', typical_dilution: '15-20%', data_source: '低空经济投融资报告2025', effective_date: '2025-03' },
    { sector: 'eVTOL/低空经济', round: 'B轮(取证中)', ps_range: 'N/A', pe_range: 'N/A', ev_ebitda_range: 'N/A', typical_valuation: '30-60亿', typical_dilution: '10-15%', data_source: '低空经济投融资报告2025', effective_date: '2025-03' },
    // 储能/新能源
    { sector: '储能/新能源', round: 'A轮', ps_range: '2-5x', pe_range: '15-30x', ev_ebitda_range: '8-15x', typical_valuation: '10-25亿', typical_dilution: '15-20%', data_source: '新能源投融资报告2025', effective_date: '2025-03' },
    { sector: '储能/新能源', round: 'B轮', ps_range: '1.5-3x', pe_range: '12-25x', ev_ebitda_range: '6-12x', typical_valuation: '25-60亿', typical_dilution: '10-15%', data_source: '新能源投融资报告2025', effective_date: '2025-03' },
    { sector: '储能/新能源', round: 'C轮/Pre-IPO', ps_range: '1-2x', pe_range: '10-20x', ev_ebitda_range: '5-10x', typical_valuation: '60-120亿', typical_dilution: '5-10%', data_source: '新能源投融资报告2025', effective_date: '2025-03' },
    // SaaS/企服
    { sector: 'SaaS/企服', round: 'A轮', ps_range: '5-12x', pe_range: 'N/A', ev_ebitda_range: 'N/A', typical_valuation: '2-8亿', typical_dilution: '15-20%', data_source: 'SaaS投融资报告2025', effective_date: '2025-03' },
    { sector: 'SaaS/企服', round: 'B轮', ps_range: '4-8x', pe_range: '30-50x(盈利)', ev_ebitda_range: '20-35x', typical_valuation: '8-20亿', typical_dilution: '10-15%', data_source: 'SaaS投融资报告2025', effective_date: '2025-03' },
    { sector: 'SaaS/企服', round: 'C轮+', ps_range: '3-6x', pe_range: '20-35x', ev_ebitda_range: '15-25x', typical_valuation: '20-50亿', typical_dilution: '5-10%', data_source: 'SaaS投融资报告2025', effective_date: '2025-03' },
    // 商业航天
    { sector: '商业航天', round: '天使/Pre-A', ps_range: 'N/A', pe_range: 'N/A', ev_ebitda_range: 'N/A', typical_valuation: '5-15亿', typical_dilution: '15-25%', data_source: '商业航天投融资报告2025', effective_date: '2025-03' },
    { sector: '商业航天', round: 'A轮', ps_range: 'N/A', pe_range: 'N/A', ev_ebitda_range: 'N/A', typical_valuation: '15-35亿', typical_dilution: '15-20%', data_source: '商业航天投融资报告2025', effective_date: '2025-03' },
    { sector: '商业航天', round: 'B轮(首飞后)', ps_range: '8-15x', pe_range: 'N/A', ev_ebitda_range: 'N/A', typical_valuation: '35-80亿', typical_dilution: '10-15%', data_source: '商业航天投融资报告2025', effective_date: '2025-03' },
  ];

  const insertValuation = db.prepare(`
    INSERT INTO kb_valuation_benchmarks (sector, round, ps_range, pe_range, ev_ebitda_range, typical_valuation, typical_dilution, data_source, effective_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const v of valuations) {
    insertValuation.run(v.sector, v.round, v.ps_range, v.pe_range, v.ev_ebitda_range, v.typical_valuation, v.typical_dilution, v.data_source, v.effective_date);
  }

  // ===== 行业红线规则 =====
  const redlines = [
    // 通用红线
    { industry_name: '通用', category: '创始人', rule: '创始人有过欺诈/失信/重大诉讼记录', severity: 'high', reference: '投委会通用红线' },
    { industry_name: '通用', category: '创始人', rule: '核心团队近6个月离职率>30%', severity: 'high', reference: '投委会通用红线' },
    { industry_name: '通用', category: '创始人', rule: '创始人持股<15%（控制权不足）', severity: 'high', reference: '投委会通用红线' },
    { industry_name: '通用', category: '股权/治理', rule: '股权代持未清理', severity: 'high', reference: '九民纪要' },
    { industry_name: '通用', category: '股权/治理', rule: '机构持股>70%（创始人无实控权）', severity: 'high', reference: '投委会通用红线' },
    { industry_name: '通用', category: '合规', rule: '业务模式涉嫌非法经营/监管灰色地带', severity: 'high', reference: '投委会通用红线' },
    { industry_name: '通用', category: '合规', rule: '数据合规重大瑕疵（尤其涉及个人隐私）', severity: 'high', reference: '个人信息保护法/数据安全法' },
    { industry_name: '通用', category: '市场/财务', rule: 'TAM<50亿且无扩展路径', severity: 'high', reference: '投委会通用红线' },
    { industry_name: '通用', category: '市场/财务', rule: '单位经济模型不成立（毛利<30%或CAC回收>24月）', severity: 'high', reference: '投委会通用红线' },
    { industry_name: '通用', category: '市场/财务', rule: '现金流<6个月且无明确融资/盈利路径', severity: 'high', reference: '投委会通用红线' },
    // AI 行业红线
    { industry_name: 'AI/具身智能/机器人', category: '技术', rule: '大模型套壳无自主训练能力（仅API调用+简单Prompt）', severity: 'high', reference: 'AI项目专项红线' },
    { industry_name: 'AI/具身智能/机器人', category: '技术', rule: '训练数据来源不明/侵权风险高（爬虫无授权/版权未核实）', severity: 'high', reference: 'AI项目专项红线/AIGC版权法规' },
    { industry_name: 'AI/具身智能/机器人', category: '合规', rule: '算法备案/安全评估未完成（生成式AI需备案）', severity: 'high', reference: '生成式人工智能服务管理暂行办法' },
    { industry_name: 'AI/具身智能/机器人', category: '商业模式', rule: 'AI+伪需求：AI仅为噱头，去掉AI核心业务仍可运转', severity: 'medium', reference: 'AI项目专项红线' },
    { industry_name: 'AI/具身智能/机器人', category: '财务', rule: '推理成本>客户支付意愿（无法覆盖边际成本）', severity: 'medium', reference: 'AI项目专项红线' },
    // 半导体红线
    { industry_name: '半导体/芯片', category: '技术', rule: '核心IP来自被制裁供应商且无替代方案', severity: 'high', reference: '半导体项目专项红线/出口管制' },
    { industry_name: '半导体/芯片', category: '合规', rule: '实体清单风险：核心团队/技术在制裁清单', severity: 'high', reference: '半导体项目专项红线/BIS出口管制' },
    { industry_name: '半导体/芯片', category: '技术', rule: '流片3次以上未成功且无明确改进方案', severity: 'high', reference: '半导体项目专项红线' },
    { industry_name: '半导体/芯片', category: '市场', rule: '产品无Design-in进展且竞品已量产', severity: 'medium', reference: '半导体项目专项红线' },
    // 创新药红线
    { industry_name: '生物制造/创新药', category: '技术', rule: '核心管线临床数据不可重复/统计显著性不足(p>0.05)', severity: 'high', reference: '创新药项目专项红线' },
    { industry_name: '生物制造/创新药', category: '合规', rule: 'GMP/GCP严重违规/临床数据造假', severity: 'high', reference: '创新药项目专项红线/GCP规范' },
    { industry_name: '生物制造/创新药', category: '知识产权', rule: '核心专利FTO(自由实施)分析存在侵权风险', severity: 'high', reference: '创新药项目专项红线' },
    { industry_name: '生物制造/创新药', category: '市场', rule: 'me-too管线且竞品已上市3+家，无差异化优势', severity: 'medium', reference: '创新药项目专项红线' },
    // eVTOL红线
    { industry_name: '低空经济/eVTOL', category: '合规', rule: '未取得TC(型号合格证)即大规模预售/承诺交付', severity: 'high', reference: 'eVTOL项目专项红线/CCAR-21' },
    { industry_name: '低空经济/eVTOL', category: '市场', rule: '场景经济性未验证(成本>替代方案3倍以上)', severity: 'medium', reference: 'eVTOL项目专项红线' },
    { industry_name: '低空经济/eVTOL', category: '技术', rule: '电池能量密度<250Wh/kg且无明确升级路径', severity: 'medium', reference: 'eVTOL项目专项红线' },
    // 储能红线
    { industry_name: '新能源/新型储能', category: '市场', rule: '产能利用率<50%且行业已明显过剩', severity: 'high', reference: '新能源项目专项红线' },
    { industry_name: '新能源/新型储能', category: '财务', rule: '海外营收>60%且高度依赖单一国家(贸易壁垒风险)', severity: 'medium', reference: '新能源项目专项红线' },
    { industry_name: '新能源/新型储能', category: '技术', rule: '技术路线被主流厂商放弃(如早期储能用铅酸)', severity: 'high', reference: '新能源项目专项红线' },
  ];

  const insertRedline = db.prepare(`
    INSERT INTO kb_redlines (industry_name, category, rule, severity, reference)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const r of redlines) {
    insertRedline.run(r.industry_name, r.category, r.rule, r.severity, r.reference);
  }

  // ===== 政策法规 =====
  const policies = [
    { industry_name: 'AI/具身智能/机器人', policy_name: '生成式人工智能服务管理暂行办法', issuer: '国家网信办等7部门', summary: '生成式AI服务提供者需完成算法备案、安全评估，对训练数据合法性负责，不得侵害他人知识产权', impact: 'AI企业合规门槛提升，小公司备案压力大', effective_date: '2023-08-15', doc_number: '国家网信办令第12号' },
    { industry_name: 'AI/具身智能/机器人', policy_name: '人工智能安全治理框架(2024)', issuer: '全国网络安全标准化技术委员会', summary: '提出AI安全风险分类框架，覆盖内生安全/应用安全/滥用风险，鼓励安全可信AI发展', impact: 'AI安全合规要求持续加严', effective_date: '2024-09', doc_number: null },
    { industry_name: '半导体/芯片', policy_name: '集成电路企业所得税优惠政策', issuer: '财政部/税务总局', summary: '集成电路线宽<28nm企业10年免征企业所得税；<65nm企业5年免征+5年减半', impact: '显著降低先进制程IC设计/代工企业税负', effective_date: '2020-01-01', doc_number: '财税〔2020〕29号' },
    { industry_name: '半导体/芯片', policy_name: '美国对华半导体出口管制更新', issuer: '美国商务部BIS', summary: '限制先进制程(18nm以下DRAM/128层以上NAND/14nm以下逻辑)设备、EDA工具、高算力芯片对华出口', impact: '先进制程受限，倒逼国产替代加速；成熟制程不受直接影响', effective_date: '2022-10(持续更新)', doc_number: null },
    { industry_name: '低空经济/eVTOL', policy_name: '无人驾驶航空器飞行管理暂行条例', issuer: '国务院/中央军委', summary: '规范无人机分类管理、适航管理、运营许可、空域使用，为eVTOL适航取证和商业运营提供法律基础', impact: 'eVTOL适航取证有法可依，但审批流程长', effective_date: '2024-01-01', doc_number: '国务院令第761号' },
    { industry_name: '低空经济/eVTOL', policy_name: '关于深化低空空域管理改革的指导意见', issuer: '民航局/空管委', summary: '推进空域分类管理、简化审批流程、鼓励低空经济发展，2025年在15个城市试点', impact: '空域开放试点推进，但全面开放仍需时间', effective_date: '2024-12', doc_number: null },
    { industry_name: '新能源/新型储能', policy_name: '新型储能制造业高质量发展行动方案', issuer: '工信部等8部门', summary: '到2027年新型储能制造业规模超3000亿元，培育3-5家千亿级企业，推动钠电池/液流电池/固态电池产业化', impact: '政策明确支持新型储能技术路线多元化', effective_date: '2025-03', doc_number: null },
    { industry_name: '新能源/新型储能', policy_name: '新能源汽车购置税减免政策延续', issuer: '财政部/税务总局/工信部', summary: '2024-2025年免征购置税(上限3万元)；2026-2027年减半征收(上限1.5万元)', impact: '补贴逐步退坡，2026年后优惠缩水', effective_date: '2024-01-01', doc_number: '财政部公告2023年第10号' },
    { industry_name: '生物制造/创新药', policy_name: '全面深化药品医疗器械监管改革意见', issuer: '国务院办公厅', summary: '优化审评审批流程、鼓励创新药研发、加速罕见病药物审批、推进国际监管互认', impact: '创新药审批提速，但同时对数据/质量要求提高', effective_date: '2024-12', doc_number: null },
    { industry_name: 'SaaS/企服', policy_name: '信创产品政府采购需求标准', issuer: '财政部/工信部', summary: '党政机关/关键基础设施优先采购国产化产品(操作系统/数据库/中间件/办公软件)', impact: '信创替换为国产SaaS/基础软件带来确定性增量', effective_date: '2023-12', doc_number: null },
  ];

  const insertPolicy = db.prepare(`
    INSERT INTO kb_policies (industry_name, policy_name, issuer, summary, impact, effective_date, doc_number)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const p of policies) {
    insertPolicy.run(p.industry_name, p.policy_name, p.issuer, p.summary, p.impact, p.effective_date, p.doc_number);
  }

  console.log(`✓ 知识库数据写入完成：${industries.length} 个行业档案，${valuations.length} 条估值基准，${redlines.length} 条红线规则，${policies.length} 条政策法规`);
}
