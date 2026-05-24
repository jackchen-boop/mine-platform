import db from './connection.js';

export function initSchema() {
  db.exec(`
    -- 用户表（矿业机构 / 投资机构 / 管理员）
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT    NOT NULL,
      email         TEXT    NOT NULL UNIQUE,
      phone         TEXT    UNIQUE,
      password_hash TEXT    NOT NULL,
      role          TEXT    NOT NULL DEFAULT 'investor',
      org_type      TEXT    DEFAULT 'investor',
      organization  TEXT,
      avatar_letter TEXT,
      status        TEXT    NOT NULL DEFAULT 'active',
      verified      INTEGER DEFAULT 0,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT
    );

    -- 矿产项目表
    CREATE TABLE IF NOT EXISTS mine_projects (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      code              TEXT    NOT NULL UNIQUE,
      name              TEXT    NOT NULL,
      name_en           TEXT,
      mineral_types     TEXT    NOT NULL,
      province          TEXT,
      city              TEXT,
      area_km2          REAL,
      estimated_reserve TEXT,
      reserve_grade     TEXT,
      depth_range       TEXT,
      mine_type         TEXT    DEFAULT 'open-pit',
      development_stage TEXT    DEFAULT 'exploration',
      license_status    TEXT    DEFAULT 'valid',
      license_expires   TEXT,
      asking_price      TEXT,
      asking_price_raw  REAL,
      description       TEXT,
      description_masked TEXT,
      highlights        TEXT,
      disposal_options  TEXT,
      contact_masked    TEXT,
      is_hot            INTEGER DEFAULT 0,
      is_featured       INTEGER DEFAULT 0,
      is_confidential   INTEGER DEFAULT 1,
      view_count        INTEGER DEFAULT 0,
      ai_score          REAL,
      ai_summary        TEXT,
      status            TEXT    DEFAULT 'active',
      owner_id          INTEGER REFERENCES users(id),
      created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at        TEXT
    );

    -- 矿业报告上传记录（详查报告/备案报告/资源报告等）
    CREATE TABLE IF NOT EXISTS mine_reports (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id           INTEGER NOT NULL REFERENCES users(id),
      project_id        INTEGER REFERENCES mine_projects(id),
      report_type       TEXT    NOT NULL DEFAULT 'exploration',
      original_filename TEXT    NOT NULL,
      stored_filename   TEXT    NOT NULL,
      file_size         INTEGER,
      file_type         TEXT,
      extracted_text    TEXT,
      parse_status      TEXT    DEFAULT 'pending',
      created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- AI 分析报告
    CREATE TABLE IF NOT EXISTS ai_analyses (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id       INTEGER NOT NULL REFERENCES users(id),
      project_id    INTEGER REFERENCES mine_projects(id),
      report_id     INTEGER REFERENCES mine_reports(id),
      analysis_type TEXT    NOT NULL DEFAULT 'value_assessment',
      content       TEXT,
      ai_score      REAL,
      model_used    TEXT,
      token_usage   TEXT,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- AI 咨询对话记录
    CREATE TABLE IF NOT EXISTS ai_conversations (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id       INTEGER NOT NULL REFERENCES users(id),
      project_id    INTEGER REFERENCES mine_projects(id),
      role          TEXT    NOT NULL,
      content       TEXT    NOT NULL,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- 用户关注项目
    CREATE TABLE IF NOT EXISTS favorites (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id),
      project_id INTEGER NOT NULL REFERENCES mine_projects(id),
      created_at TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, project_id)
    );

    -- 意向沟通申请
    CREATE TABLE IF NOT EXISTS inquiries (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id),
      project_id INTEGER NOT NULL REFERENCES mine_projects(id),
      message    TEXT,
      budget     TEXT,
      status     TEXT    DEFAULT 'pending',
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- 合作机构
    CREATE TABLE IF NOT EXISTS partners (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      name             TEXT    NOT NULL,
      type             TEXT    NOT NULL DEFAULT 'mine_enterprise',
      description      TEXT,
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

    -- 直播房间表
    CREATE TABLE IF NOT EXISTS live_streams (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      title         TEXT    NOT NULL,
      project_id    INTEGER REFERENCES mine_projects(id),
      presenter_id  INTEGER NOT NULL REFERENCES users(id),
      presenter_name TEXT,
      status        TEXT    NOT NULL DEFAULT 'scheduled',
      scheduled_at  TEXT,
      started_at    TEXT,
      ended_at      TEXT,
      viewer_count  INTEGER DEFAULT 0,
      description   TEXT,
      cover_image   TEXT,
      room_token    TEXT    UNIQUE,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- 直播发言申请（上麦）
    CREATE TABLE IF NOT EXISTS live_speaker_requests (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      stream_id     INTEGER NOT NULL REFERENCES live_streams(id),
      user_id       INTEGER NOT NULL REFERENCES users(id),
      user_name     TEXT,
      status        TEXT    NOT NULL DEFAULT 'pending',
      approved_by   INTEGER REFERENCES users(id),
      created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(stream_id, user_id)
    );

    -- 工作组
    CREATE TABLE IF NOT EXISTS workgroups (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL,
      description TEXT,
      code        TEXT    NOT NULL UNIQUE,
      owner_id    INTEGER NOT NULL REFERENCES users(id),
      status      TEXT    NOT NULL DEFAULT 'active',
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT
    );

    -- 工作组成员
    CREATE TABLE IF NOT EXISTS workgroup_members (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      workgroup_id  INTEGER NOT NULL REFERENCES workgroups(id),
      user_id       INTEGER NOT NULL REFERENCES users(id),
      role          TEXT    NOT NULL DEFAULT 'member',
      joined_at     TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(workgroup_id, user_id)
    );

    -- 矿业项目工作流任务（项目推进阶段追踪）
    CREATE TABLE IF NOT EXISTS project_tasks (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id   INTEGER NOT NULL REFERENCES mine_projects(id),
      phase        TEXT    NOT NULL,
      title        TEXT    NOT NULL,
      description  TEXT,
      assignee_id  INTEGER REFERENCES users(id),
      status       TEXT    NOT NULL DEFAULT 'pending',
      priority     TEXT    NOT NULL DEFAULT 'normal',
      due_date     TEXT,
      completed_at TEXT,
      notes        TEXT,
      created_by   INTEGER NOT NULL REFERENCES users(id),
      created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT
    );

    -- 项目动态/评论（工作组成员协作记录）
    CREATE TABLE IF NOT EXISTS project_activities (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id   INTEGER NOT NULL REFERENCES mine_projects(id),
      user_id      INTEGER NOT NULL REFERENCES users(id),
      activity_type TEXT   NOT NULL DEFAULT 'comment',
      content      TEXT    NOT NULL,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- 索引（工作组）
    CREATE INDEX IF NOT EXISTS idx_workgroup_members_user ON workgroup_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_workgroup_members_wg   ON workgroup_members(workgroup_id);
    CREATE INDEX IF NOT EXISTS idx_project_tasks_project  ON project_tasks(project_id);
    CREATE INDEX IF NOT EXISTS idx_project_tasks_status   ON project_tasks(status);
    CREATE INDEX IF NOT EXISTS idx_project_activities     ON project_activities(project_id, created_at DESC);

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
    CREATE INDEX IF NOT EXISTS idx_mine_projects_mineral  ON mine_projects(mineral_types);
    CREATE INDEX IF NOT EXISTS idx_mine_projects_province ON mine_projects(province);
    CREATE INDEX IF NOT EXISTS idx_mine_projects_status   ON mine_projects(status);
    CREATE INDEX IF NOT EXISTS idx_mine_projects_hot      ON mine_projects(is_hot DESC);
    CREATE INDEX IF NOT EXISTS idx_favorites_user         ON favorites(user_id);
    CREATE INDEX IF NOT EXISTS idx_ai_analyses_user       ON ai_analyses(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_inquiries_project      ON inquiries(project_id);
    CREATE INDEX IF NOT EXISTS idx_live_streams_status    ON live_streams(status, scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_live_streams_project   ON live_streams(project_id);
    CREATE INDEX IF NOT EXISTS idx_speaker_requests       ON live_speaker_requests(stream_id, status);
  `);

  // workgroup_id 列可能已存在（ALTER TABLE IF NOT EXISTS 在 SQLite < 3.37 不支持）
  try { db.exec('ALTER TABLE mine_projects ADD COLUMN workgroup_id INTEGER REFERENCES workgroups(id)'); } catch(e) {}

  // 项目优先级评分相关字段
  try { db.exec('ALTER TABLE mine_projects ADD COLUMN priority_score REAL DEFAULT 0'); } catch(e) {}
  try { db.exec('ALTER TABLE mine_projects ADD COLUMN priority_level TEXT DEFAULT \'C\''); } catch(e) {}
  try { db.exec('ALTER TABLE mine_projects ADD COLUMN score_ai REAL DEFAULT 0'); } catch(e) {}
  try { db.exec('ALTER TABLE mine_projects ADD COLUMN score_decision_maker INTEGER DEFAULT 0'); } catch(e) {}
  try { db.exec('ALTER TABLE mine_projects ADD COLUMN score_funding_prob INTEGER DEFAULT 0'); } catch(e) {}
  try { db.exec('ALTER TABLE mine_projects ADD COLUMN priority_notes TEXT'); } catch(e) {}
  try { db.exec('ALTER TABLE mine_projects ADD COLUMN priority_updated_at TEXT'); } catch(e) {}

  // 项目参与人表（工作组成员参与具体项目的角色记录）
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_participants (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id   INTEGER NOT NULL REFERENCES mine_projects(id),
      user_id      INTEGER NOT NULL REFERENCES users(id),
      role         TEXT    NOT NULL DEFAULT 'member',
      -- role: owner(项目负责人) / analyst(分析师) / bd(资源对接) / finance(资金方对接) / member(参与人)
      is_decision_contact INTEGER DEFAULT 0,  -- 是否为决策人对接联系人
      funding_confidence  INTEGER DEFAULT 0,  -- 资金方参与信心度 0-100
      notes        TEXT,
      joined_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(project_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_proj_participants ON project_participants(project_id);
  `);

  console.log('✓ 矿业平台数据库 schema 初始化完成');
}
