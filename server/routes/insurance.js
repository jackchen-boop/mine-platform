import { Router } from 'express';
import db from '../db/connection.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

// ===== 工具函数 =====
function generateOrderNo() {
  const prefix = 'INS';
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${date}-${random}`;
}

function logLeadAction(leadId, action, oldStatus, newStatus, note, operatedBy) {
  db.prepare(`
    INSERT INTO insurance_lead_logs (lead_id, action, old_status, new_status, note, operated_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(leadId, action, oldStatus || null, newStatus || null, note || null, operatedBy);
}

// ===== 公开接口：提交保险咨询线索 =====
router.post('/leads', (req, res) => {
  try {
    const {
      name, phone, wechat, source, referrer,
      age, marriage, hasLoan, annualIncome, investableAssets, monthlyExpense,
      risks, riskScore, investmentStyle, allocation, recommendations
    } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ error: '请填写称呼和手机号码' });
    }
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      return res.status(400).json({ error: '手机号码格式不正确' });
    }

    // 同一手机号 24 小时内最多提交 3 次
    const recentCount = db.prepare(`
      SELECT COUNT(*) as cnt FROM insurance_leads
      WHERE phone = ? AND created_at > datetime('now', '-1 day')
    `).get(phone)?.cnt || 0;
    if (recentCount >= 3) {
      return res.status(429).json({ error: '提交过于频繁，请稍后再试' });
    }

    const result = db.prepare(`
      INSERT INTO insurance_leads (
        name, phone, wechat, source, referrer,
        age, marriage, has_loan, annual_income, investable_assets, monthly_expense,
        risks, risk_score, investment_style, allocation, recommendations
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name, phone, wechat || null, source || 'insurance-assessment', referrer || null,
      age || null, marriage || null, hasLoan || null,
      annualIncome || 0, investableAssets || 0, monthlyExpense || 0,
      JSON.stringify(risks || []), riskScore || 0, investmentStyle || null,
      JSON.stringify(allocation || {}), JSON.stringify(recommendations || [])
    );

    res.status(201).json({
      message: '提交成功',
      leadId: result.lastInsertRowid
    });
  } catch (err) {
    console.error('[insurance] submit lead error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== 以下接口需要 admin 权限 =====
router.use(requireRole('admin'));

// 仪表盘统计
router.get('/stats', (req, res) => {
  try {
    const totalLeads = db.prepare("SELECT COUNT(*) as cnt FROM insurance_leads").get()?.cnt || 0;
    const newLeads = db.prepare("SELECT COUNT(*) as cnt FROM insurance_leads WHERE status = 'new'").get()?.cnt || 0;
    const todayLeads = db.prepare("SELECT COUNT(*) as cnt FROM insurance_leads WHERE date(created_at) = date('now')").get()?.cnt || 0;
    const orderedLeads = db.prepare("SELECT COUNT(*) as cnt FROM insurance_leads WHERE status = 'ordered'").get()?.cnt || 0;

    const totalOrders = db.prepare("SELECT COUNT(*) as cnt FROM insurance_orders").get()?.cnt || 0;
    const totalPremium = db.prepare("SELECT SUM(premium_amount) as total FROM insurance_orders WHERE status IN ('confirmed', 'paid', 'issued')").get()?.total || 0;
    const totalCommission = db.prepare("SELECT SUM(commission_amount) as total FROM insurance_orders WHERE status IN ('confirmed', 'paid', 'issued')").get()?.total || 0;

    const statusDist = db.prepare(`
      SELECT status, COUNT(*) as cnt FROM insurance_leads GROUP BY status
    `).all();
    const orderStatusDist = db.prepare(`
      SELECT status, COUNT(*) as cnt FROM insurance_orders GROUP BY status
    `).all();

    res.json({
      leads: { total: totalLeads, new: newLeads, today: todayLeads, ordered: orderedLeads },
      orders: { total: totalOrders, totalPremium, totalCommission },
      statusDist,
      orderStatusDist
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 线索列表
router.get('/leads', (req, res) => {
  try {
    const { keyword, status, source, assignedTo, startDate, endDate, page = 1, pageSize = 20 } = req.query;
    const conditions = [];
    const params = [];

    if (keyword) {
      conditions.push('(name LIKE ? OR phone LIKE ? OR wechat LIKE ?)');
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }
    if (status) { conditions.push('status = ?'); params.push(status); }
    if (source) { conditions.push('source = ?'); params.push(source); }
    if (assignedTo) { conditions.push('assigned_to = ?'); params.push(parseInt(assignedTo)); }
    if (startDate) { conditions.push("date(created_at) >= ?"); params.push(startDate); }
    if (endDate) { conditions.push("date(created_at) <= ?"); params.push(endDate); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const offset = (parseInt(page) - 1) * parseInt(pageSize);

    const leads = db.prepare(`
      SELECT l.*, u.name as assigned_name
      FROM insurance_leads l
      LEFT JOIN users u ON u.id = l.assigned_to
      ${where}
      ORDER BY l.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, parseInt(pageSize), offset);

    const total = db.prepare(`SELECT COUNT(*) as cnt FROM insurance_leads l ${where}`).get(...params)?.cnt || 0;

    // 解析 JSON 字段
    const formattedLeads = leads.map(l => ({
      ...l,
      risks: safeJsonParse(l.risks),
      allocation: safeJsonParse(l.allocation),
      recommendations: safeJsonParse(l.recommendations)
    }));

    res.json({ leads: formattedLeads, total, page: parseInt(page), pageSize: parseInt(pageSize) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 线索详情
router.get('/leads/:id', (req, res) => {
  try {
    const lead = db.prepare(`
      SELECT l.*, u.name as assigned_name
      FROM insurance_leads l
      LEFT JOIN users u ON u.id = l.assigned_to
      WHERE l.id = ?
    `).get(req.params.id);
    if (!lead) return res.status(404).json({ error: '线索不存在' });

    const logs = db.prepare(`
      SELECT log.*, u.name as operator_name
      FROM insurance_lead_logs log
      LEFT JOIN users u ON u.id = log.operated_by
      WHERE log.lead_id = ?
      ORDER BY log.created_at DESC
    `).all(req.params.id);

    const orders = db.prepare(`
      SELECT * FROM insurance_orders WHERE lead_id = ? ORDER BY created_at DESC
    `).all(req.params.id);

    res.json({
      lead: {
        ...lead,
        risks: safeJsonParse(lead.risks),
        allocation: safeJsonParse(lead.allocation),
        recommendations: safeJsonParse(lead.recommendations)
      },
      logs,
      orders
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 更新线索状态
router.put('/leads/:id/status', (req, res) => {
  try {
    const { status, note } = req.body;
    const validStatuses = ['new', 'contacted', 'qualified', 'quoted', 'ordered', 'closed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: '无效的状态' });
    }

    const lead = db.prepare('SELECT id, status FROM insurance_leads WHERE id = ?').get(req.params.id);
    if (!lead) return res.status(404).json({ error: '线索不存在' });

    db.prepare(`
      UPDATE insurance_leads
      SET status = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(status, req.params.id);

    logLeadAction(req.params.id, 'status_change', lead.status, status, note, req.user.id);

    res.json({ message: '状态已更新', lead: { ...lead, status } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 分配线索
router.put('/leads/:id/assign', (req, res) => {
  try {
    const { assignedTo, note } = req.body;
    const lead = db.prepare('SELECT id, status, assigned_to FROM insurance_leads WHERE id = ?').get(req.params.id);
    if (!lead) return res.status(404).json({ error: '线索不存在' });

    db.prepare(`
      UPDATE insurance_leads
      SET assigned_to = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(assignedTo || null, req.params.id);

    logLeadAction(req.params.id, 'assign', null, null, note, req.user.id);

    res.json({ message: '分配已更新' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 添加跟进备注
router.post('/leads/:id/notes', (req, res) => {
  try {
    const { note } = req.body;
    if (!note?.trim()) return res.status(400).json({ error: '备注不能为空' });

    const lead = db.prepare('SELECT id, follow_up_note FROM insurance_leads WHERE id = ?').get(req.params.id);
    if (!lead) return res.status(404).json({ error: '线索不存在' });

    const newNote = lead.follow_up_note
      ? `${lead.follow_up_note}\n---\n${new Date().toLocaleString('zh-CN')}: ${note}`
      : `${new Date().toLocaleString('zh-CN')}: ${note}`;

    db.prepare(`
      UPDATE insurance_leads
      SET follow_up_note = ?, last_contacted_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).run(newNote, req.params.id);

    logLeadAction(req.params.id, 'note', null, null, note, req.user.id);

    res.json({ message: '备注已保存' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== 订单管理 =====

// 订单列表
router.get('/orders', (req, res) => {
  try {
    const { keyword, status, productType, page = 1, pageSize = 20 } = req.query;
    const conditions = [];
    const params = [];

    if (keyword) {
      conditions.push('(order_no LIKE ? OR customer_name LIKE ? OR customer_phone LIKE ? OR product_name LIKE ?)');
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }
    if (status) { conditions.push('status = ?'); params.push(status); }
    if (productType) { conditions.push('product_type = ?'); params.push(productType); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const offset = (parseInt(page) - 1) * parseInt(pageSize);

    const orders = db.prepare(`
      SELECT o.*, l.name as lead_name, l.phone as lead_phone
      FROM insurance_orders o
      LEFT JOIN insurance_leads l ON l.id = o.lead_id
      ${where}
      ORDER BY o.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, parseInt(pageSize), offset);

    const total = db.prepare(`SELECT COUNT(*) as cnt FROM insurance_orders o ${where}`).get(...params)?.cnt || 0;

    res.json({ orders, total, page: parseInt(page), pageSize: parseInt(pageSize) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 创建订单
router.post('/orders', (req, res) => {
  try {
    const {
      leadId, customerName, customerPhone, productType, productName,
      insurer, premiumAmount, premiumCurrency, paymentTerm, sumAssured,
      commissionAmount, commissionRate, signedAt, remark
    } = req.body;

    if (!leadId || !customerName || !customerPhone || !productType) {
      return res.status(400).json({ error: '缺少必要字段' });
    }

    const lead = db.prepare('SELECT id FROM insurance_leads WHERE id = ?').get(leadId);
    if (!lead) return res.status(404).json({ error: '线索不存在' });

    const orderNo = generateOrderNo();
    const result = db.prepare(`
      INSERT INTO insurance_orders (
        lead_id, order_no, customer_name, customer_phone, product_type, product_name,
        insurer, premium_amount, premium_currency, payment_term, sum_assured,
        commission_amount, commission_rate, signed_at, remark, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      leadId, orderNo, customerName, customerPhone, productType, productName || null,
      insurer || 'Prudential HK', premiumAmount || 0, premiumCurrency || 'USD',
      paymentTerm || null, sumAssured || 0, commissionAmount || 0, commissionRate || 0,
      signedAt || null, remark || null, req.user.id
    );

    // 自动更新线索状态为已成交
    db.prepare("UPDATE insurance_leads SET status = 'ordered', updated_at = datetime('now') WHERE id = ?").run(leadId);
    logLeadAction(leadId, 'order_created', null, 'ordered', `创建订单 ${orderNo}`, req.user.id);

    res.status(201).json({ message: '订单创建成功', orderId: result.lastInsertRowid, orderNo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 更新订单
router.put('/orders/:id', (req, res) => {
  try {
    const order = db.prepare('SELECT * FROM insurance_orders WHERE id = ?').get(req.params.id);
    if (!order) return res.status(404).json({ error: '订单不存在' });

    const {
      productType, productName, insurer, premiumAmount, premiumCurrency,
      paymentTerm, sumAssured, commissionAmount, commissionRate,
      status, signedAt, issuedAt, remark
    } = req.body;

    db.prepare(`
      UPDATE insurance_orders SET
        product_type = COALESCE(?, product_type),
        product_name = COALESCE(?, product_name),
        insurer = COALESCE(?, insurer),
        premium_amount = COALESCE(?, premium_amount),
        premium_currency = COALESCE(?, premium_currency),
        payment_term = COALESCE(?, payment_term),
        sum_assured = COALESCE(?, sum_assured),
        commission_amount = COALESCE(?, commission_amount),
        commission_rate = COALESCE(?, commission_rate),
        status = COALESCE(?, status),
        signed_at = COALESCE(?, signed_at),
        issued_at = COALESCE(?, issued_at),
        remark = COALESCE(?, remark),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      productType, productName, insurer, premiumAmount, premiumCurrency,
      paymentTerm, sumAssured, commissionAmount, commissionRate,
      status, signedAt, issuedAt, remark, req.params.id
    );

    logLeadAction(order.lead_id, 'order_updated', order.status, status, `订单 ${order.order_no} 更新`, req.user.id);

    res.json({ message: '订单已更新' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 删除订单
router.delete('/orders/:id', (req, res) => {
  try {
    const order = db.prepare('SELECT * FROM insurance_orders WHERE id = ?').get(req.params.id);
    if (!order) return res.status(404).json({ error: '订单不存在' });

    db.prepare('DELETE FROM insurance_orders WHERE id = ?').run(req.params.id);
    logLeadAction(order.lead_id, 'order_deleted', null, null, `订单 ${order.order_no} 删除`, req.user.id);

    res.json({ message: '订单已删除' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 订单详情
router.get('/orders/:id', (req, res) => {
  try {
    const order = db.prepare(`
      SELECT o.*, l.name as lead_name, l.phone as lead_phone
      FROM insurance_orders o
      LEFT JOIN insurance_leads l ON l.id = o.lead_id
      WHERE o.id = ?
    `).get(req.params.id);
    if (!order) return res.status(404).json({ error: '订单不存在' });
    res.json({ order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function safeJsonParse(str) {
  if (!str) return [];
  try { return JSON.parse(str); } catch { return []; }
}

export default router;
