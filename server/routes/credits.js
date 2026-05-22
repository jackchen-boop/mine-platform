// 积分路由 — /api/credits/*
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getUserCredits, addCredits, consumeCredits, getTransactions } from '../services/credits.js';

const router = Router();

// GET /api/credits — 查询当前积分余额
router.get('/', requireAuth, (req, res) => {
  const credits = getUserCredits(req.user.id);
  res.json({ credits });
});

// GET /api/credits/transactions — 积分流水
router.get('/transactions', requireAuth, (req, res) => {
  const txs = getTransactions(req.user.id, 100);
  res.json({ transactions: txs });
});

// POST /api/credits/recharge — 充值（1元=100积分）
router.post('/recharge', requireAuth, (req, res) => {
  const { amount } = req.body;
  const yuan = parseFloat(amount);
  if (!yuan || yuan <= 0 || isNaN(yuan)) {
    return res.status(400).json({ error: '充值金额必须大于0' });
  }
  const creditsToAdd = Math.floor(yuan * 100);
  const result = addCredits(req.user.id, creditsToAdd, `充值 ${yuan} 元`, null, 'recharge');
  res.json({ success: true, credits: result.balance, added: creditsToAdd });
});

// POST /api/credits/consume — 消费积分
router.post('/consume', requireAuth, (req, res) => {
  const { amount, description, related_id } = req.body;
  const amt = parseInt(amount, 10);
  if (!amt || amt <= 0 || isNaN(amt)) {
    return res.status(400).json({ error: '消费金额必须大于0' });
  }
  const result = consumeCredits(req.user.id, amt, description || '积分消费', related_id || null);
  if (!result.success) {
    return res.status(402).json({ error: result.error, needed: result.needed, current: result.current });
  }
  res.json({ success: true, credits: result.balance, consumed: amt });
});

export default router;
