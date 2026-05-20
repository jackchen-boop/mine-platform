/* ============================================================
   专家套件 · 技能注册表 + 调用弹窗组件
   - 技能数据来源：equity-research / investment-banking / pe-vc-investment
   - 登录用户：通过 /api/skill-run 调用星链 AI 引擎（SSE 流式）
   - 未登录：展示登录提示
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
  function openModal(skillId) {
    const s = SKILLS.find(x => x.id === skillId);
    if (!s) return alert("未找到技能：" + skillId);

    const isLoggedIn = typeof VCPlat !== 'undefined' && VCPlat.isLoggedIn();
    let uploadId = null;
    let selectedFiles = [];

    // ── 构建弹窗 HTML ──────────────────────────────────────
    const wrap = document.createElement("div");
    wrap.className = "skill-modal-wrap";
    wrap.innerHTML =
      '<div class="skill-modal-mask"></div>' +
      '<div class="skill-modal glass corner-deco">' +
      '  <button class="skill-modal-close" aria-label="关闭">✕</button>' +
      '  <div class="flex items-start gap-4 mb-4">' +
      '    <div class="w-14 h-14 rounded-xl flex items-center justify-center text-3xl" style="background:rgba(212,175,55,.1);border:1px solid var(--line);">' + s.icon + '</div>' +
      '    <div class="flex-1">' +
      '      <div class="flex items-center gap-2 mb-1">' +
      '        <span class="chip chip-' + (s.suiteColor || "gold") + '">' + s.suite + ' 套件</span>' +
      '        <span class="chip">⏱ ~' + s.time + '</span>' +
      '      </div>' +
      '      <h3 class="font-serif-cn text-2xl font-bold">' + s.name + '</h3>' +
      '      <p class="text-mute text-[13px] leading-6 mt-1">' + s.desc + '</p>' +
      '    </div>' +
      '  </div>' +
      '  <div class="grid grid-cols-2 gap-3 mb-4">' +
      '    <div class="hairline rounded-lg p-3"><div class="text-[11px] text-dim">所需输入</div><div class="text-sm mt-1">' + s.input + '</div></div>' +
      '    <div class="hairline rounded-lg p-3"><div class="text-[11px] text-dim">输出交付物</div><div class="text-sm mt-1 text-gold-2">' + s.output + '</div></div>' +
      '  </div>' +
      (isLoggedIn
        ? '  <div id="sk-upload-box" class="hairline rounded-xl p-4 mb-4">' +
          '    <input type="file" id="sk-fi" multiple accept=".pdf,.pptx,.ppt,.docx,.doc,.txt" style="display:none">' +
          '    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">' +
          '      <span style="font-size:13px;color:var(--text-2);">上传文件（PDF / PPTX / DOCX / TXT）</span>' +
          '      <label for="sk-fi" class="btn btn-gold" style="padding:6px 16px;font-size:13px;cursor:pointer;">选择文件</label>' +
          '    </div>' +
          '    <div id="sk-file-list" style="display:none;margin-bottom:8px;"></div>' +
          '    <div id="sk-validate-result" style="display:none;margin-top:8px;"></div>' +
          '    <div style="display:flex;gap:10px;margin-top:12px;">' +
          '      <button id="sk-upload-btn" class="btn btn-gold" style="flex:1;" disabled>上传并校验</button>' +
          '      <button id="sk-run-btn" class="btn-ai" style="flex:1;justify-content:center;display:none;">' +
          '        <svg viewBox="0 0 16 16" fill="currentColor" style="width:13px;height:13px;margin-right:6px;"><path d="M8 0L9.5 5.5L15 7L9.5 8.5L8 14L6.5 8.5L1 7L6.5 5.5L8 0Z"/></svg>用星链 AI 执行' +
          '      </button>' +
          '    </div>' +
          '  </div>'
        : '  <a href="/auth.html" class="btn btn-gold mt-2 mb-4 w-full justify-center" style="display:flex;">请先登录以使用 AI 技能</a>') +
      '  <div id="sk-ai-wrap" style="display:none;" class="hairline rounded-xl p-4">' +
      '    <div class="flex items-center justify-between mb-3">' +
      '      <div class="ai-status" id="sk-ai-status"><span class="dot"></span><span id="sk-ai-status-txt">连接中…</span></div>' +
      '      <button id="sk-ai-clear" class="text-[11px] text-dim hover:text-gold">清空</button>' +
      '    </div>' +
      '    <div id="sk-ai-out" class="ai-stream" style="max-height:320px;overflow-y:auto;"></div>' +
      '  </div>' +
      '</div>';

    document.body.appendChild(wrap);

    // ── 关闭 ──────────────────────────────────────────────
    function close() { wrap.remove(); }
    wrap.querySelector(".skill-modal-mask").onclick = close;
    wrap.querySelector(".skill-modal-close").onclick = close;
    document.addEventListener("keydown", function esc(e) {
      if (e.key === "Escape") { close(); document.removeEventListener("keydown", esc); }
    });

    if (!isLoggedIn) return;

    // ── 文件 input：直接从弹窗 DOM 取，label for="sk-fi" 原生关联，无需任何 JS .click() ──
    const fi = wrap.querySelector("#sk-fi");
    const fileListEl  = wrap.querySelector("#sk-file-list");
    const validateEl  = wrap.querySelector("#sk-validate-result");
    const uploadBtn   = wrap.querySelector("#sk-upload-btn");
    const runBtn      = wrap.querySelector("#sk-run-btn");

    function renderFiles() {
      if (!selectedFiles.length) { fileListEl.style.display = "none"; uploadBtn.disabled = true; return; }
      fileListEl.style.display = "block";
      fileListEl.innerHTML = selectedFiles.map((f, i) =>
        '<div class="skill-file-item">' +
        '  <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + f.name + '</span>' +
        '  <span style="font-size:11px;color:var(--dim);margin:0 8px;">' + (f.size/1024).toFixed(0) + ' KB</span>' +
        '  <button onclick="this.closest(\'[id=sk-file-list]\'); event.stopPropagation();" data-idx="' + i + '" style="background:none;border:none;cursor:pointer;color:var(--dim);font-size:12px;padding:2px 4px;" title="移除">✕</button>' +
        '</div>'
      ).join('');
      fileListEl.querySelectorAll("[data-idx]").forEach(btn => {
        btn.onclick = function(e) {
          e.stopPropagation();
          selectedFiles.splice(parseInt(this.dataset.idx), 1);
          renderFiles();
        };
      });
      uploadBtn.disabled = false;
    }

    fi.onchange = function () {
      selectedFiles = selectedFiles.concat(Array.from(fi.files)).slice(0, 10);
      fi.value = "";
      renderFiles();
    };

    // ── 上传 + 校验 ───────────────────────────────────────
    uploadBtn.onclick = async function () {
      uploadBtn.disabled = true;
      uploadBtn.textContent = "上传中…";
      validateEl.style.display = "none";
      try {
        const fd = new FormData();
        fd.append("skillKey", s.id);
        selectedFiles.forEach(f => fd.append("files", f));
        const ur = await fetch("/api/skill-upload", {
          method: "POST",
          headers: { Authorization: "Bearer " + VCPlat.getToken() },
          body: fd
        });
        const ud = await ur.json();
        if (!ur.ok) throw new Error(ud.error || "上传失败");
        uploadId = ud.uploadId;
        uploadBtn.textContent = "AI 校验中…";

        const vr = await fetch("/api/skill-validate", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + VCPlat.getToken() },
          body: JSON.stringify({ uploadId, skillKey: s.id })
        });
        const vd = await vr.json();
        if (!vr.ok) throw new Error(vd.error || "校验失败");

        if (vd.sufficient) {
          validateEl.innerHTML = '<div class="skill-validate-pass">✅ 信息充分，可以执行技能' +
            (vd.summary ? '<br><span style="font-size:12px;opacity:.8;">' + vd.summary + '</span>' : '') + '</div>';
          runBtn.style.display = "flex";
          uploadBtn.style.display = "none";
        } else {
          const miss = (vd.missing||[]).length
            ? '<ul style="margin:4px 0 0;padding-left:18px;">' + vd.missing.map(m=>'<li>'+m+'</li>').join('') + '</ul>' : '';
          validateEl.innerHTML =
            '<div class="skill-validate-fail">⚠️ 信息不足，部分内容可能缺失' +
            (vd.summary ? '<br><span style="font-size:12px;">' + vd.summary + '</span>' : '') + miss +
            '<div style="margin-top:8px;"><button id="sk-run-anyway" class="btn" style="font-size:12px;">仍然继续执行</button></div></div>';
          wrap.querySelector("#sk-run-anyway").onclick = function () {
            runBtn.style.display = "flex"; uploadBtn.style.display = "none"; runBtn.click();
          };
          uploadBtn.disabled = false; uploadBtn.textContent = "重新上传";
        }
        validateEl.style.display = "block";
      } catch(err) {
        validateEl.innerHTML = '<div class="skill-validate-fail">❌ ' + err.message + '</div>';
        validateEl.style.display = "block";
        uploadBtn.disabled = false; uploadBtn.textContent = "上传并校验";
      }
    };

    // ── AI 执行 ───────────────────────────────────────────
    wrap.querySelector("#sk-ai-clear").onclick = function () { wrap.querySelector("#sk-ai-out").innerHTML = ""; };
    runBtn.onclick = async function () {
      const aiWrap = wrap.querySelector("#sk-ai-wrap");
      const out    = wrap.querySelector("#sk-ai-out");
      const stBox  = wrap.querySelector("#sk-ai-status");
      const stTxt  = wrap.querySelector("#sk-ai-status-txt");
      runBtn.disabled = true;
      aiWrap.style.display = "block";
      out.innerHTML = '<span class="ai-cursor"></span>';
      stBox.classList.remove("success","error");
      stTxt.textContent = "连接星链 AI 中…";
      setTimeout(() => aiWrap.scrollIntoView({ behavior:"smooth", block:"nearest" }), 100);
      let raw = "", first = true;
      await VCPlat.streamAI({
        endpoint: "/api/skill-run",
        payload: uploadId ? { skill: s.id, uploadId } : { skill: s.id, input: s.desc },
        onChunk: d => { if(first){stTxt.textContent="AI 生成中…";first=false;} raw+=d; out.innerHTML=VCPlat.mdToHtml(raw)+'<span class="ai-cursor"></span>'; out.scrollTop=out.scrollHeight; },
        onUsage: u => console.log("[skill]",u),
        onDone:  () => { out.innerHTML=VCPlat.mdToHtml(raw); stBox.classList.add("success"); stTxt.textContent="执行完成"; runBtn.disabled=false; },
        onError: e => { stBox.classList.add("error"); stTxt.textContent="调用失败："+e.message; runBtn.disabled=false; }
      });
    };
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
