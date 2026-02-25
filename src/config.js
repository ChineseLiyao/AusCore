// 前后端分离部署配置
// 开发环境：前端 5173，后端 13338
// 生产环境：通过环境变量配置后端地址
const isDev = import.meta.env.DEV

export const API_BASE = isDev 
  ? 'http://localhost:13338' 
  : (import.meta.env.VITE_API_BASE || 'http://localhost:13338')

export const WS_BASE = isDev 
  ? 'ws://localhost:13338' 
  : (import.meta.env.VITE_WS_BASE || 'ws://localhost:13338')
