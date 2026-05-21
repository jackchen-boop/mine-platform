// SQLite 连接 — 使用 Node.js v22.5+ 内置 node:sqlite（无需编译原生模块）
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Railway 持久卷挂载路径 /data，本地默认为项目 data/ 目录
const dataDir = process.env.DATA_DIR || join(__dirname, '../../data');
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

const DB_PATH = process.env.DB_PATH || join(dataDir, 'mineplatform.db');

let _db;

function getDb() {
  if (!_db) {
    _db = new DatabaseSync(DB_PATH);
    _db.exec("PRAGMA journal_mode = WAL");
    _db.exec("PRAGMA foreign_keys = ON");
    _db.exec("PRAGMA busy_timeout = 5000");
  }
  return _db;
}

// node:sqlite 返回 null-prototype 对象，转为普通对象
function toPlain(val) {
  if (val === null || val === undefined) return val;
  if (Array.isArray(val)) return val.map(toPlain);
  if (typeof val === 'object') return Object.assign({}, val);
  return val;
}

// 封装 db，让 .prepare() 返回适配层，统一转换结果为普通对象
function wrapDb(db) {
  return {
    exec: (sql) => db.exec(sql),
    prepare: (sql) => {
      const stmt = db.prepare(sql);
      return {
        run: (...args) => stmt.run(...flattenArgs(args)),
        get: (...args) => toPlain(stmt.get(...flattenArgs(args))),
        all: (...args) => (stmt.all(...flattenArgs(args)) || []).map(toPlain),
      };
    }
  };
}

// 展平参数：支持 stmt.run(val1, val2) 和 stmt.run([val1, val2])
function flattenArgs(args) {
  if (args.length === 1 && Array.isArray(args[0])) return args[0];
  return args;
}

// 导出已实例化的 db 对象（单例），路由直接 import db from './connection.js' 后调用 db.prepare()
let _wrapped;
function getWrappedDb() {
  if (!_wrapped) _wrapped = wrapDb(getDb());
  return _wrapped;
}

// 懒加载代理：首次访问任意属性时才初始化，避免模块加载顺序问题
const dbProxy = new Proxy({}, {
  get(_, prop) {
    return getWrappedDb()[prop];
  }
});

export default dbProxy;
