#!/usr/bin/env bash
# scripts/release.sh — Mine Platform 版本发布脚本
#
# 用法：
#   ./scripts/release.sh patch   # 补丁版本 1.0.0 → 1.0.1（bug修复）
#   ./scripts/release.sh minor   # 次版本   1.0.0 → 1.1.0（新功能）
#   ./scripts/release.sh major   # 主版本   1.0.0 → 2.0.0（重大变更）
#   ./scripts/release.sh 1.2.3   # 指定版本号
#
# 前提：本地 git 状态干净（无未提交改动），已配置 SSH 部署权限

set -e

# ── 配置区 ──────────────────────────────────────────────
SERVER_USER="root"
SERVER_IP="121.43.127.52"
SERVER_PATH="/opt/mine-platform"
SERVER_PASS="^15Atendell"
# ────────────────────────────────────────────────────────

# 读取当前版本
CURRENT=$(cat VERSION | tr -d '[:space:]')
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"

# 计算新版本号
case "$1" in
  patch)   NEW_VERSION="$MAJOR.$MINOR.$((PATCH+1))" ;;
  minor)   NEW_VERSION="$MAJOR.$((MINOR+1)).0" ;;
  major)   NEW_VERSION="$((MAJOR+1)).0.0" ;;
  [0-9]*\.[0-9]*\.[0-9]*)  NEW_VERSION="$1" ;;
  *)
    echo "用法: $0 [patch|minor|major|x.y.z]"
    exit 1
    ;;
esac

echo "📦 发布版本: $CURRENT → $NEW_VERSION"

# 检查 git 工作区是否干净
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo ""
  echo "⚠️  本地有未提交的改动，请先 commit 再发布。"
  echo "   执行：git add . && git commit -m 'your message'"
  exit 1
fi

# 更新 VERSION 文件
echo "$NEW_VERSION" > VERSION

# 更新 CHANGELOG.md（追加到顶部）
DATE=$(date +%Y-%m-%d)
CHANGELOG_ENTRY="## v$NEW_VERSION — $DATE\n\n- [在此填写本版本变更内容]\n\n"
if [ -f CHANGELOG.md ]; then
  # 插入到第一个 ## 之前
  TMP=$(mktemp)
  awk -v entry="$CHANGELOG_ENTRY" '
    /^## / && !inserted { print entry; inserted=1 }
    { print }
  ' CHANGELOG.md > "$TMP" && mv "$TMP" CHANGELOG.md
else
  printf "# Changelog\n\n${CHANGELOG_ENTRY}" > CHANGELOG.md
fi

# 提交版本文件
git add VERSION CHANGELOG.md
git commit -m "chore: release v$NEW_VERSION"

# 打 Git tag
git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"

echo ""
echo "✅ Git tag v$NEW_VERSION 已创建"
echo ""
echo "📤 开始部署到服务器..."

# 同步所有改动到服务器（排除不需要的目录）
sshpass -p "$SERVER_PASS" ssh -o StrictHostKeyChecking=no \
  "${SERVER_USER}@${SERVER_IP}" \
  "cd ${SERVER_PATH} && git fetch --all 2>/dev/null || true"

# 用 scp 同步关键目录（服务器无 rsync）
sshpass -p "$SERVER_PASS" scp -o StrictHostKeyChecking=no -r \
  public/ "${SERVER_USER}@${SERVER_IP}:${SERVER_PATH}/public/"

sshpass -p "$SERVER_PASS" scp -o StrictHostKeyChecking=no -r \
  server/ "${SERVER_USER}@${SERVER_IP}:${SERVER_PATH}/server/"

sshpass -p "$SERVER_PASS" scp -o StrictHostKeyChecking=no \
  server.js VERSION \
  "${SERVER_USER}@${SERVER_IP}:${SERVER_PATH}/"

# 在服务器写入版本标记并重启
sshpass -p "$SERVER_PASS" ssh -o StrictHostKeyChecking=no \
  "${SERVER_USER}@${SERVER_IP}" \
  "echo '$NEW_VERSION' > ${SERVER_PATH}/VERSION && systemctl restart mine-platform && sleep 2 && systemctl is-active mine-platform"

echo ""
echo "🎉 部署完成！版本 v$NEW_VERSION 已上线"
echo ""
echo "验证："
echo "  curl http://${SERVER_IP}:3000/api/mine-projects/published | head -c 100"
