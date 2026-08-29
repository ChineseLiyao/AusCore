#!/bin/bash

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印函数
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查是否为 root 用户
check_root() {
    if [ "$EUID" -ne 0 ]; then
        print_error "请使用 root 权限运行此脚本"
        print_info "使用: sudo bash install.sh"
        exit 1
    fi
}

# 检测操作系统
detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
        VERSION=$VERSION_ID
    elif [ -f /etc/redhat-release ]; then
        OS="centos"
    elif [ "$(uname)" == "Darwin" ]; then
        OS="macos"
    else
        print_error "不支持的操作系统"
        exit 1
    fi
    
    print_info "检测到操作系统: $OS"
}

# 安装 Node.js
install_nodejs() {
    print_info "检查 Node.js..."
    
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$NODE_VERSION" -ge 18 ]; then
            print_success "Node.js $(node -v) 已安装"
            return
        else
            print_warning "Node.js 版本过低，需要升级到 18+"
        fi
    fi
    
    print_info "安装 Node.js 20..."
    
    case $OS in
        ubuntu|debian)
            curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
            apt-get install -y nodejs
            ;;
        centos|rhel|fedora)
            curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
            yum install -y nodejs
            ;;
        macos)
            if ! command -v brew &> /dev/null; then
                print_error "请先安装 Homebrew: https://brew.sh"
                exit 1
            fi
            brew install node@20
            ;;
        *)
            print_error "不支持的操作系统: $OS"
            exit 1
            ;;
    esac
    
    print_success "Node.js $(node -v) 安装完成"
}

# 配置 npm 镜像源（国内加速，可设 AUSCORE_NO_MIRROR=1 跳过）
configure_npm_mirror() {
    if [ "${AUSCORE_NO_MIRROR:-0}" = "1" ]; then
        print_warning "已跳过 npm 镜像配置（AUSCORE_NO_MIRROR=1）"
        return
    fi

    print_info "配置 npm 镜像源（npmmirror）..."
    npm config set registry https://registry.npmmirror.com
    # node-gyp 编译原生模块时下载 Node 头文件的镜像（npm 10+ 不再接受 disturl 配置项）
    export NODEJS_ORG_MIRROR=https://npmmirror.com/mirrors/node
    print_success "npm 镜像源配置完成"
}

# 安装 Git
install_git() {    if command -v git &> /dev/null; then
        print_success "Git 已安装"
        return
    fi
    
    print_info "安装 Git..."
    
    case $OS in
        ubuntu|debian)
            apt-get update
            apt-get install -y git
            ;;
        centos|rhel|fedora)
            yum install -y git
            ;;
        macos)
            brew install git
            ;;
    esac
    
    print_success "Git 安装完成"
}

# 安装 PM2
install_pm2() {
    if command -v pm2 &> /dev/null; then
        print_success "PM2 已安装"
        return
    fi
    
    print_info "安装 PM2..."
    npm install -g pm2
    print_success "PM2 安装完成"
}

# 克隆项目
GITHUB_REPO="https://github.com/ChineseLiyao/AusCore.git"
# 备用镜像（国内加速，按需增删）
REPO_MIRRORS=(
    "https://gh-proxy.com/https://github.com/ChineseLiyao/AusCore.git"
    "https://ghfast.top/https://github.com/ChineseLiyao/AusCore.git"
    "https://ghproxy.net/https://github.com/ChineseLiyao/AusCore.git"
)

# 带超时与镜像回退的克隆
git_clone_with_fallback() {
    local dest="$1"
    local urls=("$GITHUB_REPO" "${REPO_MIRRORS[@]}")
    local ok=false

    for url in "${urls[@]}"; do
        print_info "尝试克隆: $url"
        if timeout 120 git clone "$url" "$dest"; then
            ok=true
            break
        fi
        print_warning "该地址克隆失败，尝试下一个..."
        rm -rf "$dest"
    done

    if [ "$ok" != "true" ]; then
        print_error "无法克隆项目，请检查网络后手动执行: git clone $GITHUB_REPO $dest"
        exit 1
    fi
}

clone_project() {
    INSTALL_DIR="/opt/auscore"

    if [ -d "$INSTALL_DIR/.git" ]; then
        print_warning "目录 $INSTALL_DIR 已存在"

        # 检测是否为交互式终端
        if [ -t 0 ]; then
            read -p "是否删除并重新安装? (y/N): " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                rm -rf "$INSTALL_DIR"
            else
                print_info "使用现有目录并更新代码"
                cd "$INSTALL_DIR"
                git pull || print_warning "更新代码失败，将使用现有代码继续"
                return
            fi
        else
            print_info "非交互式终端，使用现有目录并更新代码"
            cd "$INSTALL_DIR"
            git pull || print_warning "更新代码失败，将使用现有代码继续"
            return
        fi
    fi

    print_info "克隆项目到 $INSTALL_DIR..."
    git_clone_with_fallback "$INSTALL_DIR"
    cd "$INSTALL_DIR"
    print_success "项目克隆完成"
}

# 安装编译工具（bcrypt / node-pty 等原生模块需要 make/g++）
install_build_tools() {
    print_info "检查编译工具（原生模块需要 make / g++ / python3）..."

    case $OS in
        ubuntu|debian)
            apt-get update -y
            apt-get install -y build-essential python3
            ;;
        centos|rhel|fedora)
            yum -y groupinstall "Development Tools" || yum -y install gcc gcc-c++ make python3
            ;;
        macos)
            if ! xcode-select -p &> /dev/null; then
                print_info "安装 Xcode Command Line Tools..."
                xcode-select --install || true
            fi
            ;;
        *)
            print_warning "未知系统，跳过编译工具安装"
            ;;
    esac

    print_success "编译工具准备完成"
}

# 安装依赖
install_dependencies() {
    print_info "安装前端依赖..."
    npm install

    print_info "安装后端依赖..."
    cd server

    if npm install; then
        print_success "后端依赖安装完成"
    else
        print_warning "后端依赖安装失败，可能缺少编译工具或 node-pty 编译失败"
        print_warning "尝试移除可选原生模块 node-pty 后重装（项目内终端将降级为基础模式）..."

        # 从 package.json 移除 node-pty（npm 7+ 用 npm pkg，旧版回退到 sed）
        npm pkg delete dependencies.node-pty 2>/dev/null || true
        npm pkg delete optionalDependencies.node-pty 2>/dev/null || true
        sed -i '/"node-pty"/d' package.json

        if npm install; then
            print_warning "node-pty 未安装，项目内终端将使用基础模式（spawn），其余功能不受影响"
        else
            print_error "后端依赖安装失败，请检查网络或手动执行：cd server && npm install"
            exit 1
        fi
    fi

    cd ..

    print_success "依赖安装完成"
}

# 挑选一个空闲端口
pick_free_port() {
    local p
    while :; do
        p=$(( RANDOM % 40000 + 20000 ))
        if ss -tln 2>/dev/null | grep -q ":$p[[:space:]]"; then
            continue
        fi
        if netstat -tln 2>/dev/null | grep -q ":$p[[:space:]]"; then
            continue
        fi
        echo "$p"
        return
    done
}

# 解析部署配置（端口 + 安全入口）：环境变量 > 已有配置文件 > 自动生成
resolve_deploy_config() {
    local config_file="$INSTALL_DIR/server/auscore.config.json"
    local existing_port=""
    local existing_path=""

    if [ -f "$config_file" ]; then
        existing_port=$(grep -o '"port"[[:space:]]*:[[:space:]]*[0-9]*' "$config_file" | grep -o '[0-9]*' | head -n1)
        existing_path=$(grep -o '"secretPath"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | sed 's/.*"secretPath"[[:space:]]*:[[:space:]]*"//; s/"//')
    fi

    if [ -n "$AUSCORE_PORT" ]; then
        AUSCORE_DEPLOY_PORT="$AUSCORE_PORT"
    elif [ -n "$existing_port" ]; then
        AUSCORE_DEPLOY_PORT="$existing_port"
    else
        AUSCORE_DEPLOY_PORT=$(pick_free_port)
    fi

    if [ -n "$AUSCORE_PATH" ]; then
        AUSCORE_DEPLOY_PATH=$(echo "$AUSCORE_PATH" | sed 's#^/##; s#/$##')
    elif [ -n "$existing_path" ]; then
        AUSCORE_DEPLOY_PATH="$existing_path"
    else
        AUSCORE_DEPLOY_PATH="auscore-$(openssl rand -hex 5 2>/dev/null || date +%s%N | tail -c 11)"
    fi

    # 校验端口是否被占用，被占用则自动更换
    if ss -tln 2>/dev/null | grep -q ":$AUSCORE_DEPLOY_PORT[[:space:]]" || netstat -tln 2>/dev/null | grep -q ":$AUSCORE_DEPLOY_PORT[[:space:]]"; then
        if [ -n "$AUSCORE_PORT" ]; then
            print_warning "AUSCORE_PORT=$AUSCORE_PORT 已被占用，自动更换端口"
        else
            print_warning "端口 $AUSCORE_DEPLOY_PORT 已被占用，自动更换端口"
        fi
        AUSCORE_DEPLOY_PORT=$(pick_free_port)
    fi
}

# 写入部署配置
write_deploy_config() {
    mkdir -p "$INSTALL_DIR/server"
    cat > "$INSTALL_DIR/server/auscore.config.json" <<EOF
{
  "port": $AUSCORE_DEPLOY_PORT,
  "secretPath": "$AUSCORE_DEPLOY_PATH"
}
EOF
    print_success "部署配置已生成：端口 $AUSCORE_DEPLOY_PORT，安全入口 /$AUSCORE_DEPLOY_PATH"
    print_info "配置文件: $INSTALL_DIR/server/auscore.config.json（可手动修改后重启服务）"
}

# 构建前端
build_frontend() {
    print_info "构建前端..."
    npm run build
    print_success "前端构建完成"
}

# 部署服务
deploy_services() {
    print_info "部署后端服务（前端已由后端托管 dist/，单端口运行）..."
    
    cd "$INSTALL_DIR/server"
    pm2 delete auscore-api 2>/dev/null || true
    pm2 start index.js --name auscore-api
    
    pm2 save
    
    # 设置开机自启
    env PATH=$PATH:/usr/bin /usr/local/bin/pm2 startup systemd -u root --hp /root 2>/dev/null || true
    
    print_success "服务部署完成"
}

# 配置防火墙
configure_firewall() {
    local port="$1"
    print_info "配置防火墙（开放端口 $port）..."
    
    if command -v ufw &> /dev/null; then
        ufw allow $port/tcp comment "AusCore" 2>/dev/null || true
        print_success "UFW 防火墙规则已添加"
    elif command -v firewall-cmd &> /dev/null; then
        firewall-cmd --permanent --add-port=$port/tcp 2>/dev/null || true
        firewall-cmd --reload 2>/dev/null || true
        print_success "Firewalld 防火墙规则已添加"
    else
        print_warning "未检测到防火墙，请手动开放端口 $port"
    fi
}

# 显示完成信息
show_completion() {
    local port="$1"
    local spath="$2"
    local ip
    ip=$(hostname -I 2>/dev/null | awk '{print $1}')
    [ -z "$ip" ] && ip=$(hostname -i 2>/dev/null | awk '{print $1}')
    [ -z "$ip" ] && ip="服务器IP"

    echo ""
    echo "=========================================="
    print_success "AusCore 安装完成！"
    echo "=========================================="
    echo ""
    
    print_info "访问地址: http://$ip:$port/$spath"
    print_info "安全入口: /$spath（请务必保存，未携带入口路径的请求将返回 404）"
    echo ""
    
    print_info "常用命令:"
    echo "  pm2 list                      # 查看进程状态"
    echo "  pm2 logs auscore-api          # 查看后端日志"
    echo "  pm2 restart auscore-api       # 重启后端"
    echo "  pm2 stop all                  # 停止所有服务"
    echo ""
    
    print_info "详细文档: https://github.com/ChineseLiyao/AusCore"
    echo ""
}

# 主函数
main() {
    echo ""
    echo "=========================================="
    echo "       AusCore 自动安装脚本"
    echo "=========================================="
    echo ""
    
    check_root
    detect_os
    install_nodejs
    configure_npm_mirror
    install_git
    install_build_tools
    install_pm2
    clone_project
    resolve_deploy_config
    write_deploy_config
    install_dependencies
    build_frontend
    deploy_services
    configure_firewall "$AUSCORE_DEPLOY_PORT"
    show_completion "$AUSCORE_DEPLOY_PORT" "$AUSCORE_DEPLOY_PATH"
}

# 执行主函数
main
