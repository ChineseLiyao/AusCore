import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import './Login.css'
import { API_BASE } from '../config'

function Login({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!username || !password) {
      setError('请填写所有字段')
      return
    }

    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || '登录失败')
        return
      }

      localStorage.setItem('auscore_session', 'true')
      localStorage.setItem('auscore_user', JSON.stringify(data.user))
      onLogin()
      navigate('/dashboard')
    } catch (err) {
      setError('网络错误，请稍后重试')
      console.error(err)
    }
  }

  return (
    <div className="login-page">
      <div className="login-panel">
        <div className="login-card">
          <h1 className="login-title">账户登录</h1>

          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-group">
              <label>用户名 <span className="required">*</span></label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="请输入用户名"
              />
            </div>

            <div className="form-group">
              <label>密码 <span className="required">*</span></label>
              <div className="password-input-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入密码"
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && <div className="error-message">{error}</div>}

            <button type="submit" className="submit-button">
              登录
            </button>
          </form>

          <p className="login-register">
            还没有账户？<span className="login-link" onClick={() => navigate('/register')}>现在注册</span>
          </p>
        </div>
      </div>

      <div className="login-visual" />
    </div>
  )
}

export default Login
