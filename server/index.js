import express from 'express'
import cors from 'cors'
import os from 'os'
import fs from 'fs'
import path from 'path'
import { exec, spawn } from 'child_process'
import { promisify } from 'util'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import serveStatic from 'serve-static'  // 用于项目静态服务器
import bcrypt from 'bcrypt'
import multer from 'multer'
import archiver from 'archiver'
import unzipper from 'unzipper'
import https from 'https'

const execAsync = promisify(exec)
const app = express()
const PORT = 13338
const httpServer = createServer(app)

// Windows 终端输出解码器
// 中文 Windows 的 tree 等原生命令可能忽略 chcp 65001，仍用 GBK 编码输出
const gbkDecoder = new TextDecoder('gbk')

function isValidUtf8(buffer) {
  let i = 0
  while (i < buffer.length) {
    const byte = buffer[i]
    if (byte < 0x80) {
      i++
    } else if ((byte & 0xE0) === 0xC0) {
      if (i + 1 >= buffer.length || (buffer[i + 1] & 0xC0) !== 0x80) return false
      i += 2
    } else if ((byte & 0xF0) === 0xE0) {
      if (i + 2 >= buffer.length || (buffer[i + 1] & 0xC0) !== 0x80 || (buffer[i + 2] & 0xC0) !== 0x80) return false
      i += 3
    } else if ((byte & 0xF8) === 0xF0) {
      if (i + 3 >= buffer.length || (buffer[i + 1] & 0xC0) !== 0x80 || (buffer[i + 2] & 0xC0) !== 0x80 || (buffer[i + 3] & 0xC0) !== 0x80) return false
      i += 4
    } else {
      return false
    }
  }
  return true
}

function decodeWindowsOutput(buffer) {
  // 纯 ASCII 直接返回
  if (buffer.every(b => b < 0x80)) {
    return buffer.toString('ascii')
  }
  // 如果是有效的 UTF-8，按 UTF-8 解码
  if (isValidUtf8(buffer)) {
    return buffer.toString('utf8')
  }
  // 否则回退到 GBK 解码（tree 等命令的输出）
  try {
    return gbkDecoder.decode(buffer)
  } catch {
    return buffer.toString('utf8')
  }
}
const wss = new WebSocketServer({ server: httpServer })

app.use(cors())
app.use(express.json())

let networkHistory = { rx: 0, tx: 0, timestamp: Date.now() }
let diskHistory = { read: 0, write: 0, timestamp: Date.now() }
let cpuHistory = null

// 缓存 metrics 数据，避免并发请求重复计算
let metricsCache = null
let metricsCacheTime = 0
const METRICS_CACHE_TTL = 1000 // 1 秒缓存

async function getCPUUsage() {
  return new Promise((resolve) => {
    const startMeasure = os.cpus()

    setTimeout(() => {
      const endMeasure = os.cpus()

      let totalIdle = 0
      let totalTick = 0
      const numCores = endMeasure.length

      for (let i = 0; i < numCores; i++) {
        const start = startMeasure[i].times
        const end = endMeasure[i].times

        const idleDiff = end.idle - start.idle
        const totalDiff = Object.values(end).reduce((a, b) => a + b, 0) -
          Object.values(start).reduce((a, b) => a + b, 0)

        totalIdle += idleDiff
        totalTick += totalDiff
      }

      const usage = totalTick > 0 ? 100 - (100 * totalIdle / totalTick) : 0

      let loadAvg = '0.00, 0.00, 0.00'
      if (process.platform !== 'win32') {
        loadAvg = os.loadavg().map(l => l.toFixed(2)).join(', ')
      } else {
        loadAvg = `${numCores} cores, ${usage.toFixed(1)}%`
      }

      resolve({
        usage: parseFloat(usage.toFixed(1)),
        loadAvg
      })
    }, 300) // 缩短到 300ms
  })
}

function getMemoryUsage() {
  const total = os.totalmem()
  const free = os.freemem()
  const used = total - free
  const usage = (used / total) * 100

  return {
    usage: usage.toFixed(1),
    used: (used / 1024 / 1024 / 1024).toFixed(1),
    total: (total / 1024 / 1024 / 1024).toFixed(1)
  }
}

async function getDiskUsage() {
  try {
    const now = Date.now()
    const timeDiff = (now - diskHistory.timestamp) / 1000
    let totalRead = 0
    let totalWrite = 0

    if (process.platform === 'win32') {
      const { stdout } = await execAsync('typeperf "\\PhysicalDisk(_Total)\\Disk Read Bytes/sec" "\\PhysicalDisk(_Total)\\Disk Write Bytes/sec" -sc 1')
      const lines = stdout.split('\n')

      for (let line of lines) {
        if (line.includes(',')) {
          const parts = line.split(',')
          if (parts.length >= 3) {
            const readStr = parts[1].replace(/"/g, '').trim()
            const writeStr = parts[2].replace(/"/g, '').trim()
            totalRead = parseFloat(readStr) || 0
            totalWrite = parseFloat(writeStr) || 0
          }
        }
      }
    } else {
      const { stdout } = await execAsync('cat /proc/diskstats')
      const lines = stdout.split('\n')

      lines.forEach(line => {
        const parts = line.trim().split(/\s+/)
        if (parts.length >= 14 && (parts[2].startsWith('sd') || parts[2].startsWith('nvme'))) {
          totalRead += parseInt(parts[5]) * 512 || 0
          totalWrite += parseInt(parts[9]) * 512 || 0
        }
      })
    }

    let readSpeed = 0
    let writeSpeed = 0

    if (process.platform === 'win32') {
      readSpeed = totalRead / 1024 / 1024
      writeSpeed = totalWrite / 1024 / 1024
    } else if (diskHistory.read > 0 && timeDiff > 0) {
      const readDiff = totalRead - diskHistory.read
      const writeDiff = totalWrite - diskHistory.write

      readSpeed = readDiff > 0 ? (readDiff / 1024 / 1024 / timeDiff) : 0
      writeSpeed = writeDiff > 0 ? (writeDiff / 1024 / 1024 / timeDiff) : 0
    }

    diskHistory = { read: totalRead, write: totalWrite, timestamp: now }

    return {
      read: readSpeed.toFixed(2),
      write: writeSpeed.toFixed(2)
    }
  } catch (error) {
    console.error('Disk error:', error)
    return { read: '0.00', write: '0.00' }
  }
}

async function getNetworkUsage() {
  try {
    let download = 0
    let upload = 0

    if (process.platform === 'win32') {
      const { stdout } = await execAsync('powershell "Get-NetAdapter | Where-Object {$_.Status -eq \'Up\' -and $_.Virtual -eq $false -and $_.Name -notlike \'*Loopback*\' -and $_.Name -notlike \'*vEthernet*\'} | Select-Object -First 1 -ExpandProperty InterfaceDescription"', { encoding: 'utf8' })
      const adapterName = stdout.trim()

      if (adapterName) {
        try {
          const { stdout: perfData } = await execAsync(`chcp 65001 > nul && typeperf "\\Network Interface(${adapterName})\\Bytes Received/sec" "\\Network Interface(${adapterName})\\Bytes Sent/sec" -sc 1`, { encoding: 'utf8' })
          const lines = perfData.split('\n')

          for (let line of lines) {
            if (line.includes(',') && !line.includes('PDH') && !line.includes('exiting')) {
              const parts = line.split(',')
              if (parts.length >= 3) {
                // 第一列是时间戳，第二列是接收（下载），第三列是发送（上传）
                const rxStr = parts[1].replace(/"/g, '').trim()
                const txStr = parts[2].replace(/"/g, '').trim()
                const rxVal = parseFloat(rxStr)
                const txVal = parseFloat(txStr)

                if (!isNaN(rxVal) && rxVal >= 0) {
                  download = rxVal / 1024 / 1024
                }
                if (!isNaN(txVal) && txVal >= 0) {
                  upload = txVal / 1024 / 1024
                }

                break // 只处理第一行有效数据
              }
            }
          }
        } catch (perfError) {
          console.error('Typeperf error:', perfError.message)
        }
      }
    } else {
      const { stdout } = await execAsync('cat /proc/net/dev')
      const lines = stdout.split('\n').slice(2)
      const now = Date.now()
      const timeDiff = (now - networkHistory.timestamp) / 1000

      let totalRx = 0
      let totalTx = 0

      lines.forEach(line => {
        const parts = line.trim().split(/\s+/)
        if (parts.length >= 10 && !parts[0].includes('lo:')) {
          totalRx += parseInt(parts[1]) || 0
          totalTx += parseInt(parts[9]) || 0
        }
      })

      if (networkHistory.rx > 0 && timeDiff > 0) {
        const rxDiff = totalRx - networkHistory.rx
        const txDiff = totalTx - networkHistory.tx

        download = rxDiff > 0 ? (rxDiff / 1024 / 1024 / timeDiff) : 0
        upload = txDiff > 0 ? (txDiff / 1024 / 1024 / timeDiff) : 0
      }

      networkHistory = { rx: totalRx, tx: totalTx, timestamp: now }
    }

    return {
      download: download.toFixed(2),
      upload: upload.toFixed(2)
    }
  } catch (error) {
    console.error('Network error:', error)
    return { download: '0.00', upload: '0.00' }
  }
}

app.get('/api/hostname', (req, res) => {
  res.json({ hostname: os.hostname() })
})

app.get('/api/metrics', async (req, res) => {
  try {
    const now = Date.now()
    
    // 使用缓存避免并发请求重复计算
    if (metricsCache && (now - metricsCacheTime) < METRICS_CACHE_TTL) {
      return res.json(metricsCache)
    }

    // 并发获取所有指标，但加超时保护
    const timeout = (ms, fallback) => new Promise(resolve => setTimeout(() => resolve(fallback), ms))
    
    const [cpu, memory, disk, network] = await Promise.all([
      Promise.race([getCPUUsage(), timeout(1000, { usage: 0, loadAvg: 'N/A' })]),
      Promise.resolve(getMemoryUsage()),
      Promise.race([getDiskUsage(), timeout(1500, { read: '0.00', write: '0.00' })]),
      Promise.race([getNetworkUsage(), timeout(1500, { download: '0.00', upload: '0.00' })])
    ])

    const result = {
      cpu: {
        value: cpu.usage,
        load: cpu.loadAvg
      },
      memory: {
        value: parseFloat(memory.usage),
        used: memory.used,
        total: memory.total
      },
      disk: {
        read: parseFloat(disk.read),
        write: parseFloat(disk.write)
      },
      network: {
        download: parseFloat(network.download),
        upload: parseFloat(network.upload)
      }
    }
    
    metricsCache = result
    metricsCacheTime = now
    
    res.json(result)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

httpServer.listen(PORT, () => {
  console.log(`AusCore API server running on http://localhost:${PORT}`)
  console.log(`WebSocket server running on ws://localhost:${PORT}`)
})

// 服务器终端进程
let serverTerminalProcess = null
const serverTerminalClients = new Set()

// WebSocket 连接处理
wss.on('connection', async (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  const projectId = url.searchParams.get('projectId')
  
  // 服务器终端连接
  if (req.url === '/terminal') {
    serverTerminalClients.add(ws)
    
    // 如果终端进程不存在，创建一个
    if (!serverTerminalProcess) {
      const isWindows = process.platform === 'win32'
      let shell, shellArgs, spawnEnv
      
      if (isWindows) {
        shell = 'powershell.exe'
        shellArgs = ['-NoLogo', '-NoExit', '-Command', '[Console]::InputEncoding = [System.Text.Encoding]::UTF8; [Console]::OutputEncoding = [System.Text.Encoding]::UTF8']
        spawnEnv = {
          ...process.env,
          PYTHONIOENCODING: 'utf-8'
        }
      } else {
        shell = '/bin/bash'
        shellArgs = ['-i']  // 交互式模式
        spawnEnv = {
          ...process.env,
          PYTHONIOENCODING: 'utf-8',
          LANG: 'en_US.UTF-8',
          TERM: 'xterm-256color',
          PS1: '\\u@\\h:\\w\\$ '  // 设置提示符格式
        }
      }
      
      serverTerminalProcess = spawn(shell, shellArgs, {
        cwd: BASE_PATH,
        shell: false,
        env: spawnEnv
      })
      
      serverTerminalProcess.stdout.on('data', (data) => {
        const isWin = process.platform === 'win32'
        const raw = isWin ? decodeWindowsOutput(data) : data.toString('utf8')
        // 确保换行符为 \r\n，xterm.js 需要 \r\n 才能正确回到行首
        const text = raw.replace(/\r?\n/g, '\r\n')
        const log = { type: 'stdout', data: text, timestamp: Date.now() }
        serverTerminalClients.forEach(client => {
          if (client.readyState === 1) {
            client.send(JSON.stringify(log))
          }
        })
      })
      
      serverTerminalProcess.stderr.on('data', (data) => {
        const isWin = process.platform === 'win32'
        const raw = isWin ? decodeWindowsOutput(data) : data.toString('utf8')
        const text = raw.replace(/\r?\n/g, '\r\n')
        const log = { type: 'stderr', data: text, timestamp: Date.now() }
        serverTerminalClients.forEach(client => {
          if (client.readyState === 1) {
            client.send(JSON.stringify(log))
          }
        })
      })
      
      serverTerminalProcess.on('exit', (code) => {
        serverTerminalProcess = null
      })
    }
    
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString())
        
        if (data.type === 'command' && serverTerminalProcess) {
          serverTerminalProcess.stdin.write(data.command + '\n', 'utf8')
        } else if (data.type === 'clear') {
          ws.send(JSON.stringify({ type: 'cleared' }))
        }
      } catch (error) {
        console.error('Server terminal message error:', error)
      }
    })
    
    ws.on('close', () => {
      serverTerminalClients.delete(ws)
      
      // 如果没有客户端连接，关闭终端进程
      if (serverTerminalClients.size === 0 && serverTerminalProcess) {
        serverTerminalProcess.kill()
        serverTerminalProcess = null
      }
    })
    
    return
  }

  // 项目终端连接
  if (!projectId) {
    ws.close()
    return
  }

  // 添加客户端到项目的客户端列表
  if (!projectClients.has(projectId)) {
    projectClients.set(projectId, new Set())
  }
  projectClients.get(projectId).add(ws)

  // 发送历史日志（从文件读取）
  try {
    const logs = await loadLogs(projectId)
    if (logs.length > 0) {
      ws.send(JSON.stringify({ type: 'history', logs }))
    }
  } catch (error) {
    console.error('Load logs error:', error)
  }

  // 处理客户端消息（发送命令到进程）
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString())

      if (data.type === 'command') {
        const processData = runningProcesses.get(projectId)
        if (processData) {
          const { process: childProcess } = processData
          childProcess.stdin.write(data.command + '\n')
        }
      } else if (data.type === 'clear') {
        // 清除日志
        clearLogs(projectId)
        ws.send(JSON.stringify({ type: 'cleared' }))
      }
    } catch (error) {
      console.error('WebSocket message error:', error)
    }
  })

  ws.on('close', () => {
    const clients = projectClients.get(projectId)
    if (clients) {
      clients.delete(ws)
      if (clients.size === 0) {
        projectClients.delete(projectId)
      }
    }
  })
})


// File management APIs
const BASE_PATH = process.cwd()
const UPLOAD_DIR = path.join(BASE_PATH, 'uploads')

// 确保上传目录存在
async function ensureUploadDir() {
  try {
    await fs.promises.access(UPLOAD_DIR)
  } catch {
    await fs.promises.mkdir(UPLOAD_DIR, { recursive: true })
  }
}

// 配置 multer
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    await ensureUploadDir()
    cb(null, UPLOAD_DIR)
  },
  filename: (req, file, cb) => {
    // 保留原始文件名，使用 Buffer 处理中文
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8')
    cb(null, `${Date.now()}_${originalName}`)
  }
})

const upload = multer({ storage })

app.get('/api/files', async (req, res) => {
  try {
    const requestedPath = req.query.path || '/'
    const fullPath = path.join(BASE_PATH, requestedPath)

    if (!fullPath.startsWith(BASE_PATH)) {
      return res.status(403).json({ error: 'Access denied' })
    }

    const items = await fs.promises.readdir(fullPath, { withFileTypes: true })
    
    // 限制并发 stat 调用数量，避免文件太多时卡死
    const BATCH_SIZE = 50
    const files = []
    
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE)
      const batchResults = await Promise.all(
        batch.map(async (item) => {
          try {
            const itemPath = path.join(fullPath, item.name)
            const stats = await fs.promises.stat(itemPath)
            return {
              name: item.name,
              type: item.isDirectory() ? 'directory' : 'file',
              size: stats.size,
              modified: stats.mtime
            }
          } catch (err) {
            console.warn(`Cannot access file: ${item.name}`, err.code)
            return null
          }
        })
      )
      files.push(...batchResults.filter(f => f !== null))
    }

    res.json({
      files: files.sort((a, b) => {
        if (a.type === b.type) return a.name.localeCompare(b.name)
        return a.type === 'directory' ? -1 : 1
      })
    })
  } catch (error) {
    console.error('Files list error:', error)
    res.status(500).json({ error: error.message })
  }
})

app.get('/api/files/read', async (req, res) => {
  try {
    const requestedPath = req.query.path
    if (!requestedPath) {
      return res.status(400).json({ error: 'Path required' })
    }

    const fullPath = path.join(BASE_PATH, requestedPath)

    if (!fullPath.startsWith(BASE_PATH)) {
      return res.status(403).json({ error: 'Access denied' })
    }

    const content = await fs.promises.readFile(fullPath, 'utf-8')
    res.json({ content })
  } catch (error) {
    console.error('File read error:', error)
    res.status(500).json({ error: error.message })
  }
})

app.post('/api/files/write', async (req, res) => {
  try {
    const { path: requestedPath, content } = req.body
    if (!requestedPath) {
      return res.status(400).json({ error: 'Path required' })
    }

    const fullPath = path.join(BASE_PATH, requestedPath)

    if (!fullPath.startsWith(BASE_PATH)) {
      return res.status(403).json({ error: 'Access denied' })
    }

    await fs.promises.writeFile(fullPath, content, 'utf-8')
    res.json({ success: true })
  } catch (error) {
    console.error('File write error:', error)
    res.status(500).json({ error: error.message })
  }
})

app.delete('/api/files/delete', async (req, res) => {
  try {
    const requestedPath = req.query.path
    if (!requestedPath) {
      return res.status(400).json({ error: 'Path required' })
    }

    const fullPath = path.join(BASE_PATH, requestedPath)

    if (!fullPath.startsWith(BASE_PATH)) {
      return res.status(403).json({ error: 'Access denied' })
    }

    const stats = await fs.promises.stat(fullPath)
    if (stats.isDirectory()) {
      await fs.promises.rm(fullPath, { recursive: true, force: true })
    } else {
      await fs.promises.unlink(fullPath)
    }

    res.json({ success: true })
  } catch (error) {
    console.error('File delete error:', error)
    // Windows 下可能因为文件被占用而无法删除
    if (error.code === 'EPERM' || error.code === 'EBUSY') {
      res.status(423).json({ error: '文件正在使用中，无法删除' })
    } else {
      res.status(500).json({ error: error.message })
    }
  }
})

// 重命名文件或文件夹
app.post('/api/files/rename', async (req, res) => {
  try {
    const { path: oldPath, newName } = req.body
    
    if (!oldPath || !newName) {
      return res.status(400).json({ error: 'Path and new name required' })
    }

    // 验证新名称不包含路径分隔符
    if (newName.includes('/') || newName.includes('\\')) {
      return res.status(400).json({ error: '文件名不能包含路径分隔符' })
    }

    const fullOldPath = path.join(BASE_PATH, oldPath)
    
    if (!fullOldPath.startsWith(BASE_PATH)) {
      return res.status(403).json({ error: 'Access denied' })
    }

    // 构建新路径（同一目录下）
    const directory = path.dirname(fullOldPath)
    const fullNewPath = path.join(directory, newName)

    if (!fullNewPath.startsWith(BASE_PATH)) {
      return res.status(403).json({ error: 'Access denied' })
    }

    // 检查新路径是否已存在
    try {
      await fs.promises.access(fullNewPath)
      return res.status(400).json({ error: '目标文件已存在' })
    } catch {
      // 文件不存在，可以继续
    }

    await fs.promises.rename(fullOldPath, fullNewPath)
    res.json({ success: true, newPath: path.relative(BASE_PATH, fullNewPath) })
  } catch (error) {
    console.error('File rename error:', error)
    if (error.code === 'EPERM' || error.code === 'EBUSY') {
      res.status(423).json({ error: '文件正在使用中，无法重命名' })
    } else {
      res.status(500).json({ error: error.message })
    }
  }
})

// 移动文件或文件夹
app.post('/api/files/move', async (req, res) => {
  try {
    const { sourcePath, targetPath } = req.body
    
    if (!sourcePath || !targetPath) {
      return res.status(400).json({ error: 'Source and target paths required' })
    }

    const fullSourcePath = path.join(BASE_PATH, sourcePath)
    const fullTargetPath = path.join(BASE_PATH, targetPath)

    if (!fullSourcePath.startsWith(BASE_PATH) || !fullTargetPath.startsWith(BASE_PATH)) {
      return res.status(403).json({ error: 'Access denied' })
    }

    // 检查源文件是否存在
    try {
      await fs.promises.access(fullSourcePath)
    } catch {
      return res.status(404).json({ error: '源文件不存在' })
    }

    // 检查目标路径
    const targetStats = await fs.promises.stat(fullTargetPath).catch(() => null)
    let finalTargetPath = fullTargetPath

    // 如果目标是目录，则将文件移动到该目录下
    if (targetStats && targetStats.isDirectory()) {
      const fileName = path.basename(fullSourcePath)
      finalTargetPath = path.join(fullTargetPath, fileName)
    }

    // 检查最终目标是否已存在
    try {
      await fs.promises.access(finalTargetPath)
      return res.status(400).json({ error: '目标位置已存在同名文件' })
    } catch {
      // 文件不存在，可以继续
    }

    await fs.promises.rename(fullSourcePath, finalTargetPath)
    res.json({ 
      success: true, 
      newPath: path.relative(BASE_PATH, finalTargetPath)
    })
  } catch (error) {
    console.error('File move error:', error)
    if (error.code === 'EPERM' || error.code === 'EBUSY') {
      res.status(423).json({ error: '文件正在使用中，无法移动' })
    } else if (error.code === 'EXDEV') {
      // 跨设备移动，需要复制后删除
      res.status(400).json({ error: '不支持跨设备移动文件' })
    } else {
      res.status(500).json({ error: error.message })
    }
  }
})

// 批量删除文件
app.post('/api/files/delete-batch', async (req, res) => {
  try {
    const { path: basePath, items } = req.body
    if (!basePath || !items || items.length === 0) {
      return res.status(400).json({ error: 'Path and items required' })
    }

    const fullBasePath = path.join(BASE_PATH, basePath)
    if (!fullBasePath.startsWith(BASE_PATH)) {
      return res.status(403).json({ error: 'Access denied' })
    }

    const results = []
    for (const item of items) {
      try {
        const itemPath = path.join(fullBasePath, item)
        const stats = await fs.promises.stat(itemPath)

        if (stats.isDirectory()) {
          await fs.promises.rm(itemPath, { recursive: true, force: true })
        } else {
          await fs.promises.unlink(itemPath)
        }
        results.push({ name: item, success: true })
      } catch (error) {
        console.error(`Delete ${item} error:`, error)
        results.push({
          name: item,
          success: false,
          error: error.code === 'EPERM' || error.code === 'EBUSY' ? '文件正在使用中' : error.message
        })
      }
    }

    const successCount = results.filter(r => r.success).length
    const failedCount = results.length - successCount

    res.json({
      success: failedCount === 0,
      results,
      summary: {
        total: results.length,
        success: successCount,
        failed: failedCount
      }
    })
  } catch (error) {
    console.error('Batch delete error:', error)
    res.status(500).json({ error: error.message })
  }
})

// 上传文件
app.post('/api/files/upload', upload.single('file'), async (req, res) => {
  try {
    const targetPath = req.body.path || '/'
    const fullTargetPath = path.join(BASE_PATH, targetPath)

    if (!fullTargetPath.startsWith(BASE_PATH)) {
      return res.status(403).json({ error: 'Access denied' })
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    // 移动文件到目标目录
    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8')
    const finalPath = path.join(fullTargetPath, originalName)
    await fs.promises.rename(req.file.path, finalPath)

    res.json({ success: true, filename: originalName })
  } catch (error) {
    console.error('File upload error:', error)
    res.status(500).json({ error: error.message })
  }
})

// 批量上传文件
app.post('/api/files/upload-batch', upload.array('files', 50), async (req, res) => {
  try {
    const targetPath = req.body.path || '/'
    const fullTargetPath = path.join(BASE_PATH, targetPath)

    if (!fullTargetPath.startsWith(BASE_PATH)) {
      return res.status(403).json({ error: 'Access denied' })
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' })
    }

    const results = []
    for (const file of req.files) {
      try {
        const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8')
        const finalPath = path.join(fullTargetPath, originalName)
        await fs.promises.rename(file.path, finalPath)
        results.push({ name: originalName, success: true })
      } catch (error) {
        console.error(`Upload ${file.originalname} error:`, error)
        results.push({
          name: Buffer.from(file.originalname, 'latin1').toString('utf8'),
          success: false,
          error: error.message
        })
      }
    }

    const successCount = results.filter(r => r.success).length
    const failedCount = results.length - successCount

    res.json({
      success: failedCount === 0,
      results,
      summary: {
        total: results.length,
        success: successCount,
        failed: failedCount
      }
    })
  } catch (error) {
    console.error('Batch upload error:', error)
    res.status(500).json({ error: error.message })
  }
})

// 下载文件
app.get('/api/files/download', async (req, res) => {
  try {
    const requestedPath = req.query.path
    if (!requestedPath) {
      return res.status(400).json({ error: 'Path required' })
    }

    const fullPath = path.join(BASE_PATH, requestedPath)

    if (!fullPath.startsWith(BASE_PATH)) {
      return res.status(403).json({ error: 'Access denied' })
    }

    const stats = await fs.promises.stat(fullPath)
    if (stats.isDirectory()) {
      return res.status(400).json({ error: 'Cannot download directory' })
    }

    res.download(fullPath)
  } catch (error) {
    console.error('File download error:', error)
    res.status(500).json({ error: error.message })
  }
})

// 压缩文件/文件夹
app.post('/api/files/compress', async (req, res) => {
  try {
    const { path: requestedPath, items } = req.body
    if (!requestedPath || !items || items.length === 0) {
      return res.status(400).json({ error: 'Path and items required' })
    }

    const fullPath = path.join(BASE_PATH, requestedPath)
    if (!fullPath.startsWith(BASE_PATH)) {
      return res.status(403).json({ error: 'Access denied' })
    }

    const zipName = `archive_${Date.now()}.zip`
    const zipPath = path.join(fullPath, zipName)
    const output = fs.createWriteStream(zipPath)
    const archive = archiver('zip', { zlib: { level: 9 } })

    output.on('close', () => {
      res.json({ success: true, filename: zipName })
    })

    archive.on('error', (err) => {
      throw err
    })

    archive.pipe(output)

    // 添加文件到压缩包
    for (const item of items) {
      const itemPath = path.join(fullPath, item)
      const stats = await fs.promises.stat(itemPath)

      if (stats.isDirectory()) {
        archive.directory(itemPath, item)
      } else {
        archive.file(itemPath, { name: item })
      }
    }

    await archive.finalize()
  } catch (error) {
    console.error('Compress error:', error)
    res.status(500).json({ error: error.message })
  }
})

// 解压文件
app.post('/api/files/extract', async (req, res) => {
  try {
    const { path: requestedPath } = req.body
    if (!requestedPath) {
      return res.status(400).json({ error: 'Path required' })
    }

    const fullPath = path.join(BASE_PATH, requestedPath)
    if (!fullPath.startsWith(BASE_PATH)) {
      return res.status(403).json({ error: 'Access denied' })
    }

    if (!fullPath.endsWith('.zip')) {
      return res.status(400).json({ error: 'Only zip files supported' })
    }

    const extractPath = path.dirname(fullPath)

    await fs.createReadStream(fullPath)
      .pipe(unzipper.Extract({ path: extractPath }))
      .promise()

    res.json({ success: true })
  } catch (error) {
    console.error('Extract error:', error)
    res.status(500).json({ error: error.message })
  }
})

// 移动/重命名文件
app.post('/api/files/move', async (req, res) => {
  try {
    const { from, to } = req.body
    if (!from || !to) {
      return res.status(400).json({ error: 'From and to paths required' })
    }

    const fullFromPath = path.join(BASE_PATH, from)
    const fullToPath = path.join(BASE_PATH, to)

    if (!fullFromPath.startsWith(BASE_PATH) || !fullToPath.startsWith(BASE_PATH)) {
      return res.status(403).json({ error: 'Access denied' })
    }

    await fs.promises.rename(fullFromPath, fullToPath)
    res.json({ success: true })
  } catch (error) {
    console.error('Move error:', error)
    res.status(500).json({ error: error.message })
  }
})


// Project management APIs
const PROJECTS_DIR = path.join(BASE_PATH, 'projects')
const PROJECTS_FILE = path.join(BASE_PATH, 'projects.json')
const LOGS_DIR = path.join(BASE_PATH, 'logs')
const runningServers = new Map() // 存储运行中的服务器实例
const runningProcesses = new Map() // 存储运行中的自定义进程
const projectClients = new Map() // 存储项目的 WebSocket 客户端

// 确保日志目录存在
async function ensureLogsDir() {
  try {
    await fs.promises.access(LOGS_DIR)
  } catch {
    await fs.promises.mkdir(LOGS_DIR, { recursive: true })
  }
}

// 保存日志到文件
async function saveLog(projectId, log) {
  try {
    await ensureLogsDir()
    const logFile = path.join(LOGS_DIR, `${projectId}.json`)
    let logs = []

    try {
      const data = await fs.promises.readFile(logFile, 'utf-8')
      logs = JSON.parse(data)
    } catch {
      // 文件不存在，使用空数组
    }

    logs.push(log)
    // 只保留最近 400 条日志
    if (logs.length > 400) {
      logs = logs.slice(-400)
    }

    await fs.promises.writeFile(logFile, JSON.stringify(logs))
  } catch (error) {
    console.error('Save log error:', error)
  }
}

// 读取日志
async function loadLogs(projectId) {
  try {
    const logFile = path.join(LOGS_DIR, `${projectId}.json`)
    const data = await fs.promises.readFile(logFile, 'utf-8')
    return JSON.parse(data)
  } catch {
    return []
  }
}

// 清除日志
async function clearLogs(projectId) {
  try {
    const logFile = path.join(LOGS_DIR, `${projectId}.json`)
    await fs.promises.unlink(logFile)
  } catch {
    // 文件不存在，忽略
  }
}

// 确保项目目录存在
async function ensureProjectsDir() {
  try {
    await fs.promises.access(PROJECTS_DIR)
  } catch {
    await fs.promises.mkdir(PROJECTS_DIR, { recursive: true })
  }
}

async function loadProjects() {
  try {
    const data = await fs.promises.readFile(PROJECTS_FILE, 'utf-8')
    return JSON.parse(data)
  } catch (error) {
    return []
  }
}

async function saveProjects(projects) {
  await fs.promises.writeFile(PROJECTS_FILE, JSON.stringify(projects, null, 2))
}

function startStaticServer(projectId, projectPath, port) {
  return new Promise((resolve, reject) => {
    try {
      const app = express()
      app.use(serveStatic(projectPath, { index: ['index.html', 'index.htm'] }))

      const server = app.listen(port, () => {
        // 存储服务器实例和连接追踪
        const connections = new Set()

        server.on('connection', (conn) => {
          connections.add(conn)
          conn.on('close', () => {
            connections.delete(conn)
          })
        })

        runningServers.set(projectId, { server, connections })
        resolve()
      })

      server.on('error', (err) => {
        console.error(`Failed to start server on port ${port}:`, err)
        reject(err)
      })
    } catch (error) {
      reject(error)
    }
  })
}

function stopStaticServer(projectId) {
  const serverData = runningServers.get(projectId)
  if (serverData) {
    return new Promise((resolve) => {
      const { server, connections } = serverData

      // 强制关闭所有连接
      connections.forEach(conn => {
        conn.destroy()
      })
      connections.clear()

      // 关闭服务器
      server.close(() => {
        console.log(`Static server stopped for project ${projectId}`)
        runningServers.delete(projectId)
        resolve(true)
      })

      // 如果 1 秒后还没关闭，强制删除引用
      setTimeout(() => {
        if (runningServers.has(projectId)) {
          runningServers.delete(projectId)
          resolve(true)
        }
      }, 1000)
    })
  }
  return Promise.resolve(false)
}

// Docker 项目管理
const dockerProcesses = new Map()

function startDockerProject(projectId, projectPath, dockerConfig) {
  return new Promise((resolve, reject) => {
    try {
      const { image, containerName, ports, volumes, envVars, extraArgs, dockerComposeFile } = dockerConfig
      const isWindows = process.platform === 'win32'
      const name = containerName || `auscore_${projectId}`
      let command

      if (dockerComposeFile) {
        // Docker Compose 模式
        command = `docker compose -f "${dockerComposeFile}" up`
      } else {
        // Docker run 模式
        let args = `docker run --name ${name} --rm`
        if (ports) {
          ports.split(',').map(p => p.trim()).filter(Boolean).forEach(p => {
            args += ` -p ${p}`
          })
        }
        if (volumes) {
          volumes.split(',').map(v => v.trim()).filter(Boolean).forEach(v => {
            args += ` -v ${v}`
          })
        }
        if (envVars) {
          envVars.split(',').map(e => e.trim()).filter(Boolean).forEach(e => {
            args += ` -e ${e}`
          })
        }
        if (extraArgs) {
          args += ` ${extraArgs}`
        }
        args += ` ${image}`
        command = args
      }
      
      const shell = isWindows ? 'cmd.exe' : '/bin/bash'
      const shellArgs = isWindows ? ['/c', command] : ['-c', command]

      const childProcess = spawn(shell, shellArgs, {
        cwd: projectPath,
        shell: false,  // 改为 false
        env: { ...process.env }
      })

      const processData = { process: childProcess, logs: [], containerName: name, dockerComposeFile }

      childProcess.stdout.on('data', (data) => {
        const text = isWindows ? decodeWindowsOutput(data) : data.toString('utf8')
        const log = { type: 'stdout', data: text, timestamp: Date.now() }
        processData.logs.push(log)
        saveLog(projectId, log)
        const clients = projectClients.get(projectId)
        if (clients) {
          clients.forEach(ws => { if (ws.readyState === 1) ws.send(JSON.stringify(log)) })
        }
      })

      childProcess.stderr.on('data', (data) => {
        const text = isWindows ? decodeWindowsOutput(data) : data.toString('utf8')
        const log = { type: 'stderr', data: text, timestamp: Date.now() }
        processData.logs.push(log)
        saveLog(projectId, log)
        const clients = projectClients.get(projectId)
        if (clients) {
          clients.forEach(ws => { if (ws.readyState === 1) ws.send(JSON.stringify(log)) })
        }
      })

      childProcess.on('error', (error) => {
        reject(error)
      })

      childProcess.on('exit', (code) => {
        const log = { type: 'exit', data: `Docker 进程退出，退出码: ${code}\n`, timestamp: Date.now(), code }
        processData.logs.push(log)
        saveLog(projectId, log)
        const clients = projectClients.get(projectId)
        if (clients) {
          clients.forEach(ws => { if (ws.readyState === 1) ws.send(JSON.stringify(log)) })
        }
        dockerProcesses.delete(projectId)
        runningProcesses.delete(projectId)
        loadProjects().then(projects => {
          const project = projects.find(p => p.id === projectId)
          if (project && project.status === 'running') {
            project.status = 'stopped'
            saveProjects(projects)
          }
        }).catch(() => {})
      })

      dockerProcesses.set(projectId, processData)
      runningProcesses.set(projectId, processData)
      resolve()
    } catch (error) {
      reject(error)
    }
  })
}

function stopDockerProject(projectId, dockerConfig) {
  const processData = dockerProcesses.get(projectId)
  if (!processData) return Promise.resolve(false)

  return new Promise((resolve) => {
    const { containerName, dockerComposeFile } = processData
    let stopCmd

    if (dockerComposeFile) {
      stopCmd = `docker compose -f "${dockerComposeFile}" down`
    } else {
      stopCmd = `docker stop ${containerName}`
    }

    exec(stopCmd, (error) => {
      if (error) {
        // 强制 kill 进程
        try { processData.process.kill('SIGKILL') } catch {}
      }
      dockerProcesses.delete(projectId)
      runningProcesses.delete(projectId)
      resolve(true)
    })

    setTimeout(() => {
      if (dockerProcesses.has(projectId)) {
        try { processData.process.kill('SIGKILL') } catch {}
        dockerProcesses.delete(projectId)
        runningProcesses.delete(projectId)
        resolve(true)
      }
    }, 15000)
  })
}

function startCustomProcess(projectId, projectPath, startCommand) {
  return new Promise((resolve, reject) => {
    try {
      const isWindows = process.platform === 'win32'
      const shell = isWindows ? 'cmd.exe' : '/bin/bash'
      const shellArgs = isWindows ? ['/c', 'chcp 65001 >nul && ' + startCommand] : ['-c', startCommand]

      const childProcess = spawn(shell, shellArgs, {
        cwd: projectPath,
        shell: false,  // 改为 false，因为已经手动指定了 shell
        env: { 
          ...process.env,
          PYTHONIOENCODING: 'utf-8'
        }
      })

      const processData = {
        process: childProcess,
        logs: []
      }

      childProcess.stdout.on('data', (data) => {
        const text = isWindows ? decodeWindowsOutput(data) : data.toString('utf8')
        const log = { type: 'stdout', data: text, timestamp: Date.now() }
        processData.logs.push(log)
        saveLog(projectId, log)

        const clients = projectClients.get(projectId)
        if (clients) {
          clients.forEach(ws => {
            if (ws.readyState === 1) {
              ws.send(JSON.stringify(log))
            }
          })
        }
      })

      childProcess.stderr.on('data', (data) => {
        const text = isWindows ? decodeWindowsOutput(data) : data.toString('utf8')
        const log = { type: 'stderr', data: text, timestamp: Date.now() }
        processData.logs.push(log)
        saveLog(projectId, log)

        const clients = projectClients.get(projectId)
        if (clients) {
          clients.forEach(ws => {
            if (ws.readyState === 1) {
              ws.send(JSON.stringify(log))
            }
          })
        }
      })

      childProcess.on('error', (error) => {
        console.error(`Process error for project ${projectId}:`, error)
        reject(error)
      })

      childProcess.on('exit', (code) => {
        const log = { type: 'exit', data: `进程退出，退出码: ${code}\n`, timestamp: Date.now(), code }
        processData.logs.push(log)
        saveLog(projectId, log)

        const clients = projectClients.get(projectId)
        if (clients) {
          clients.forEach(ws => {
            if (ws.readyState === 1) {
              ws.send(JSON.stringify(log))
            }
          })
        }

        runningProcesses.delete(projectId)

        // 自动将项目状态更新为停止
        loadProjects().then(projects => {
          const project = projects.find(p => p.id === projectId)
          if (project && project.status === 'running') {
            project.status = 'stopped'
            saveProjects(projects)
          }
        }).catch(() => {})
      })

      runningProcesses.set(projectId, processData)
      resolve()
    } catch (error) {
      reject(error)
    }
  })
}

function stopCustomProcess(projectId, stopCommand = '^C') {
  const processData = runningProcesses.get(projectId)
  if (processData) {
    return new Promise((resolve) => {
      const { process: childProcess } = processData

      if (stopCommand === '^C' || !stopCommand) {
        // 发送 SIGINT (Ctrl+C)
        if (process.platform === 'win32') {
          exec(`taskkill /pid ${childProcess.pid} /T /F`, (error) => {
            if (error) console.error('Error killing process:', error)
          })
        } else {
          childProcess.kill('SIGINT')
        }
      } else {
        // 执行自定义停止命令
        childProcess.stdin.write(stopCommand + '\n')
      }

      // 等待进程退出
      setTimeout(() => {
        if (runningProcesses.has(projectId)) {
          childProcess.kill('SIGKILL')
          runningProcesses.delete(projectId)
        }
        resolve(true)
      }, 3000)
    })
  }
  return Promise.resolve(false)
}

app.post('/api/projects/create', async (req, res) => {
  try {
    const { name, type, port, startCommand, stopCommand, dockerConfig } = req.body

    if (!name) {
      return res.status(400).json({ error: '项目名称不能为空' })
    }

    await ensureProjectsDir()

    const projects = await loadProjects()

    // 检查项目名是否已存在
    const nameExists = projects.some(p => p.name === name)
    if (nameExists) {
      return res.status(400).json({ error: '项目名称已存在' })
    }

    // 检查端口是否已被使用
    if (port) {
      const portInUse = projects.some(p => p.port === port)
      if (portInUse) {
        return res.status(400).json({ error: '端口已被占用' })
      }
    }

    // 生成项目路径
    const projectId = Date.now().toString()
    const projectPath = path.join(PROJECTS_DIR, `${name}_${projectId}`)

    // 创建项目目录
    await fs.promises.mkdir(projectPath, { recursive: true })

    // 如果是静态项目，创建默认 index.html
    if (type === 'static') {
      const defaultHtml = `<!DOCTYPE html>
<html>
<head>
<title>${name}!</title>
</head>
<body>
<h1>欢迎来到 ${name}!</h1>
<p>静态项目已创建.</p>
<p><em>这是一个AusCore静态项目默认页.</em></p>
<hr>
<p>AusCore.</p>
</body>
</html>`

      await fs.promises.writeFile(path.join(projectPath, 'index.html'), defaultHtml, 'utf-8')
    }

    const newProject = {
      id: projectId,
      name,
      type,
      port: port || null,
      path: projectPath,
      status: 'stopped',
      startCommand: startCommand || (type === 'static' ? null : ''),
      stopCommand: stopCommand || (type === 'minecraft' ? 'stop' : '^C'),
      ...(type === 'docker' ? { dockerConfig: dockerConfig || {} } : {}),
      createdAt: new Date().toISOString()
    }

    projects.push(newProject)
    await saveProjects(projects)

    res.json({ project: newProject })
  } catch (error) {
    console.error('Create project error:', error)
    res.status(500).json({ error: error.message })
  }
})

app.get('/api/projects', async (req, res) => {
  try {
    const projects = await loadProjects()
    res.json({ projects })
  } catch (error) {
    console.error('Get projects error:', error)
    res.status(500).json({ error: error.message })
  }
})

app.get('/api/projects/:id', async (req, res) => {
  try {
    const { id } = req.params
    const projects = await loadProjects()
    const project = projects.find(p => p.id === id)

    if (!project) {
      return res.status(404).json({ error: '项目不存在' })
    }

    res.json({ project })
  } catch (error) {
    console.error('Get project error:', error)
    res.status(500).json({ error: error.message })
  }
})

app.put('/api/projects/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { startCommand, stopCommand, port, dockerConfig } = req.body
    const projects = await loadProjects()
    const project = projects.find(p => p.id === id)

    if (!project) {
      return res.status(404).json({ error: '项目不存在' })
    }

    if (project.status === 'running') {
      return res.status(400).json({ error: '请先停止项目再修改配置' })
    }

    if (startCommand !== undefined) project.startCommand = startCommand
    if (stopCommand !== undefined) project.stopCommand = stopCommand
    if (dockerConfig !== undefined) project.dockerConfig = dockerConfig
    if (port !== undefined) {
      // 检查端口是否被其他项目占用
      const portInUse = projects.some(p => p.id !== id && p.port === port)
      if (portInUse) {
        return res.status(400).json({ error: '端口已被占用' })
      }
      project.port = port
    }

    await saveProjects(projects)
    res.json({ project })
  } catch (error) {
    console.error('Update project error:', error)
    res.status(500).json({ error: error.message })
  }
})

// 环境检测
async function checkEnvironment(type, startCommand, javaPath = null) {
  const checks = []

  if (type === 'docker') {
    try {
      await execAsync('docker --version')
    } catch {
      checks.push('未检测到 Docker 环境，请先安装 Docker')
    }
  }

  if (type === 'minecraft' || (startCommand && startCommand.includes('java'))) {
    if (javaPath && javaPath !== 'java') {
      // 检测自定义 Java 路径是否有效
      try {
        await execAsync(`${javaPath} -version 2>&1`)
      } catch {
        checks.push(`配置的 Java 路径无效: ${javaPath}`)
      }
    } else {
      try {
        await execAsync('java -version')
      } catch {
        checks.push('未检测到 Java 环境，请在 Java 环境卡片中配置或安装 Java')
      }
    }
  }

  if (startCommand) {
    if (startCommand.includes('node ') || startCommand.includes('npm ') || startCommand.includes('npx ')) {
      try {
        await execAsync('node --version')
      } catch {
        checks.push('未检测到 Node.js 环境，请先安装 Node.js')
      }
    }
    if (startCommand.includes('python') || startCommand.includes('pip')) {
      try {
        await execAsync('python --version')
      } catch {
        try {
          await execAsync('python3 --version')
        } catch {
          checks.push('未检测到 Python 环境，请先安装 Python')
        }
      }
    }
  }

  return checks
}

app.get('/api/env-check/:type', async (req, res) => {
  try {
    const { type } = req.params
    const startCommand = req.query.command || ''
    const javaPath = req.query.javaPath || null
    const issues = await checkEnvironment(type, startCommand, javaPath)
    res.json({ ok: issues.length === 0, issues })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Java 环境管理
const JAVA_DIR = path.join(BASE_PATH, 'java')

async function ensureJavaDir() {
  try { await fs.promises.access(JAVA_DIR) } catch { await fs.promises.mkdir(JAVA_DIR, { recursive: true }) }
}

async function detectInstalledJavas() {
  const javas = []
  const isWindows = process.platform === 'win32'

  // 检测系统 Java
  try {
    const { stdout } = await execAsync('java -version 2>&1')
    const match = stdout.match(/version "([^"]+)"/)
    if (match) {
      javas.push({ version: match[1], path: 'java', source: 'system', label: `系统 Java ${match[1]}` })
    }
  } catch { /* no system java */ }

  // 检测 AusCore 下载的 Java
  await ensureJavaDir()
  try {
    const dirs = await fs.promises.readdir(JAVA_DIR, { withFileTypes: true })
    for (const dir of dirs) {
      if (!dir.isDirectory()) continue
      const javaExe = isWindows ? 'java.exe' : 'java'
      const binPath = path.join(JAVA_DIR, dir.name, 'bin', javaExe)
      try {
        await fs.promises.access(binPath)
        const versionMatch = dir.name.match(/jdk-?(\d+)/)
        const ver = versionMatch ? versionMatch[1] : dir.name
        javas.push({ version: ver, path: `"${binPath}"`, source: 'auscore', label: `Java ${ver} (AusCore)`, dir: dir.name })
      } catch {
        // 可能是嵌套目录结构，尝试查找
        try {
          const subDirs = await fs.promises.readdir(path.join(JAVA_DIR, dir.name), { withFileTypes: true })
          for (const sub of subDirs) {
            if (!sub.isDirectory()) continue
            const subBinPath = path.join(JAVA_DIR, dir.name, sub.name, 'bin', javaExe)
            try {
              await fs.promises.access(subBinPath)
              const versionMatch = sub.name.match(/jdk-?(\d+)/)
              const ver = versionMatch ? versionMatch[1] : sub.name
              javas.push({ version: ver, path: `"${subBinPath}"`, source: 'auscore', label: `Java ${ver} (AusCore)`, dir: dir.name })
            } catch { /* skip */ }
          }
        } catch { /* skip */ }
      }
    }
  } catch { /* skip */ }

  return javas
}

// 获取可用 Java 列表
app.get('/api/java/list', async (req, res) => {
  try {
    const javas = await detectInstalledJavas()
    res.json({ javas })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 获取可下载的 Java 版本（Adoptium API）
app.get('/api/java/available', async (req, res) => {
  try {
    const isWindows = process.platform === 'win32'
    const arch = os.arch() === 'x64' ? 'x64' : 'aarch64'
    const osName = isWindows ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux'
    const versions = [8, 11, 17, 21]
    const results = []

    for (const ver of versions) {
      try {
        const url = `https://api.adoptium.net/v3/assets/latest/${ver}/hotspot?architecture=${arch}&image_type=jdk&os=${osName}&vendor=eclipse`
        const data = await httpsGet(url)
        if (data && data.length > 0) {
          const asset = data[0]
          results.push({
            version: ver,
            fullVersion: asset.version?.semver || `${ver}`,
            downloadUrl: asset.binary?.package?.link || null,
            size: asset.binary?.package?.size || 0,
            fileName: asset.binary?.package?.name || ''
          })
        }
      } catch { /* skip version */ }
    }

    res.json({ versions: results })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 下载 Java
app.post('/api/java/download', async (req, res) => {
  try {
    const { version, downloadUrl, fileName } = req.body
    if (!downloadUrl || !fileName) {
      return res.status(400).json({ error: '缺少下载参数' })
    }

    await ensureJavaDir()
    const destFile = path.join(JAVA_DIR, fileName)
    const extractDir = path.join(JAVA_DIR, `jdk-${version}`)
    const taskId = `java_${version}_${Date.now()}`

    downloadTasks.set(taskId, {
      name: `Java ${version}`,
      status: 'downloading',
      progress: 0,
      downloaded: 0,
      totalSize: 0
    })

    ;(async () => {
      try {
        await downloadFile(downloadUrl, destFile, taskId)

        // 解压
        if (downloadTasks.has(taskId)) {
          downloadTasks.get(taskId).name = `Java ${version} (解压中)`
        }

        if (fileName.endsWith('.zip')) {
          await fs.createReadStream(destFile)
            .pipe(unzipper.Extract({ path: extractDir }))
            .promise()
        } else if (fileName.endsWith('.tar.gz') || fileName.endsWith('.tgz')) {
          await fs.promises.mkdir(extractDir, { recursive: true })
          await execAsync(`tar -xzf "${destFile}" -C "${extractDir}" --strip-components=1`)
        }

        // 删除压缩包
        await fs.promises.unlink(destFile).catch(() => {})

        if (downloadTasks.has(taskId)) {
          const task = downloadTasks.get(taskId)
          task.name = `Java ${version}`
          task.status = 'done'
          task.progress = 100
          setTimeout(() => downloadTasks.delete(taskId), 30000)
        }
      } catch (error) {
        if (downloadTasks.has(taskId)) {
          downloadTasks.get(taskId).status = 'error'
          downloadTasks.get(taskId).error = error.message
        }
      }
    })()

    res.json({ success: true, taskId })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 设置项目 Java 路径
app.post('/api/projects/:id/java', async (req, res) => {
  try {
    const { id } = req.params
    const { javaPath } = req.body
    const projects = await loadProjects()
    const project = projects.find(p => p.id === id)

    if (!project) return res.status(404).json({ error: '项目不存在' })

    project.javaPath = javaPath || null

    // 自动替换启动命令中的 java 路径
    if (project.startCommand && javaPath) {
      // 替换命令开头的 java 或带引号的 java 路径
      project.startCommand = project.startCommand.replace(/^"[^"]*java(?:\.exe)?"/, javaPath).replace(/^java(?:\.exe)?/, javaPath)
    }

    await saveProjects(projects)
    res.json({ project })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.post('/api/projects/:id/start', async (req, res) => {
  try {
    const { id } = req.params
    const projects = await loadProjects()
    const project = projects.find(p => p.id === id)

    if (!project) {
      return res.status(404).json({ error: '项目不存在' })
    }

    if (project.status === 'running') {
      return res.status(400).json({ error: '项目已在运行' })
    }

    // 验证路径是否存在
    try {
      await fs.promises.access(project.path)
    } catch {
      return res.status(400).json({ error: '项目路径不存在' })
    }

    // 环境检测
    const envIssues = await checkEnvironment(project.type, project.startCommand, project.javaPath)
    if (envIssues.length > 0) {
      return res.status(400).json({ error: envIssues[0] })
    }

    if (project.type === 'static') {
      if (!project.port) {
        return res.status(400).json({ error: '静态项目需要配置端口' })
      }
      await startStaticServer(project.id, project.path, project.port)
    } else if (project.type === 'docker') {
      if (!project.dockerConfig?.image && !project.dockerConfig?.dockerComposeFile) {
        return res.status(400).json({ error: 'Docker 项目需要配置镜像或 Compose 文件' })
      }
      await startDockerProject(project.id, project.path, project.dockerConfig)
    } else if (project.type === 'custom' || project.type === 'minecraft') {
      if (!project.startCommand) {
        return res.status(400).json({ error: project.type === 'minecraft' ? 'Minecraft 服务器需要配置启动命令' : '自定义项目需要配置启动命令' })
      }
      let cmd = project.startCommand
      // MC 项目：如果设置了 javaPath，替换命令中的 java
      if (project.type === 'minecraft' && project.javaPath) {
        cmd = cmd.replace(/^"[^"]*java(?:\.exe)?"/, project.javaPath).replace(/^java(?:\.exe)?/, project.javaPath)
      }
      await startCustomProcess(project.id, project.path, cmd)
    }

    project.status = 'running'
    await saveProjects(projects)

    res.json({ project })
  } catch (error) {
    console.error('Start project error:', error)
    res.status(500).json({ error: error.message })
  }
})

app.post('/api/projects/:id/stop', async (req, res) => {
  try {
    const { id } = req.params
    const projects = await loadProjects()
    const project = projects.find(p => p.id === id)

    if (!project) {
      return res.status(404).json({ error: '项目不存在' })
    }

    if (project.status === 'stopped') {
      return res.status(400).json({ error: '项目未运行' })
    }

    if (project.type === 'static') {
      await stopStaticServer(project.id)
    } else if (project.type === 'docker') {
      await stopDockerProject(project.id, project.dockerConfig)
    } else if (project.type === 'custom' || project.type === 'minecraft') {
      await stopCustomProcess(project.id, project.stopCommand)
    }

    project.status = 'stopped'
    await saveProjects(projects)

    res.json({ project })
  } catch (error) {
    console.error('Stop project error:', error)
    res.status(500).json({ error: error.message })
  }
})

app.delete('/api/projects/:id', async (req, res) => {
  try {
    const { id } = req.params
    const deleteFiles = req.query.deleteFiles === 'true'
    const projects = await loadProjects()
    const projectIndex = projects.findIndex(p => p.id === id)

    if (projectIndex === -1) {
      return res.status(404).json({ error: '项目不存在' })
    }

    const project = projects[projectIndex]

    // 如果项目正在运行，先停止
    if (project.status === 'running') {
      if (project.type === 'static') {
        stopStaticServer(project.id)
      } else if (project.type === 'docker') {
        await stopDockerProject(project.id, project.dockerConfig)
      } else if (project.type === 'custom' || project.type === 'minecraft') {
        stopCustomProcess(project.id, project.stopCommand)
      }
    }

    // 如果选择删除文件，删除项目目录
    if (deleteFiles && project.path) {
      try {
        await fs.promises.rm(project.path, { recursive: true, force: true })
      } catch (error) {
        console.error('Delete project files error:', error)
        // 即使删除文件失败，也继续删除项目记录
      }
    }

    // 删除项目日志
    try {
      await clearLogs(project.id)
    } catch (error) {
      console.error('Delete project logs error:', error)
    }

    projects.splice(projectIndex, 1)
    await saveProjects(projects)

    res.json({ success: true, deletedFiles: deleteFiles })
  } catch (error) {
    console.error('Delete project error:', error)
    res.status(500).json({ error: error.message })
  }
})

// 辅助函数：进行 HTTPS GET 请求
function httpsGet(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      reject(new Error('Too many redirects'))
      return
    }

    https.get(url, {
      headers: {
        'User-Agent': 'AusCore/1.0'
      }
    }, (res) => {
      // 处理重定向
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
        const redirectUrl = res.headers.location
        if (redirectUrl) {
          httpsGet(redirectUrl, redirectCount + 1).then(resolve).catch(reject)
          return
        }
      }

      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`))
        return
      }

      let data = ''
      
      res.on('data', (chunk) => {
        data += chunk
      })
      
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch (err) {
          console.error('JSON parse error:', err)
          console.error('Response data:', data)
          reject(err)
        }
      })
    }).on('error', (err) => {
      reject(err)
    })
  })
}

// 下载任务管理
const downloadTasks = new Map()

// 辅助函数：下载文件（带进度追踪）
function downloadFile(url, dest, taskId = null, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      reject(new Error('Too many redirects'))
      return
    }

    const makeRequest = (requestUrl) => {
      const proto = requestUrl.startsWith('https') ? https : require('http')
      proto.get(requestUrl, {
        headers: { 'User-Agent': 'AusCore/1.0' }
      }, (response) => {
        if ([301, 302, 307, 308].includes(response.statusCode)) {
          const redirectUrl = response.headers.location
          if (redirectUrl) {
            response.resume()
            downloadFile(redirectUrl, dest, taskId, redirectCount + 1).then(resolve).catch(reject)
            return
          }
        }

        if (response.statusCode !== 200) {
          response.resume()
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`))
          return
        }

        const totalSize = parseInt(response.headers['content-length'], 10) || 0
        let downloaded = 0

        if (taskId && downloadTasks.has(taskId)) {
          const task = downloadTasks.get(taskId)
          task.totalSize = totalSize
        }

        const file = fs.createWriteStream(dest)

        response.on('data', (chunk) => {
          downloaded += chunk.length
          file.write(chunk)
          if (taskId && downloadTasks.has(taskId)) {
            const task = downloadTasks.get(taskId)
            task.downloaded = downloaded
            task.progress = totalSize > 0
              ? Math.round((downloaded / totalSize) * 100)
              : Math.min(99, Math.round(downloaded / 1024 / 1024)) // 无 content-length 时按 MB 估算
          }
        })

        response.on('end', () => {
          file.end(() => {
            if (taskId && downloadTasks.has(taskId)) {
              const task = downloadTasks.get(taskId)
              task.status = 'done'
              task.progress = 100
              setTimeout(() => downloadTasks.delete(taskId), 30000)
            }
            resolve()
          })
        })

        response.on('error', (err) => {
          file.close()
          fs.unlink(dest, () => {})
          if (taskId && downloadTasks.has(taskId)) {
            downloadTasks.get(taskId).status = 'error'
            downloadTasks.get(taskId).error = err.message
          }
          reject(err)
        })

        file.on('error', (err) => {
          file.close()
          fs.unlink(dest, () => {})
          if (taskId && downloadTasks.has(taskId)) {
            downloadTasks.get(taskId).status = 'error'
            downloadTasks.get(taskId).error = err.message
          }
          reject(err)
        })
      }).on('error', (err) => {
        fs.unlink(dest, () => {})
        if (taskId && downloadTasks.has(taskId)) {
          downloadTasks.get(taskId).status = 'error'
          downloadTasks.get(taskId).error = err.message
        }
        reject(err)
      })
    }

    makeRequest(url)
  })
}

// 下载进度查询 API
app.get('/api/downloads', (req, res) => {
  const tasks = []
  downloadTasks.forEach((task, id) => {
    tasks.push({ id, ...task })
  })
  res.json({ tasks })
})

// Minecraft 核心下载 API
app.post('/api/minecraft/download-core', async (req, res) => {
  try {
    const { projectId, projectPath, coreType, version } = req.body

    if (!projectId || !projectPath || !coreType || !version) {
      return res.status(400).json({ error: '缺少必要参数' })
    }

    try {
      await fs.promises.access(projectPath)
    } catch {
      return res.status(400).json({ error: '项目路径不存在' })
    }

    const fileName = 'server.jar'
    const filePath = path.join(projectPath, fileName)
    const taskId = `core_${projectId}_${Date.now()}`

    downloadTasks.set(taskId, {
      name: `${coreType} ${version}`,
      status: 'downloading',
      progress: 0,
      downloaded: 0,
      totalSize: 0
    })

    // 后台下载
    ;(async () => {
      try {
        let downloadUrl = null

        if (coreType === 'paper') {
          const buildsUrl = `https://api.papermc.io/v2/projects/paper/versions/${version}/builds`
          const buildsData = await httpsGet(buildsUrl)
          if (buildsData.builds && buildsData.builds.length > 0) {
            const latestBuild = buildsData.builds[buildsData.builds.length - 1]
            const buildNumber = latestBuild.build
            const jarName = latestBuild.downloads.application.name
            downloadUrl = `https://api.papermc.io/v2/projects/paper/versions/${version}/builds/${buildNumber}/downloads/${jarName}`
          }
        } else if (coreType === 'purpur') {
          const buildsUrl = `https://api.purpurmc.org/v2/purpur/${version}`
          const buildsData = await httpsGet(buildsUrl)
          if (buildsData.builds && buildsData.builds.latest) {
            const latestBuild = buildsData.builds.latest
            downloadUrl = `https://api.purpurmc.org/v2/purpur/${version}/${latestBuild}/download`
          }
        }

        if (!downloadUrl) {
          throw new Error(`无法获取 ${coreType} ${version} 的下载链接`)
        }

        await downloadFile(downloadUrl, filePath, taskId)
      } catch (error) {
        console.error('Download core error:', error)
        if (downloadTasks.has(taskId)) {
          downloadTasks.get(taskId).status = 'error'
          downloadTasks.get(taskId).error = error.message
        }
      }
    })()

    res.json({ 
      success: true, 
      fileName,
      taskId,
      message: '下载任务已启动'
    })
  } catch (error) {
    console.error('Download core error:', error)
    res.status(500).json({ error: error.message })
  }
})

// 获取核心版本列表
app.get('/api/minecraft/core-versions/:coreType', async (req, res) => {
  try {
    const { coreType } = req.params
    let versions = []

    if (coreType === 'paper') {
      const data = await httpsGet('https://api.papermc.io/v2/projects/paper')
      versions = data.versions || []
    } else if (coreType === 'purpur') {
      const data = await httpsGet('https://api.purpurmc.org/v2/purpur')
      versions = data.versions || []
    }

    res.json({ versions: versions.reverse() })
  } catch (error) {
    console.error('Get core versions error:', error)
    res.status(500).json({ error: error.message })
  }
})

// 获取核心构建列表
app.get('/api/minecraft/core-builds/:coreType/:version', async (req, res) => {
  try {
    const { coreType, version } = req.params
    let builds = []

    if (coreType === 'paper') {
      const data = await httpsGet(`https://api.papermc.io/v2/projects/paper/versions/${version}/builds`)
      builds = data.builds.map(b => ({
        build: b.build,
        time: new Date(b.time).toLocaleString('zh-CN'),
        channel: b.channel
      })).reverse()
    } else if (coreType === 'purpur') {
      const data = await httpsGet(`https://api.purpurmc.org/v2/purpur/${version}`)
      if (data.builds && data.builds.all) {
        builds = data.builds.all.map(b => ({
          build: b,
          date: ''
        })).reverse()
      }
    }

    res.json({ builds })
  } catch (error) {
    console.error('Get core builds error:', error)
    res.status(500).json({ error: error.message })
  }
})

// 下载指定构建的核心
app.post('/api/minecraft/download-core-build', async (req, res) => {
  try {
    const { projectId, projectPath, coreType, version, buildNumber } = req.body

    if (!projectId || !projectPath || !coreType || !version || !buildNumber) {
      return res.status(400).json({ error: '缺少必要参数' })
    }

    const fileName = 'server.jar'
    const filePath = path.join(projectPath, fileName)
    const taskId = `core_${projectId}_${Date.now()}`

    downloadTasks.set(taskId, {
      name: `${coreType} ${version} #${buildNumber}`,
      status: 'downloading',
      progress: 0,
      downloaded: 0,
      totalSize: 0
    })

    ;(async () => {
      try {
        let downloadUrl = null

        if (coreType === 'paper') {
          const buildsData = await httpsGet(`https://api.papermc.io/v2/projects/paper/versions/${version}/builds`)
          const build = buildsData.builds.find(b => b.build === parseInt(buildNumber))
          if (build) {
            const jarName = build.downloads.application.name
            downloadUrl = `https://api.papermc.io/v2/projects/paper/versions/${version}/builds/${buildNumber}/downloads/${jarName}`
          }
        } else if (coreType === 'purpur') {
          downloadUrl = `https://api.purpurmc.org/v2/purpur/${version}/${buildNumber}/download`
        }

        if (!downloadUrl) {
          throw new Error(`无法获取构建 #${buildNumber} 的下载链接`)
        }

        await downloadFile(downloadUrl, filePath, taskId)
      } catch (error) {
        console.error('Download core build error:', error)
        if (downloadTasks.has(taskId)) {
          downloadTasks.get(taskId).status = 'error'
          downloadTasks.get(taskId).error = error.message
        }
      }
    })()

    res.json({ 
      success: true, 
      fileName,
      taskId,
      message: '下载任务已启动'
    })
  } catch (error) {
    console.error('Download core build error:', error)
    res.status(500).json({ error: error.message })
  }
})

// 获取已安装插件列表
app.get('/api/minecraft/plugins/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params
    const projects = await loadProjects()
    const project = projects.find(p => p.id === projectId)

    if (!project) {
      return res.status(404).json({ error: '项目不存在' })
    }

    const pluginsDir = path.join(project.path, 'plugins')
    
    try {
      await fs.promises.access(pluginsDir)
      const files = await fs.promises.readdir(pluginsDir)
      const plugins = files.filter(f => f.endsWith('.jar'))
      res.json({ plugins })
    } catch {
      // plugins 目录不存在
      res.json({ plugins: [] })
    }
  } catch (error) {
    console.error('Get plugins error:', error)
    res.status(500).json({ error: error.message })
  }
})

// 搜索插件（对接 Modrinth API）
app.post('/api/minecraft/search-plugins', async (req, res) => {
  try {
    const { query, filters } = req.body

    if (!query) {
      return res.status(400).json({ error: '搜索关键词不能为空' })
    }

    // 构建 Modrinth API 查询参数
    // Modrinth 上的 Bukkit/Spigot 插件使用 project_type:plugin
    let facets = [['project_type:plugin']]
    
    // 添加服务端类型筛选
    if (filters.loader) {
      const loaderMap = {
        'paper': 'paper',
        'spigot': 'spigot',
        'purpur': 'purpur',
        'bukkit': 'bukkit'
      }
      const loader = loaderMap[filters.loader] || filters.loader
      facets.push([`categories:${loader}`])
    } else {
      // 默认搜索所有 Bukkit 系插件
      facets.push(['categories:bukkit', 'categories:spigot', 'categories:paper'])
    }
    
    if (filters.version) {
      facets.push([`versions:${filters.version}`])
    }

    const searchParams = new URLSearchParams({
      query,
      facets: JSON.stringify(facets),
      limit: '20'
    })

    // 调用 Modrinth API
    const apiUrl = `https://api.modrinth.com/v2/search?${searchParams.toString()}`
    
    try {
      const data = await httpsGet(apiUrl)
      
      const results = data.hits.map(hit => ({
        project_id: hit.project_id,
        slug: hit.slug,
        title: hit.title,
        description: hit.description,
        downloads: hit.downloads,
        icon_url: hit.icon_url,
        categories: hit.categories
      }))
      
      res.json({ results })
    } catch (apiError) {
      console.error('Modrinth API error:', apiError)
      res.status(500).json({ error: 'Modrinth API 调用失败' })
    }
  } catch (error) {
    console.error('Search plugins error:', error)
    res.status(500).json({ error: error.message })
  }
})

// 获取插件版本列表
app.get('/api/minecraft/plugin-versions/:pluginId', async (req, res) => {
  try {
    const { pluginId } = req.params
    const filters = JSON.parse(req.query.filters || '{}')

    // 调用 Modrinth API 获取版本列表
    const apiUrl = `https://api.modrinth.com/v2/project/${pluginId}/version`
    
    try {
      const versions = await httpsGet(apiUrl)
      
      // 根据筛选条件过滤版本
      let filteredVersions = versions
      
      if (filters.version) {
        filteredVersions = filteredVersions.filter(v => 
          v.game_versions && v.game_versions.includes(filters.version)
        )
      }
      
      if (filters.loader) {
        filteredVersions = filteredVersions.filter(v => 
          v.loaders && v.loaders.some(l => l.toLowerCase().includes(filters.loader.toLowerCase()))
        )
      }
      
      // 只返回前20个版本
      const limitedVersions = filteredVersions.slice(0, 20).map(v => ({
        id: v.id,
        name: v.name,
        version_number: v.version_number,
        game_versions: v.game_versions,
        loaders: v.loaders,
        files: v.files
          .filter(f => f.filename.endsWith('.jar')) // 只返回 .jar 文件
          .map(f => ({
            filename: f.filename,
            url: f.url,
            size: f.size,
            primary: f.primary
          }))
      })).filter(v => v.files.length > 0) // 过滤掉没有 .jar 文件的版本
      
      res.json({ versions: limitedVersions })
    } catch (apiError) {
      console.error('Modrinth API error:', apiError)
      res.status(500).json({ error: 'Modrinth API 调用失败' })
    }
  } catch (error) {
    console.error('Get plugin versions error:', error)
    res.status(500).json({ error: error.message })
  }
})

// 下载插件
app.post('/api/minecraft/download-plugin', async (req, res) => {
  try {
    const { projectId, projectPath, pluginId, versionId, fileName, downloadUrl } = req.body

    if (!projectId || !projectPath || !versionId || !fileName || !downloadUrl) {
      return res.status(400).json({ error: '缺少必要参数' })
    }

    if (!fileName.endsWith('.jar')) {
      return res.status(400).json({ error: '只支持下载 .jar 文件' })
    }

    const pluginsDir = path.join(projectPath, 'plugins')
    await fs.promises.mkdir(pluginsDir, { recursive: true })

    const filePath = path.join(pluginsDir, fileName)
    const taskId = `plugin_${projectId}_${Date.now()}`

    downloadTasks.set(taskId, {
      name: fileName.replace('.jar', ''),
      status: 'downloading',
      progress: 0,
      downloaded: 0,
      totalSize: 0
    })

    ;(async () => {
      try {
        await downloadFile(downloadUrl, filePath, taskId)
      } catch (error) {
        if (downloadTasks.has(taskId)) {
          downloadTasks.get(taskId).status = 'error'
          downloadTasks.get(taskId).error = error.message
        }
      }
    })()

    res.json({ 
      success: true, 
      fileName,
      taskId,
      message: '下载任务已启动'
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})


// User authentication APIs
const USERS_FILE = path.join(BASE_PATH, 'users.json')

async function loadUsers() {
  try {
    const data = await fs.promises.readFile(USERS_FILE, 'utf-8')
    return JSON.parse(data)
  } catch (error) {
    return []
  }
}

async function saveUsers(users) {
  await fs.promises.writeFile(USERS_FILE, JSON.stringify(users, null, 2))
}

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body

    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' })
    }

    const users = await loadUsers()

    // 检查是否已有管理员
    if (users.length > 0) {
      return res.status(400).json({ error: '管理员账户已存在' })
    }

    // 检查密码强度
    if (password.length < 8) {
      return res.status(400).json({ error: '密码长度至少为8个字符' })
    }

    // 加密密码
    const saltRounds = 10
    const hashedPassword = await bcrypt.hash(password, saltRounds)

    const newUser = {
      id: Date.now().toString(),
      username,
      password: hashedPassword,
      createdAt: new Date().toISOString()
    }

    users.push(newUser)
    await saveUsers(users)

    res.json({ success: true, user: { id: newUser.id, username: newUser.username } })
  } catch (error) {
    console.error('Register error:', error)
    res.status(500).json({ error: error.message })
  }
})

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body

    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' })
    }

    const users = await loadUsers()
    const user = users.find(u => u.username === username)

    if (!user) {
      return res.status(401).json({ error: '用户名或密码错误' })
    }

    // 验证密码
    const isPasswordValid = await bcrypt.compare(password, user.password)

    if (!isPasswordValid) {
      return res.status(401).json({ error: '用户名或密码错误' })
    }

    res.json({ success: true, user: { id: user.id, username: user.username } })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ error: error.message })
  }
})

app.get('/api/auth/check', async (req, res) => {
  try {
    const users = await loadUsers()
    res.json({ hasAdmin: users.length > 0 })
  } catch (error) {
    console.error('Check auth error:', error)
    res.status(500).json({ error: error.message })
  }
})
