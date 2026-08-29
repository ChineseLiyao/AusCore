import { Home, LogOut, FolderKanban, FileText, Terminal, User, Settings, X, RefreshCw, DownloadCloud } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import './Sidebar.css'
import { API_BASE, getServerAddr, setServerAddr } from '../config'

function getDefaultAddr() {
  try {
    return {
      https: window.location.protocol === 'https:',
      host: window.location.hostname,
      port: window.location.port || (window.location.protocol === 'https:' ? '443' : '')
    }
  } catch {
    return { https: false, host: '', port: '' }
  }
}

function parseServerAddr(value) {
  try {
    const u = new URL(value)
    return {
      https: u.protocol === 'https:',
      host: u.hostname,
      port: u.port
    }
  } catch {
    return getDefaultAddr()
  }
}

function Sidebar({ onLogout, toast, open, onClose }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [hostname, setHostname] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [showUpdateModal, setShowUpdateModal] = useState(false)
  const [updateInfo, setUpdateInfo] = useState(null)
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [updating, setUpdating] = useState(false)
  const checkIntervalRef = useRef(null)
  const pollTimerRef = useRef(null)

  const saved = getServerAddr() ? parseServerAddr(getServerAddr()) : getDefaultAddr()
  const [settings, setSettings] = useState({
    https: saved.https,
    host: saved.host,
    port: saved.port
  })

  useEffect(() => {
    fetch(`${API_BASE}/api/hostname`)
      .then(res => res.json())
      .then(data => setHostname(data.hostname))
      .catch(() => {})
  }, [])

  const checkUpdate = async (silent = true) => {
    if (checkingUpdate) return
    setCheckingUpdate(true)
    try {
      const res = await fetch(`${API_BASE}/api/update/check`)
      if (res.ok) {
        const data = await res.json()
        setUpdateInfo(data)
        if (!silent && data.hasUpdate) {
          toast?.success('发现新版本，可进行更新')
        }
        return data
      }
    } catch {
      /* ignore */
    } finally {
      setCheckingUpdate(false)
    }
    return null
  }

  // 启动时自动检测，之后每 30 分钟检测一次
  useEffect(() => {
    checkUpdate()
    checkIntervalRef.current = setInterval(() => checkUpdate(), 30 * 60 * 1000)
    return () => {
      clearInterval(checkIntervalRef.current)
      clearInterval(pollTimerRef.current)
    }
  }, [])

  const handleApplyUpdate = async () => {
    setUpdating(true)
    try {
      const res = await fetch(`${API_BASE}/api/update/apply`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        toast?.error(data.error || '更新失败')
        setUpdating(false)
        return
      }
      toast?.success('更新已开始，服务将在完成后自动重启')
      setShowUpdateModal(false)

      // 轮询等待更新完成（服务重启后本地版本与远程一致即完成）
      let tries = 0
      const poll = async () => {
        tries++
        try {
          const d = await checkUpdate(true)
          if (d && d.installed?.commit && d.latest?.commit && d.installed.commit === d.latest.commit) {
            toast?.success('更新完成，正在刷新页面')
            window.location.reload()
            return
          }
        } catch { /* server restarted */ }
        if (tries < 60) {
          pollTimerRef.current = setTimeout(poll, 5000)
        } else {
          setUpdating(false)
          toast?.warning('更新状态未知，请手动刷新页面查看')
        }
      }
      poll()
    } catch (err) {
      setUpdating(false)
      toast?.error('更新请求失败')
    }
  }

  const handleSaveSettings = () => {
    const host = settings.host.trim()
    if (!host) return
    const scheme = settings.https ? 'https' : 'http'
    const portPart = settings.port ? `:${settings.port}` : ''
    setServerAddr(`${scheme}://${host}${portPart}`)
    window.location.reload()
  }

  const handleResetSettings = () => {
    setServerAddr('')
    window.location.reload()
  }

  const menuItems = [
    { id: 'dashboard', label: '主页', icon: <Home size={18} />, path: '/dashboard' },
    { id: 'projects', label: '项目', icon: <FolderKanban size={18} />, path: '/projects' },
    { id: 'files', label: '文件', icon: <FileText size={18} />, path: '/files' },
    { id: 'terminal', label: '终端', icon: <Terminal size={18} />, path: '/terminal' }
  ]

  const handleLogout = () => {
    localStorage.removeItem('auscore_session')
    onLogout()
  }

  return (
    <>
      {open && <div className="sidebar-overlay" onClick={onClose} />}
      <div className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h2 className="sidebar-title">AusCore</h2>
          <p className="sidebar-version">Alpha v1.0.1</p>
        </div>

        <nav className="sidebar-nav">
          {menuItems.map(item => (
            <div
              key={item.id}
              className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
              onClick={() => { navigate(item.path); onClose?.() }}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </div>
          ))}
        </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user">
          <User size={16} />
          <span>{hostname || '...'}</span>
        </div>
        <button
          className={`update-button ${updateInfo?.hasUpdate ? 'has-update' : ''}`}
          onClick={() => setShowUpdateModal(true)}
        >
          {updateInfo?.hasUpdate ? <DownloadCloud size={16} /> : <RefreshCw size={16} className={checkingUpdate ? 'spin' : ''} />}
          <span>
            {updating
              ? '更新中...'
              : updateInfo?.hasUpdate
                ? '有新版本'
                : '检查更新'}
          </span>
        </button>
        <button className="settings-button" onClick={() => setShowSettings(true)}>
          <Settings size={16} />
          <span>服务器设置</span>
        </button>
        <button className="logout-button" onClick={handleLogout}>
          <LogOut size={16} />
          <span>退出登录</span>
        </button>
      </div>

      {showUpdateModal && (
        <div className="modal-overlay" onClick={() => setShowUpdateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <h2>系统更新</h2>
              <button className="btn-close-modal" onClick={() => setShowUpdateModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              {updateInfo ? (
                <div className="update-info">
                  <div className="update-row">
                    <span className="update-label">当前版本</span>
                    <span className="update-value">v{updateInfo.installed.version} ({updateInfo.installed.short || 'unknown'})</span>
                  </div>
                  <div className="update-row">
                    <span className="update-label">最新版本</span>
                    <span className="update-value">{updateInfo.latest.short || updateInfo.latest.commit || 'unknown'}</span>
                  </div>
                  {updateInfo.error ? (
                    <p className="update-status error">{updateInfo.error}</p>
                  ) : updateInfo.hasUpdate ? (
                    <p className="update-status available">发现新版本，点击下方按钮开始更新</p>
                  ) : (
                    <p className="update-status ok">已是最新版本</p>
                  )}
                </div>
              ) : (
                <p className="modal-hint">正在获取版本信息...</p>
              )}
              <div className="settings-actions">
                <button className="btn-cancel" onClick={() => { checkUpdate(false); }} disabled={checkingUpdate}>
                  <RefreshCw size={14} className={checkingUpdate ? 'spin' : ''} />
                  <span>重新检测</span>
                </button>
                {updateInfo?.hasUpdate && !updating && (
                  <button className="btn-save" onClick={handleApplyUpdate}>
                    <DownloadCloud size={14} />
                    <span>立即更新</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <h2>服务器设置</h2>
              <button className="btn-close-modal" onClick={() => setShowSettings(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <p className="modal-hint">配置后端 API 服务器地址，保存后自动跳转使用该服务器。</p>
              <div className="settings-form">
                <label className="settings-label">
                  <span>服务器地址（IP 或域名）</span>
                  <input
                    type="text"
                    className="settings-input"
                    placeholder="例：192.168.1.10 或 example.com"
                    value={settings.host}
                    onChange={(e) => setSettings({ ...settings, host: e.target.value })}
                  />
                </label>
                <div className="settings-row">
                  <label className="settings-label">
                    <span>端口</span>
                    <input
                      type="text"
                      className="settings-input"
                      placeholder="端口（默认跟随当前页面）"
                      value={settings.port}
                      onChange={(e) => setSettings({ ...settings, port: e.target.value })}
                    />
                  </label>
                  <label className="settings-check">
                    <input
                      type="checkbox"
                      checked={settings.https}
                      onChange={(e) => setSettings({ ...settings, https: e.target.checked })}
                    />
                    <span>使用 HTTPS</span>
                  </label>
                </div>
                {getServerAddr() && (
                  <p className="settings-current">当前：{getServerAddr()}</p>
                )}
              </div>
              <div className="settings-actions">
                <button className="btn-cancel" onClick={handleResetSettings}>恢复自动检测</button>
                <button className="btn-save" onClick={handleSaveSettings} disabled={!settings.host.trim()}>保存并跳转</button>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </>
  )
}

export default Sidebar
