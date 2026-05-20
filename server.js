import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

import { initSchema } from './server/db/schema.js';
import { runSeed } from './server/db/seed.js';
import errorHandler from './server/middleware/errorHandler.js';

import authRoutes from './server/routes/auth.js';
import projectRoutes from './server/routes/projects.js';
import bpRoutes from './server/routes/bp.js';
import analysisRoutes from './server/routes/analysis.js';
import skillRoutes from './server/routes/skills.js';
import roadshowRoutes from './server/routes/roadshow.js';
import followRoutes from './server/routes/follows.js';
import reportRoutes from './server/routes/reports.js';
import userRoutes from './server/routes/users.js';
import adminRoutes from './server/routes/admin.js';
import partnerRoutes from './server/routes/partners.js';
import statsRoutes from './server/routes/stats.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// 确保必要目录存在
['data', 'public/uploads'].forEach(dir => {
  const p = join(__dirname, dir);
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
});

// 初始化数据库
initSchema();
runSeed();

// 安全头部
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "cdn.tailwindcss.com", "fonts.googleapis.com"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "cdn.tailwindcss.com", "fonts.googleapis.com", "fonts.gstatic.com"],
      fontSrc: ["'self'", "fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "api.minimax.chat"],
      frameSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

// CORS
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',').map(s => s.trim());
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.some(o => origin.startsWith(o))) cb(null, true);
    else cb(null, false);
  },
  credentials: true
}));

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 静态文件 — 服务 public/ 目录
app.use(express.static(join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      // HTML 文件不缓存，确保总是最新版
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
    } else if (filePath.includes('/assets/')) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    }
  }
}));

// API 路由
app.use('/api/auth',      authRoutes);
app.use('/api/projects',  projectRoutes);
app.use('/api/bp',        bpRoutes);
app.use('/api',           analysisRoutes);   // POST /api/ai-analyze
app.use('/api',           skillRoutes);      // POST /api/skill-run
app.use('/api/roadshow',  roadshowRoutes);
app.use('/api/follows',   followRoutes);
app.use('/api/reports',   reportRoutes);
app.use('/api/users',     userRoutes);
app.use('/api/admin',     adminRoutes);
app.use('/api/partners',  partnerRoutes);
app.use('/api/stats',     statsRoutes);

// 所有其他 GET 请求回退到 index.html（SPA 支持）
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

// 全局错误处理
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`\n🚀 星链创投 VC 平台已启动`);
  console.log(`   地址: http://localhost:${PORT}`);
  console.log(`   环境: ${process.env.NODE_ENV || 'development'}\n`);
});

export default app;
