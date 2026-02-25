import { useEffect, useRef, useState } from 'react'
import './Terminal.css'

function Terminal({ projectId, onProcessExit }) {
  const terminalRef = useRef(null)
  const wsRef = useRef(null)
  const [logs, setLogs] = useState([])
  const [input, setInput] = useState('')
  const inputRef = useRef(null)
  const onProcessExitRef = useRef(onProcessExit)

  // 更新 ref
  useEffect(() => {
    onProcessExitRef.current = onProcessExit
  }, [onProcessExit])

  // 解析 ANSI 转义序列
  const parseAnsi = (text) => {
    if (!text) return [{ text: '', style: {} }]
    
    const parts = []
    let currentIndex = 0
    // 匹配所�?ANSI 转义序列（包�?RGB 颜色�?
    const ansiRegex = /\x1b\[([0-9;]*)m/g
    let match
    let currentStyle = {}

    while ((match = ansiRegex.exec(text)) !== null) {
      // 添加前面的文�?
      if (match.index > currentIndex) {
        const textPart = text.substring(currentIndex, match.index)
        if (textPart) {
          parts.push({
            text: textPart,
            style: { ...currentStyle }
          })
        }
      }

      // 解析样式代码
      const codes = match[1] ? match[1].split(';').map(Number) : [0]
      let i = 0
      while (i < codes.length) {
        const code = codes[i]
        
        if (code === 0) {
          // 重置所有样�?
          currentStyle = {}
        } else if (code === 1) {
          currentStyle.fontWeight = 'bold'
        } else if (code === 22) {
          delete currentStyle.fontWeight
        } else if (code >= 30 && code <= 37) {
          // 标准前景�?
          const colors = ['#000', '#cd3131', '#0dbc79', '#e5e510', '#2472c8', '#bc3fbc', '#11a8cd', '#e5e5e5']
          currentStyle.color = colors[code - 30]
        } else if (code === 39) {
          // 默认前景�?
          delete currentStyle.color
        } else if (code >= 90 && code <= 97) {
          // 亮色前景
          const colors = ['#666', '#f14c4c', '#23d18b', '#f5f543', '#3b8eea', '#d670d6', '#29b8db', '#fff']
          currentStyle.color = colors[code - 90]
        } else if (code === 38 && i + 2 < codes.length) {
          // 256色或RGB�?
          if (codes[i + 1] === 2 && i + 4 < codes.length) {
            // RGB: 38;2;r;g;b
            const r = codes[i + 2]
            const g = codes[i + 3]
            const b = codes[i + 4]
            currentStyle.color = `rgb(${r},${g},${b})`
            i += 4
          } else if (codes[i + 1] === 5 && i + 2 < codes.length) {
            // 256�? 38;5;n
            // 简化处理，使用默认颜色
            currentStyle.color = '#d4d4d4'
            i += 2
          }
        }
        i++
      }

      currentIndex = match.index + match[0].length
    }

    // 添加剩余文本
    if (currentIndex < text.length) {
      const textPart = text.substring(currentIndex)
      if (textPart) {
        parts.push({
          text: textPart,
          style: { ...currentStyle }
        })
      }
    }

    return parts.length > 0 ? parts : [{ text, style: {} }]
  }

  useEffect(() => {
    let isConnected = false
    let isMounted = true
    
    // 连接 WebSocket
    const ws = new WebSocket(`ws://localhost:13338?projectId=${projectId}`)
    wsRef.current = ws

    ws.onopen = () => {
      if (!isMounted) return
      isConnected = true
      setLogs(prev => [...prev, { type: 'system', data: '已连接到项目终端\n', timestamp: Date.now() }])
    }

    ws.onmessage = (event) => {
      if (!isMounted) return
      try {
        const data = JSON.parse(event.data)
        
        if (data.type === 'history') {
          // 替换历史日志，不追加
          setLogs(data.logs)
        } else if (data.type === 'cleared') {
          setLogs([])
        } else if (data.type === 'stdout' || data.type === 'stderr' || data.type === 'input') {
          // 追加新日�?
          setLogs(prev => [...prev, data])
        } else if (data.type === 'exit') {
          setLogs(prev => [...prev, data])
          if (onProcessExitRef.current && isMounted) {
            setTimeout(() => onProcessExitRef.current(), 100)
          }
        }
      } catch (error) {
        console.error('Terminal message error:', error)
      }
    }

    ws.onerror = (error) => {
      if (isConnected && isMounted) {
        setLogs(prev => [...prev, { type: 'error', data: '连接错误\n', timestamp: Date.now() }])
      }
      console.error('Terminal WebSocket error:', error)
    }

    ws.onclose = () => {
      if (isConnected && isMounted) {
        setLogs(prev => [...prev, { type: 'error', data: '已断开连接\n', timestamp: Date.now() }])
      }
      isConnected = false
    }

    return () => {
      isMounted = false
      isConnected = false
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close()
      }
    }
  }, [projectId]) // 移除 onProcessExit 依赖

  // 自动滚动到底�?
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [logs])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (input.trim() && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'command', command: input }))
      setInput('')
    }
  }

  const handleKeyDown = (e) => {
    // Ctrl+L 清屏
    if (e.ctrlKey && e.key === 'l') {
      e.preventDefault()
      setLogs([])
    }
    // Ctrl+C
    else if (e.ctrlKey && e.key === 'c') {
      e.preventDefault()
      setInput('')
    }
  }

  const renderLog = (log, index) => {
    let className = 'log-line'
    let text = log.data

    // 移除特殊的系统消息样式，�?ANSI 解析处理
    if (log.type === 'system') {
      className += ' success'
    } else if (log.type === 'error') {
      className += ' error'
    }

    // 解析 ANSI 转义序列
    const parts = parseAnsi(text)

    return (
      <div key={index} className={className}>
        {parts.map((part, i) => (
          <span key={i} style={part.style}>
            {part.text}
          </span>
        ))}
      </div>
    )
  }

  return (
    <div className="terminal-container">
      <div className="terminal-output" ref={terminalRef}>
        {logs.map((log, index) => renderLog(log, index))}
      </div>
      <form className="terminal-input-form" onSubmit={handleSubmit}>
        <span className="terminal-prompt">$</span>
        <input
          ref={inputRef}
          type="text"
          className="terminal-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入命令..."
          autoFocus
        />
      </form>
    </div>
  )
}

export default Terminal
