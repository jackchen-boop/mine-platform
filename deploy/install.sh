#!/bin/bash
# =============================================================================
# mine-platform 一键服务器安装脚本
# 适用：Ubuntu 22.04 LTS / 腾讯云轻量 / 2核2G+
# 作用：安装 Node.js、Nginx、PM2、SSL 证书，并拉取部署项目
# =============================================================================

set -e

PROJECT_DIR="/opt/mine-platform"
REPO_URL="https://github.com/jackchen-boop/mine-platform.git"
DOMAIN="minelab.top"
NODE_VERSION="22"

export DEBIAN_FRONTEND=noninteractive

echo "==> 1. 更新系统包"
sudo apt-get update
sudo apt-get upgrade -y

echo "==> 2. 安装基础依赖"
sudo apt-get install -y curl wget git nginx certbot python3-certbot-nginx build-essential

echo "==> 3. 安装 Node.js ${NODE_VERSION}.x"
curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | sudo -E bash -
sudo apt-get install -y nodejs

echo "==> 4. 安装 PM2"
sudo npm install -g pm2

echo "==> 5. 克隆/更新项目"
if [ -d "$PROJECT_DIR/.git" ]; then
  cd "$PROJECT_DIR"
  sudo git pull origin main
else
  sudo git clone "$REPO_URL" "$PROJECT_DIR"
  cd "$PROJECT_DIR"
fi

echo "==> 6. 安装项目依赖"
sudo npm install

echo "==> 7. 创建必要目录"
sudo mkdir -p "$PROJECT_DIR/public/uploads"
sudo mkdir -p "$PROJECT_DIR/data"

echo "==> 8. 配置 systemd 服务"
sudo cp "$PROJECT_DIR/deploy/mine-platform.service" /etc/systemd/system/mine-platform.service
sudo sed -i "s|/opt/mine-platform|$PROJECT_DIR|g" /etc/systemd/system/mine-platform.service
sudo systemctl daemon-reload
sudo systemctl enable mine-platform

echo "==> 9. 配置 Nginx"
sudo cp "$PROJECT_DIR/deploy/nginx-minelab.conf" /etc/nginx/sites-available/minelab
sudo sed -i "s|__DOMAIN__|$DOMAIN|g" /etc/nginx/sites-available/minelab
sudo sed -i "s|__PROJECT_DIR__|$PROJECT_DIR|g" /etc/nginx/sites-available/minelab
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sf /etc/nginx/sites-available/minelab /etc/nginx/sites-enabled/minelab
sudo nginx -t

echo "==> 10. 启动应用"
sudo systemctl start mine-platform

echo "==> 11. 申请 SSL 证书（如果域名已解析到本机）"
if host "$DOMAIN" > /dev/null 2>&1; then
  sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "admin@$DOMAIN" || true
else
  echo "警告：域名 $DOMAIN 未解析到本机，跳过 SSL 申请。请解析后再运行：sudo certbot --nginx -d $DOMAIN"
fi

echo "==> 12. 重启 Nginx"
sudo systemctl restart nginx

echo ""
echo "=========================================="
echo "部署完成！"
echo "访问地址："
echo "  首页：      https://$DOMAIN"
echo "  保险测评：  https://$DOMAIN/insurance/"
echo "  管理后台：  https://$DOMAIN/insurance/admin"
echo ""
echo "常用命令："
echo "  查看日志：  sudo journalctl -u mine-platform -f"
echo "  重启服务：  sudo systemctl restart mine-platform"
echo "  更新部署：  sudo $PROJECT_DIR/deploy/update.sh"
echo "=========================================="
