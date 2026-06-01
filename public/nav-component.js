// 统一导航栏组件 - 自动插入到页面顶部
(function() {
  // 检查当前页面路径
  const currentPath = window.location.pathname;
  const isLoggedIn = !!localStorage.getItem('mine_token');
  const user = JSON.parse(localStorage.getItem('mine_user') || '{}');

  // 构建导航栏 HTML
  const navHtml = `
  <nav class="fixed top-0 left-0 right-0 z-50 border-b border-yellow-900/30" id="main-nav" style="background-image: url('/assets/images/minelab-header-bar.png'); background-size: cover; background-position: center; box-shadow: 0 1px 0 rgba(212,175,55,0.25), 0 4px 28px rgba(0,0,0,0.6);">
  <!-- 遮罩层保证文字可读 -->
  <div style="position:absolute;inset:0;background:rgba(5,8,20,0.55);backdrop-filter:blur(2px);pointer-events:none;"></div>
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8" style="position:relative;z-index:1;">
      <div class="flex items-center justify-between h-16">
        <!-- Logo -->
        <a href="/" class="flex items-center gap-3 flex-shrink-0">
          <div class="w-9 h-9 rounded-lg bg-mine-gold/20 flex items-center justify-center border border-mine-gold/30">
            <span class="text-lg">⛏️</span>
          </div>
          <span class="text-lg font-bold gold-gradient hidden sm:inline">矿脉科技</span>
        </a>

        <!-- Desktop Nav -->
        <div class="hidden md:flex items-center gap-1 flex-1 justify-center">
          <a href="/" class="nav-link px-3 py-2 text-sm text-mine-text2 hover:text-mine-gold transition-colors ${currentPath === '/' ? 'text-mine-gold' : ''}">首页</a>
          <a href="/ai-analysis.html" class="nav-link px-3 py-2 text-sm text-mine-text2 hover:text-mine-gold transition-colors ${currentPath === '/ai-analysis.html' || currentPath === '/upload.html' ? 'text-mine-gold' : ''}">AI分析</a>
          <a href="/workbench.html" class="nav-link px-3 py-2 text-sm text-mine-text2 hover:text-mine-gold transition-colors ${currentPath === '/workbench.html' ? 'text-mine-gold' : ''}">工作台</a>
          <a href="/live.html" class="nav-link px-3 py-2 text-sm text-mine-text2 hover:text-mine-gold transition-colors ${currentPath === '/live.html' ? 'text-mine-gold' : ''}">直播路演</a>
        </div>

        <!-- Right side -->
        <div class="hidden md:flex items-center gap-2 flex-shrink-0">
          ${isLoggedIn ? `
            ${user.role === 'admin' ? `<a href="/admin.html" class="nav-link px-3 py-2 text-sm text-mine-text2 hover:text-mine-gold transition-colors ${currentPath === '/admin.html' ? 'text-mine-gold' : ''}">管理后台</a>` : ''}
            <a href="/dashboard.html" class="nav-link px-3 py-2 text-sm text-mine-text2 hover:text-mine-gold transition-colors ${currentPath === '/dashboard.html' ? 'text-mine-gold' : ''}">会员中心</a>
            <span class="text-xs text-mine-text3">${user.name || ''}</span>
            <button onclick="localStorage.removeItem('mine_token');localStorage.removeItem('mine_user');window.location.reload()" class="text-xs text-mine-text3 hover:text-mine-danger transition-colors">退出</button>
          ` : `
            <a href="/auth.html" class="px-4 py-2 text-sm font-medium rounded-lg bg-mine-gold/10 text-mine-gold border border-mine-gold/30 hover:bg-mine-gold/20 transition-colors">登录 / 注册</a>
          `}
        </div>

        <!-- Mobile menu button -->
        <button id="mobile-menu-btn" class="md:hidden p-2 text-mine-text2 hover:text-mine-gold transition-colors" onclick="toggleMobileMenu()">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- Mobile menu -->
    <div id="mobile-menu" class="hidden md:hidden border-t border-mine-border bg-mine-bg/95 backdrop-blur-xl" style="position:relative;z-index:1;">
      <div class="px-4 py-3 space-y-1">
        <a href="/" class="block px-3 py-2 text-sm text-mine-text2 hover:text-mine-gold ${currentPath === '/' ? 'text-mine-gold' : ''}">首页</a>
        <a href="/ai-analysis.html" class="block px-3 py-2 text-sm text-mine-text2 hover:text-mine-gold ${currentPath === '/ai-analysis.html' || currentPath === '/upload.html' ? 'text-mine-gold' : ''}">AI分析</a>
        <a href="/workbench.html" class="block px-3 py-2 text-sm text-mine-text2 hover:text-mine-gold ${currentPath === '/workbench.html' ? 'text-mine-gold' : ''}">工作台</a>
        <a href="/live.html" class="block px-3 py-2 text-sm text-mine-text2 hover:text-mine-gold ${currentPath === '/live.html' ? 'text-mine-gold' : ''}">直播路演</a>
        ${isLoggedIn ? `
          ${user.role === 'admin' ? `<a href="/admin.html" class="block px-3 py-2 text-sm text-mine-text2 hover:text-mine-gold">管理后台</a>` : ''}
          <a href="/dashboard.html" class="block px-3 py-2 text-sm text-mine-text2 hover:text-mine-gold">会员中心</a>
          <button onclick="localStorage.removeItem('mine_token');localStorage.removeItem('mine_user');window.location.reload()" class="block w-full text-left px-3 py-2 text-sm text-mine-danger">退出登录</button>
        ` : `
          <a href="/auth.html" class="block px-3 py-2 text-sm text-mine-gold">登录 / 注册</a>
        `}
      </div>
    </div>
  </nav>`;

  // 插入导航栏并设置 body padding
  document.body.insertAdjacentHTML('afterbegin', navHtml);
  document.body.style.paddingTop = '64px';

  // 防止 iOS 输入框获焦自动放大（不用 user-scalable=no，避免影响点击）
  const iosStyle = document.createElement('style');
  iosStyle.textContent = 'input, select, textarea { font-size: max(16px, 1em); }';
  document.head.appendChild(iosStyle);

  // 添加 toggle 函数到全局
  window.toggleMobileMenu = function() {
    const menu = document.getElementById('mobile-menu');
    if (menu) menu.classList.toggle('hidden');
  };

  // 点击外部关闭菜单
  document.addEventListener('click', function(e) {
    const menu = document.getElementById('mobile-menu');
    const btn = document.getElementById('mobile-menu-btn');
    if (menu && !menu.contains(e.target) && !btn.contains(e.target)) {
      menu.classList.add('hidden');
    }
  });
})();
