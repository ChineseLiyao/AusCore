import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import './ServerTerminal.css'
import { WS_BASE } from '../config'

function ServerTerminal() {
  const terminalRef = useRef(null)
  const xtermRef = useRef(null)
  const wsRef = useRef(null)
  const fitAddonRef = useRef(null)

  useEffect(() => {
    // 创建 xterm 实例
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      lineHeight: 1.4,
      fontFamily: '"Cascadia Code", "Cascadia Mono", Consolas, "DejaVu Sans Mono", "Liberation Mono", "Microsoft YaHei", SimHei, monospace',
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
        brightBlack: '#666666',
        brightRed: '#f14c4c',
        brightGreen: '#23d18b',
        brightYellow: '#f5f543',
        brightBlue: '#3b8eea',
        brightMagenta: '#d670d6',
        brightCyan: '#29b8db',
        brightWhite: '#e5e5e5'
      },
      allowProposedApi: true
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)

    term.open(terminalRef.current)
    fitAddon.fit()

    xtermRef.current = term
    fitAddonRef.current = fitAddon

    // 连接 WebSocket
    const ws = new WebSocket(`${WS_BASE}/terminal`)
    wsRef.current = ws

    let connectionTimeout = setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        term.writeln('\r\n\x1b[31mConnection timeout - please check server status\x1b[0m')
      }
    }, 5000)

    ws.onopen = () => {
      clearTimeout(connectionTimeout)
      term.writeln('Connected to server terminal')
      term.writeln('')
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'stdout' || data.type === 'stderr') {
          term.write(data.data)
        } else if (data.type === 'cleared') {
          term.clear()
        }
      } catch (error) {
        console.error('Terminal message error:', error)
      }
    }

    ws.onerror = (error) => {
      term.writeln('\r\n\x1b[31mConnection error\x1b[0m')
      console.error('Terminal WebSocket error:', error)
    }

    ws.onclose = () => {
      term.writeln('\r\n\x1b[31mDisconnected from server\x1b[0m')
    }

    // 处理用户输入 - 直接发送原始数据到 PTY
    term.onData((data) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return
      ws.send(JSON.stringify({ type: 'input', data }))
    })

    // 窗口大小改变时通知后端
    const handleResize = () => {
      fitAddon.fit()
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ 
          type: 'resize', 
          cols: term.cols, 
          rows: term.rows 
        }))
      }
    }
    window.addEventListener('resize', handleResize)
    
    // 初始大小
    setTimeout(() => handleResize(), 100)

    return () => {
      window.removeEventListener('resize', handleResize)
      if (ws.readyState === WebSocket.OPEN) {
        ws.close()
      }
      term.dispose()
    }
  }, [])

  return (
    <div className="server-terminal-page">
      <div className="terminal-page-header">
        <h1>服务器终端</h1>
        <p className="terminal-hint">Ctrl+L 清屏 | Ctrl+C 中断</p>
      </div>
      <div className="xterm-container" ref={terminalRef}></div>
    </div>
  )
}

export default ServerTerminal
