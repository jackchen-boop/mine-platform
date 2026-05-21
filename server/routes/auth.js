import { Router } from 'express';
import db from '../db/connection.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import { signToken } from '../utils/token.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// POST /api/auth/register
router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password, phone, organization, role, org_type } = req.body;

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

export default router;
