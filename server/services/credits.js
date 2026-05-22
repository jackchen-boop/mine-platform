// 积分服务 — 查询、消费、充值、流水
import db from '../db/connection.js';

export function getUserCredits(userId) {
  const row = db.prepare('SELECT credits FROM users WHERE id = ?').get(userId);
  return row?.credits ?? 0;
}

export function consumeCredits(userId, amount, description, relatedId = null) {
  const user = db.prepare('SELECT credits FROM users WHERE id = ?').get(userId);
  const current = user?.credits ?? 0;
  if (current < amount) {
    return { success: false, error: '积分不足', current, needed: amount };
  }
  const newBalance = current - amount;
  db.prepare('UPDATE users SET credits = ? WHERE id = ?').run(newBalance, userId);
  db.prepare(`
    INSERT INTO credit_transactions (user_id, type, amount, balance_after, description, related_id)
    VALUES (?, 'consumption', ?, ?, ?, ?)
  `).run(userId, -amount, newBalance, description, relatedId);
  return { success: true, balance: newBalance };
}

export function addCredits(userId, amount, description, relatedId = null, type = 'bonus') {
  const user = db.prepare('SELECT credits FROM users WHERE id = ?').get(userId);
  const current = user?.credits ?? 0;
  const newBalance = current + amount;
  db.prepare('UPDATE users SET credits = ? WHERE id = ?').run(newBalance, userId);
  db.prepare(`
    INSERT INTO credit_transactions (user_id, type, amount, balance_after, description, related_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, type, amount, newBalance, description, relatedId);
  return { success: true, balance: newBalance };
}

export function getTransactions(userId, limit = 100) {
  return db.prepare(`
    SELECT id, type, amount, balance_after, description, related_id, created_at
    FROM credit_transactions
    WHERE user_id = ?
    ORDER BY created_at DESC LIMIT ?
  `).all(userId, limit);
}
