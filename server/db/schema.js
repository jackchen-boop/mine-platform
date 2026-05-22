import db from './connection.js';

export function initSchema() {
  db.exec(`
    -- 用户表
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT    NOT NULL,
      email         TEXT    NOT NULL UNIQUE,
      phone         TEXT    UNIQUE,
      password_hash TEXT    NOT NULL,
      role          TEXT    NOT NULL DEFAULT 'investor',
      organization  TEXT,
      avatar_letter TEXT,
      status        TEXT    NOT NULL DEFAULT 'active',
      created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT
    );

    -- 融资项目表
    CREATE TABLE IF NOT EXISTS projects (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      name              TEXT    NOT NULL,
      name_en           TEXT,
      code_letter       TEXT    NOT NULL DEFAULT '项',
      sector            TEXT    NOT NULL,
      sub_sector        TEXT,
      location          TEXT,
      round             TEXT    NOT NULL,
      amount            TEXT,
      amount_raw        REAL,
      valuation         TEXT,
      valuation_raw     REAL,
      ai_score          REAL,
      progress_pct      INTEGER DEFAULT 0,
      fans_count        INTEGER DEFAULT 0,
      description       TEXT,
      is_hot            INTEGER DEFAULT 0,
      status            TEXT    DEFAULT 'active',
      team_info         TEXT,
      financial_summary TEXT,
      business_model    TEXT,
      created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at        TEXT
    );

    -- BP 上传记录
    CREATE TABLE IF NOT EXISTS bp_uploads (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id           INTEGER NOT NULL REFERENCES users(id),
      project_id        INTEGER REFERENCES projects(id),
      original_filename TEXT    NOT NULL,
      stored_filename   TEXT    NOT NULL,
      file_size         INTEGER,
      file_type         TEXT,
      extracted_text    TEXT,
      parse_result      TEXT,
      parse_status      TEXT    DEFAULT 'pending',
      created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- AI 分析报告
    CREATE TABLE IF NOT EXISTS reports (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER NOT NULL REFERENCES users(id),
      project_id   INTEGER REFERENCES projects(id),
      report_type  TEXT    NOT NULL DEFAULT 'ai_analysis',
      skill_key    TEXT,
      input_params TEXT,
      content      TEXT,
      ai_score     REAL,
      model_used   TEXT,
      token_usage  TEXT,
      title        TEXT,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- 路演表
    CREATE TABLE IF NOT EXISTS roadshows (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id          INTEGER NOT NULL REFERENCES projects(id),
      type                TEXT    NOT NULL DEFAULT 'recorded',
      title               TEXT,
      presenter           TEXT,
      scheduled_at        TEXT,
      duration_min        INTEGER DEFAULT 60,
      viewer_count        INTEGER DEFAULT 0,
      reservation_count   INTEGER DEFAULT 0,
      status              TEXT    DEFAULT 'scheduled',
      created_at          TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- 用户关注
    CREATE TABLE IF NOT EXISTS follows (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id),
      project_id INTEGER NOT NULL REFERENCES projects(id),
      created_at TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, project_id)
    );

    -- 合作机构
    CREATE TABLE IF NOT EXISTS partners (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      name             TEXT    NOT NULL,
      name_en          TEXT,
      type             TEXT    NOT NULL DEFAULT 'gp',
      stage_preference TEXT,
      sector_count     INTEGER DEFAULT 0,
      platform_deals   INTEGER DEFAULT 0,
      fund_size        TEXT,
      is_featured      INTEGER DEFAULT 0,
      sort_order       INTEGER DEFAULT 0,
      created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- 直播权限申请表（创业者申请直播路演，管理员审批）
    CREATE TABLE IF NOT EXISTS live_applications (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      roadshow_id     INTEGER NOT NULL REFERENCES roadshows(id),
      applicant_user_id INTEGER NOT NULL REFERENCES users(id),
      applicant_name  TEXT,
      applicant_org   TEXT,
      status          TEXT    NOT NULL DEFAULT 'pending',
      reason          TEXT,
      admin_notes     TEXT,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- 管理员操作日志
    CREATE TABLE IF NOT EXISTS admin_logs (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_user_id INTEGER NOT NULL REFERENCES users(id),
      action        TEXT    NOT NULL,
      target_type   TEXT,
      target_id     INTEGER,
      detail        TEXT,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- 平台 KPI 缓存
    CREATE TABLE IF NOT EXISTS system_stats (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      stat_key      TEXT    NOT NULL UNIQUE,
      stat_value    REAL    NOT NULL DEFAULT 0,
      display_value TEXT,
      description   TEXT,
      updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- 技能文件上传临时缓存（非 BP，2小时过期）
    CREATE TABLE IF NOT EXISTS skill_uploads (
      id              TEXT PRIMARY KEY,
      user_id         INTEGER NOT NULL REFERENCES users(id),
      skill_key       TEXT    NOT NULL,
      extracted_text  TEXT,
      file_count      INTEGER DEFAULT 1,
      file_meta       TEXT,
      supplement      TEXT,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- ===== RAG 知识库表 =====

    -- 行业档案（市场空间/增速/竞争格局/产业链/关键指标）
    CREATE TABLE IF NOT EXISTS kb_industries (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      industry_name   TEXT    NOT NULL UNIQUE,
      tier            TEXT    NOT NULL DEFAULT '3',
      keywords        TEXT    NOT NULL,
      market_size     TEXT,
      cagr            TEXT,
      cr3             TEXT,
      cr5             TEXT,
      value_chain     TEXT,
      key_players     TEXT,
      key_metrics     TEXT,
      trends          TEXT,
      risk_factors    TEXT,
      updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- 估值基准（按赛道/轮次的估值倍数区间）
    CREATE TABLE IF NOT EXISTS kb_valuation_benchmarks (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      sector          TEXT    NOT NULL,
      round           TEXT    NOT NULL,
      ps_range        TEXT,
      pe_range        TEXT,
      ev_ebitda_range TEXT,
      typical_valuation TEXT,
      typical_dilution  TEXT,
      data_source     TEXT,
      effective_date  TEXT,
      UNIQUE(sector, round)
    );

    -- 行业红线规则库
    CREATE TABLE IF NOT EXISTS kb_redlines (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      industry_name   TEXT    NOT NULL,
      category        TEXT    NOT NULL,
      rule            TEXT    NOT NULL,
      severity        TEXT    NOT NULL DEFAULT 'high',
      reference       TEXT
    );

    -- 政策法规库
    CREATE TABLE IF NOT EXISTS kb_policies (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      industry_name   TEXT    NOT NULL,
      policy_name     TEXT    NOT NULL,
      issuer          TEXT,
      summary         TEXT    NOT NULL,
      impact          TEXT,
      effective_date  TEXT,
      doc_number      TEXT
    );

    -- 索引
    CREATE INDEX IF NOT EXISTS idx_projects_sector   ON projects(sector);
    CREATE INDEX IF NOT EXISTS idx_projects_round    ON projects(round);
    CREATE INDEX IF NOT EXISTS idx_projects_status   ON projects(status);
    CREATE INDEX IF NOT EXISTS idx_projects_hot      ON projects(is_hot DESC);
    CREATE INDEX IF NOT EXISTS idx_follows_user      ON follows(user_id);
    CREATE INDEX IF NOT EXISTS idx_reports_user      ON reports(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_roadshows_status  ON roadshows(status, scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_live_app_status   ON live_applications(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_live_app_user     ON live_applications(applicant_user_id);
    CREATE INDEX IF NOT EXISTS idx_kb_industry_tier  ON kb_industries(tier);
    CREATE INDEX IF NOT EXISTS idx_kb_val_sector     ON kb_valuation_benchmarks(sector);
    CREATE INDEX IF NOT EXISTS idx_kb_redlines_ind   ON kb_redlines(industry_name);
    CREATE INDEX IF NOT EXISTS idx_kb_policies_ind   ON kb_policies(industry_name);

    -- ===== 上市公司可比公司数据库 =====

    -- 上市公司关键财务指标（用于可比公司分析和估值锚定）
    CREATE TABLE IF NOT EXISTS kb_listed_companies (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      stock_code      TEXT    NOT NULL UNIQUE,
      company_name    TEXT    NOT NULL,
      industry_sw     TEXT,
      industry_sw_l1  TEXT,
      industry_sw_l2  TEXT,
      industry_sw_l3  TEXT,
      listing_board   TEXT,
      listing_date    TEXT,
      revenue         REAL,
      revenue_yoy     REAL,
      net_profit      REAL,
      net_profit_yoy  REAL,
      gross_margin    REAL,
      net_margin      REAL,
      roe             REAL,
      total_assets    REAL,
      total_liab      REAL,
      equity          REAL,
      debt_ratio      REAL,
      cash            REAL,
      ocf             REAL,
      market_cap      REAL,
      pe_ttm          REAL,
      pb              REAL,
      ps_ttm          REAL,
      ev_ebitda       REAL,
      report_year     TEXT,
      data_source     TEXT,
      updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // 迁移：reports 表增加 bp_upload_id 列（SQLite 不支持 IF NOT EXISTS，用 try/catch）
  try { db.exec('ALTER TABLE reports ADD COLUMN bp_upload_id INTEGER REFERENCES bp_uploads(id)'); } catch {}

  // bp_upload_id 索引（必须在列存在后创建）
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_reports_bp ON reports(bp_upload_id)'); } catch {}

  // 上市公司索引
  try {
    db.exec('CREATE INDEX IF NOT EXISTS idx_kb_listed_sw1 ON kb_listed_companies(industry_sw_l1)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_kb_listed_sw2 ON kb_listed_companies(industry_sw_l2)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_kb_listed_board ON kb_listed_companies(listing_board)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_kb_listed_mktcap ON kb_listed_companies(market_cap)');
  } catch {}

  // ===== AI 训练系统表 =====

  // 训练样本库（管理员上传的 Q&A 对、参考分析、评分标准）
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ai_training_samples (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        category        TEXT    NOT NULL,
        skill_key       TEXT,
        industry        TEXT,
        input_text      TEXT    NOT NULL,
        ideal_output    TEXT    NOT NULL,
        source_type     TEXT    NOT NULL DEFAULT 'manual',
        quality_score   REAL,
        is_active       INTEGER NOT NULL DEFAULT 1,
        created_by      INTEGER REFERENCES users(id),
        created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
        updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_train_cat ON ai_training_samples(category)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_train_skill ON ai_training_samples(skill_key)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_train_ind ON ai_training_samples(industry)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_train_active ON ai_training_samples(is_active)');
  } catch {}

  // AI 反馈学习（用户对 AI 输出的评价和修正）
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ai_feedback (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        report_id       INTEGER REFERENCES reports(id),
        user_id         INTEGER NOT NULL REFERENCES users(id),
        rating          INTEGER NOT NULL,
        correction      TEXT,
        accepted        INTEGER,
        created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_fb_report ON ai_feedback(report_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_fb_user ON ai_feedback(user_id)');
  } catch {}

  // 训练任务记录（每次训练的参数、状态、结果）
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ai_training_jobs (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        status          TEXT    NOT NULL DEFAULT 'pending',
        sample_count    INTEGER DEFAULT 0,
        feedback_count  INTEGER DEFAULT 0,
        config          TEXT,
        result          TEXT,
        started_at      TEXT,
        completed_at    TEXT,
        created_by      INTEGER REFERENCES users(id),
        created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
      )
    `);
  } catch {}

  // ===== 积分系统 =====
  // 用户积分余额（新用户默认500）
  try { db.exec('ALTER TABLE users ADD COLUMN credits INTEGER NOT NULL DEFAULT 500'); } catch {}

  db.exec(`
    CREATE TABLE IF NOT EXISTS credit_transactions (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id       INTEGER NOT NULL REFERENCES users(id),
      type          TEXT    NOT NULL,
      amount        INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      description   TEXT,
      related_id    INTEGER,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_credit_tx_user ON credit_transactions(user_id, created_at DESC);
  `);

  console.log('✓ 数据库 schema 初始化完成');
}
