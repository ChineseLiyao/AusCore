import { Home, LogOut, FolderKanban, FileText, Terminal, User, Settings, X } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import './Sidebar.css'
import { API_BASE, getServerAddr, setServerAddr } from '../config'

function parseServerAddr(value) {
  try {
    const u = new URL(value)
    return {
      https: u.protocol === 'https:',
      host: u.hostname,
      port: u.port || (u.protocol === 'https:' ? '443' : '13338')
    }
  } catch {
    return { https: false, host: '', port: '13338' }
  }
}

function Sidebar({ onLogout }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [hostname, setHostname] = useState('')
  const [showSettings, setShowSettings] = useState(false)

  const saved = parseServerAddr(getServerAddr())
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

  const handleSaveSettings = () => {
    const host = settings.host.trim()
    if (!host) return
    const scheme = settings.https ? 'https' : 'http'
    setServerAddr(`${scheme}://${host}:${settings.port}`)
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
    <div className="sidebar">
      <div className="sidebar-header">
        <h2 className="sidebar-title">AusCore</h2>
        <p className="sidebar-version">Alpha v1.0.0</p>
      </div>

      <nav className="sidebar-nav">
        {menuItems.map(item => (
          <div
            key={item.id}
            className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
            onClick={() => navigate(item.path)}
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
        <button className="settings-button" onClick={() => setShowSettings(true)}>
          <Settings size={16} />
          <span>服务器设置</span>
        </button>
        <button className="logout-button" onClick={handleLogout}>
          <LogOut size={16} />
          <span>退出登录</span>
        </button>
      </div>

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
                      placeholder="13338"
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
  )
}

export default Sidebar
