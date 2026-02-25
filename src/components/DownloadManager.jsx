import { useState, useEffect, useRef } from 'react'
import './DownloadManager.css'
import { API_BASE } from '../config'

const DownloadIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
)

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

const ErrorIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

const BalloonIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="10" fill="hsl(142, 76%, 90%)" stroke="hsl(142, 76%, 36%)" strokeWidth="1.5" />
    <polyline points="8 12 11 15 16 9" fill="none" stroke="hsl(142, 76%, 36%)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

function DownloadManager() {
  const [tasks, setTasks] = useState([])
  const [expanded, setExpanded] = useState(false)
  const [visible, setVisible] = useState(false)
  const [fadeOut, setFadeOut] = useState(false)
  const [balloons, setBalloons] = useState([])
  const prevTasksRef = useRef(new Map())
  const pollRef = useRef(null)

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/downloads`)
        if (res.ok) {
          const data = await res.json()
          const newTasks = data.tasks || []
          setTasks(newTasks)

          // 检测新完成的任�?
          const prevMap = prevTasksRef.current
          newTasks.forEach(t => {
            const prev = prevMap.get(t.id)
            if (t.status === 'done' && (!prev || prev.status !== 'done')) {
              setBalloons(b => [...b, { id: t.id, name: t.name, ts: Date.now() }])
            }
          })

          // 更新 prev ref
          const newMap = new Map()
          newTasks.forEach(t => newMap.set(t.id, { status: t.status }))
          prevTasksRef.current = newMap

          const hasActive = newTasks.some(t => t.status === 'downloading')
          if (newTasks.length > 0) {
            setVisible(true)
            setFadeOut(false)
          }
          if (!hasActive && newTasks.length > 0 && newTasks.every(t => t.status === 'done' || t.status === 'error')) {
            // 全部完成�?秒后渐隐
            setTimeout(() => setFadeOut(true), 3000)
            setTimeout(() => { setVisible(false); setFadeOut(false); setExpanded(false) }, 4000)
          }
        }
      } catch { /* ignore */ }
    }

    pollRef.current = setInterval(poll, 800)
    return () => clearInterval(pollRef.current)
  }, [])

  // 清理气球通知
  useEffect(() => {
    if (balloons.length === 0) return
    const timer = setTimeout(() => {
      setBalloons(b => b.filter(bl => Date.now() - bl.ts < 4000))
    }, 4500)
    return () => clearTimeout(timer)
  }, [balloons])

  const activeCount = tasks.filter(t => t.status === 'downloading').length
  const overallProgress = tasks.length > 0
    ? Math.round(tasks.reduce((sum, t) => sum + (t.progress || 0), 0) / tasks.length)
    : 0

  if (!visible && balloons.length === 0) return null

  const circumference = 2 * Math.PI * 18

  return (
    <>
      {/* 气球通知 */}
      <div className="download-balloons">
        {balloons.map(b => (
          <div key={b.id} className="download-balloon">
            <BalloonIcon />
            <span>{b.name} 下载完成</span>
          </div>
        ))}
      </div>

      {/* 浮动圆圈 */}
      {visible && (
        <div className={`download-fab ${fadeOut ? 'fade-out' : ''}`} onClick={() => setExpanded(!expanded)}>
          <svg className="download-fab-ring" width="48" height="48" viewBox="0 0 48 48">
            <circle cx="24" cy="24" r="18" fill="none" stroke="hsl(272, 15%, 88%)" strokeWidth="3" />
            <circle
              cx="24" cy="24" r="18" fill="none"
              stroke="hsl(208, 40%, 35%)" strokeWidth="3"
              strokeDasharray={circumference}
              strokeDashoffset={circumference - (circumference * overallProgress / 100)}
              strokeLinecap="round"
              transform="rotate(-90 24 24)"
              className="download-fab-progress"
            />
          </svg>
          <div className="download-fab-icon">
            {activeCount > 0 ? <DownloadIcon /> : <CheckIcon />}
          </div>
          {activeCount > 0 && <span className="download-fab-badge">{activeCount}</span>}
        </div>
      )}

      {/* 展开面板 */}
      {expanded && visible && (
        <div className="download-panel">
          <div className="download-panel-header">
            <span>下载任务</span>
            <button className="download-panel-close" onClick={() => setExpanded(false)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="download-panel-list">
            {tasks.length === 0 && <div className="download-panel-empty">暂无下载任务</div>}
            {tasks.map(t => (
              <div key={t.id} className={`download-item ${t.status}`}>
                <div className="download-item-info">
                  <span className="download-item-name">{t.name}</span>
                  <span className="download-item-status">
                    {t.status === 'downloading' && `${t.progress}%`}
                    {t.status === 'done' && <><CheckIcon /> 完成</>}
                    {t.status === 'error' && <><ErrorIcon /> 失败</>}
                  </span>
                </div>
                {t.status === 'downloading' && (
                  <div className="download-item-bar">
                    <div className="download-item-bar-fill" style={{ width: `${t.progress}%` }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

export default DownloadManager
