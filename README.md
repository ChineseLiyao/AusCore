<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.0--alpha-blue?style=flat-square" alt="Version" />
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License" />
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen?style=flat-square" alt="Node" />
  <img src="https://img.shields.io/badge/platform-Linux%20%7C%20macOS-lightgrey?style=flat-square" alt="Platform" />
</p>

<h1 align="center">AusCore</h1>

<p align="center">
  轻量级服务器管理面板<br/>
  实时监控 · 项目管理 · 文件管理
</p>

<p align="center">
  <a href="#快速安装">快速安装</a> •
  <a href="#功能特性">功能特性</a> •
  <a href="#技术栈">技术栈</a> •
  <a href="#手动部署">手动部署</a> •
  <a href="#开发指南">开发指南</a> •
  <a href="#许可证">许可证</a>
</p>

---

</text>
</invoke>

## 功能特性


### 实时监控仪表盘
- CPU 使用率与负载监控
- 内存使用量实时追踪
- 磁盘 I/O 读写速率
- 网络上传/下载流量
- 所有指标带历史趋势图表

### 项目管理
- 创建和管理多个项目（静态站点 / Node.js / Docker / Minecraft 服务器）
- 一键启动/停止项目进程
- 项目内置终端，实时查看日志输出
- Minecraft 服务端核心下载（Paper / Purpur）
- Modrinth 插件搜索与安装
- Java 版本管理（Adoptium）
- 启动命令可视化配置

### 文件管理器
- 可视化浏览服务器文件系统
- Monaco Editor 在线编辑代码文件
- 文件/文件夹的创建、重命名、删除、移动
- 拖拽上传文件
- 文件与文件夹下载（自动打包 ZIP）
- 批量选择操作

### Web 终端
- 基于 xterm.js 的全功能终端
- WebSocket 实时连接
- 支持中文输入输出

### 用户认证
- bcrypt 密码加密
- 首次访问注册管理员账户
- 登录状态持久化

---

## 快速安装

> 不支持 Windows。

**一键安装：**

```bash
curl -fsSL https://raw.githubusercontent.com/ChineseLiyao/AusCore/main/install.sh | sudo bash
```

脚本会自动完成：
1. 检测操作系统
2. 安装 Node.js 20 和 Git（如未安装）
3. 克隆项目到 `/opt/auscore`
4. 安装依赖并构建前端
5. 创建系统服务（systemd / launchd）并自动启动

安装完成后访问 `http://服务器IP:13338` 即可使用。

---

## 手动部署

### 环境要求

| 依赖 | 最低版本 |
|------|---------|
| Node.js | >= 18 |
| npm | >= 8 |
| Git | 任意 |

### 步骤

```bash
# 1. 克隆项目
git clone https://github.com/ChineseLiyao/AusCore.git
cd AusCore

# 2. 安装前端依赖并构建
npm install
npm run build

# 3. 安装后端依赖
cd server
npm install

# 4. 启动服务
node index.js
```

服务默认运行在 `http://服务器IP:13338`，首次访问会引导注册管理员账户。

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | React 18 |
| 构建工具 | Vite 5 |
| UI 图标 | Lucide React |
| 代码编辑器 | Monaco Editor |
| 终端模拟 | xterm.js |
| 路由 | React Router 6 |
| 后端框架 | Express.js |
| 实时通信 | WebSocket (ws) |
| 密码加密 | bcrypt |
| 文件上传 | Multer |
| 压缩/解压 | Archiver / Unzipper |

---

## 项目结构

```
auscore/
├── src/                    # 前端源码
│   ├── components/         # 通用组件
│   │   ├── Sidebar         # 侧边导航栏
│   │   ├── MetricCard      # 监控指标卡片
│   │   ├── Terminal         # 项目内嵌终端
│   │   ├── Toast            # 消息提示
│   │   ├── ConfirmDialog    # 确认对话框
│   │   ├── DownloadManager  # 下载管理器
│   │   └── Breadcrumb       # 面包屑导航
│   ├── pages/              # 页面
│   │   ├── Dashboard        # 监控仪表盘
│   │   ├── Projects         # 项目列表
│   │   ├── ProjectDetail    # 项目详情
│   │   ├── Files            # 文件管理器
│   │   ├── ServerTerminal   # Web 终端
│   │   ├── Login            # 登录
│   │   └── Register         # 注册
│   ├── hooks/              # 自定义 Hooks
│   ├── App.jsx             # 根组件
│   └── main.jsx            # 入口
├── server/                 # 后端
│   ├── index.js            # Express 服务 + API
│   ├── users.json          # 用户数据
│   ├── projects.json       # 项目数据
│   └── projects/           # 项目文件存储
├── install.sh              # 一键安装脚本
├── vite.config.js          # Vite 配置
└── package.json
```

---

## 开发指南

**前后端分离开发：**

```bash
# 后端（端口 13338）
cd server
npm install
npm start

# 前端（端口 13337）
npm install
npm run dev
```

前端开发服务器：http://localhost:13337  
后端 API 服务器：http://localhost:13338

详细部署文档见 [DEPLOY.md](DEPLOY.md)

---

## 服务管理

### Linux (systemd)

```bash
sudo systemctl start auscore     # 启动
sudo systemctl stop auscore      # 停止
sudo systemctl restart auscore   # 重启
sudo systemctl status auscore    # 状态
sudo journalctl -u auscore -f    # 查看日志
```

### macOS (launchd)

```bash
launchctl start com.auscore.server
launchctl stop com.auscore.server
```

---

## 许可证

[MIT](LICENSE)

---

<p align="center">
  AusCore
</p>
