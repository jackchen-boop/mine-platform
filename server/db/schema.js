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

    -- 索引
    CREATE INDEX IF NOT EXISTS idx_projects_sector   ON projects(sector);
    CREATE INDEX IF NOT EXISTS idx_projects_round    ON projects(round);
    CREATE INDEX IF NOT EXISTS idx_projects_status   ON projects(status);
    CREATE INDEX IF NOT EXISTS idx_projects_hot      ON projects(is_hot DESC);
    CREATE INDEX IF NOT EXISTS idx_follows_user      ON follows(user_id);
    CREATE INDEX IF NOT EXISTS idx_reports_user      ON reports(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_roadshows_status  ON roadshows(status, scheduled_at);
  `);

  // 迁移：reports 表增加 bp_upload_id 列（SQLite 不支持 IF NOT EXISTS，用 try/catch）
  try { db.exec('ALTER TABLE reports ADD COLUMN bp_upload_id INTEGER REFERENCES bp_uploads(id)'); } catch {}

  // bp_upload_id 索引（必须在列存在后创建）
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_reports_bp ON reports(bp_upload_id)'); } catch {}

  console.log('✓ 数据库 schema 初始化完成');
}
