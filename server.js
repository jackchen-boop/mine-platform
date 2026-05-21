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
import { runKnowledgeSeed } from './server/db/knowledgeSeed.js';
import errorHandler from './server/middleware/errorHandler.js';

import authRoutes from './server/routes/auth.js';
import mineProjectRoutes from './server/routes/mine-projects.js';
import mineReportRoutes from './server/routes/mine-reports.js';
import mineAnalysisRoutes from './server/routes/mine-analysis.js';
import mineStatsRoutes from './server/routes/mine-stats.js';
import minePartnersRoutes from './server/routes/mine-partners.js';
import mineInquiryRoutes from './server/routes/mine-inquiries.js';
import liveRoutes from './server/routes/live.js';
import adminRoutes from './server/routes/admin.js';

import { setupLiveWebSocket } from './server/websocket/live-signal.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// 确保必要目录存在
const uploadDir = join(__dirname, 'public/uploads');
if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });
// data 目录由 db/connection.js 负责创建

// 初始化数据库
initSchema();
runSeed();
runKnowledgeSeed();

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
      connectSrc: ["'self'", "api.minimax.chat", "ws:", "wss:"],
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
  credentials: true,
  allowedHeaders: ['Authorization', 'Content-Type', 'X-Requested-With']
}));

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 静态文件 — 服务 public/ 目录
app.use(express.static(join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
    } else if (filePath.includes('/assets/')) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    }
  }
}));

// API 路由
app.use('/api/auth',           authRoutes);
app.use('/api/mine-projects',  mineProjectRoutes);
app.use('/api/mine-reports',   mineReportRoutes);
app.use('/api/mine-analysis',  mineAnalysisRoutes);
app.use('/api/mine-stats',     mineStatsRoutes);
app.use('/api/mine-partners',  minePartnersRoutes);
app.use('/api/mine-inquiries', mineInquiryRoutes);
app.use('/api/live',           liveRoutes);
app.use('/api/admin',          adminRoutes);

// 所有其他 GET 请求回退到 index.html
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

// 全局错误处理
app.use(errorHandler);

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n⛏️  矿资资本 MineCapital 平台已启动`);
  console.log(`   地址: http://localhost:${PORT}`);
  console.log(`   监听: 0.0.0.0:${PORT}`);
  console.log(`   环境: ${process.env.NODE_ENV || 'development'}\n`);
});

// 启动 WebSocket 直播信令服务器
setupLiveWebSocket(server);

export default app;
