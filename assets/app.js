/* ===== 全局共享脚本：导航、登录态切换、计数动画 ===== */
(function () {
  // ---- mock auth state ----
  window.VCPlat = window.VCPlat || {};
  const KEY = "vcplat_user";
  VCPlat.getUser = function () {
    try { return JSON.parse(localStorage.getItem(KEY) || "null"); }
    catch (e) { return null; }
  };
  VCPlat.setUser = function (u) {
    if (u) localStorage.setItem(KEY, JSON.stringify(u));
    else   localStorage.removeItem(KEY);
  };
  VCPlat.logout = function () { VCPlat.setUser(null); location.reload(); };

  // ---- inject background layers ----
  document.addEventListener("DOMContentLoaded", function () {
    if (!document.querySelector(".app-bg")) {
      const a = document.createElement("div"); a.className = "app-bg";
      const g = document.createElement("div"); g.className = "app-grid";
      document.body.prepend(g); document.body.prepend(a);
    }

    // active nav link based on data-page
    const page = document.body.dataset.page;
    document.querySelectorAll(".nav-link").forEach(function (a) {
      if (a.dataset.page === page) a.classList.add("active");
    });

    // auth area in nav
    renderAuthArea();

    // count-up animations
    document.querySelectorAll("[data-count]").forEach(function (el) {
      const target = parseFloat(el.dataset.count);
      const decimals = parseInt(el.dataset.decimals || "0", 10);
      const dur = 1200; const t0 = performance.now();
      function tick(t) {
        const p = Math.min(1, (t - t0) / dur);
        const v = target * (1 - Math.pow(1 - p, 3));
        el.textContent = v.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        if (p < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  });

  function renderAuthArea() {
    const slot = document.getElementById("nav-auth");
    if (!slot) return;
    const u = VCPlat.getUser();
    if (u) {
      slot.innerHTML =
        '<div class="flex items-center gap-3">' +
        '  <span class="chip chip-gold">已认证 · ' + u.role + '</span>' +
        '  <div class="flex items-center gap-2">' +
        '    <div class="w-8 h-8 rounded-full bg-gradient-to-br from-yellow-300 to-yellow-700 flex items-center justify-center text-xs font-bold text-black">' +
              (u.name || "U").slice(0, 1) +
        '    </div>' +
        '    <span class="text-sm text-mute">' + (u.name || "投资者") + '</span>' +
        '    <button onclick="VCPlat.logout()" class="text-xs text-dim hover:text-gold ml-2">退出</button>' +
        '  </div>' +
        '</div>';
    } else {
      slot.innerHTML =
        '<div class="flex items-center gap-2">' +
        '  <a href="auth.html" class="btn btn-ghost">登录</a>' +
        '  <a href="auth.html?tab=register" class="btn btn-gold">注册</a>' +
        '</div>';
    }
  }

  VCPlat.renderAuthArea = renderAuthArea;
})();
