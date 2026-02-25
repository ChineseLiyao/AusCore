# AusCore 部署指南

## 前后端分离部署

### 开发环境

**后端（端口 13338）：**
```bash
cd server
npm install
npm start
```

**前端（端口 13337）：**
```bash
npm install
npm run dev
```

访问：http://localhost:13337

---

### 生产环境

#### 方案 1：前端静态托管 + 后端独立运行

**1. 构建前端**
```bash
npm install
npm run build
```
生成 `dist/` 目录

**2. 部署前端（Nginx）**

创建 `/etc/nginx/sites-available/auscore-frontend`：
```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    root /path/to/AusCore/dist;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # 如果前后端同域，可以代理 API
    location /api/ {
        proxy_pass http://localhost:13338;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
    
    # WebSocket 代理
    location /terminal {
        proxy_pass http://localhost:13338;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
    }
}
```

启用配置：
```bash
sudo ln -s /etc/nginx/sites-available/auscore-frontend /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

**3. 部署后端（PM2）**
```bash
cd server
npm install --production

# 使用 PM2 管理
pm2 start index.js --name auscore-api
pm2 save
pm2 startup
```

**4. 配置环境变量**

如果前后端不同域，需要在构建前端时配置：

创建 `.env.production`：
```env
VITE_API_BASE=https://api.your-domain.com
VITE_WS_BASE=wss://api.your-domain.com
```

然后重新构建：
```bash
npm run build
```

---

#### 方案 2：前端开发服务器 + 后端独立运行（仅开发/测试）

**后端：**
```bash
cd server
pm2 start index.js --name auscore-api
```

**前端：**
```bash
pm2 start npm --name auscore-frontend -- run dev -- --host 0.0.0.0
```

---

### 跨域配置

如果前后端不同域，后端已配置 CORS：
```javascript
app.use(cors())
```

如需限制来源，修改 `server/index.js`：
```javascript
app.use(cors({
  origin: ['https://your-frontend-domain.com'],
  credentials: true
}))
```

---

### 端口配置

- 前端开发服务器：13337（Vite）
- 后端 API：13338
- 项目静态服务器：动态分配（25565+）

修改后端端口：编辑 `server/index.js` 的 `PORT` 变量

---

### 健康检查

后端提供以下端点：
- `GET /api/hostname` - 服务器主机名
- `GET /api/metrics` - 系统指标
- `GET /api/auth/check` - 认证状态

---

### 常见问题

**Q: 前端连不上后端？**
- 检查 `src/config.js` 的 API_BASE 和 WS_BASE 配置
- 检查后端是否启动：`pm2 list`
- 检查防火墙：`sudo ufw allow 13338`

**Q: WebSocket 连接失败？**
- 确保 Nginx 配置了 WebSocket 代理（见上方配置）
- 检查后端日志：`pm2 logs auscore-api`

**Q: 生产环境 API 地址错误？**
- 检查 `.env.production` 文件
- 重新构建前端：`npm run build`
