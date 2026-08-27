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

function resolveApiBase() {
  const override = normalizeBase(getServerAddr())
  if (override) return override

  const isDev = import.meta.env.DEV
  if (isDev) {
    return window.location.hostname === 'localhost'
      ? 'http://localhost:13338'
      : `http://${window.location.hostname}:13338`
  }
  return import.meta.env.VITE_API_BASE || `http://${window.location.hostname}:13338`
}

export const API_BASE = resolveApiBase()
export const WS_BASE = API_BASE.replace(/^http/, 'ws')
