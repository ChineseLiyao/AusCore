import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import './Register.css'

function Register({ onRegister }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [passwordStrength, setPasswordStrength] = useState(0)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const navigate = useNavigate()

  const checkPasswordStrength = (pwd) => {
    let strength = 0
    if (pwd.length >= 8) strength++
    if (pwd.length >= 12) strength++
    if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) strength++
    if (/\d/.test(pwd)) strength++
    if (/[^a-zA-Z0-9]/.test(pwd)) strength++
    return strength
  }

  const handlePasswordChange = (e) => {
    const pwd = e.target.value
    setPassword(pwd)
    setPasswordStrength(checkPasswordStrength(pwd))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!username || !password || !confirmPassword) {
      setError('请填写所有字段')
      return
    }

    if (password !== confirmPassword) {
      setError('两次密码输入不一致')
      return
    }

    if (password.length < 8) {
      setError('密码长度至少8个字符')
      return
    }

    if (passwordStrength < 3) {
      setError('密码强度不足，请使用大小写字母、数字和特殊字符的组合')
      return
    }

    try {
      const response = await fetch('http://localhost:13338/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || '注册失败')
        return
      }

      localStorage.setItem('auscore_session', 'true')
      localStorage.setItem('auscore_user', JSON.stringify(data.user))
      onRegister()
      navigate('/dashboard')
    } catch (err) {
      setError('网络错误，请稍后重试')
      console.error(err)
    }
  }

  const getStrengthColor = () => {
    if (passwordStrength <= 1) return 'hsl(354, 88%, 71%)'
    if (passwordStrength <= 3) return 'hsl(343, 40%, 59%)'
    return 'hsl(208, 40%, 35%)'
  }

  const getStrengthText = () => {
    if (passwordStrength <= 1) return '弱'
    if (passwordStrength <= 3) return '中'
    return '强'
  }

  return (
    <div className="register-container">
      <div className="register-card">
        <h1 className="register-title">AusCore</h1>
        <p className="register-subtitle">服务器管理面板</p>
        
        <form onSubmit={handleSubmit} className="register-form">
          <div className="form-group">
            <label>用户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入用户名"
            />
          </div>

          <div className="form-group">
            <label>密码</label>
            <div className="password-input-wrapper">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={handlePasswordChange}
                placeholder="请输入密码（至少8个字符）"
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {password && (
              <div className="password-strength">
                <div className="strength-bar">
                  <div 
                    className="strength-fill" 
                    style={{ 
                      width: `${(passwordStrength / 5) * 100}%`,
                      backgroundColor: getStrengthColor()
                    }}
                  ></div>
                </div>
                <span style={{ color: getStrengthColor() }}>
                  密码强度: {getStrengthText()}
                </span>
              </div>
            )}
          </div>

          <div className="form-group">
            <label>确认密码</label>
            <div className="password-input-wrapper">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="请再次输入密码"
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" className="submit-button">
            创建管理员账户
          </button>
        </form>
      </div>
    </div>
  )
}

export default Register
