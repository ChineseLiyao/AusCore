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

    let commandBuffer = ''
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

    // 判断字符是否为全角/中文（占两个终端列宽）
    function isFullWidth(char) {
      const code = char.codePointAt(0)
      if (code === undefined) return false
      return (
        (code >= 0x1100 && code <= 0x115F) ||
        (code >= 0x2E80 && code <= 0x303E) ||
        (code >= 0x3040 && code <= 0x33BF) ||
        (code >= 0x3400 && code <= 0x4DBF) ||
        (code >= 0x4E00 && code <= 0xA4CF) ||
        (code >= 0xA960 && code <= 0xA97C) ||
        (code >= 0xAC00 && code <= 0xD7FF) ||
        (code >= 0xF900 && code <= 0xFAFF) ||
        (code >= 0xFE30 && code <= 0xFE6F) ||
        (code >= 0xFF01 && code <= 0xFF60) ||
        (code >= 0xFFE0 && code <= 0xFFE6) ||
        (code >= 0x20000 && code <= 0x2FA1F)
      )
    }

    // 处理用户输入
    term.onData((data) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return

      const code = data.charCodeAt(0)

      // Enter 键
      if (code === 13) {
        term.write('\r\n')
        if (commandBuffer.trim()) {
          ws.send(JSON.stringify({ type: 'command', command: commandBuffer }))
        }
        commandBuffer = ''
      }
      // Backspace 键
      else if (code === 127) {
        if (commandBuffer.length > 0) {
          const removed = [...commandBuffer].pop()
          commandBuffer = [...commandBuffer].slice(0, -1).join('')
          if (removed && isFullWidth(removed)) {
            // 中文等全角字符占两列宽度，需要回退两格
            term.write('\b \b\b \b')
          } else {
            term.write('\b \b')
          }
        }
      }
      // Ctrl+C
      else if (code === 3) {
        term.write('^C\r\n')
        commandBuffer = ''
      }
      // Ctrl+L (清屏)
      else if (code === 12) {
        term.clear()
        commandBuffer = ''
      }
      // 普通字符
      else if (code >= 32) {
        commandBuffer += data
        term.write(data)
      }
    })

    // 窗口大小改变时自动调整
    const handleResize = () => {
      fitAddon.fit()
    }
    window.addEventListener('resize', handleResize)

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
