// 全局错误处理中间件
export default function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  const message = err.message || '服务器内部错误';

  // 不暴露堆栈到生产环境
  if (process.env.NODE_ENV !== 'production') {
    console.error('[Error]', err.stack || err);
  }

  res.status(status).json({
    error: message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
}
