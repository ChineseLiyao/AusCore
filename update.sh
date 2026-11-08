#!/bin/bash
set -e

BRANCH="${1:-main}"
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "=== 更新开始 $(date) ==="
echo "目标分支: $BRANCH"

echo "[1/5] 拉取代码..."
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

# 目标分支在远端必须存在，避免 reset 到不存在的引用
if ! git rev-parse --verify -q "origin/$BRANCH" > /dev/null; then
    echo "更新失败：远端不存在分支 $BRANCH"
    exit 1
fi

git reset --hard "origin/$BRANCH"
echo "当前提交: $(git rev-parse --short HEAD)"

echo "[2/5] 安装前端依赖..."
npm install --no-audit --no-fund

echo "[3/5] 构建前端..."
npm run build

# 校验构建产物已更新，避免构建静默失败后仍重启到旧界面
if [ ! -f dist/index.html ]; then
    echo "更新失败：构建产物 dist/index.html 不存在，保留旧版本运行"
    exit 1
fi

echo "[4/5] 安装后端依赖..."
cd server
npm install --no-audit --no-fund
cd ..

echo "[5/5] 重启服务..."
if command -v pm2 &> /dev/null; then
  pm2 restart auscore-api --update-env 2>/dev/null || pm2 restart all --update-env || true
else
  echo "未检测到 PM2，请手动重启服务"
fi

echo "=== 更新完成 $(date) ==="
