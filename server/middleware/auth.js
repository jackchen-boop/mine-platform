import jwt from 'jsonwebtoken';
import db from '../db/connection.js';

const JWT_SECRET = () => process.env.JWT_SECRET || 'dev-secret-change-in-prod';

// 验证 JWT，将 user 注入 req.user（支持 Authorization header 或 ?token= query 参数）
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : (req.query.token || null);

  if (!token) {
    return res.status(401).json({ error: '请先登录' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET());
    const user = db.prepare('SELECT id, name, email, role, organization, avatar_letter, status FROM users WHERE id = ?').get(payload.id || payload.userId);
    if (!user || user.status !== 'active') {
      return res.status(401).json({ error: '账号不存在或已被禁用' });
    }
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token 无效或已过期，请重新登录' });
  }
}

// 可选认证：有 token 就验证，没有则以游客身份继续
export function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET());
    const user = db.prepare('SELECT id, name, email, role, organization, avatar_letter, status FROM users WHERE id = ?').get(payload.id || payload.userId);
    req.user = (user && user.status === 'active') ? user : null;
  } catch {
    req.user = null;
  }
  next();
}

// 角色权限工厂
export function requireRole(...roles) {
  return [requireAuth, (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: '权限不足' });
    }
    next();
  }];
}
