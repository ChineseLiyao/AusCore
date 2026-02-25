// 前后端分离部署配置
const isDev = import.meta.env.DEV

// 开发环境：如果通过 IP 访问，自动使用当前域名的后端
export const API_BASE = isDev 
  ? (window.location.hostname === 'localhost' 
      ? 'http://localhost:13338' 
      : `http://${window.location.hostname}:13338`)
  : (import.meta.env.VITE_API_BASE || `http://${window.location.hostname}:13338`)

export const WS_BASE = isDev 
  ? (window.location.hostname === 'localhost' 
      ? 'ws://localhost:13338' 
      : `ws://${window.location.hostname}:13338`)
  : (import.meta.env.VITE_WS_BASE || `ws://${window.location.hostname}:13338`)
