import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Settings, FolderOpen, Play, Square, Save, X, Package, Puzzle, Zap, Search, Download, Filter } from 'lucide-react'
import Terminal from '../components/Terminal'
import './ProjectDetail.css'
import { API_BASE } from '../config'

function ProjectDetail({ toast }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [project, setProject] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showCoreModal, setShowCoreModal] = useState(false)
  const [showCommandModal, setShowCommandModal] = useState(false)
  const [showPluginsModal, setShowPluginsModal] = useState(false)
  const [selectedCore, setSelectedCore] = useState(null)
  const [coreVersions, setCoreVersions] = useState([])
  const [selectedCoreVersion, setSelectedCoreVersion] = useState(null)
  const [coreBuilds, setCoreBuilds] = useState([])
  const [loadingCoreData, setLoadingCoreData] = useState(false)
  const [installedPlugins, setInstalledPlugins] = useState([])
  const [searchResults, setSearchResults] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchFilters, setSearchFilters] = useState({
    version: '',
    category: '',
    loader: 'paper'
  })
  const [selectedPlugin, setSelectedPlugin] = useState(null)
  const [pluginVersions, setPluginVersions] = useState([])
  const [loadingPlugins, setLoadingPlugins] = useState(false)
  const [commandConfig, setCommandConfig] = useState({
    memory: '4',
    jarFile: 'server.jar',
    useUtf8: true,
    advancedArgs: ''
  })
  const [formData, setFormData] = useState({
    startCommand: '',
    stopCommand: '^C',
    port: '',
    dockerConfig: null
  })
  const [envWarnings, setEnvWarnings] = useState([])
  const [showJavaModal, setShowJavaModal] = useState(false)
  const [installedJavas, setInstalledJavas] = useState([])
  const [availableJavas, setAvailableJavas] = useState([])
  const [loadingJava, setLoadingJava] = useState(false)
  const [showJavaHint, setShowJavaHint] = useState(false)
  useEffect(() => {
    fetchProject()
  }, [id])

  const fetchProject = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/projects/${id}`)
      if (!response.ok) throw new Error('Failed to fetch project')
      const data = await response.json()
      setProject(data.project)
      setFormData({
        startCommand: data.project.startCommand || '',
        stopCommand: data.project.stopCommand || (data.project.type === 'minecraft' ? 'stop' : '^C'),
        port: data.project.port || '',
        dockerConfig: data.project.dockerConfig || null
      })

      // 环境检测
      try {
        const envRes = await fetch(`${API_BASE}/api/env-check/${data.project.type}?command=${encodeURIComponent(data.project.startCommand || '')}`)
        if (envRes.ok) {
          const envData = await envRes.json()
          setEnvWarnings(envData.issues || [])
        }
      } catch { /* ignore */ }
    } catch (err) {
      toast.error('加载项目失败')
      console.error(err)
    }
  }

  const handleProcessExit = useCallback(async () => {
    // 只更新项目状态，不重新渲染整个组件
    try {
      const response = await fetch(`${API_BASE}/api/projects/${id}`)
      if (response.ok) {
        const data = await response.json()
        setProject(prev => ({ ...prev, status: data.project.status }))
        toast.warning('项目进程已退出')
      }
    } catch (err) {
      console.error(err)
    }
  }, [id]) // 移除 toast 依赖

  const handleStart = async () => {
    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/api/projects/${id}/start`, {
        method: 'POST'
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error)
      }
      await fetchProject()
      toast.success('项目启动成功')
    } catch (err) {
      toast.error(err.message || '启动失败')
    } finally {
      setLoading(false)
    }
  }

  const handleStop = async () => {
    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/api/projects/${id}/stop`, {
        method: 'POST'
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error)
      }
      await fetchProject()
      toast.success('项目已停止')
    } catch (err) {
      toast.error(err.message || '停止失败')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveSettings = async () => {
    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/api/projects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error)
      }
      await fetchProject()
      setShowSettings(false)
      toast.success('设置已保存')
    } catch (err) {
      toast.error(err.message || '保存失败')
    } finally {
      setLoading(false)
    }
  }

  const handleOpenFiles = () => {
    const normalizedPath = project.path.replace(/\\/g, '/')
    const serverIndex = normalizedPath.lastIndexOf('/server/')

    if (serverIndex !== -1) {
      let relativePath = normalizedPath.substring(serverIndex + 8)
      if (!relativePath.startsWith('/')) {
        relativePath = '/' + relativePath
      }
      navigate(`/files${relativePath}`, { state: { fromProject: { id: project.id, name: project.name } } })
    } else {
      const pathParts = normalizedPath.split('/').filter(p => p)
      const projectName = pathParts[pathParts.length - 1]
      navigate(`/files/${projectName}`, { state: { fromProject: { id: project.id, name: project.name } } })
    }
  }

  const handleDownloadCore = async (coreType, version) => {
    setShowCoreModal(false)

    try {
      const response = await fetch(`${API_BASE}/api/minecraft/download-core`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: id,
          projectPath: project.path,
          coreType,
          version
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error)
      }

      toast.success(`${coreType} ${version} 开始下载`)
      setCommandConfig(prev => ({ ...prev, jarFile: 'server.jar' }))
    } catch (err) {
      toast.error(err.message || '下载失败')
    }
  }

  const loadCoreVersions = async (coreType) => {
    setLoadingCoreData(true)
    setSelectedCore(coreType)
    setCoreVersions([])
    setSelectedCoreVersion(null)
    setCoreBuilds([])

    try {
      const response = await fetch(`${API_BASE}/api/minecraft/core-versions/${coreType}`)
      if (response.ok) {
        const data = await response.json()
        setCoreVersions(data.versions || [])
      }
    } catch (err) {
      toast.error('加载版本列表失败')
      console.error(err)
    } finally {
      setLoadingCoreData(false)
    }
  }

  const loadCoreBuilds = async (coreType, version) => {
    setLoadingCoreData(true)
    setSelectedCoreVersion(version)
    setCoreBuilds([])

    try {
      const response = await fetch(`${API_BASE}/api/minecraft/core-builds/${coreType}/${version}`)
      if (response.ok) {
        const data = await response.json()
        setCoreBuilds(data.builds || [])
      }
    } catch (err) {
      toast.error('加载构建列表失败')
      console.error(err)
    } finally {
      setLoadingCoreData(false)
    }
  }

  const handleDownloadCoreBuild = async (buildNumber) => {
    setShowCoreModal(false)

    try {
      const response = await fetch(`${API_BASE}/api/minecraft/download-core-build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: id,
          projectPath: project.path,
          coreType: selectedCore,
          version: selectedCoreVersion,
          buildNumber
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error)
      }

      toast.success(`${selectedCore} ${selectedCoreVersion} #${buildNumber} 开始下载`)
      setCommandConfig(prev => ({ ...prev, jarFile: 'server.jar' }))
    } catch (err) {
      toast.error(err.message || '下载失败')
    }
  }

  const generateStartCommand = () => {
    const { memory, jarFile, useUtf8, advancedArgs } = commandConfig

    let command = `java -Xmx${memory}G -Xms${memory}G`

    if (useUtf8) {
      command += ' -Dfile.encoding=UTF-8'
    }

    if (advancedArgs.trim()) {
      command += ` ${advancedArgs.trim()}`
    }

    command += ` -jar ${jarFile} nogui`

    return command
  }

  const handleApplyCommand = async () => {
    const command = generateStartCommand()

    try {
      const response = await fetch(`${API_BASE}/api/projects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startCommand: command })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error)
      }

      await fetchProject()
      setShowCommandModal(false)
      toast.success('启动命令已更新')
    } catch (err) {
      toast.error(err.message || '更新失败')
    }
  }

  const loadInstalledPlugins = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/minecraft/plugins/${id}`)
      if (response.ok) {
        const data = await response.json()
        setInstalledPlugins(data.plugins || [])
      }
    } catch (err) {
      console.error('Load plugins error:', err)
    }
  }

  const searchPlugins = async () => {
    if (!searchQuery.trim()) return

    setLoadingPlugins(true)
    try {
      const response = await fetch(`${API_BASE}/api/minecraft/search-plugins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQuery,
          filters: searchFilters
        })
      })

      if (response.ok) {
        const data = await response.json()
        setSearchResults(data.results || [])
      }
    } catch (err) {
      toast.error('搜索失败')
      console.error('Search error:', err)
    } finally {
      setLoadingPlugins(false)
    }
  }

  const loadPluginVersions = async (pluginId) => {
    setLoadingPlugins(true)
    try {
      const response = await fetch(`${API_BASE}/api/minecraft/plugin-versions/${pluginId}?filters=${encodeURIComponent(JSON.stringify(searchFilters))}`)

      if (response.ok) {
        const data = await response.json()
        setPluginVersions(data.versions || [])
      }
    } catch (err) {
      toast.error('加载版本失败')
      console.error('Load versions error:', err)
    } finally {
      setLoadingPlugins(false)
    }
  }

  const downloadPlugin = async (pluginId, versionId, fileName, downloadUrl) => {
    try {
      const response = await fetch(`${API_BASE}/api/minecraft/download-plugin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: id,
          projectPath: project.path,
          pluginId,
          versionId,
          fileName,
          downloadUrl
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error)
      }

      toast.success(`${fileName} 开始下载`)
      setSelectedPlugin(null)
      setPluginVersions([])
    } catch (err) {
      toast.error(err.message || '下载失败')
    }
  }

  const loadJavaList = async () => {
    setLoadingJava(true)
    try {
      const [installedRes, availableRes] = await Promise.all([
        fetch(`${API_BASE}/api/java/list`),
        fetch(`${API_BASE}/api/java/available`)
      ])
      if (installedRes.ok) {
        const data = await installedRes.json()
        setInstalledJavas(data.javas || [])
      }
      if (availableRes.ok) {
        const data = await availableRes.json()
        setAvailableJavas(data.versions || [])
      }
    } catch {
      toast.error('加载 Java 信息失败')
    } finally {
      setLoadingJava(false)
    }
  }

  const handleSelectJava = async (javaPath) => {
    try {
      const response = await fetch(`${API_BASE}/api/projects/${id}/java`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ javaPath })
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error)
      }
      await fetchProject()
      setShowJavaModal(false)
      toast.success('Java 环境已更新')
    } catch (err) {
      toast.error(err.message || '设置失败')
    }
  }

  const handleDownloadJava = async (ver) => {
    try {
      const response = await fetch(`${API_BASE}/api/java/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: ver.version, downloadUrl: ver.downloadUrl, fileName: ver.fileName })
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error)
      }
      toast.success(`Java ${ver.version} 开始下载`)
    } catch (err) {
      toast.error(err.message || '下载失败')
    }
  }

  const handleStartWithJavaCheck = async () => {
    // 检查启动命令是否包含 java
    if (project.type === 'minecraft' && project.startCommand && !project.startCommand.includes('java') && !project.javaPath) {
      setShowJavaHint(true)
      return
    }
    handleStart()
  }

  const terminalComponent = useMemo(() => {
    if (project?.type === 'custom' || project?.type === 'minecraft' || project?.type === 'docker') {
      return <Terminal key={project.id} projectId={project.id} onProcessExit={handleProcessExit} />
    }
    return null
  }, [project?.id, project?.type, handleProcessExit])

  if (!project) {
    return (
      <div className="project-detail-page">
        <div className="loading">加载中...</div>
      </div>
    )
  }

  return (
    <div className="project-detail-page">
      <div className="detail-header">
        <h1>{project.name}</h1>
        <div className="header-actions">
          {project.status === 'stopped' ? (
            <button className="btn-start" onClick={project.type === 'minecraft' ? handleStartWithJavaCheck : handleStart} disabled={loading}>
              <Play size={16} />
              <span>启动</span>
            </button>
          ) : (
            <button className="btn-stop" onClick={handleStop} disabled={loading}>
              <Square size={16} />
              <span>停止</span>
            </button>
          )}
        </div>
      </div>

      {envWarnings.length > 0 && (
        <div className="env-warnings">
          {envWarnings.map((w, i) => (
            <div key={i} className="env-warning-item">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      <div className="detail-content">
        {terminalComponent && (
          <div className="terminal-card">
            {terminalComponent}
          </div>
        )}

        <div className="detail-body">
          <div className="detail-left">
            <div className="info-card">
              <h3>项目信息</h3>
              <div className="info-row">
                <span className="label">类型:</span>
                <span>{project.type === 'static' ? '静态网站' : project.type === 'minecraft' ? 'Minecraft 服务器' : project.type === 'docker' ? 'Docker 项目' : '自定义项目'}</span>
              </div>
              <div className="info-row">
                <span className="label">端口:</span>
                <span>{project.port || '未设置'}</span>
              </div>
              <div className="info-row">
                <span className="label">状态:</span>
                <span className={`status ${project.status}`}>
                  {project.status === 'running' ? '运行中' : '已停止'}
                </span>
              </div>
              {project.type === 'minecraft' && (
                <div className="info-row">
                  <span className="label">Java:</span>
                  <span>{project.javaPath ? (project.javaPath === 'java' ? '系统 Java' : 'AusCore Java') : '未配置'}</span>
                </div>
              )}
              {project.startCommand && (
                <div className="info-row">
                  <span className="label">启动命令:</span>
                  <span className="info-command">{project.startCommand}</span>
                </div>
              )}
              {project.type === 'docker' && project.dockerConfig && (
                <>
                  {project.dockerConfig.image && (
                    <div className="info-row">
                      <span className="label">镜像:</span>
                      <span>{project.dockerConfig.image}</span>
                    </div>
                  )}
                  {project.dockerConfig.dockerComposeFile && (
                    <div className="info-row">
                      <span className="label">Compose:</span>
                      <span>{project.dockerConfig.dockerComposeFile}</span>
                    </div>
                  )}
                  {project.dockerConfig.ports && (
                    <div className="info-row">
                      <span className="label">端口映射:</span>
                      <span>{project.dockerConfig.ports}</span>
                    </div>
                  )}
                </>
              )}
              <div className="info-row">
                <span className="label">创建时间:</span>
                <span>{project.createdAt ? new Date(project.createdAt).toLocaleString('zh-CN') : '-'}</span>
              </div>
            </div>
          </div>

          <div className="detail-right">
            {project.type === 'minecraft' && (
              <>
                <div className="action-card minecraft-java" onClick={() => { setShowJavaModal(true); loadJavaList() }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 8h1a4 4 0 1 1 0 8h-1" /><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" />
                    <line x1="6" y1="2" x2="6" y2="4" /><line x1="10" y1="2" x2="10" y2="4" /><line x1="14" y1="2" x2="14" y2="4" />
                  </svg>
                  <div className="action-card-text">
                    <h3>Java 环境</h3>
                    <p>{project.javaPath ? (project.javaPath === 'java' ? '系统 Java' : 'AusCore Java') : '点击配置'}</p>
                  </div>
                </div>

                <div className="action-card" onClick={() => setShowCoreModal(true)}>
                  <Package size={28} />
                  <div className="action-card-text">
                    <h3>服务器核心</h3>
                    <p>下载服务器核心文件</p>
                  </div>
                </div>

                <div className="action-card" onClick={() => { setShowPluginsModal(true); loadInstalledPlugins() }}>
                  <Puzzle size={28} />
                  <div className="action-card-text">
                    <h3>插件管理</h3>
                    <p>搜索下载服务器插件</p>
                  </div>
                </div>

                <div className="action-card" onClick={() => setShowCommandModal(true)}>
                  <Zap size={28} />
                  <div className="action-card-text">
                    <h3>启动命令生成</h3>
                    <p>快速生成启动命令</p>
                  </div>
                </div>
              </>
            )}

            <div className="action-card" onClick={() => setShowSettings(true)}>
              <Settings size={28} />
              <div className="action-card-text">
                <h3>项目设置</h3>
                <p>配置启动和停止命令</p>
              </div>
            </div>

            <div className="action-card" onClick={handleOpenFiles}>
              <FolderOpen size={28} />
              <div className="action-card-text">
                <h3>文件管理</h3>
                <p>浏览和编辑项目文件</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showCoreModal && (
        <div className="modal-overlay" onClick={() => setShowCoreModal(false)}>
          <div className="modal-content core-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>选择服务器核心</h2>
              <button className="btn-close-modal" onClick={() => setShowCoreModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              {!selectedCore ? (
                // 核心类型选择
                <>
                  <div className="core-section" onClick={() => loadCoreVersions('paper')}>
                    <h3>Paper</h3>
                    <p className="core-desc">高性能 Spigot 分支，推荐用于生存服务器</p>
                  </div>

                  <div className="core-section" onClick={() => loadCoreVersions('purpur')}>
                    <h3>Purpur</h3>
                    <p className="core-desc">Paper 的增强版，提供更多配置选项</p>
                  </div>
                </>
              ) : !selectedCoreVersion ? (
                // 版本选择
                <>
                  <button className="btn-back-search" onClick={() => {
                    setSelectedCore(null)
                    setCoreVersions([])
                  }}>
                    <ArrowLeft size={14} />
                    <span>返回核心选择</span>
                  </button>
                  <h3>{selectedCore.toUpperCase()} - 选择版本</h3>
                  {loadingCoreData ? (
                    <div className="loading-plugins">加载中...</div>
                  ) : (
                    <div className="core-versions">
                      {coreVersions.map((version) => (
                        <button
                          key={version}
                          className="core-version-btn"
                          onClick={() => loadCoreBuilds(selectedCore, version)}
                        >
                          {version}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                // 构建选择
                <>
                  <button className="btn-back-search" onClick={() => {
                    setSelectedCoreVersion(null)
                    setCoreBuilds([])
                  }}>
                    <ArrowLeft size={14} />
                    <span>返回版本选择</span>
                  </button>
                  <h3>{selectedCore.toUpperCase()} {selectedCoreVersion} - 选择构建</h3>
                  {loadingCoreData ? (
                    <div className="loading-plugins">加载中...</div>
                  ) : coreBuilds.length > 0 ? (
                    <div className="versions-list">
                      {coreBuilds.map((build) => (
                        <div key={build.build} className="version-item">
                          <div className="version-info">
                            <span className="version-name">构建 #{build.build}</span>
                            <span className="version-game">{build.time || build.date || ''}</span>
                          </div>
                          <button
                            className="btn-download-version"
                            onClick={() => handleDownloadCoreBuild(build.build)}
                          >
                            <Download size={14} />
                            <span>下载</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="core-versions">
                      <button
                        className="core-version-btn"
                        onClick={() => handleDownloadCore(selectedCore, selectedCoreVersion)}
                      >
                        下载最新构建
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {showCommandModal && (
        <div className="modal-overlay" onClick={() => setShowCommandModal(false)}>
          <div className="modal-content command-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>启动命令生成</h2>
              <button className="btn-close-modal" onClick={() => setShowCommandModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label>内存分配 (GB)</label>
                <div className="memory-options">
                  <button
                    className={`memory-btn ${commandConfig.memory === '2' ? 'active' : ''}`}
                    onClick={() => setCommandConfig({ ...commandConfig, memory: '2' })}
                  >
                    2GB
                  </button>
                  <button
                    className={`memory-btn ${commandConfig.memory === '4' ? 'active' : ''}`}
                    onClick={() => setCommandConfig({ ...commandConfig, memory: '4' })}
                  >
                    4GB
                  </button>
                  <button
                    className={`memory-btn ${commandConfig.memory === '8' ? 'active' : ''}`}
                    onClick={() => setCommandConfig({ ...commandConfig, memory: '8' })}
                  >
                    8GB
                  </button>
                  <button
                    className={`memory-btn ${commandConfig.memory === '16' ? 'active' : ''}`}
                    onClick={() => setCommandConfig({ ...commandConfig, memory: '16' })}
                  >
                    16GB
                  </button>
                </div>
                <input
                  type="number"
                  value={commandConfig.memory}
                  onChange={(e) => setCommandConfig({ ...commandConfig, memory: e.target.value })}
                  placeholder="自定义内存大小"
                  style={{ marginTop: '8px' }}
                />
              </div>

              <div className="form-group">
                <label>服务器核心文件</label>
                <input
                  type="text"
                  value={commandConfig.jarFile}
                  onChange={(e) => setCommandConfig({ ...commandConfig, jarFile: e.target.value })}
                  placeholder="server.jar"
                />
                <small>核心 jar 文件名称</small>
              </div>

              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={commandConfig.useUtf8}
                    onChange={(e) => setCommandConfig({ ...commandConfig, useUtf8: e.target.checked })}
                  />
                  <span>启用 UTF-8 编码</span>
                </label>
                <small>推荐开启，避免中文乱码</small>
              </div>

              <div className="form-group">
                <label>高级启动参数（可选）</label>
                <textarea
                  value={commandConfig.advancedArgs}
                  onChange={(e) => setCommandConfig({ ...commandConfig, advancedArgs: e.target.value })}
                  placeholder="-"
                  rows="3"
                />
                <small>添加额外的 JVM 参数</small>
              </div>

              <div className="command-preview">
                <label>生成的命令预览：</label>
                <code>{generateStartCommand()}</code>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setShowCommandModal(false)}>
                取消
              </button>
              <button className="btn-save" onClick={handleApplyCommand}>
                <Save size={16} />
                <span>应用命令</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {showPluginsModal && (
        <div className="modal-overlay" onClick={() => setShowPluginsModal(false)}>
          <div className="modal-content plugins-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>插件管理 (仅支持Java版服务器)</h2>
              <button className="btn-close-modal" onClick={() => setShowPluginsModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              {/* 已安装插件列表 */}
              <div className="plugins-section">
                <h3>已安装插件 ({installedPlugins.length})</h3>
                {installedPlugins.length === 0 ? (
                  <p className="empty-hint">暂无已安装的插件</p>
                ) : (
                  <div className="installed-plugins-list">
                    {installedPlugins.map((plugin, index) => (
                      <div key={index} className="plugin-item installed">
                        <span className="plugin-name">{plugin}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 插件搜索 */}
              <div className="plugins-section">
                <h3>下载插件</h3>

                {/* 搜索栏 */}
                <div className="search-bar">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && searchPlugins()}
                    placeholder="搜索插件..."
                  />
                  <button className="btn-search" onClick={searchPlugins} disabled={loadingPlugins}>
                    <Search size={16} />
                    <span>搜索</span>
                  </button>
                </div>

                {/* 高级筛选 */}
                <details className="filters-section">
                  <summary>
                    <Filter size={14} />
                    <span>高级筛选</span>
                  </summary>
                  <div className="filters-content">
                    <div className="filter-group">
                      <label>Minecraft 版本</label>
                      <input
                        type="text"
                        value={searchFilters.version}
                        onChange={(e) => setSearchFilters({ ...searchFilters, version: e.target.value })}
                        placeholder="-"
                      />
                    </div>
                    <div className="filter-group">
                      <label>服务端类型</label>
                      <select
                        value={searchFilters.loader}
                        onChange={(e) => setSearchFilters({ ...searchFilters, loader: e.target.value })}
                      >
                        <option value="paper">Paper</option>
                        <option value="spigot">Spigot</option>
                        <option value="purpur">Purpur</option>
                        <option value="bukkit">Bukkit</option>
                      </select>
                    </div>
                  </div>
                </details>

                {/* 搜索结果 */}
                {loadingPlugins ? (
                  <div className="loading-plugins">加载中...</div>
                ) : selectedPlugin ? (
                  <div className="plugin-versions">
                    <button className="btn-back-search" onClick={() => {
                      setSelectedPlugin(null)
                      setPluginVersions([])
                    }}>
                      <ArrowLeft size={14} />
                      <span>返回搜索结果</span>
                    </button>
                    <h4>{selectedPlugin.title}</h4>
                    <p className="plugin-description">{selectedPlugin.description}</p>
                    <div className="versions-list">
                      {pluginVersions.map((version) => (
                        <div key={version.id} className="version-item">
                          <div className="version-info">
                            <span className="version-name">{version.name}</span>
                            <span className="version-game">{version.game_versions?.join(', ')}</span>
                          </div>
                          <button
                            className="btn-download-version"
                            onClick={() => downloadPlugin(
                              selectedPlugin.project_id,
                              version.id,
                              version.files[0]?.filename,
                              version.files[0]?.url
                            )}
                          >
                            <Download size={14} />
                            <span>下载</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : searchResults.length > 0 ? (
                  <div className="search-results">
                    {searchResults.map((plugin) => (
                      <div key={plugin.project_id} className="plugin-item searchable" onClick={() => {
                        setSelectedPlugin(plugin)
                        loadPluginVersions(plugin.project_id)
                      }}>
                        <div className="plugin-info">
                          <span className="plugin-title">{plugin.title}</span>
                          <span className="plugin-desc">{plugin.description}</span>
                          <span className="plugin-downloads">下载: {plugin.downloads?.toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : searchQuery ? (
                  <p className="empty-hint">-</p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>项目设置</h2>
            </div>

            <div className="modal-body">
              {(project.type === 'custom' || project.type === 'minecraft') && (
                <>
                  <div className="form-group">
                    <label>启动命令</label>
                    <input
                      type="text"
                      value={formData.startCommand}
                      onChange={(e) => setFormData({ ...formData, startCommand: e.target.value })}
                      placeholder={project.type === 'minecraft' ? '启动命令' : '启动命令'}
                    />
                  </div>

                  <div className="form-group">
                    <label>停止命令</label>
                    <input
                      type="text"
                      value={formData.stopCommand}
                      onChange={(e) => setFormData({ ...formData, stopCommand: e.target.value })}
                      placeholder={project.type === 'minecraft' ? '默认: stop' : '默认: ^C'}
                    />
                  </div>

                  <div className="form-group">
                    <label>端口号（可选）</label>
                    <input
                      type="number"
                      value={formData.port || ''}
                      onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) || null })}
                      placeholder={project.type === 'minecraft' ? '25565' : '如果项目需要端口可填写'}
                    />
                  </div>
                </>
              )}

              {project.type === 'static' && (
                <div className="form-group">
                  <label>端口号</label>
                  <input
                    type="number"
                    value={formData.port}
                    onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) || '' })}
                    placeholder="8080"
                  />
                </div>
              )}

              {project.type === 'docker' && formData.dockerConfig && (
                <>
                  <div className="form-group">
                    <label>Docker Compose 文件</label>
                    <input
                      type="text"
                      value={formData.dockerConfig.dockerComposeFile || ''}
                      onChange={(e) => setFormData({ ...formData, dockerConfig: { ...formData.dockerConfig, dockerComposeFile: e.target.value } })}
                      placeholder="例如: docker-compose.yml"
                    />
                    <small>填写后将使用 Compose 模式</small>
                  </div>
                  <div className="form-group">
                    <label>镜像名称</label>
                    <input
                      type="text"
                      value={formData.dockerConfig.image || ''}
                      onChange={(e) => setFormData({ ...formData, dockerConfig: { ...formData.dockerConfig, image: e.target.value } })}
                      placeholder="例如: nginx:latest"
                    />
                  </div>
                  <div className="form-group">
                    <label>容器名称</label>
                    <input
                      type="text"
                      value={formData.dockerConfig.containerName || ''}
                      onChange={(e) => setFormData({ ...formData, dockerConfig: { ...formData.dockerConfig, containerName: e.target.value } })}
                      placeholder="留空自动生成"
                    />
                  </div>
                  <div className="form-group">
                    <label>端口映射</label>
                    <input
                      type="text"
                      value={formData.dockerConfig.ports || ''}
                      onChange={(e) => setFormData({ ...formData, dockerConfig: { ...formData.dockerConfig, ports: e.target.value } })}
                      placeholder="例如: 8080:80, 3306:3306"
                    />
                    <small>多个端口用逗号分隔</small>
                  </div>
                  <div className="form-group">
                    <label>卷挂载</label>
                    <input
                      type="text"
                      value={formData.dockerConfig.volumes || ''}
                      onChange={(e) => setFormData({ ...formData, dockerConfig: { ...formData.dockerConfig, volumes: e.target.value } })}
                      placeholder="例如: ./data:/app/data"
                    />
                    <small>多个挂载用逗号分隔</small>
                  </div>
                  <div className="form-group">
                    <label>环境变量</label>
                    <input
                      type="text"
                      value={formData.dockerConfig.envVars || ''}
                      onChange={(e) => setFormData({ ...formData, dockerConfig: { ...formData.dockerConfig, envVars: e.target.value } })}
                      placeholder="例如: NODE_ENV=production, PORT=3000"
                    />
                    <small>多个变量用逗号分隔</small>
                  </div>
                  <div className="form-group">
                    <label>额外参数</label>
                    <input
                      type="text"
                      value={formData.dockerConfig.extraArgs || ''}
                      onChange={(e) => setFormData({ ...formData, dockerConfig: { ...formData.dockerConfig, extraArgs: e.target.value } })}
                      placeholder="例如: --restart=always"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setShowSettings(false)}>
                取消
              </button>
              <button className="btn-save" onClick={handleSaveSettings} disabled={loading}>
                <Save size={16} />
                <span>保存</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {showJavaModal && (
        <div className="modal-overlay" onClick={() => setShowJavaModal(false)}>
          <div className="modal-content core-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Java 环境管理</h2>
              <button className="btn-close-modal" onClick={() => setShowJavaModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              {loadingJava ? (
                <div className="loading-plugins">加载中...</div>
              ) : (
                <>
                  <div className="plugins-section">
                    <h3>已安装的 Java</h3>
                    {installedJavas.length === 0 ? (
                      <p className="empty-hint">未检测到 Java 环境</p>
                    ) : (
                      <div className="versions-list">
                        {installedJavas.map((j, i) => (
                          <div key={i} className="version-item">
                            <div className="version-info">
                              <span className="version-name">{j.label}</span>
                              <span className="version-game">{j.path}</span>
                            </div>
                            <button
                              className={`btn-download-version ${project.javaPath === j.path ? 'active' : ''}`}
                              onClick={() => handleSelectJava(j.path)}
                              style={project.javaPath === j.path ? { background: 'hsl(208, 40%, 35%)' } : {}}
                            >
                              {project.javaPath === j.path ? '当前' : '使用'}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="plugins-section">
                    <h3>下载 Java (Adoptium)</h3>
                    {availableJavas.length === 0 ? (
                      <p className="empty-hint">无法获取可用版本</p>
                    ) : (
                      <div className="versions-list">
                        {availableJavas.map((v) => (
                          <div key={v.version} className="version-item">
                            <div className="version-info">
                              <span className="version-name">Java {v.version}</span>
                              <span className="version-game">{v.fullVersion} ({(v.size / 1024 / 1024).toFixed(0)} MB)</span>
                            </div>
                            <button
                              className="btn-download-version"
                              onClick={() => handleDownloadJava(v)}
                              disabled={!v.downloadUrl}
                            >
                              <Download size={14} />
                              <span>下载</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <small style={{ marginTop: '8px', display: 'block' }}>下载完成后刷新此页面即可选择使用</small>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {showJavaHint && (
        <div className="modal-overlay" onClick={() => setShowJavaHint(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>启动命令提示</h2>
              <button className="btn-close-modal" onClick={() => setShowJavaHint(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ margin: '0 0 12px', color: 'hsl(272, 15%, 42%)' }}>
                当前启动命令中未包含 <code>java</code>，且未配置 Java 路径。
              </p>
              {project.javaPath && (
                <p style={{ margin: '0 0 12px', fontSize: '13px', color: 'hsl(272, 15%, 50%)' }}>
                  已配置 Java 路径: <code>{project.javaPath}</code>
                </p>
              )}
              <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'hsl(272, 15%, 50%)' }}>
                建议先在「Java 环境」卡片中选择 Java，或在「启动命令生成」中生成包含 java 的命令。
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setShowJavaHint(false)}>取消</button>
              <button className="btn-save" onClick={() => { setShowJavaHint(false); handleStart() }}>
                <Play size={16} />
                <span>仍然启动</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ProjectDetail
