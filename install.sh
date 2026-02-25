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

# 安装依赖
install_dependencies() {
    print_info "安装前端依赖..."
    npm install
    
    print_info "安装后端依赖..."
    cd server
    npm install
    cd ..
    
    print_success "依赖安装完成"
}

# 构建前端
build_frontend() {
    print_info "构建前端..."
    npm run build
    print_success "前端构建完成"
}

# 配置部署方式
configure_deployment() {
    echo ""
    print_info "选择部署方式:"
    echo "1) 仅后端 API（推荐，前端单独部署到 Nginx/CDN）"
    echo "2) 后端 + 前端开发服务器（默认）"
    echo "3) 仅后端 API（手动配置）"
    
    # 检测是否为交互式终端
    if [ -t 0 ]; then
        read -p "请选择 [1-3] (默认: 2): " -n 1 -r DEPLOY_MODE
        echo ""
    else
        print_warning "非交互式终端，使用默认部署方式 2"
        DEPLOY_MODE="2"
    fi
    
    # 默认值
    DEPLOY_MODE=${DEPLOY_MODE:-2}
    
    case $DEPLOY_MODE in
        1)
            deploy_api_only
            ;;
        2)
            deploy_with_dev_server
            ;;
        3)
            deploy_api_manual
            ;;
        *)
            print_warning "无效选择，使用默认方式 2"
            deploy_with_dev_server
            ;;
    esac
}

# 部署方式 1: 仅后端 API
deploy_api_only() {
    print_info "配置后端 API 服务..."
    
    cd "$INSTALL_DIR/server"
    pm2 delete auscore-api 2>/dev/null || true
    pm2 start index.js --name auscore-api
    pm2 save
    
    # 设置开机自启
    pm2 startup | tail -n 1 | bash
    
    print_success "后端 API 已启动在端口 13338"
    print_info "后端构建文件位于: $INSTALL_DIR/dist"
    print_warning "请手动配置 Nginx 托管前端静态文件"
}

# 部署方式 2: 后端 + 前端开发服务器
deploy_with_dev_server() {
    print_warning "此模式仅用于测试，不推荐生产环境使用"
    
    cd "$INSTALL_DIR/server"
    pm2 delete auscore-api 2>/dev/null || true
    pm2 start index.js --name auscore-api
    
    cd "$INSTALL_DIR"
    pm2 delete auscore-frontend 2>/dev/null || true
    pm2 start npm --name auscore-frontend -- run dev -- --host 0.0.0.0
    
    pm2 save
    pm2 startup | tail -n 1 | bash
    
    print_success "后端 API 已启动在端口 13338"
    print_success "前端开发服务器已启动在端口 13337"
}

# 部署方式 3: 仅后端（手动）
deploy_api_manual() {
    print_info "后端 API 已准备就绪"
    print_info "手动启动命令:"
    echo ""
    echo "  cd $INSTALL_DIR/server"
    echo "  pm2 start index.js --name auscore-api"
    echo "  pm2 save"
    echo ""
    print_info "前端构建文件位于: $INSTALL_DIR/dist"
}

# 配置防火墙
configure_firewall() {
    print_info "配置防火墙..."
    
    if command -v ufw &> /dev/null; then
        ufw allow 13338/tcp comment "AusCore API"
        if [ "$DEPLOY_MODE" == "2" ]; then
            ufw allow 13337/tcp comment "AusCore Frontend Dev"
        fi
        print_success "UFW 防火墙规则已添加"
    elif command -v firewall-cmd &> /dev/null; then
        firewall-cmd --permanent --add-port=13338/tcp
        if [ "$DEPLOY_MODE" == "2" ]; then
            firewall-cmd --permanent --add-port=13337/tcp
        fi
        firewall-cmd --reload
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
    
    case $DEPLOY_MODE in
        1)
            print_info "后端 API: http://$(hostname -I | awk '{print $1}'):13338"
            print_info "前端文件: $INSTALL_DIR/dist"
            echo ""
            print_warning "下一步: 配置 Nginx 托管前端"
            print_info "参考文档: $INSTALL_DIR/DEPLOY.md"
            ;;
        2)
            print_info "前端地址: http://$(hostname -I | awk '{print $1}'):13337"
            print_info "后端 API: http://$(hostname -I | awk '{print $1}'):13338"
            ;;
        3)
            print_info "后端 API 已准备就绪"
            print_info "前端文件: $INSTALL_DIR/dist"
            ;;
    esac
    
    echo ""
    print_info "常用命令:"
    echo "  pm2 list              # 查看进程状态"
    echo "  pm2 logs auscore-api  # 查看后端日志"
    echo "  pm2 restart auscore-api  # 重启后端"
    echo "  pm2 stop auscore-api     # 停止后端"
    echo ""
    
    if [ "$DEPLOY_MODE" == "2" ]; then
        echo "  pm2 logs auscore-frontend  # 查看前端日志"
        echo "  pm2 restart auscore-frontend  # 重启前端"
        echo ""
    fi
    
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
    install_pm2
    clone_project
    install_dependencies
    build_frontend
    configure_deployment
    configure_firewall
    show_completion
}

# 执行主函数
main
