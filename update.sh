#!/bin/bash
set -e

BRANCH="${1:-main}"
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "=== 更新开始 $(date) ==="

echo "[1/4] 拉取代码..."
# 直接 fetch，失败则 5s 超时后切换镜像回退
fetch_with_fallback() {
    if timeout 5 git fetch origin; then
        return 0
    fi
    echo "直接 fetch 失败，尝试镜像..."
    for m in \
        "https://gh-proxy.com/https://github.com/ChineseLiyao/AusCore.git" \
        "https://ghfast.top/https://github.com/ChineseLiyao/AusCore.git" \
        "https://ghproxy.net/https://github.com/ChineseLiyao/AusCore.git"; do
        git remote set-url origin "$m"
        if timeout 5 git fetch origin; then
            return 0
        fi
    done
    return 1
}

if ! fetch_with_fallback; then
    echo "更新失败：所有镜像均无法连接，请检查网络后重试"
    exit 1
fi

git reset --hard "origin/$BRANCH"

echo "[2/4] 安装前端依赖..."
npm install

echo "[3/4] 构建前端..."
npm run build

echo "[4/4] 安装后端依赖..."
cd server
npm install
cd ..

echo "重启服务..."
if command -v pm2 &> /dev/null; then
  pm2 restart auscore-api --update-env 2>/dev/null || pm2 restart all --update-env || true
else
  echo "未检测到 PM2，请手动重启服务"
fi

echo "=== 更新完成 $(date) ==="
