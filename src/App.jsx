import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import Register from './pages/Register'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Projects from './pages/Projects'
import ProjectDetail from './pages/ProjectDetail'
import Files from './pages/Files'
import ServerTerminal from './pages/ServerTerminal'
import Sidebar from './components/Sidebar'
import Breadcrumb from './components/Breadcrumb'
import Toast from './components/Toast'
import ConfirmDialog from './components/ConfirmDialog'
import DownloadManager from './components/DownloadManager'
import { useToast } from './hooks/useToast'
import { useConfirm } from './hooks/useConfirm'

const API_URL = 'http://localhost:13338/api/metrics'

function MainLayout({ onLogout }) {
  const { toasts, removeToast, success, error: showError, warning } = useToast()
  const { confirmState, confirm } = useConfirm()
  const [metrics, setMetrics] = useState({
    cpu: { value: 0, load: '0, 0, 0', history: [] },
    memory: { value: 0, used: '0 GB', total: '0 GB', history: [] },
    disk: { read: 0, write: 0, history: [] },
    network: { download: 0, upload: 0, history: [] }
  })
  const [errorMsg, setErrorMsg] = useState(null)
  const intervalRef = useRef(null)

  const fetchMetrics = async () => {
    try {
      const response = await fetch(API_URL)
      if (!response.ok) throw new Error('Failed to fetch metrics')
      
      const data = await response.json()
      
      setMetrics(prev => ({
        cpu: {
          value: data.cpu.value,
          load: data.cpu.load,
          history: [...prev.cpu.history.slice(-20), data.cpu.value]
        },
        memory: {
          value: data.memory.value,
          used: `${data.memory.used} GB`,
          total: `${data.memory.total} GB`,
          history: [...prev.memory.history.slice(-20), data.memory.value]
        },
        disk: {
          read: data.disk.read,
          write: data.disk.write,
          history: [...prev.disk.history.slice(-20), { 
            down: data.disk.read, 
            up: data.disk.write 
          }]
        },
        network: {
          download: data.network.download,
          upload: data.network.upload,
          history: [...prev.network.history.slice(-20), { 
            down: data.network.download, 
            up: data.network.upload 
          }]
        }
      }))
      setErrorMsg(null)
    } catch (err) {
      setErrorMsg('无法连接到服务器，请确保后端服务已启动')
      console.error('Error fetching metrics:', err)
    }
  }

  useEffect(() => {
    fetchMetrics()
    intervalRef.current = setInterval(fetchMetrics, 2000)
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [])

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh' }}>
      <Sidebar onLogout={onLogout} />
      <div style={{ flex: 1, overflow: 'auto', background: 'hsl(0, 0%, 96%)' }}>
        <Breadcrumb />
        <Routes>
          <Route path="/dashboard" element={<Dashboard metrics={metrics} error={errorMsg} />} />
          <Route path="/projects" element={<Projects toast={{ success, error: showError, warning }} confirm={confirm} />} />
          <Route path="/projects/:id" element={<ProjectDetail toast={{ success, error: showError, warning }} />} />
          <Route path="/files/*" element={<Files toast={{ success, error: showError, warning }} confirm={confirm} />} />
          <Route path="/terminal" element={<ServerTerminal toast={{ success, error: showError, warning }} />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </div>
      {confirmState && (
        <ConfirmDialog
          message={confirmState.message}
          onConfirm={confirmState.onConfirm}
          onCancel={confirmState.onCancel}
        />
      )}
      <div className="toast-container">
        {toasts.map(toast => (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </div>
      <DownloadManager />
    </div>
  )
}

function App() {
  const [isRegistered, setIsRegistered] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        // 先检查本地会话（同步）
        const session = localStorage.getItem('auscore_session')
        setIsAuthenticated(!!session)
        
        // 检查服务器是否有管理员账户
        const response = await fetch('http://localhost:13338/api/auth/check')
        const data = await response.json()
        setIsRegistered(data.hasAdmin)
      } catch (error) {
        console.error('Auth check error:', error)
      } finally {
        setIsLoading(false)
      }
    }
    
    checkAuth()
  }, [])

  const handleLogout = () => {
    localStorage.removeItem('auscore_session')
    setIsAuthenticated(false)
  }

  if (isLoading) {
    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        width: '100vw', 
        height: '100vh',
        background: 'hsl(0, 0%, 96%)'
      }}>
        <div style={{ fontSize: '16px', color: 'hsl(272, 15%, 60%)' }}>加载中...</div>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route 
          path="/register" 
          element={
            !isRegistered ? (
              <Register onRegister={() => {
                setIsRegistered(true)
                setIsAuthenticated(true)
              }} />
            ) : (
              <Navigate to="/login" replace />
            )
          } 
        />
        <Route 
          path="/login" 
          element={
            isAuthenticated ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <Login onLogin={() => setIsAuthenticated(true)} />
            )
          } 
        />
        <Route 
          path="/*" 
          element={
            isAuthenticated ? (
              <MainLayout onLogout={handleLogout} />
            ) : (
              <Navigate to={isRegistered ? "/login" : "/register"} replace />
            )
          } 
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App