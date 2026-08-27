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

# 安装 Git
install_git() {
    if command -v git &> /dev/null; then
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
clone_project() {
    INSTALL_DIR="/opt/auscore"
    
    if [ -d "$INSTALL_DIR" ]; then
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
                git pull
                return
            fi
        else
            print_info "非交互式终端，使用现有目录并更新代码"
            cd "$INSTALL_DIR"
            git pull
            return
        fi
    fi
    
    print_info "克隆项目到 $INSTALL_DIR..."
    git clone https://github.com/ChineseLiyao/AusCore.git "$INSTALL_DIR"
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
    print_info "配置防火墙..."
    
    if command -v ufw &> /dev/null; then
        ufw allow 13338/tcp comment "AusCore" 2>/dev/null || true
        print_success "UFW 防火墙规则已添加"
    elif command -v firewall-cmd &> /dev/null; then
        firewall-cmd --permanent --add-port=13338/tcp 2>/dev/null || true
        firewall-cmd --reload 2>/dev/null || true
        print_success "Firewalld 防火墙规则已添加"
    else
        print_warning "未检测到防火墙，请手动开放端口 13338"
    fi
}

# 显示完成信息
show_completion() {
    echo ""
    echo "=========================================="
    print_success "AusCore 安装完成！"
    echo "=========================================="
    echo ""
    
    print_info "访问地址: http://$(hostname -I | awk '{print $1}'):13338"
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
    install_git
    install_build_tools
    install_pm2
    clone_project
    install_dependencies
    build_frontend
    deploy_services
    configure_firewall
    show_completion
}

# 执行主函数
main
