import { Home, LogOut, FolderKanban, FileText, Terminal, User } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import './Sidebar.css'

function Sidebar({ onLogout }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [hostname, setHostname] = useState('')

  useEffect(() => {
    fetch('http://localhost:13338/api/hostname')
      .then(res => res.json())
      .then(data => setHostname(data.hostname))
      .catch(() => {})
  }, [])

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
        <button className="logout-button" onClick={handleLogout}>
          <LogOut size={16} />
          <span>退出登录</span>
        </button>
      </div>
    </div>
  )
}

export default Sidebar
