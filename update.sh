#!/bin/bash

# Screen2Gether 服务器一键更新脚本
# 用法: ./update.sh [branch]
# 默认更新 dev 分支

BRANCH=${1:-dev}
APP_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "========================================"
echo "  Screen2Gether 更新脚本"
echo "========================================"
echo ""
echo "应用目录: $APP_DIR"
echo "目标分支: $BRANCH"
echo ""

cd "$APP_DIR"

# 检查是否有未提交的更改
if ! git diff-index --quiet HEAD --; then
    echo "⚠️  检测到未提交的更改，正在暂存..."
    git stash
    STASHED=true
fi

# 拉取最新代码
echo "📥 拉取最新代码..."
git fetch origin
git checkout $BRANCH
git pull origin $BRANCH

if [ $? -ne 0 ]; then
    echo "❌ 拉取失败，请检查网络或 git 配置"
    exit 1
fi

# 恢复暂存的更改
if [ "$STASHED" = true ]; then
    echo "📦 恢复暂存的更改..."
    git stash pop
fi

# 更新依赖
echo "📦 更新依赖..."
npm install --production

# 重启 PM2 服务
echo "🔄 重启服务..."
if command -v pm2 &> /dev/null; then
    pm2 restart screen2gether
    echo ""
    echo "✅ 更新完成！"
    echo ""
    pm2 status
else
    echo "⚠️  PM2 未安装，请手动重启服务"
fi

echo ""
echo "========================================"
echo "  查看日志: pm2 logs screen2gether"
echo "========================================"
