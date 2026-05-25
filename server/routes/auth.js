import { Router } from 'express';
import db from '../db/connection.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import { signToken } from '../utils/token.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// POST /api/auth/register
router.post('/register', async (req, res, next) => {
  try {
    const { name, email: rawEmail, password, phone, organization, role, org_type } = req.body;
    const email = rawEmail ? rawEmail.toLowerCase().trim() : '';

    if (!name || !email || !password) {
      return res.status(400).json({ error: '姓名、邮箱和密码为必填项' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: '密码至少 8 位' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: '邮箱格式不正确' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({ error: '该邮箱已注册' });
    }

    const passwordHash = await hashPassword(password);
    const avatarLetter = name.charAt(0).toUpperCase();
    const allowedRoles = ['investor', 'mine_enterprise'];
    const userRole = allowedRoles.includes(role) ? role : 'investor';
    const userOrgType = org_type || userRole;

    const result = db.prepare(`
      INSERT INTO users (name, email, phone, password_hash, role, org_type, organization, avatar_letter, status, verified)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', 0)
    `).run(name, email, phone || null, passwordHash, userRole, userOrgType, organization || null, avatarLetter);

    const user = db.prepare('SELECT id, name, email, role, org_type, organization, avatar_letter FROM users WHERE id = ?').get(result.lastInsertRowid);
    const token = signToken({ id: user.id, email: user.email, role: user.role });

    res.status(201).json({ token, user });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email: rawEmail, password } = req.body;
    const email = rawEmail ? rawEmail.toLowerCase().trim() : '';
    if (!email || !password) {
      return res.status(400).json({ error: '邮箱和密码不能为空' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ? AND status = ?').get(email, 'active');
    if (!user) {
      return res.status(401).json({ error: '邮箱或密码错误' });
    }

    const valid = await comparePassword(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: '邮箱或密码错误' });
    }

    const token = signToken({ id: user.id, email: user.email, role: user.role });
    const { password_hash: _, ...safeUser } = user;

    res.json({ token, user: safeUser });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare(
    'SELECT id, name, email, phone, role, org_type, organization, avatar_letter, status, verified, created_at FROM users WHERE id = ?'
  ).get(req.user.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  res.json({ user });
});

// PUT /api/auth/profile
router.put('/profile', requireAuth, async (req, res, next) => {
  try {
    const { name, phone, organization } = req.body;
    db.prepare('UPDATE users SET name = ?, phone = ?, organization = ?, avatar_letter = ? WHERE id = ?')
      .run(
        name || req.user.name,
        phone || null,
        organization || null,
        (name || '').charAt(0).toUpperCase() || req.user.avatar_letter,
        req.user.id
      );
    const user = db.prepare('SELECT id, name, email, phone, role, org_type, organization, avatar_letter FROM users WHERE id = ?').get(req.user.id);
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

// ── 微信扫码登录 ─────────────────────────────────────
// 需要 wx_appid 和 wx_appsecret 环境变量
// 流程：前端扫码 → 获取 code → 后端换 openid → 绑定/登录

// POST /api/auth/wx-login
// 接收微信 code，换取 openid，查找绑定用户或返回待绑定状态
router.post('/wx-login', async (req, res, next) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: '缺少微信授权码' });

    const appid     = process.env.WX_APPID;
    const appsecret = process.env.WX_APPSECRET;
    if (!appid || !appsecret) {
      return res.status(501).json({ error: '微信登录未配置，请联系管理员设置 WX_APPID 和 WX_APPSECRET 环境变量' });
    }

    // 用 code 向微信服务器换取 openid + session_key
    const wxUrl = `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${appid}&secret=${appsecret}&code=${code}&grant_type=authorization_code`;
    const wxRes = await fetch(wxUrl);
    const wxData = await wxRes.json();

    if (wxData.errcode) {
      return res.status(400).json({ error: '微信授权失败: ' + (wxData.errmsg || wxData.errcode) });
    }

    const openid = wxData.openid;
    const unionid = wxData.unionid || null;

    // 查找已绑定此 openid 的用户
    let user = db.prepare('SELECT * FROM users WHERE wx_openid = ?').get(openid);

    if (user) {
      // 已绑定 → 直接登录
      const token = signToken({ id: user.id, email: user.email, role: user.role });
      const { password_hash: _, ...safeUser } = user;
      return res.json({ token, user: safeUser, bound: true });
    }

    // 未绑定 → 返回 openid，前端引导绑定已有账号或注册
    res.json({ bound: false, openid, unionid });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/wx-bind
// 将 openid 绑定到已有账号（输入邮箱+密码验证身份）
router.post('/wx-bind', async (req, res, next) => {
  try {
    const { openid, email: rawEmail, password } = req.body;
    const email = rawEmail ? rawEmail.toLowerCase().trim() : '';
    if (!openid || !email || !password) {
      return res.status(400).json({ error: '参数不完整' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ? AND status = ?').get(email, 'active');
    if (!user) return res.status(401).json({ error: '邮箱或密码错误' });

    const valid = await comparePassword(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: '邮箱或密码错误' });

    // 绑定 openid
    try { db.exec('ALTER TABLE users ADD COLUMN wx_openid TEXT'); } catch(e) {}
    try { db.exec('ALTER TABLE users ADD COLUMN wx_unionid TEXT'); } catch(e) {}
    db.prepare('UPDATE users SET wx_openid = ? WHERE id = ?').run(openid, user.id);

    const token = signToken({ id: user.id, email: user.email, role: user.role });
    const { password_hash: _, ...safeUser } = user;
    safeUser.wx_openid = openid;
    res.json({ token, user: safeUser, bound: true });
  } catch (err) {
    next(err);
  }
});

export default router;
