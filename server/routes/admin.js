import { Router } from 'express';
import db from '../db/connection.js';
import { requireRole } from '../middleware/auth.js';
import { hashPassword } from '../utils/password.js';
import { clearAISettingsCache } from '../lib/ai-provider.js';

const router = Router();
router.use(requireRole('admin'));

// ===== Dashboard =====
router.get('/dashboard', (req, res) => {
  try {
    const userTotal = db.prepare("SELECT COUNT(*) as cnt FROM users WHERE status = 'active'").get()?.cnt || 0;
    const projectTotal = db.prepare("SELECT COUNT(*) as cnt FROM mine_projects WHERE status = 'active'").get()?.cnt || 0;
    const reportTotal = db.prepare("SELECT COUNT(*) as cnt FROM ai_analyses").get()?.cnt || 0;
    const inquiryTotal = db.prepare("SELECT COUNT(*) as cnt FROM inquiries").get()?.cnt || 0;
    const mineReportTotal = db.prepare("SELECT COUNT(*) as cnt FROM mine_reports").get()?.cnt || 0;
    const workgroupTotal = db.prepare("SELECT COUNT(*) as cnt FROM workgroups").get()?.cnt || 0;

    const todayUsers = db.prepare("SELECT COUNT(*) as cnt FROM users WHERE date(created_at) = date('now')").get()?.cnt || 0;
    const todayProjects = db.prepare("SELECT COUNT(*) as cnt FROM mine_projects WHERE date(created_at) = date('now')").get()?.cnt || 0;

    const recentUsers = db.prepare('SELECT id, name, email, role, org_type, organization, status, created_at FROM users ORDER BY created_at DESC LIMIT 10').all();
    const recentProjects = db.prepare('SELECT id, code, name, mineral_types, province, status, created_at FROM mine_projects ORDER BY created_at DESC LIMIT 10').all();

    const mineralDist = db.prepare(`
      SELECT mineral_types, COUNT(*) as cnt FROM mine_projects WHERE status = 'active'
      GROUP BY mineral_types ORDER BY cnt DESC LIMIT 8
    `).all();

    const roleDist = db.prepare(`
      SELECT role, COUNT(*) as cnt FROM users WHERE status = 'active' GROUP BY role
    `).all();

    res.json({
      summary: { userTotal, projectTotal, reportTotal, inquiryTotal, mineReportTotal, workgroupTotal },
      today: { users: todayUsers, projects: todayProjects },
      recentUsers, recentProjects, mineralDist, roleDist
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Users CRUD =====

// GET /api/admin/users — 列表（含工作组信息）
router.get('/users', (req, res) => {
  try {
    const users = db.prepare(`
      SELECT id, name, email, phone, role, org_type, organization, status, verified, created_at
      FROM users ORDER BY created_at DESC
    `).all();

    // 查询所有用户的工作组关系
    const wgRows = db.prepare(`
      SELECT wm.user_id, wg.id, wg.name, wg.code, wm.role as member_role
      FROM workgroup_members wm
      JOIN workgroups wg ON wg.id = wm.workgroup_id
      WHERE wg.status = 'active'
    `).all();

    const wgMap = {};
    for (const row of wgRows) {
      if (!wgMap[row.user_id]) wgMap[row.user_id] = [];
      wgMap[row.user_id].push({ id: row.id, name: row.name, code: row.code, member_role: row.member_role });
    }

    for (const user of users) {
      user.workgroups = wgMap[user.id] || [];
    }

    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/users/:id — 详情
router.get('/users/:id', (req, res) => {
  try {
    const user = db.prepare('SELECT id, name, email, phone, role, org_type, organization, status, verified, created_at FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: '用户不存在' });
    // 查询用户所在工作组
    const workgroups = db.prepare(`
      SELECT wg.id, wg.name, wg.code, wm.role as member_role, wm.joined_at
      FROM workgroups wg
      JOIN workgroup_members wm ON wg.id = wm.workgroup_id
      WHERE wm.user_id = ?
    `).all(req.params.id);
    res.json({ user, workgroups });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/users — 创建用户
router.post('/users', async (req, res) => {
  try {
    const { name, email: rawEmail, password, phone, role, org_type, organization, workgroup_id, workgroup_ids, new_workgroup_name } = req.body;
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
    const allowedRoles = ['admin', 'investor', 'mine_enterprise'];
    const userRole = allowedRoles.includes(role) ? role : 'investor';

    const result = db.prepare(`
      INSERT INTO users (name, email, phone, password_hash, role, org_type, organization, avatar_letter, status, verified)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', 0)
    `).run(name, email, phone || null, passwordHash, userRole, org_type || userRole, organization || null, avatarLetter);

    const userId = result.lastInsertRowid;

    // 处理工作组分配（支持多个工作组）
    const assignedWorkgroups = [];

    // 处理 workgroup_ids 数组（多个现有工作组）
    if (workgroup_ids && Array.isArray(workgroup_ids)) {
      for (const wgId of workgroup_ids) {
        const wg = db.prepare('SELECT id FROM workgroups WHERE id = ?').get(wgId);
        if (wg) {
          db.prepare('INSERT OR IGNORE INTO workgroup_members (workgroup_id, user_id, role) VALUES (?,?,?)')
            .run(wgId, userId, 'member');
          assignedWorkgroups.push({ id: wgId, action: 'joined' });
        }
      }
    }

    // 兼容单个 workgroup_id
    if (workgroup_id && (!workgroup_ids || !workgroup_ids.includes(workgroup_id))) {
      const wg = db.prepare('SELECT id FROM workgroups WHERE id = ?').get(workgroup_id);
      if (wg) {
        db.prepare('INSERT OR IGNORE INTO workgroup_members (workgroup_id, user_id, role) VALUES (?,?,?)')
          .run(workgroup_id, userId, 'member');
        assignedWorkgroups.push({ id: workgroup_id, action: 'joined' });
      }
    }

    // 新建工作组
    if (new_workgroup_name && new_workgroup_name.trim()) {
      const code = 'WG-' + Math.random().toString(36).substring(2, 10).toUpperCase();
      const wgResult = db.prepare(`
        INSERT INTO workgroups (name, code, description, owner_id, status)
        VALUES (?, ?, ?, ?, 'active')
      `).run(new_workgroup_name.trim(), code, null, userId);
      db.prepare('INSERT INTO workgroup_members (workgroup_id, user_id, role) VALUES (?,?,?)')
        .run(wgResult.lastInsertRowid, userId, 'owner');
      assignedWorkgroups.push({ id: wgResult.lastInsertRowid, name: new_workgroup_name.trim(), code, action: 'created' });
    }

    const user = db.prepare('SELECT id, name, email, phone, role, org_type, organization, status, created_at FROM users WHERE id = ?').get(userId);
    res.status(201).json({ user, workgroups: assignedWorkgroups, message: '用户已创建' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/users/:id — 更新用户
router.put('/users/:id', async (req, res) => {
  try {
    const { name, email: rawEmail, phone, role, org_type, organization, status, workgroup_ids } = req.body;
    const userId = parseInt(req.params.id);
    const email = rawEmail ? rawEmail.toLowerCase().trim() : null;

    const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!existing) return res.status(404).json({ error: '用户不存在' });

    // 如果修改邮箱，检查是否重复
    if (email) {
      const dup = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, userId);
      if (dup) return res.status(409).json({ error: '该邮箱已被其他用户使用' });
    }

    db.prepare(`
      UPDATE users SET
        name = COALESCE(?, name),
        email = COALESCE(?, email),
        phone = COALESCE(?, phone),
        role = COALESCE(?, role),
        org_type = COALESCE(?, org_type),
        organization = COALESCE(?, organization),
        status = COALESCE(?, status)
      WHERE id = ?
    `).run(
      name ?? null,
      email ?? null,
      phone ?? null,
      role ?? null,
      org_type ?? null,
      organization ?? null,
      status ?? null,
      userId
    );

    // 如果提供了 workgroup_ids，更新用户的工作组关系
    if (workgroup_ids && Array.isArray(workgroup_ids)) {
      // 先移除用户不在新列表中的旧关系
      if (workgroup_ids.length > 0) {
        const placeholders = workgroup_ids.map(() => '?').join(',');
        db.prepare(`DELETE FROM workgroup_members WHERE user_id = ? AND workgroup_id NOT IN (${placeholders})`)
          .run(userId, ...workgroup_ids);
      } else {
        db.prepare('DELETE FROM workgroup_members WHERE user_id = ?').run(userId);
      }
      // 添加新关系（已存在的会被 OR IGNORE 跳过）
      for (const wgId of workgroup_ids) {
        db.prepare('INSERT OR IGNORE INTO workgroup_members (workgroup_id, user_id, role) VALUES (?, ?, ?)')
          .run(wgId, userId, 'member');
      }
    }

    const user = db.prepare('SELECT id, name, email, phone, role, org_type, organization, status, created_at FROM users WHERE id = ?').get(userId);
    res.json({ user, message: '用户已更新' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/users/:id/password — 重置密码
router.put('/users/:id/password', async (req, res) => {
  try {
    const { password } = req.body;
    const userId = parseInt(req.params.id);
    if (!password || password.length < 8) {
      return res.status(400).json({ error: '密码至少 8 位' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!existing) return res.status(404).json({ error: '用户不存在' });

    const passwordHash = await hashPassword(password);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, userId);
    res.json({ message: '密码已重置' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/users/:id — 删除用户
router.delete('/users/:id', (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    if (userId === 1) {
      return res.status(403).json({ error: '不能删除初始管理员账号' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!existing) return res.status(404).json({ error: '用户不存在' });

    db.prepare('DELETE FROM workgroup_members WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM project_participants WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);

    res.json({ message: '用户已删除' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Workgroups CRUD =====

// GET /api/admin/workgroups — 列表
router.get('/workgroups', (req, res) => {
  try {
    const workgroups = db.prepare(`
      SELECT wg.*, u.name as owner_name,
             (SELECT COUNT(*) FROM workgroup_members WHERE workgroup_id = wg.id) as member_count
      FROM workgroups wg
      LEFT JOIN users u ON u.id = wg.owner_id
      ORDER BY wg.created_at DESC
    `).all();
    res.json({ workgroups });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/workgroups/:id — 详情含成员
router.get('/workgroups/:id', (req, res) => {
  try {
    const wg = db.prepare(`
      SELECT wg.*, u.name as owner_name
      FROM workgroups wg
      LEFT JOIN users u ON u.id = wg.owner_id
      WHERE wg.id = ?
    `).get(req.params.id);
    if (!wg) return res.status(404).json({ error: '工作组不存在' });

    const members = db.prepare(`
      SELECT wm.user_id, wm.role as member_role, wm.joined_at, u.name, u.email, u.role as user_role
      FROM workgroup_members wm
      JOIN users u ON u.id = wm.user_id
      WHERE wm.workgroup_id = ?
    `).all(req.params.id);

    res.json({ workgroup: wg, members });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/workgroups — 创建工作组
router.post('/workgroups', (req, res) => {
  try {
    const { name, description, owner_id } = req.body;
    if (!name) return res.status(400).json({ error: '工作组名称为必填项' });

    const code = 'WG-' + Math.random().toString(36).substring(2, 10).toUpperCase();
    const ownerId = owner_id || req.user.id;

    const result = db.prepare(`
      INSERT INTO workgroups (name, code, description, owner_id, status)
      VALUES (?, ?, ?, ?, 'active')
    `).run(name, code, description || null, ownerId);

    // 把创建者加入为 owner
    db.prepare('INSERT OR IGNORE INTO workgroup_members (workgroup_id, user_id, role) VALUES (?,?,?)')
      .run(result.lastInsertRowid, ownerId, 'owner');

    const wg = db.prepare('SELECT * FROM workgroups WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ workgroup: wg, message: '工作组已创建' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/workgroups/:id — 更新工作组
router.put('/workgroups/:id', (req, res) => {
  try {
    const { name, description, status, owner_id } = req.body;
    const wgId = parseInt(req.params.id);

    const existing = db.prepare('SELECT id FROM workgroups WHERE id = ?').get(wgId);
    if (!existing) return res.status(404).json({ error: '工作组不存在' });

    db.prepare(`
      UPDATE workgroups SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        status = COALESCE(?, status),
        owner_id = COALESCE(?, owner_id)
      WHERE id = ?
    `).run(name, description, status, owner_id, wgId);

    const wg = db.prepare('SELECT * FROM workgroups WHERE id = ?').get(wgId);
    res.json({ workgroup: wg, message: '工作组已更新' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/workgroups/:id — 删除工作组
router.delete('/workgroups/:id', (req, res) => {
  try {
    const wgId = parseInt(req.params.id);
    const existing = db.prepare('SELECT id FROM workgroups WHERE id = ?').get(wgId);
    if (!existing) return res.status(404).json({ error: '工作组不存在' });

    db.prepare('DELETE FROM workgroup_members WHERE workgroup_id = ?').run(wgId);
    db.prepare('DELETE FROM workgroups WHERE id = ?').run(wgId);

    res.json({ message: '工作组已删除' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/workgroups/:id/members — 添加成员
router.post('/workgroups/:id/members', (req, res) => {
  try {
    const wgId = parseInt(req.params.id);
    const { user_id, role = 'member' } = req.body;
    if (!user_id) return res.status(400).json({ error: '缺少 user_id' });

    const wg = db.prepare('SELECT id FROM workgroups WHERE id = ?').get(wgId);
    if (!wg) return res.status(404).json({ error: '工作组不存在' });

    const user = db.prepare('SELECT id, name FROM users WHERE id = ?').get(user_id);
    if (!user) return res.status(404).json({ error: '用户不存在' });

    db.prepare('INSERT OR IGNORE INTO workgroup_members (workgroup_id, user_id, role) VALUES (?,?,?)')
      .run(wgId, user_id, role);

    res.json({ message: `${user.name} 已加入工作组` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/workgroups/:id/members/:userId — 移除成员
router.delete('/workgroups/:id/members/:userId', (req, res) => {
  try {
    const wgId = parseInt(req.params.id);
    const userId = parseInt(req.params.userId);

    db.prepare('DELETE FROM workgroup_members WHERE workgroup_id = ? AND user_id = ?').run(wgId, userId);
    res.json({ message: '成员已移除' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Projects CRUD =====

router.get('/projects', (req, res) => {
  try {
    const projects = db.prepare('SELECT * FROM mine_projects ORDER BY created_at DESC').all();
    res.json({ projects });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/projects/:id', (req, res) => {
  try {
    const project = db.prepare('SELECT * FROM mine_projects WHERE id = ?').get(req.params.id);
    if (!project) return res.status(404).json({ error: '项目不存在' });

    const participants = db.prepare(`
      SELECT pp.*, u.name, u.email, u.role as user_role
      FROM project_participants pp
      JOIN users u ON u.id = pp.user_id
      WHERE pp.project_id = ?
    `).all(req.params.id);

    res.json({ project, participants });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/projects', (req, res) => {
  try {
    const { code, name, mineral_types, province, city, asking_price, description, description_masked } = req.body;
    const result = db.prepare(`
      INSERT INTO mine_projects (code, name, mineral_types, province, city, asking_price, description, description_masked, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(code, name, mineral_types, province, city, asking_price, description, description_masked);
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/projects/:id', (req, res) => {
  try {
    const { name, mineral_types, province, city, asking_price, description, description_masked, status, priority_level, priority_score } = req.body;
    const projectId = parseInt(req.params.id);

    const existing = db.prepare('SELECT id FROM mine_projects WHERE id = ?').get(projectId);
    if (!existing) return res.status(404).json({ error: '项目不存在' });

    db.prepare(`
      UPDATE mine_projects SET
        name = COALESCE(?, name),
        mineral_types = COALESCE(?, mineral_types),
        province = COALESCE(?, province),
        city = COALESCE(?, city),
        asking_price = COALESCE(?, asking_price),
        description = COALESCE(?, description),
        description_masked = COALESCE(?, description_masked),
        status = COALESCE(?, status),
        priority_level = COALESCE(?, priority_level),
        priority_score = COALESCE(?, priority_score)
      WHERE id = ?
    `).run(name, mineral_types, province, city, asking_price, description, description_masked, status, priority_level, priority_score, projectId);

    const project = db.prepare('SELECT * FROM mine_projects WHERE id = ?').get(projectId);
    res.json({ project, message: '项目已更新' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/projects/:id', (req, res) => {
  try {
    const projectId = parseInt(req.params.id);
    const existing = db.prepare('SELECT id FROM mine_projects WHERE id = ?').get(projectId);
    if (!existing) return res.status(404).json({ error: '项目不存在' });

    // 先删除所有关联表数据（避免外键约束失败）
    // 注意顺序：先删除引用其他关联表的子表，再删除父表
    db.prepare('DELETE FROM ai_analyses WHERE project_id = ?').run(projectId);
    db.prepare('DELETE FROM ai_conversations WHERE project_id = ?').run(projectId);
    db.prepare('DELETE FROM favorites WHERE project_id = ?').run(projectId);
    db.prepare('DELETE FROM inquiries WHERE project_id = ?').run(projectId);
    db.prepare('DELETE FROM live_streams WHERE project_id = ?').run(projectId);
    db.prepare('DELETE FROM project_tasks WHERE project_id = ?').run(projectId);
    db.prepare('DELETE FROM project_activities WHERE project_id = ?').run(projectId);
    db.prepare('DELETE FROM project_participants WHERE project_id = ?').run(projectId);
    // mine_reports 的 report_id 可能被 ai_analyses 引用，但上面已清除 ai_analyses
    db.prepare('DELETE FROM mine_reports WHERE project_id = ?').run(projectId);
    db.prepare('DELETE FROM mine_projects WHERE id = ?').run(projectId);

    res.json({ message: '项目已删除' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== System Settings =====

// GET /api/admin/settings — 获取系统设置
router.get('/settings', (req, res) => {
  try {
    const rows = db.prepare("SELECT setting_key, setting_value, description FROM system_settings WHERE setting_key LIKE 'ai_%'").all();
    const settings = {};
    for (const row of rows) {
      settings[row.setting_key] = row.setting_value;
    }
    // 补全默认值
    const defaults = {
      ai_provider: 'minimax',
      ai_api_key: '',
      ai_api_base: 'https://api.minimaxi.com/v1',
      ai_model: 'MiniMax-M2.7',
      ai_max_tokens: '4096',
      ai_temperature: '0.3',
      ai_enabled: 'true',
    };
    for (const [key, val] of Object.entries(defaults)) {
      if (settings[key] === undefined) settings[key] = val;
    }
    res.json({ settings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/settings — 更新系统设置
router.post('/settings', (req, res) => {
  try {
    const { settings } = req.body;
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: 'settings 对象必填' });
    }

    const allowedKeys = ['ai_provider', 'ai_api_key', 'ai_api_base', 'ai_model', 'ai_max_tokens', 'ai_temperature', 'ai_enabled'];
    const stmt = db.prepare(`
      INSERT INTO system_settings (setting_key, setting_value, description)
      VALUES (?, ?, ?)
      ON CONFLICT(setting_key) DO UPDATE SET
        setting_value = excluded.setting_value,
        updated_at = datetime('now')
    `);

    for (const [key, val] of Object.entries(settings)) {
      if (!allowedKeys.includes(key)) continue;
      let desc = '';
      if (key === 'ai_provider') desc = 'AI服务提供商';
      if (key === 'ai_api_key') desc = 'API密钥';
      if (key === 'ai_api_base') desc = 'API基础地址';
      if (key === 'ai_model') desc = '模型名称';
      if (key === 'ai_max_tokens') desc = '最大生成token数';
      if (key === 'ai_temperature') desc = '采样温度';
      if (key === 'ai_enabled') desc = '是否启用外部AI';
      stmt.run(key, String(val), desc);
    }

    // 清除AI设置缓存，使新配置立即生效
    clearAISettingsCache();

    res.json({ message: '设置已更新' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── 意向管理 ─────────────────────────────────────────────

// GET /api/admin/inquiries — 意向列表
router.get('/inquiries', (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    let where = '';
    if (status && status !== 'all') { where = 'WHERE i.status = ?'; params.push(status); }

    const total = db.prepare(`SELECT COUNT(*) as cnt FROM inquiries i ${where}`).get(...params)?.cnt || 0;
    const inquiries = db.prepare(`
      SELECT i.*, p.name as project_name, p.code as project_code,
             u.name as user_name, u.phone as user_phone
      FROM inquiries i
      LEFT JOIN mine_projects p ON i.project_id = p.id
      LEFT JOIN users u ON i.user_id = u.id
      ${where}
      ORDER BY i.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, parseInt(limit), offset);

    res.json({ inquiries, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/inquiries/:id/status — 更新意向状态
router.put('/inquiries/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['pending', 'contacted', 'closed'];
    if (!allowed.includes(status)) return res.status(400).json({ error: '无效状态' });
    db.prepare('UPDATE inquiries SET status = ? WHERE id = ?').run(status, req.params.id);
    res.json({ message: '已更新' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── 提取案例库管理 ────────────────────────────────────────

// GET /api/admin/extraction-examples — 获取案例列表，支持 ?mineral=xxx 筛选
router.get('/extraction-examples', (req, res) => {
  try {
    const { mineral } = req.query;
    let query = `
      SELECT e.id, e.mineral_types, e.province, e.source_text, e.extracted,
             e.quality_score, e.created_at,
             u.name as confirmed_by_name
      FROM extraction_examples e
      LEFT JOIN users u ON e.confirmed_by = u.id
    `;
    const params = [];
    if (mineral) {
      query += ' WHERE e.mineral_types LIKE ?';
      params.push(`%${mineral}%`);
    }
    query += ' ORDER BY e.created_at DESC LIMIT 200';

    const examples = db.prepare(query).all(...params);
    const total = db.prepare(
      mineral
        ? 'SELECT COUNT(*) as cnt FROM extraction_examples WHERE mineral_types LIKE ?'
        : 'SELECT COUNT(*) as cnt FROM extraction_examples'
    ).get(...(mineral ? [`%${mineral}%`] : []))?.cnt || 0;

    res.json({ examples, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/extraction-examples/:id — 从案例库移除指定记录
router.delete('/extraction-examples/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: '无效ID' });
    const row = db.prepare('SELECT id FROM extraction_examples WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: '案例不存在' });
    db.prepare('DELETE FROM extraction_examples WHERE id = ?').run(id);
    res.json({ message: '案例已移除' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
