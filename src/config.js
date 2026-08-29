// 前后端分离部署配置
const OVERRIDE_KEY = 'auscore_server_addr'

function normalizeBase(value) {
  try {
    let base = String(value || '').trim()
    if (!base) return null
    if (!/^https?:\/\//i.test(base)) base = 'http://' + base
    return new URL(base).origin
  } catch {
    return null
  }
}

// 获取用户手动配置的服务器地址
export function getServerAddr() {
  try {
    return localStorage.getItem(OVERRIDE_KEY) || ''
  } catch {
    return ''
  }
}

// 设置服务器地址（传空则恢复自动检测）
export function setServerAddr(value) {
  const base = normalizeBase(value)
  try {
    if (base) {
      localStorage.setItem(OVERRIDE_KEY, base)
    } else {
      localStorage.removeItem(OVERRIDE_KEY)
    }
  } catch {}
  return base
}

// 当前部署的安全入口前缀（由后端注入到 index.html 的 window.__AUSCORE_PREFIX__）
// 未启用安全入口（legacy / 开发模式）时为空字符串
function getPathPrefix() {
  try {
    const v = window.__AUSCORE_PREFIX__
    return typeof v === 'string' && v.startsWith('/') ? v : ''
  } catch {
    return ''
  }
}

function resolveApiBase() {
  const override = normalizeBase(getServerAddr())
  const prefix = getPathPrefix()
  if (override) return override + prefix

  const isDev = import.meta.env.DEV
  if (isDev) {
    return window.location.hostname === 'localhost'
      ? 'http://localhost:13338'
      : `http://${window.location.hostname}:13338`
  }
  const explicit = import.meta.env.VITE_API_BASE
  if (explicit) return explicit
  // 生产环境与后端同源（端口 + 安全入口随当前地址自动推导）
  return window.location.origin + prefix
}

export const API_BASE = resolveApiBase()
export const WS_BASE = API_BASE.replace(/^http/, 'ws')
// React Router 的 basename（安全入口前缀，未设置时为 '/'）
export const ROUTER_BASENAME = getPathPrefix() || '/'

// ---- 认证令牌 ----
const TOKEN_KEY = 'auscore_token'

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) || '' } catch { return '' }
}

export function setToken(token) {
  try { localStorage.setItem(TOKEN_KEY, token || '') } catch {}
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem('auscore_session')
    localStorage.removeItem('auscore_user')
  } catch {}
}

// 自动附带 Authorization 头的 fetch 封装
export function authFetch(url, options = {}) {
  const headers = new Headers(options.headers || {})
  const token = getToken()
  if (token) headers.set('Authorization', 'Bearer ' + token)
  return fetch(url, { ...options, headers })
}

// 生成带令牌的 WebSocket 地址
export function wsUrl(path) {
  const token = getToken()
  const sep = path.includes('?') ? '&' : '?'
  return token ? `${path}${sep}token=${encodeURIComponent(token)}` : path
}
