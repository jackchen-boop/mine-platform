/* ============================================================
   专家套件 · 技能注册表 + 调用弹窗组件
   - 技能数据来源：equity-research / investment-banking / pe-vc-investment
   - 在前端 Demo 中通过弹窗收集输入参数，
     生成可粘贴到 QoderWork 主对话窗执行的 Prompt
============================================================ */
(function () {
  // ---------- 技能数据 ----------
  const SKILLS = [
    // ===== 股权投资 (PE/VC) =====
    { id: "pe-vc-investment:筛项目", suite: "股权投资", suiteColor: "purple",
      stage: "1-筛选", icon: "🎯", name: "筛项目",
      desc: "BP/CIM → 一页项目筛选备忘录，含六维评分（量化评分标准）、红线快筛和风险矩阵。",
      input: "项目 BP / CIM 关键信息（公司、赛道、轮次、财务）",
      output: "六维评分卡 · 红线清单 · 一页投资备忘录",
      time: "3 min" },
    { id: "pe-vc-investment:尽调清单", suite: "股权投资", suiteColor: "purple",
      stage: "2-尽调", icon: "📋", name: "尽调清单",
      desc: "项目描述 → 结构化尽调清单（财务/法律/业务/技术 + 行业专项 + 架构专项），含优先级与负责方。",
      input: "公司行业、轮次、特殊关注点",
      output: "DD 清单（含优先级 / 负责方 / 资料模板）",
      time: "2 min" },
    { id: "pe-vc-investment:投决备忘录", suite: "股权投资", suiteColor: "purple",
      stage: "3-投决", icon: "🗂️", name: "投决备忘录",
      desc: "项目信息 + 尽调发现 → IC Memo，含投资逻辑四维论述、估值分析与交易条款摘要。",
      input: "项目信息 + 尽调要点",
      output: "可呈交投委会的完整 IC Memo（PDF）",
      time: "8 min" },
    { id: "pe-vc-investment:测收益", suite: "股权投资", suiteColor: "purple",
      stage: "3-投决", icon: "📈", name: "测收益",
      desc: "交易条款 + 退出假设 → IRR/MOIC/DPI 测算，含多情景对比、25 格敏感性分析与 GP/LP 瀑布分配。",
      input: "投资金额 / 估值 / 退出价 / 周期 / 业绩对赌",
      output: "IRR · MOIC · DPI · 敏感性矩阵 · 瀑布表",
      time: "4 min" },
    { id: "pe-vc-investment:审条款", suite: "股权投资", suiteColor: "purple",
      stage: "3-投决", icon: "✍️", name: "审条款",
      desc: "TS / SPA → 条款审查报告，逐项评估风险等级并给出谈判建议（含九民纪要合规检查）。",
      input: "Term Sheet 或 SPA 文件",
      output: "条款矩阵 · 风险等级 · 谈判要点",
      time: "5 min" },
    { id: "pe-vc-investment:退出分析", suite: "股权投资", suiteColor: "purple",
      stage: "5-投后退出", icon: "🚪", name: "退出分析",
      desc: "被投公司现状 → 退出路径对比报告（IPO/并购/S 基金/回购/清算），含时间与成本估算。",
      input: "被投公司现状 + 基金到期约束",
      output: "5 路径对比矩阵 · 推荐路径 · 行动表",
      time: "5 min" },

    // ===== 投研分析 (Equity Research) =====
    { id: "equity-research:筛项目辅助·研报摘要", suite: "投研", suiteColor: "blue",
      stage: "0-投研支持", icon: "📑", name: "研报摘要",
      desc: "上传 1-10 份券商研报 PDF → 提取核心观点、盈利预测和评级；多份时生成观点分歧矩阵。",
      input: "1-10 份券商 PDF 研报",
      output: "核心观点 · 盈利预测对比 · 评级矩阵",
      time: "3 min" },
    { id: "equity-research:可比公司分析", suite: "投研", suiteColor: "blue",
      stage: "3-投决", icon: "📊", name: "可比公司分析",
      desc: "输入标的 → 筛选可比公司并构建估值指标矩阵，输出估值区间与隐含股价。",
      input: "标的公司 + 同行业可比池",
      output: "PE/PB/PS/EV-EBITDA 矩阵 · 估值区间",
      time: "4 min" },
    { id: "equity-research:深度报告", suite: "投研", suiteColor: "blue",
      stage: "0-投研支持", icon: "📕", name: "公司深度报告",
      desc: "公司名称 + 材料 → 撰写券商体例的公司深度研究报告，覆盖行业、商业模式、财务、估值全框架。",
      input: "公司名称 + 公开资料 / BP",
      output: "30+ 页 PDF 深度报告",
      time: "12 min" },
    { id: "equity-research:行业研究", suite: "投研", suiteColor: "blue",
      stage: "0-投研支持", icon: "🏭", name: "行业研究",
      desc: "行业名称 → 行业全景研究报告，覆盖市场空间、产业链、竞争格局与投资机会。",
      input: "行业名称 / 细分赛道",
      output: "市场地图 · 产业链 · 竞争格局 · 机会点",
      time: "10 min" },
    { id: "equity-research:读年报", suite: "投研", suiteColor: "blue",
      stage: "0-投研支持", icon: "📘", name: "读年报",
      desc: "上传 A 股年报 PDF → 提取核心财务数据、经营分析与风险提示，生成结构化投资备忘录。",
      input: "上市公司年报 PDF",
      output: "财务摘要 · 经营分析 · 风险提示",
      time: "4 min" },
    { id: "equity-research:业绩快评", suite: "投研", suiteColor: "blue",
      stage: "0-投研支持", icon: "⚡", name: "业绩快评",
      desc: "上传业绩公告 / 快报 → 业绩点评报告，含超预期/低预期判断、核心驱动因素与单季度趋势分析。",
      input: "业绩公告 / 快报 / 预告",
      output: "点评报告 · 超预期判断 · 驱动因素",
      time: "3 min" },
    { id: "equity-research:调研纪要", suite: "投研", suiteColor: "blue",
      stage: "2-尽调", icon: "🎤", name: "调研纪要",
      desc: "上传调研笔记 / 录音转写 → 标准化调研纪要，提取核心信息、关键数据点与投资要点。",
      input: "调研笔记 / 电话会转写",
      output: "结构化调研纪要 · 数据点 · 投资要点",
      time: "3 min" },
    { id: "equity-research:晨会纪要", suite: "投研", suiteColor: "blue",
      stage: "0-投研支持", icon: "🌅", name: "晨会纪要",
      desc: "覆盖范围 / 素材 → 晨会汇报材料，覆盖市场回顾、重要事件、公司动态与投资观点。",
      input: "覆盖标的清单 + 当日新闻",
      output: "晨会演讲稿 · 要点速览",
      time: "5 min" },

    // ===== 投行业务 (Investment Banking) =====
    { id: "investment-banking:财务建模", suite: "投行", suiteColor: "gold",
      stage: "3-投决", icon: "🧮", name: "财务建模",
      desc: "历史财报 → CAS 格式三表联动预测模型，含 DCF 与可比公司估值、敏感性与情景分析。",
      input: "历史 3 年财报 + 业务假设",
      output: "三表模型 · DCF · 敏感性 · 情景分析",
      time: "8 min" },
    { id: "investment-banking:路演材料", suite: "投行", suiteColor: "gold",
      stage: "4-融资执行", icon: "🎬", name: "路演材料",
      desc: "项目信息 + 路演类型 → 结构化 PPT 大纲、逐页演讲稿与 Q&A 预案，适配 IPO/债券/并购/定增。",
      input: "项目基本信息 + 路演类型",
      output: "PPT 大纲 · 逐页演讲稿 · Q&A 预案",
      time: "6 min" },
    { id: "investment-banking:并购方案", suite: "投行", suiteColor: "gold",
      stage: "5-投后退出", icon: "🤝", name: "并购方案",
      desc: "交易背景 + 标的信息 → 并购重组报告书初稿，含定价分析、业绩承诺设计与交易影响测算。",
      input: "交易方案 + 标的资料",
      output: "并购重组报告书初稿",
      time: "10 min" },
    { id: "investment-banking:招股书", suite: "投行", suiteColor: "gold",
      stage: "4-融资执行", icon: "📜", name: "招股书",
      desc: "公司信息 + 拟上市板块 → 注册制招股说明书各章节初稿，适配科创/创业/主板/北交所差异要求。",
      input: "公司材料 + 目标板块",
      output: "招股书各章节初稿",
      time: "15 min" },
    { id: "investment-banking:问询回复", suite: "投行", suiteColor: "gold",
      stage: "4-融资执行", icon: "📨", name: "问询回复",
      desc: "交易所问询函 → 逐条输出符合监管格式的回复初稿，含事实陈述+合理性论证+同行对比+核查意见。",
      input: "问询函 + 公司资料",
      output: "逐条回复初稿（含核查意见）",
      time: "10 min" },
    { id: "investment-banking:债券募集", suite: "投行", suiteColor: "gold",
      stage: "4-融资执行", icon: "💵", name: "债券募集",
      desc: "发行人 + 债券品种 → 募集说明书初稿，含偿债能力专项分析与信用增进措施设计。",
      input: "发行人信息 + 债券品种",
      output: "募集说明书初稿",
      time: "10 min" },
  ];

  // 阶段 → 元信息
  const STAGES = [
    { key: "0-投研支持", name: "投研支持",   icon: "🔭", color: "blue",   tagline: "Research · 全平台底层认知" },
    { key: "1-筛选",     name: "筛选立项",   icon: "🎯", color: "purple", tagline: "Sourcing · 项目入池" },
    { key: "2-尽调",     name: "尽职调查",   icon: "🔍", color: "blue",   tagline: "Due Diligence · 风险识别" },
    { key: "3-投决",     name: "投决与估值", icon: "🗂️", color: "gold",   tagline: "IC & Valuation · 投出第一笔钱" },
    { key: "4-融资执行", name: "融资执行",   icon: "🚀", color: "gold",   tagline: "Execution · IPO/定增/并购/债券" },
    { key: "5-投后退出", name: "投后与退出", icon: "🚪", color: "purple", tagline: "Post-investment · 价值兑现" },
  ];

  // ---------- Modal ----------
  function openModal(skillId, contextHint) {
    const s = SKILLS.find(x => x.id === skillId);
    if (!s) return alert("未找到技能：" + skillId);

    // 构造默认 Prompt
    const ctx = contextHint || "";
    const prompt =
      "/" + s.id.split(":")[1] + "\n\n" +
      "请基于以下输入执行《" + s.name + "》技能：\n\n" +
      (ctx ? "【上下文】\n" + ctx + "\n\n" : "") +
      "【期望输出】" + s.output + "\n" +
      "【输出格式】结构化 Markdown，关键数据加粗，结尾附结论与下一步建议。";

    const wrap = document.createElement("div");
    wrap.className = "skill-modal-wrap";
    wrap.innerHTML =
      '<div class="skill-modal-mask"></div>' +
      '<div class="skill-modal glass corner-deco">' +
      '  <button class="skill-modal-close">✕</button>' +
      '  <div class="flex items-start gap-4 mb-5">' +
      '    <div class="w-14 h-14 rounded-xl flex items-center justify-center text-3xl"' +
      '         style="background:rgba(212,175,55,.1);border:1px solid var(--line);">' + s.icon + '</div>' +
      '    <div class="flex-1">' +
      '      <div class="flex items-center gap-2 mb-1">' +
      '        <span class="chip chip-' + (s.suiteColor || "gold") + '">' + s.suite + ' 套件</span>' +
      '        <span class="chip">' + s.id + '</span>' +
      '        <span class="chip">⏱ ~' + s.time + '</span>' +
      '      </div>' +
      '      <h3 class="font-serif-cn text-2xl font-bold">' + s.name + '</h3>' +
      '      <p class="text-mute text-[13px] leading-6 mt-1">' + s.desc + '</p>' +
      '    </div>' +
      '  </div>' +

      '  <div class="grid grid-cols-2 gap-3 mb-4">' +
      '    <div class="hairline rounded-lg p-3"><div class="text-[11px] text-dim">输入</div><div class="text-sm mt-1">' + s.input + '</div></div>' +
      '    <div class="hairline rounded-lg p-3"><div class="text-[11px] text-dim">输出</div><div class="text-sm mt-1 text-gold-2">' + s.output + '</div></div>' +
      '  </div>' +

      '  <label class="label">Prompt（已预填，可直接编辑）</label>' +
      '  <textarea id="skill-prompt" class="input font-mono text-[12px]" style="min-height:200px;line-height:1.6;">' + prompt + '</textarea>' +

      '  <div class="grid grid-cols-2 gap-3 mt-4">' +
      '    <button id="skill-copy"  class="btn btn-gold  justify-center">📋 复制 Prompt</button>' +
      '    <button id="skill-mock"  class="btn btn-ghost justify-center">▶ 在 Demo 中模拟运行</button>' +
      '  </div>' +
      '  <p class="text-xs text-dim mt-3 leading-6">' +
      '    本 Demo 不直接调用大模型。点击「复制 Prompt」后，回到 QoderWork 主对话窗粘贴即可让 AI 真实执行该技能；' +
      '    或点击「模拟运行」查看示意输出（仅用于演示工作流）。' +
      '  </p>' +
      '  <div id="skill-mock-result" class="mt-4"></div>' +
      '</div>';
    document.body.appendChild(wrap);

    function close() { wrap.remove(); }
    wrap.querySelector(".skill-modal-mask").onclick = close;
    wrap.querySelector(".skill-modal-close").onclick = close;
    document.addEventListener("keydown", function esc(e) {
      if (e.key === "Escape") { close(); document.removeEventListener("keydown", esc); }
    });

    wrap.querySelector("#skill-copy").onclick = async function () {
      const txt = wrap.querySelector("#skill-prompt").value;
      try {
        await navigator.clipboard.writeText(txt);
        this.innerHTML = "✓ 已复制，前往 QoderWork 粘贴即可";
        this.style.background = "linear-gradient(120deg,#5eead4,#10b981)";
      } catch (e) {
        wrap.querySelector("#skill-prompt").select(); document.execCommand("copy");
        this.innerHTML = "✓ 已选中 + 复制";
      }
    };

    wrap.querySelector("#skill-mock").onclick = function () {
      const box = wrap.querySelector("#skill-mock-result");
      box.innerHTML = '<div class="hairline rounded-xl p-4"><div class="flex items-center gap-2 mb-2"><span class="pulse-dot"></span><span class="text-sm font-bold">运行中…</span></div><div class="bar-track"><div class="bar-fill" id="mb" style="width:0%;transition:width .2s ease;"></div></div></div>';
      let p = 0;
      const t = setInterval(() => {
        p += Math.random() * 12 + 6; if (p > 100) p = 100;
        const el = wrap.querySelector("#mb"); if (el) el.style.width = p + "%";
        if (p >= 100) { clearInterval(t); box.innerHTML = mockOutput(s); }
      }, 180);
    };
  }

  function mockOutput(s) {
    const samples = {
      "筛项目": '<div class="hairline rounded-xl p-5"><div class="text-xs text-dim mb-2">📄 筛项目结果（示例）</div><div class="font-serif-cn text-base font-bold text-gold-2">凌芯半导体 · 综合评级 A（83 分）</div><div class="grid grid-cols-3 gap-2 mt-3 text-center text-xs"><div class="hairline rounded p-2"><div class="text-dim">赛道</div><div class="text-gold-2">9.4</div></div><div class="hairline rounded p-2"><div class="text-dim">团队</div><div class="text-gold-2">9.0</div></div><div class="hairline rounded p-2"><div class="text-dim">技术</div><div class="text-gold-2">9.2</div></div></div><div class="text-xs text-mute mt-3 leading-6">✓ 红线快筛全部通过 · ⚠ 客户集中度需关注 · 建议进入尽调阶段</div></div>',
      "可比公司分析": '<div class="hairline rounded-xl p-5"><div class="text-xs text-dim mb-2">📊 可比公司估值矩阵</div><table class="w-full text-xs font-mono"><tr class="text-dim border-b border-white/5"><td class="py-2">公司</td><td class="text-right">PE(25E)</td><td class="text-right">PS(25E)</td><td class="text-right">市值(亿)</td></tr><tr class="border-b border-white/5"><td class="py-1.5">兆易创新</td><td class="text-right text-gold-2">68x</td><td class="text-right text-gold-2">12x</td><td class="text-right">820</td></tr><tr class="border-b border-white/5"><td class="py-1.5">芯海科技</td><td class="text-right text-gold-2">82x</td><td class="text-right text-gold-2">15x</td><td class="text-right">95</td></tr><tr><td class="py-1.5">纳芯微</td><td class="text-right text-gold-2">76x</td><td class="text-right text-gold-2">14x</td><td class="text-right">218</td></tr></table><div class="mt-3 text-sm">隐含估值区间：<span class="text-gold-2 font-bold">¥38–46 亿</span>，本轮 ¥45 亿位于区间上沿</div></div>',
      "测收益": '<div class="hairline rounded-xl p-5"><div class="text-xs text-dim mb-2">📈 IRR / MOIC 测算</div><div class="grid grid-cols-3 gap-3 text-center"><div class="hairline rounded p-3"><div class="text-dim text-xs">基准情景</div><div class="text-gold-2 font-mono text-lg">IRR 32%</div><div class="text-xs text-mute">MOIC 3.6x · 5 年</div></div><div class="hairline rounded p-3"><div class="text-dim text-xs">乐观情景</div><div class="text-gold-2 font-mono text-lg">IRR 48%</div><div class="text-xs text-mute">MOIC 5.8x · 5 年</div></div><div class="hairline rounded p-3"><div class="text-dim text-xs">保守情景</div><div class="text-gold-2 font-mono text-lg">IRR 18%</div><div class="text-xs text-mute">MOIC 2.0x · 5 年</div></div></div></div>',
      "退出分析": '<div class="hairline rounded-xl p-5"><div class="text-xs text-dim mb-2">🚪 退出路径对比</div><div class="space-y-2 text-xs"><div class="flex justify-between hairline rounded px-3 py-2"><span>科创板 IPO</span><span class="text-gold-2 font-mono">3-4 年 · 推荐 ★★★★★</span></div><div class="flex justify-between hairline rounded px-3 py-2"><span>港股 IPO</span><span class="font-mono text-mute">2-3 年 · ★★★</span></div><div class="flex justify-between hairline rounded px-3 py-2"><span>并购退出</span><span class="font-mono text-mute">1-2 年 · ★★★</span></div><div class="flex justify-between hairline rounded px-3 py-2"><span>S 基金转让</span><span class="font-mono text-mute">0.5 年 · ★★</span></div></div></div>',
    };
    const html = samples[s.name] || '<div class="hairline rounded-xl p-5 text-mute text-sm">✅ 已生成《' + s.name + '》示例输出。在生产环境中，此处将渲染由真实大模型产出的完整内容。</div>';
    return html;
  }

  // ---------- 暴露 ----------
  window.VCSkills = {
    list:    () => SKILLS,
    stages:  () => STAGES,
    open:    openModal,
    byStage: (stage) => SKILLS.filter(s => s.stage === stage),
  };

  // 全局暴露：data-skill="..." 的按钮点击即唤出
  document.addEventListener("click", function (e) {
    const t = e.target.closest("[data-skill]");
    if (!t) return;
    e.preventDefault();
    openModal(t.dataset.skill, t.dataset.context || "");
  });
})();
