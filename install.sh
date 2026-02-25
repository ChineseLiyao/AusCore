#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

INSTALL_DIR="/opt/auscore"
REPO_URL="https://github.com/ChineseLiyao/AusCore.git"
NODE_MIN_VERSION=18

log()   { echo -e "${GREEN}[AusCore]${NC} $1"; }
warn()  { echo -e "${YELLOW}[警告]${NC} $1"; }
error() { echo -e "${RED}[错误]${NC} $1"; exit 1; }

check_os() {
  if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OSTYPE" == "win32" ]]; then
    error "不支持 Windows 系统"
  fi

  if [[ -f /etc/os-release ]]; then
    . /etc/os-release
    OS=$ID
    OS_NAME=$PRETTY_NAME
  elif [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macos"
    OS_NAME="macOS $(sw_vers -productVersion)"
  else
    error "无法识别的操作系统"
  fi

  log "检测到系统: $OS_NAME"
}

check_root() {
  if [[ "$OS" != "macos" && "$EUID" -ne 0 ]]; then
    error "请使用 root 权限运行: sudo bash install.sh"
  fi
}

install_node() {
  if command -v node &>/dev/null; then
    local ver=$(node -v | sed 's/v//' | cut -d. -f1)
    if [[ "$ver" -ge "$NODE_MIN_VERSION" ]]; then
      log "Node.js $(node -v) 已安装，跳过"
      return
    else
      warn "Node.js 版本过低 ($(node -v))，需要 v${NODE_MIN_VERSION}+"
    fi
  fi

  log "正在安装 Node.js..."

  case "$OS" in
    ubuntu|debian|pop)
      curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
      apt-get install -y nodejs
      ;;
    centos|rhel|rocky|almalinux|amzn)
      curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
      yum install -y nodejs
      ;;
    fedora)
      curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
      dnf install -y nodejs
      ;;
    arch|manjaro)
      pacman -Sy --noconfirm nodejs npm
      ;;
    alpine)
      apk add --no-cache nodejs npm
      ;;
    macos)
      if command -v brew &>/dev/null; then
        brew install node
      else
        error "请先安装 Homebrew: https://brew.sh"
      fi
      ;;
    *)
      error "不支持自动安装 Node.js，请手动安装 Node.js >= ${NODE_MIN_VERSION}"
      ;;
  esac

  log "Node.js $(node -v) 安装完成"
}

install_git() {
  if command -v git &>/dev/null; then
    log "Git 已安装，跳过"
    return
  fi

  log "正在安装 Git..."

  case "$OS" in
    ubuntu|debian|pop)
      apt-get update -y && apt-get install -y git
      ;;
    centos|rhel|rocky|almalinux|amzn)
      yum install -y git
      ;;
    fedora)
      dnf install -y git
      ;;
    arch|manjaro)
      pacman -Sy --noconfirm git
      ;;
    alpine)
      apk add --no-cache git
      ;;
    macos)
      xcode-select --install 2>/dev/null || true
      ;;
  esac
}

install_auscore() {
  log "正在安装 AusCore 到 ${INSTALL_DIR}..."

  if [[ -d "$INSTALL_DIR" ]]; then
    warn "检测到已有安装，备份到 ${INSTALL_DIR}.bak"
    rm -rf "${INSTALL_DIR}.bak"
    mv "$INSTALL_DIR" "${INSTALL_DIR}.bak"
  fi

  git clone "$REPO_URL" "$INSTALL_DIR" 2>/dev/null || {
    warn "Git 克隆失败，从当前目录复制..."
    mkdir -p "$INSTALL_DIR"
    cp -r "$(dirname "$0")"/* "$INSTALL_DIR"/
  }

  log "安装前端依赖..."
  npm install --prefix "$INSTALL_DIR"

  log "构建前端..."
  npm run build --prefix "$INSTALL_DIR"

  log "安装后端依赖..."
  npm install --prefix "$INSTALL_DIR/server"

  log "AusCore 安装完成"
}

create_service() {
  if [[ "$OS" == "macos" ]]; then
    create_launchd_service
    return
  fi

  if ! command -v systemctl &>/dev/null; then
    warn "未检测到 systemd，跳过服务创建"
    warn "请手动启动: cd ${INSTALL_DIR}/server && node index.js"
    return
  fi

  log "创建 systemd 服务..."

  cat > /etc/systemd/system/auscore.service << EOF
[Unit]
Description=AusCore Server Management Panel
After=network.target

[Service]
Type=simple
WorkingDirectory=${INSTALL_DIR}/server
ExecStart=$(which node) index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable auscore
  systemctl start auscore

  log "服务已创建并启动"
}

create_launchd_service() {
  local plist="$HOME/Library/LaunchAgents/com.auscore.server.plist"

  log "创建 launchd 服务..."

  cat > "$plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.auscore.server</string>
  <key>ProgramArguments</key>
  <array>
    <string>$(which node)</string>
    <string>${INSTALL_DIR}/server/index.js</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${INSTALL_DIR}/server</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
</dict>
</plist>
EOF

  launchctl load "$plist"
  log "服务已创建并启动"
}

get_ip() {
  if [[ "$OS" == "macos" ]]; then
    ipconfig getifaddr en0 2>/dev/null || echo "localhost"
  else
    hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost"
  fi
}

main() {
  echo ""
  echo -e "${BLUE}╔══════════════════════════════════════╗${NC}"
  echo -e "${BLUE}║          AusCore 自动安装脚本        ║${NC}"
  echo -e "${BLUE}╚══════════════════════════════════════╝${NC}"
  echo ""

  check_os
  check_root
  install_git
  install_node
  install_auscore
  create_service

  local IP=$(get_ip)

  echo ""
  echo -e "${GREEN}╔══════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║               安装完成               ║${NC}"
  echo -e "${GREEN}╚══════════════════════════════════════╝${NC}"
  echo ""
  echo -e "  访问地址: ${BLUE}http://${IP}:13337${NC}"
  echo -e "  安装目录: ${INSTALL_DIR}"
  echo ""
  echo -e "  管理命令:"
  if [[ "$OS" == "macos" ]]; then
    echo -e "    启动: launchctl start com.auscore.server"
    echo -e "    停止: launchctl stop com.auscore.server"
  else
    echo -e "    启动: systemctl start auscore"
    echo -e "    停止: systemctl stop auscore"
    echo -e "    状态: systemctl status auscore"
    echo -e "    日志: journalctl -u auscore -f"
  fi
  echo ""
  echo -e "  首次访问请注册管理员账户"
  echo ""
}

main "$@"
