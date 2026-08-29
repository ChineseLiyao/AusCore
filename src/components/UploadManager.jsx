import { useState, useEffect, useRef } from 'react'
import { API_BASE, authFetch, getToken } from '../config'
import './UploadManager.css'

const CHUNK_SIZE = 4 * 1024 * 1024
const STORAGE_KEY = 'auscore_uploads'
const MAX_AUTO_RETRY = 3

const delay = (ms) => new Promise(r => setTimeout(r, ms))

let itemCounter = 0
let lastRenderAt = 0

function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function writeStored(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {}
}

// 全局上传入口，供 Files 页面调用
export const uploadManager = {
  _handler: null,
  addFiles(files, targetPath) {
    if (this._handler) this._handler(files, targetPath)
  }
}

const UploadIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
)

const PauseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="6" y="4" width="4" height="16" rx="1" />
    <rect x="14" y="4" width="4" height="16" rx="1" />
  </svg>
)

const PlayIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="6 3 20 12 6 21 6 3" />
  </svg>
)

const XIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

const RetryIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1 4 1 10 7 10" />
    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
  </svg>
)

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

function UploadManager({ toast }) {
  const itemsRef = useRef(new Map())
  const filePickerRef = useRef(null)
  const resumeTargetRef = useRef(null)
  const [tick, setTick] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const [visible, setVisible] = useState(false)

  const rerender = () => setTick(t => t + 1)

  const rerenderThrottled = () => {
    const now = Date.now()
    if (now - lastRenderAt > 100) {
      lastRenderAt = now
      rerender()
    }
  }

  const persist = () => {
    const pending = []
    itemsRef.current.forEach(item => {
      if (['queued', 'uploading', 'paused', 'error'].includes(item.status)) {
        pending.push({
          id: item.id,
          name: item.name,
          size: item.size,
          lastModified: item.lastModified,
          targetPath: item.targetPath,
          uploaded: item.serverUploaded || 0
        })
      }
    })
    writeStored(pending)
  }

  const queryUploaded = async (item) => {
    const qs = `path=${encodeURIComponent(item.targetPath)}&filename=${encodeURIComponent(item.name)}&size=${item.size}`
    const res = await authFetch(`${API_BASE}/api/files/upload/resume?${qs}`)
    if (!res.ok) throw new Error('无法查询上传进度')
    const data = await res.json()
    return Math.min(data.uploaded || 0, item.size)
  }

  const cancelServerPart = async (item) => {
    try {
      const qs = `path=${encodeURIComponent(item.targetPath)}&filename=${encodeURIComponent(item.name)}&size=${item.size}`
      await authFetch(`${API_BASE}/api/files/upload/resume?${qs}`, { method: 'DELETE' })
    } catch {}
  }

  const sendChunk = (item, chunk, offset) => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    item.xhr = xhr
    xhr.open('POST', `${API_BASE}/api/files/upload/chunk`)
    xhr.setRequestHeader('Content-Type', 'application/octet-stream')
    const tk = getToken()
    if (tk) xhr.setRequestHeader('Authorization', 'Bearer ' + tk)
    xhr.setRequestHeader('x-target-path', encodeURIComponent(item.targetPath))
    xhr.setRequestHeader('x-filename', encodeURIComponent(item.name))
    xhr.setRequestHeader('x-offset', String(offset))
    xhr.setRequestHeader('x-total-size', String(item.size))
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        item.uploaded = Math.min(offset + e.loaded, item.size)
        rerenderThrottled()
      }
    }
    xhr.onload = () => {
      if (xhr.status === 200) {
        try {
          const data = JSON.parse(xhr.responseText)
          resolve(data.uploaded)
        } catch {
          reject(new Error('服务器响应异常'))
        }
      } else {
        reject(new Error(`HTTP ${xhr.status}`))
      }
    }
    xhr.onerror = () => reject(new Error('网络错误'))
    xhr.onabort = () => reject(new Error('已暂停'))
    xhr.send(chunk)
  })

  const schedule = () => {
    const hasRunning = [...itemsRef.current.values()].some(i => i.running || i.status === 'uploading')
    if (hasRunning) return
    const next = [...itemsRef.current.values()].find(i => i.status === 'queued' && i.file)
    if (next) runItem(next)
  }

  const runItem = async (item) => {
    if (item.running) return
    item.running = true
    item.status = 'uploading'
    rerender()

    try {
      // 同步服务器端已上传大小（断点续传的关键）
      item.serverUploaded = await queryUploaded(item)
      item.uploaded = item.serverUploaded

      let failCount = 0
      while (item.uploaded < item.size && item.status === 'uploading') {
        const start = item.uploaded
        const end = Math.min(start + CHUNK_SIZE, item.size)
        try {
          const chunk = item.file.slice(start, end)
          const serverUploaded = await sendChunk(item, chunk, start)
          item.serverUploaded = serverUploaded
          item.uploaded = serverUploaded
          failCount = 0
          persist()
        } catch (err) {
          if (item.status !== 'uploading') break
          failCount++
          if (failCount <= MAX_AUTO_RETRY) {
            await delay(1500 * failCount)
            try {
              item.serverUploaded = await queryUploaded(item)
              item.uploaded = item.serverUploaded
            } catch {}
            rerender()
            continue
          }
          item.status = 'error'
          item.error = err.message
          persist()
          rerender()
          break
        }
      }

      if (item.status !== 'uploading') return

      if (item.uploaded >= item.size) {
        const res = await authFetch(`${API_BASE}/api/files/upload/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: item.targetPath, filename: item.name, size: item.size })
        })
        if (!res.ok) throw new Error('合并文件失败')
        item.status = 'done'
        item.uploaded = item.size
        persist()
        rerender()
        window.dispatchEvent(new CustomEvent('auscore-upload-complete', {
          detail: { targetPath: item.targetPath, name: item.name }
        }))
        if (toast?.success) toast.success(`「${item.name}」上传完成`)
      }
    } catch (err) {
      if (item.status === 'uploading') {
        item.status = 'error'
        item.error = err.message
        persist()
        rerender()
      }
    } finally {
      item.running = false
      item.xhr = null
      rerender()
      schedule()
    }
  }

  const handleAddFiles = (filesList, targetPath) => {
    filesList.forEach(file => {
      // 去重：同一目录、同名、同大小且未完成的任务跳过
      const dup = [...itemsRef.current.values()].find(i =>
        i.targetPath === targetPath && i.name === file.name && i.size === file.size &&
        ['queued', 'uploading', 'paused'].includes(i.status)
      )
      if (dup) return
      const id = `u${Date.now()}_${itemCounter++}`
      itemsRef.current.set(id, {
        id,
        name: file.name,
        size: file.size,
        lastModified: file.lastModified,
        targetPath,
        file,
        uploaded: 0,
        serverUploaded: 0,
        status: 'queued',
        error: null,
        running: false,
        xhr: null
      })
    })
    setVisible(true)
    setExpanded(true)
    persist()
    rerender()
    schedule()
  }

  useEffect(() => {
    uploadManager._handler = handleAddFiles
    return () => { uploadManager._handler = null }
  }, [])

  // 恢复未完成的上传（页面刷新后）
  useEffect(() => {
    const stored = readStored()
    if (stored.length === 0) return
    stored.forEach(s => {
      itemsRef.current.set(s.id, {
        id: s.id,
        name: s.name,
        size: s.size,
        lastModified: s.lastModified,
        targetPath: s.targetPath,
        file: null,
        uploaded: s.uploaded || 0,
        serverUploaded: s.uploaded || 0,
        status: 'paused',
        error: null,
        running: false,
        xhr: null
      })
      // 向服务器核对真实进度
      ;(async () => {
        try {
          const qs = `path=${encodeURIComponent(s.targetPath)}&filename=${encodeURIComponent(s.name)}&size=${s.size}`
          const res = await authFetch(`${API_BASE}/api/files/upload/resume?${qs}`)
          if (res.ok) {
            const data = await res.json()
            const item = itemsRef.current.get(s.id)
            if (item && item.status === 'paused') {
              item.uploaded = Math.min(data.uploaded || 0, s.size)
              item.serverUploaded = item.uploaded
              rerender()
            }
          }
        } catch {}
      })()
    })
    setVisible(true)
    setExpanded(true)
    rerender()
  }, [])

  const pauseItem = (item) => {
    if (item.status === 'uploading' && item.xhr) item.xhr.abort()
    item.status = 'paused'
    item.error = null
    persist()
    rerender()
  }

  const resumeItem = (item) => {
    if (item.status === 'done') return
    if (!item.file) {
      resumeTargetRef.current = item.id
      filePickerRef.current?.click()
      return
    }
    item.status = 'queued'
    item.error = null
    persist()
    rerender()
    schedule()
  }

  const retryItem = (item) => {
    item.status = 'queued'
    item.error = null
    persist()
    rerender()
    schedule()
  }

  const removeItem = async (item) => {
    if (item.status === 'uploading' && item.xhr) item.xhr.abort()
    await cancelServerPart(item)
    itemsRef.current.delete(item.id)
    persist()
    rerender()
  }

  const handleResumeFilePick = (e) => {
    const picked = e.target.files?.[0]
    e.target.value = ''
    if (!picked || !resumeTargetRef.current) return
    const item = itemsRef.current.get(resumeTargetRef.current)
    resumeTargetRef.current = null
    if (!item) return
    if (picked.name !== item.name || picked.size !== item.size) {
      if (toast?.warning) toast.warning('请选择相同的文件以继续上传')
      return
    }
    item.file = picked
    item.status = 'queued'
    item.error = null
    persist()
    rerender()
    schedule()
  }

  const items = [...itemsRef.current.values()]
  const activeCount = items.filter(i => ['queued', 'uploading'].includes(i.status)).length
  const hasPending = items.some(i => ['queued', 'uploading', 'paused', 'error'].includes(i.status))
  const totalSize = items.reduce((s, i) => s + i.size, 0) || 1
  const totalUploaded = items.reduce((s, i) => s + (i.uploaded || 0), 0)
  const overallProgress = Math.min(100, Math.round(totalUploaded / totalSize * 100))

  // 全部完成且无待处理任务时自动隐藏
  useEffect(() => {
    if (items.length === 0 || hasPending) return
    const t = setTimeout(() => { setVisible(false); setExpanded(false) }, 4000)
    return () => clearTimeout(t)
  }, [tick])

  if (!visible && !expanded) return null

  const circumference = 2 * Math.PI * 18

  return (
    <>
      <input
        ref={filePickerRef}
        type="file"
        style={{ display: 'none' }}
        onChange={handleResumeFilePick}
      />

      {visible && (
        <div className="upload-fab" onClick={() => setExpanded(!expanded)}>
          <svg className="upload-fab-ring" width="48" height="48" viewBox="0 0 48 48">
            <circle cx="24" cy="24" r="18" fill="none" stroke="hsl(272, 15%, 88%)" strokeWidth="3" />
            <circle
              cx="24" cy="24" r="18" fill="none"
              stroke="hsl(208, 40%, 35%)" strokeWidth="3"
              strokeDasharray={circumference}
              strokeDashoffset={circumference - (circumference * overallProgress / 100)}
              strokeLinecap="round"
              transform="rotate(-90 24 24)"
              className="upload-fab-progress"
            />
          </svg>
          <div className="upload-fab-icon">
            {activeCount > 0 ? <UploadIcon /> : <CheckIcon />}
          </div>
          {activeCount > 0 && <span className="upload-fab-badge">{activeCount}</span>}
        </div>
      )}

      {expanded && visible && (
        <div className="upload-panel">
          <div className="upload-panel-header">
            <span>上传任务</span>
            <button className="upload-panel-close" onClick={() => setExpanded(false)}>
              <XIcon />
            </button>
          </div>
          <div className="upload-panel-list">
            {items.length === 0 && <div className="upload-panel-empty">暂无上传任务</div>}
            {items.map(item => {
              const percent = item.size > 0 ? Math.round((item.uploaded || 0) / item.size * 100) : 0
              return (
                <div key={item.id} className={`upload-item ${item.status}`}>
                  <div className="upload-item-info">
                    <span className="upload-item-name" title={item.name}>{item.name}</span>
                    <span className="upload-item-status" title={item.error || ''}>
                      {item.status === 'uploading' && `${percent}%`}
                      {item.status === 'queued' && '排队中'}
                      {item.status === 'paused' && `已暂停 · ${percent}%${!item.file ? ' · 需重新选择文件' : ''}`}
                      {item.status === 'error' && <>失败</>}
                      {item.status === 'done' && <><CheckIcon /> 完成</>}
                    </span>
                  </div>
                  <div className="upload-item-bar">
                    <div
                      className="upload-item-bar-fill"
                      style={{ width: `${item.status === 'done' ? 100 : percent}%` }}
                    />
                  </div>
                  <div className="upload-item-actions">
                    {item.status === 'uploading' && (
                      <button className="upload-item-btn" title="暂停" onClick={() => pauseItem(item)}>
                        <PauseIcon />
                      </button>
                    )}
                    {item.status === 'queued' && (
                      <button className="upload-item-btn" title="暂停" onClick={() => pauseItem(item)}>
                        <PauseIcon />
                      </button>
                    )}
                    {item.status === 'paused' && (
                      <button className="upload-item-btn" title="继续" onClick={() => resumeItem(item)}>
                        <PlayIcon />
                      </button>
                    )}
                    {item.status === 'error' && (
                      <button className="upload-item-btn" title="重试" onClick={() => retryItem(item)}>
                        <RetryIcon />
                      </button>
                    )}
                    {item.status !== 'done' && (
                      <button className="upload-item-btn upload-item-btn-danger" title="取消" onClick={() => removeItem(item)}>
                        <XIcon />
                      </button>
                    )}
                    {item.status === 'done' && (
                      <button className="upload-item-btn" title="移除" onClick={() => removeItem(item)}>
                        <XIcon />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}

export default UploadManager
