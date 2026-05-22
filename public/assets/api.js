/* ===== 全局 API 客户端 + JWT 认证层 ===== */
/* 替代原 mock auth，所有 API 调用统一走此文件 */
(function () {
  const TOKEN_KEY = 'vcplat_token';
  const USER_KEY  = 'vcplat_user';

  // ── Token 管理 ──────────────────────────────────────────
  window.VCPlat = window.VCPlat || {};

  VCPlat.getToken = () => localStorage.getItem(TOKEN_KEY);
  VCPlat.setToken = (t) => t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY);

  VCPlat.getUser = () => {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
  };
  VCPlat.setUser = (u) => {
    if (u) localStorage.setItem(USER_KEY, JSON.stringify(u));
    else   localStorage.removeItem(USER_KEY);
  };

  VCPlat.isLoggedIn = () => !!VCPlat.getToken();
  VCPlat.isAdmin    = () => VCPlat.getUser()?.role === 'admin';

  VCPlat.logout = function () {
    VCPlat.setToken(null);
    VCPlat.setUser(null);
    location.href = '/auth.html';
  };

  // 保存登录结果
  VCPlat.saveAuth = function ({ token, user }) {
    VCPlat.setToken(token);
    VCPlat.setUser(user);
  };

  // ── 带 JWT 的 fetch 封装 ────────────────────────────────
  VCPlat.authHeaders = function (extra) {
    const h = { 'Content-Type': 'application/json', ...extra };
    const token = VCPlat.getToken();
    if (token) h['Authorization'] = 'Bearer ' + token;
    return h;
  };

  /**
   * 统一 API 请求
   * @param {string} path  - API 路径，如 '/api/projects'
   * @param {object} opts  - fetch 选项，body 传对象会自动 JSON.stringify
   * @returns {Promise<any>}
   */
  VCPlat.api = async function (path, opts = {}) {
    const { body, ...rest } = opts;
    const resp = await fetch(path, {
      headers: VCPlat.authHeaders(),
      ...(body ? { body: JSON.stringify(body) } : {}),
      ...rest
    });

    if (resp.status === 401) {
      // 解析错误信息，区分"请先登录"和"Token 过期"
      let errMsg = '请先登录';
      try { const d = await resp.json(); errMsg = d.error || errMsg; } catch {}

      VCPlat.setToken(null);
      VCPlat.setUser(null);

      // 只有在非登录页时才跳转
      if (!location.pathname.includes('auth.html')) {
        const param = errMsg.includes('过期') ? 'expired=1' : 'needlogin=1';
        location.href = '/auth.html?' + param;
      }
      throw new Error(errMsg);
    }

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || `请求失败 ${resp.status}`);
    return data;
  };

  // ── SSE 流式请求（支持 JWT）────────────────────────────
  VCPlat.streamAI = async function ({ endpoint, payload, onChunk, onDone, onError, onUsage }) {
    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: VCPlat.authHeaders(),
        body: JSON.stringify(payload || {})
      });
      if (!resp.ok) {
        let detail = '';
        try { detail = (await resp.json()).error || ''; } catch {}
        const msg = '调用失败 ' + resp.status + (detail ? '：' + detail : '');
        if (onError) onError(new Error(msg)); else console.error(msg);
        return;
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '', currentEvent = 'message', dataLines = [];
      const flush = () => {
        if (!dataLines.length) return;
        const data = dataLines.join('\n');
        dataLines = [];
        if (currentEvent === 'done') { if (onDone) onDone(); }
        else if (currentEvent === 'usage') { if (onUsage) { try { onUsage(JSON.parse(data)); } catch {} } }
        else if (currentEvent === 'error') { let m = data; try { m = JSON.parse(data).message || data; } catch {} if (onError) onError(new Error(m)); }
        else { if (onChunk && data) onChunk(data); }
        currentEvent = 'message';
      };
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n'); buf = lines.pop() || '';
        for (const line of lines) {
          if (line === '') { flush(); continue; }
          if (line.startsWith(':')) continue;
          if (line.startsWith('event:')) { currentEvent = line.slice(6).trim(); continue; }
          if (line.startsWith('data:')) { dataLines.push(line.slice(5).replace(/^ /, '')); continue; }
        }
      }
      flush();
      if (onDone) onDone();
    } catch (e) { if (onError) onError(e); else console.error(e); }
  };

  // ── 倒计时动画（保留原实现）──────────────────────────
  VCPlat.startCountUp = function (el) {
    const target = parseFloat(el.dataset.count);
    const decimals = parseInt(el.dataset.decimals || '0', 10);
    const dur = 1200, t0 = performance.now();
    function tick(t) {
      const p = Math.min(1, (t - t0) / dur);
      const v = target * (1 - Math.pow(1 - p, 3));
      el.textContent = v.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  };

  // ── 从 API 加载并驱动 KPI 数字 ─────────────────────────
  VCPlat.loadStats = async function () {
    try {
      const { stats } = await VCPlat.api('/api/stats');
      // data-stat-key="total_projects" 对应 stats.total_projects
      document.querySelectorAll('[data-stat-key]').forEach(el => {
        const key = el.dataset.statKey;
        if (stats[key]) {
          // 优先用 displayValue，也触发数字动画
          const numVal = parseFloat(stats[key].value);
          if (!isNaN(numVal)) {
            el.dataset.count = numVal;
            el.dataset.decimals = numVal % 1 !== 0 ? '1' : '0';
            VCPlat.startCountUp(el);
          } else {
            el.textContent = stats[key].displayValue;
          }
          // 描述文字
          const descEl = el.closest('[data-stat-key-wrap]')?.querySelector('[data-stat-desc]')
            || document.querySelector(`[data-stat-desc="${key}"]`);
          if (descEl) descEl.textContent = stats[key].description || '';
        }
      });
    } catch (e) { console.warn('加载统计数据失败:', e.message); }
  };

  // ── 渲染导航认证区域 ──────────────────────────────────
  function renderAuthArea() {
    const slot = document.getElementById('nav-auth');
    if (!slot) return;
    const u = VCPlat.getUser();
    if (u) {
      const roleLabel = { admin: '管理员', investor: '投资人', entrepreneur: '创业者' }[u.role] || u.role;
      const credits = u.credits || 0;
      slot.innerHTML =
        '<div class="flex items-center gap-3">' +
        '  <button onclick="VCPlat.showRecharge()" class="chip chip-gold flex items-center gap-1 cursor-pointer hover:opacity-90" title="点击充值">' +
        '    <span>💎</span><span id="nav-credits">' + credits + '</span>' +
        '  </button>' +
        '  <span class="chip">已认证 · ' + roleLabel + '</span>' +
        '  <div class="flex items-center gap-2">' +
        '    <div class="w-8 h-8 rounded-full bg-gradient-to-br from-yellow-300 to-yellow-700 flex items-center justify-center text-xs font-bold text-black">' +
              (u.avatar_letter || u.name || 'U').slice(0, 1) +
        '    </div>' +
        '    <a href="/dashboard.html" class="text-sm text-mute hover:text-gold">' + (u.name || '用户') + '</a>' +
        (u.role === 'admin' ? '    <a href="/admin.html" class="text-xs text-dim hover:text-gold">管理后台</a>' : '') +
        '    <button onclick="VCPlat.logout()" class="text-xs text-dim hover:text-gold ml-2">退出</button>' +
        '  </div>' +
        '</div>';
    } else {
      slot.innerHTML =
        '<div class="flex items-center gap-2">' +
        '  <a href="/auth.html" class="btn btn-ghost">登录</a>' +
        '  <a href="/auth.html?tab=register" class="btn btn-gold">注册</a>' +
        '</div>';
    }
  }

  // ── 刷新积分显示 ──────────────────────────────────────
  VCPlat.refreshCredits = async function () {
    try {
      const { credits } = await VCPlat.api('/api/credits');
      const u = VCPlat.getUser();
      if (u) { u.credits = credits; VCPlat.setUser(u); }
      const el = document.getElementById('nav-credits');
      if (el) el.textContent = credits;
      return credits;
    } catch (e) { console.warn('刷新积分失败:', e.message); return null; }
  };

  // ── 充值弹窗 ──────────────────────────────────────────
  VCPlat.showRecharge = function () {
    let modal = document.getElementById('recharge-modal');
    if (modal) { modal.remove(); }
    modal = document.createElement('div');
    modal.id = 'recharge-modal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center';
    modal.innerHTML = `
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" onclick="this.closest('#recharge-modal').remove()"></div>
      <div class="relative glass corner-deco p-8 w-full max-w-sm mx-4 text-center">
        <h2 class="font-serif-cn text-xl font-bold mb-2">充值积分</h2>
        <p class="text-xs text-dim mb-5">1 元 = 100 积分</p>
        <div class="grid grid-cols-3 gap-2 mb-5">
          <button onclick="VCPlat.doRecharge(10)" class="btn btn-ghost text-sm py-2">10元<br><span class="text-gold-2">1000积分</span></button>
          <button onclick="VCPlat.doRecharge(50)" class="btn btn-ghost text-sm py-2">50元<br><span class="text-gold-2">5000积分</span></button>
          <button onclick="VCPlat.doRecharge(100)" class="btn btn-gold text-sm py-2">100元<br><span class="text-white">10000积分</span></button>
        </div>
        <div class="flex gap-2 mb-5">
          <input id="recharge-custom" type="number" min="1" class="input text-sm flex-1" placeholder="自定义金额">
          <button onclick="VCPlat.doRecharge(parseFloat(document.getElementById('recharge-custom').value)||0)" class="btn btn-gold text-sm">充值</button>
        </div>
        <button onclick="this.closest('#recharge-modal').remove()" class="text-xs text-dim hover:text-white">取消</button>
      </div>`;
    document.body.appendChild(modal);
  };

  VCPlat.doRecharge = async function (amount) {
    if (!amount || amount <= 0) return alert('请输入有效的充值金额');
    try {
      const result = await VCPlat.api('/api/credits/recharge', { method: 'POST', body: { amount } });
      alert('充值成功！获得 ' + result.added + ' 积分');
      VCPlat.refreshCredits();
      const modal = document.getElementById('recharge-modal');
      if (modal) modal.remove();
    } catch (e) { alert('充值失败：' + e.message); }
  };

  VCPlat.renderAuthArea = renderAuthArea;

  // ── 简易 markdown → html ─────────────────────────────
  VCPlat.mdToHtml = function (md) {
    if (!md) return '';
    let h = md.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    h = h.replace(/((?:\|[^\n]+\|\n)+)/g, function (block) {
      const rows = block.trim().split('\n').filter(r => r.trim());
      if (rows.length < 2) return block;
      const th = rows[0].split('|').slice(1, -1).map(c => '<th>' + c.trim() + '</th>').join('');
      const body = rows.slice(2).map(r =>
        '<tr>' + r.split('|').slice(1, -1).map(c => '<td>' + c.trim() + '</td>').join('') + '</tr>'
      ).join('');
      return '<table class="md-table"><thead><tr>' + th + '</tr></thead><tbody>' + body + '</tbody></table>';
    });
    h = h.replace(/^######\s+(.+)$/gm,'<h6>$1</h6>').replace(/^#####\s+(.+)$/gm,'<h5>$1</h5>')
         .replace(/^####\s+(.+)$/gm,'<h4>$1</h4>').replace(/^###\s+(.+)$/gm,'<h3>$1</h3>')
         .replace(/^##\s+(.+)$/gm,'<h2>$1</h2>').replace(/^#\s+(.+)$/gm,'<h1>$1</h1>');
    h = h.replace(/^(?:- |\* )(.+)$/gm,'<li>$1</li>').replace(/(<li>.*<\/li>\n?)+/g,'<ul>$&</ul>');
    h = h.replace(/^\d+\.\s+(.+)$/gm,'<li>$1</li>');
    h = h.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/`([^`]+)`/g,'<code>$1</code>');
    h = h.split(/\n{2,}/).map(p =>
      /^<(h\d|ul|ol|table|pre|blockquote)/i.test(p.trim()) ? p : '<p>' + p.replace(/\n/g,'<br>') + '</p>'
    ).join('\n');
    return h;
  };

  // ── 移动端检测 ──────────────────────────────────────
  VCPlat.isMobile = function () {
    return window.innerWidth < 768;
  };

  // ── DOMContentLoaded 初始化 ──────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    // 背景层
    if (!document.querySelector('.app-bg')) {
      const a = document.createElement('div'); a.className = 'app-bg';
      const g = document.createElement('div'); g.className = 'app-grid';
      document.body.prepend(g); document.body.prepend(a);
    }
    // 高亮当前导航
    const page = document.body.dataset.page;
    document.querySelectorAll('.nav-link').forEach(function (a) {
      if (a.dataset.page === page) a.classList.add('active');
    });
    // 渲染认证区域
    renderAuthArea();
    // 移动端汉堡菜单
    injectMobileNav();
    // 静态 count-up（保留兼容）
    document.querySelectorAll('[data-count]').forEach(VCPlat.startCountUp);
  });

  // ── 移动端导航注入 ──────────────────────────────────
  function injectMobileNav() {
    const header = document.querySelector('.top-nav > div');
    if (!header) return;
    // 添加汉堡按钮（仅移动端可见）
    const burger = document.createElement('button');
    burger.id = 'mobile-burger';
    burger.className = 'md:hidden flex flex-col gap-1 p-2';
    burger.innerHTML = '<span class="block w-5 h-0.5 bg-gold-1"></span><span class="block w-5 h-0.5 bg-gold-1"></span><span class="block w-5 h-0.5 bg-gold-1"></span>';
    burger.onclick = toggleMobileMenu;
    // 插到 nav-auth 前面
    const auth = document.getElementById('nav-auth');
    if (auth) header.insertBefore(burger, auth);
    else header.appendChild(burger);
  }

  function toggleMobileMenu() {
    let menu = document.getElementById('mobile-menu');
    if (menu) { menu.remove(); return; }
    const u = VCPlat.getUser();
    const links = [
      { href: '/index.html', text: '首页' },
      { href: '/roadshow.html', text: '项目路演' },
      { href: '/upload.html', text: 'BP 上传' },
      { href: '/analysis.html', text: 'AI 分析' },
      { href: '/workshop.html', text: '投研工坊' },
    ];
    if (u) {
      links.push({ href: '/dashboard.html', text: '用户中心' });
      if (u.role === 'admin') links.push({ href: '/admin.html', text: '管理后台' });
    }
    menu = document.createElement('div');
    menu.id = 'mobile-menu';
    menu.className = 'fixed inset-0 z-50 md:hidden';
    menu.innerHTML = `
      <div class="absolute inset-0 bg-black/70" onclick="this.closest('#mobile-menu').remove()"></div>
      <div class="absolute right-0 top-0 h-full w-64 glass p-6 flex flex-col gap-1">
        <div class="flex items-center justify-between mb-5">
          <span class="font-serif-cn font-bold text-gold-2">导航菜单</span>
          <button onclick="this.closest('#mobile-menu').remove()" class="text-dim text-xl">&times;</button>
        </div>
        ${links.map(l => `<a href="${l.href}" class="block py-2 text-sm hover:text-gold-2 transition">${l.text}</a>`).join('')}
        <div class="mt-auto pt-5 border-t border-white/10">
          ${u ? `<button onclick="VCPlat.logout()" class="text-sm text-red-400">退出登录</button>` : `<a href="/auth.html" class="btn btn-gold w-full text-center text-sm">登录 / 注册</a>`}
        </div>
      </div>`;
    document.body.appendChild(menu);
  }
  VCPlat.toggleMobileMenu = toggleMobileMenu;

})();
