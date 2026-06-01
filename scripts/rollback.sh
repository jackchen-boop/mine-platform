#!/usr/bin/env bash
# scripts/rollback.sh — Mine Platform 版本回滚脚本
#
# 用法：
#   ./scripts/rollback.sh            # 交互式列出版本，选择回滚目标
#   ./scripts/rollback.sh v1.0.0     # 直接回滚到指定 tag
#   ./scripts/rollback.sh <hash>     # 直接回滚到指定 commit hash
#
# 注意：回滚只影响服务器，不修改本地 git 历史

set -e

SERVER_USER="root"
SERVER_IP="121.43.127.52"
SERVER_PATH="/opt/mine-platform"
SERVER_PASS="^15Atendell"

echo "=== Mine Platform 版本回滚工具 ==="
echo ""

# 列出所有 tag
echo "📋 可用版本历史："
git tag -l "v*" --sort=-version:refname | head -20
echo ""
git log --oneline -10
echo ""

# 确定目标版本
if [ -n "$1" ]; then
  TARGET="$1"
else
  read -p "输入要回滚到的版本 tag 或 commit hash: " TARGET
fi

if [ -z "$TARGET" ]; then
  echo "❌ 未指定目标版本，退出"
  exit 1
fi

# 验证目标存在
if ! git rev-parse "$TARGET" >/dev/null 2>&1; then
  echo "❌ 版本 '$TARGET' 不存在，请检查输入"
  exit 1
fi

COMMIT_HASH=$(git rev-parse "$TARGET")
echo ""
echo "⚠️  即将回滚到：$TARGET ($COMMIT_HASH)"
echo "   此操作将覆盖服务器上的当前版本"
read -p "确认执行回滚？(输入 yes 继续): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
  echo "已取消"
  exit 0
fi

echo ""
echo "📤 从指定版本提取文件并部署到服务器..."

# 将指定版本的文件提取到临时目录
TMP_DIR=$(mktemp -d)
git archive "$TARGET" | tar -x -C "$TMP_DIR"

# 同步到服务器
sshpass -p "$SERVER_PASS" scp -o StrictHostKeyChecking=no -r \
  "$TMP_DIR/public/" "${SERVER_USER}@${SERVER_IP}:${SERVER_PATH}/public/"

sshpass -p "$SERVER_PASS" scp -o StrictHostKeyChecking=no -r \
  "$TMP_DIR/server/" "${SERVER_USER}@${SERVER_IP}:${SERVER_PATH}/server/"

sshpass -p "$SERVER_PASS" scp -o StrictHostKeyChecking=no \
  "$TMP_DIR/server.js" \
  "${SERVER_USER}@${SERVER_IP}:${SERVER_PATH}/"

# 清理临时目录
rm -rf "$TMP_DIR"

# 在服务器更新版本标记并重启
TARGET_VERSION=$(git show "$TARGET":VERSION 2>/dev/null || echo "$TARGET")
sshpass -p "$SERVER_PASS" ssh -o StrictHostKeyChecking=no \
  "${SERVER_USER}@${SERVER_IP}" \
  "echo '$TARGET_VERSION' > ${SERVER_PATH}/VERSION && systemctl restart mine-platform && sleep 2 && systemctl is-active mine-platform"

echo ""
echo "✅ 回滚完成！服务器已恢复到版本 $TARGET"
echo ""
echo "验证："
echo "  curl http://${SERVER_IP}:3000/api/mine-projects/published | head -c 100"
