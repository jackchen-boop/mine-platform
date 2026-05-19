// 认证路由 — /api/auth/*
import { Router } from 'express';
import db from '../db/connection.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import { signToken } from '../utils/token.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// POST /api/auth/register
router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password, phone, organization, role } = req.body;

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
    // 普通注册只允许 investor 或 entrepreneur 角色
    const allowedRoles = ['investor', 'entrepreneur'];
    const userRole = allowedRoles.includes(role) ? role : 'investor';

    const result = db.prepare(`
      INSERT INTO users (name, email, phone, password_hash, role, organization, avatar_letter, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(name, email, phone || null, passwordHash, userRole, organization || null, avatarLetter);

    const user = db.prepare('SELECT id, name, email, role, organization, avatar_letter FROM users WHERE id = ?').get(result.lastInsertRowid);
    const token = signToken({ id: user.id, email: user.email, role: user.role });

    res.status(201).json({ token, user });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
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

// GET /api/auth/me — 获取当前用户信息
router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare(
    'SELECT id, name, email, phone, role, organization, avatar_letter, status, created_at FROM users WHERE id = ?'
  ).get(req.user.id);

  if (!user) return res.status(404).json({ error: '用户不存在' });
  res.json({ user });
});

// PUT /api/auth/profile — 更新个人资料
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
    const user = db.prepare('SELECT id, name, email, phone, role, organization, avatar_letter FROM users WHERE id = ?').get(req.user.id);
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/change-password
router.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: '请填写原密码和新密码' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: '新密码至少 8 位' });
    }

    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
    const valid = await comparePassword(oldPassword, user.password_hash);
    if (!valid) return res.status(401).json({ error: '原密码错误' });

    const newHash = await hashPassword(newPassword);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, req.user.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
