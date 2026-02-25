import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import './Login.css'

function EqualizerBackground() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let animId

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    // 竖条配置
    const barCount = 200
    const bars = []
    for (let i = 0; i < barCount; i++) {
      bars.push({
        // 灰白条
        whiteHeight: Math.random() * 0.4 + 0.15,
        whiteSpeed: Math.random() * 0.8 + 0.4,
        whitePhase: Math.random() * Math.PI * 2,
        // 红条
        redHeight: Math.random() * 0.2 + 0.05,
        redSpeed: Math.random() * 0.6 + 0.3,
        redPhase: Math.random() * Math.PI * 2,
        redDelay: Math.random() * 1.5 + 0.5,
      })
    }

    const draw = (time) => {
      const t = time / 1000
      const W = canvas.width
      const H = canvas.height
      ctx.clearRect(0, 0, W, H)

      // 白色背景
      ctx.fillStyle = '#f5f5f7'
      ctx.fillRect(0, 0, W, H)

      const gap = 1
      const barW = Math.max(((W - gap * barCount) / barCount), 2)
      const totalBarW = barW + gap

      for (let i = 0; i < barCount; i++) {
        const b = bars[i]
        const x = i * totalBarW + gap / 2

        // 蓝色条高度 - 从底部往上
        const whiteH = (0.15 + b.whiteHeight * (0.5 + 0.5 * Math.sin(t * b.whiteSpeed + b.whitePhase))) * H
        const whiteY = H - whiteH

        // 蓝灰渐变
        const whiteGrad = ctx.createLinearGradient(x, whiteY, x, H)
        whiteGrad.addColorStop(0, 'rgba(70, 110, 150, 0.5)')
        whiteGrad.addColorStop(0.5, 'rgba(90, 130, 170, 0.35)')
        whiteGrad.addColorStop(1, 'rgba(110, 150, 190, 0.2)')
        ctx.fillStyle = whiteGrad
        ctx.fillRect(x, whiteY, barW, whiteH)

        // 红条 - 在下面追着蓝条
        const redMax = whiteH * 0.6
        const redH = (0.08 + b.redHeight * (0.5 + 0.5 * Math.sin(t * b.redSpeed + b.redPhase + b.redDelay))) * H
        const clampedRedH = Math.min(redH, redMax)
        const redY = H - clampedRedH

        const redGrad = ctx.createLinearGradient(x, redY, x, H)
        redGrad.addColorStop(0, 'rgba(220, 70, 70, 0.6)')
        redGrad.addColorStop(0.6, 'rgba(200, 50, 50, 0.45)')
        redGrad.addColorStop(1, 'rgba(180, 40, 40, 0.3)')
        ctx.fillStyle = redGrad
        ctx.fillRect(x, redY, barW, clampedRedH)
      }

      animId = requestAnimationFrame(draw)
    }

    animId = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={canvasRef} className="equalizer-bg" />
}

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
      const response = await fetch('http://localhost:13338/api/auth/login', {
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
    <div className="login-container">
      <EqualizerBackground />
      <div className="login-wrapper">
        <div className="login-card">
          <h1 className="login-title">AusCore</h1>
          
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
        </div>
        <p className="login-footer">AusCore Project</p>
      </div>
    </div>
  )
}

export default Login
