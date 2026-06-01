import { Router } from 'express';
import { createRequire } from 'module';
import db from '../db/connection.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import { signToken } from '../utils/token.js';
import { requireAuth } from '../middleware/auth.js';

const require = createRequire(import.meta.url);

const router = Router();

// 短信验证码内存缓存（生产环境应使用 Redis）
const smsCodeCache = new Map();

// 清理过期验证码
function cleanExpiredCodes() {
  const now = Date.now();
  for (const [phone, data] of smsCodeCache) {
    if (data.expireAt < now) smsCodeCache.delete(phone);
  }
}

// 判断是否为手机号
function isPhoneNumber(str) {
  return /^1[3-9]\d{9}$/.test(str);
}

// 发送阿里云短信
async function sendAliyunSms(phone, code) {
  const accessKeyId = process.env.ALIYUN_SMS_KEY_ID;
  const accessKeySecret = process.env.ALIYUN_SMS_KEY_SECRET;
  const signName = process.env.ALIYUN_SMS_SIGN_NAME || '卓曼杭州企业管理咨询详情';
  const templateCode = process.env.ALIYUN_SMS_TEMPLATE_CODE || 'SMS_335155253';

  if (!accessKeyId || !accessKeySecret) {
    // 未配置凭据时降级为控制台打印
    console.log(`[SMS-FALLBACK] 验证码 ${phone}: ${code}`);
    return { fallback: true };
  }

  const Dysmsapi = require('@alicloud/dysmsapi20170525');
  const OpenApi = require('@alicloud/openapi-client');

  const config = new OpenApi.Config({ accessKeyId, accessKeySecret });
  config.endpoint = 'dysmsapi.aliyuncs.com';
  const client = new Dysmsapi.default(config);

  const sendReq = new Dysmsapi.SendSmsRequest({
    phoneNumbers: phone,
    signName,
    templateCode,
    templateParam: JSON.stringify({ code }),
  });

  const result = await client.sendSms(sendReq);
  const body = result.body;
  if (body.code !== 'OK') {
    throw new Error(`短信发送失败: ${body.message || body.code}`);
  }
  return { bizId: body.bizId };
}

// POST /api/auth/send-sms-code — 发送短信验证码
router.post('/send-sms-code', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone || !isPhoneNumber(phone)) {
      return res.status(400).json({ error: '请输入正确的11位手机号码' });
    }

    // 检查手机号是否已注册
    const existing = db.prepare('SELECT id FROM users WHERE phone = ? AND status = ?').get(phone, 'active');
    if (existing) {
      return res.status(409).json({ error: '该手机号已注册' });
    }

    // 频率限制：60秒内不重复发送
    cleanExpiredCodes();
    const cached = smsCodeCache.get(phone);
    if (cached && cached.expireAt - Date.now() > 4 * 60 * 1000) {
      return res.status(429).json({ error: '发送过于频繁，请稍后再试' });
    }

    // 生成6位验证码
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    smsCodeCache.set(phone, { code, expireAt: Date.now() + 5 * 60 * 1000 });

    // 发送短信
    const result = await sendAliyunSms(phone, code);

    res.json({
      message: '验证码已发送，请在5分钟内完成验证',
      // 非生产环境且降级时返回 code 方便调试
      debug: result.fallback && process.env.NODE_ENV !== 'production' ? code : undefined,
    });
  } catch (err) {
    // 发送失败时清除缓存中的验证码
    smsCodeCache.delete(req.body?.phone);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/register
router.post('/register', async (req, res, next) => {
  try {
    const { name, email: rawEmail, phone, password, sms_code, organization, role, org_type } = req.body;
    const email = rawEmail ? rawEmail.toLowerCase().trim() : '';

    // 手机号注册模式
    if (phone && !email) {
      if (!isPhoneNumber(phone)) {
        return res.status(400).json({ error: '请输入正确的11位手机号码' });
      }
      if (!password || password.length < 8) {
        return res.status(400).json({ error: '密码至少 8 位' });
      }
      if (!name) {
        return res.status(400).json({ error: '姓名为必填项' });
      }
      // 验证短信验证码
      const cached = smsCodeCache.get(phone);
      if (!cached || cached.code !== sms_code || cached.expireAt < Date.now()) {
        return res.status(400).json({ error: '验证码错误或已过期' });
      }

      const existingPhone = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone);
      if (existingPhone) {
        return res.status(409).json({ error: '该手机号已注册' });
      }

      const passwordHash = await hashPassword(password);
      const avatarLetter = name.charAt(0).toUpperCase();
      const allowedRoles = ['investor', 'mine_enterprise'];
      const userRole = allowedRoles.includes(role) ? role : 'investor';
      const userOrgType = org_type || userRole;

      const result = db.prepare(`
        INSERT INTO users (name, email, phone, password_hash, role, org_type, organization, avatar_letter, status, verified)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', 0)
      `).run(name, `${phone}@phone.user`, phone, passwordHash, userRole, userOrgType, organization || null, avatarLetter);

      const user = db.prepare('SELECT id, name, email, phone, role, org_type, organization, avatar_letter FROM users WHERE id = ?').get(result.lastInsertRowid);
      const token = signToken({ id: user.id, email: user.email, role: user.role });

      // 清除验证码
      smsCodeCache.delete(phone);

      res.status(201).json({ token, user });
      return;
    }

    // 邮箱注册模式
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
    const { account, email: rawEmail, password } = req.body;
    const identifier = (account || rawEmail || '').toLowerCase().trim();
    if (!identifier || !password) {
      return res.status(400).json({ error: '账号和密码不能为空' });
    }

    let user;
    // 判断是手机号还是邮箱
    if (isPhoneNumber(identifier)) {
      user = db.prepare('SELECT * FROM users WHERE phone = ? AND status = ?').get(identifier, 'active');
    } else {
      user = db.prepare('SELECT * FROM users WHERE email = ? AND status = ?').get(identifier, 'active');
    }

    if (!user) {
      return res.status(401).json({ error: '账号或密码错误' });
    }

    const valid = await comparePassword(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: '账号或密码错误' });
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
