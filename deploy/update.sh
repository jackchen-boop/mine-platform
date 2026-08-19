#!/bin/bash
# =============================================================================
# mine-platform 自动更新部署脚本
# 作用：拉取最新代码、安装依赖、重启服务
# 建议：配置 GitHub Webhook 或定时任务自动调用
# =============================================================================

set -e

PROJECT_DIR="/opt/mine-platform"
SERVICE_NAME="mine-platform"

echo "==> $(date) 开始更新部署"

cd "$PROJECT_DIR"

echo "==> 拉取最新代码"
sudo git fetch origin main
sudo git reset --hard origin/main

echo "==> 安装依赖"
sudo npm install

echo "==> 重启服务"
sudo systemctl restart "$SERVICE_NAME"

echo "==> 等待服务启动"
sleep 3

echo "==> 健康检查"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/ || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ 服务正常，HTTP $HTTP_CODE"
else
  echo "❌ 服务异常，HTTP $HTTP_CODE"
  echo "查看日志：sudo journalctl -u $SERVICE_NAME -n 50"
  exit 1
fi

echo "==> $(date) 部署完成"
echo "访问地址："
echo "  https://minelab.top/"
echo "  https://minelab.top/insurance/"
echo "  https://minelab.top/insurance/admin"
