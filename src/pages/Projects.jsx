import { useState, useEffect } from 'react'
import { Plus, Globe, X, Play, Square, Trash2, ExternalLink, GripVertical, FolderOpen, Settings } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import DeleteProjectDialog from '../components/DeleteProjectDialog'
import './Projects.css'
import { API_BASE } from '../config'

function Projects({ toast, confirm }) {
  const navigate = useNavigate()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [deleteProject, setDeleteProject] = useState(null)
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(false)
  const [draggedItem, setDraggedItem] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    type: 'static',
    port: '',
    startCommand: '',
    dockerConfig: {
      image: '',
      containerName: '',
      ports: '',
      volumes: '',
      envVars: '',
      extraArgs: '',
      dockerComposeFile: ''
    }
  })

  useEffect(() => {
    fetchProjects()
  }, [])

  useEffect(() => {
    // 切换类型时重置端口
    if (formData.type === 'static') {
      setFormData(prev => ({ ...prev, port: '' }))
    } else {
      setFormData(prev => ({ ...prev, port: '' }))
    }
  }, [formData.type])

  const fetchProjects = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/projects`)
      if (!response.ok) throw new Error('Failed to fetch projects')
      const data = await response.json()
      setProjects(data.projects)
    } catch (err) {
      console.error(err)
    }
  }

  const handleCreateProject = async () => {
    if (!formData.name) {
      toast.warning('请填写项目名称')
      return
    }
    
    // 验证 Docker 项目配置
    if (formData.type === 'docker') {
      if (!formData.dockerConfig.dockerComposeFile && !formData.dockerConfig.image) {
        toast.warning('Docker 项目需要填写镜像名称或 Compose 文件')
        return
      }
    }

    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/api/projects/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create project')
      }
      
      await fetchProjects()
      setShowCreateModal(false)
      setFormData({ name: '', type: 'static', port: '', startCommand: '', dockerConfig: { image: '', containerName: '', ports: '', volumes: '', envVars: '', extraArgs: '', dockerComposeFile: '' } })
      toast.success('项目创建成功')
    } catch (err) {
      toast.error(err.message || '创建项目失败')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleStartProject = async (projectId) => {
    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/api/projects/${projectId}/start`, {
        method: 'POST'
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to start project')
      }
      await fetchProjects()
      toast.success('项目启动成功')
    } catch (err) {
      toast.error(err.message || '启动项目失败')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleStopProject = async (projectId) => {
    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/api/projects/${projectId}/stop`, {
        method: 'POST'
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to stop project')
      }
      await fetchProjects()
      toast.success('项目已停止')
    } catch (err) {
      toast.error(err.message || '停止项目失败')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteProject = async (deleteFiles) => {
    if (!deleteProject) return

    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/api/projects/${deleteProject.id}?deleteFiles=${deleteFiles}`, {
        method: 'DELETE'
      })
      if (!response.ok) throw new Error('Failed to delete project')
      await fetchProjects()
      setDeleteProject(null)
      toast.success(deleteFiles ? '项目及文件已删除' : '项目已删除')
    } catch (err) {
      toast.error('删除项目失败')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleDragStart = (e, index) => {
    setDraggedItem(index)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e, index) => {
    e.preventDefault()
    if (draggedItem === null || draggedItem === index) return

    const newProjects = [...projects]
    const draggedProject = newProjects[draggedItem]
    newProjects.splice(draggedItem, 1)
    newProjects.splice(index, 0, draggedProject)

    setProjects(newProjects)
    setDraggedItem(index)
  }

  const handleDragEnd = () => {
    setDraggedItem(null)
  }

  const handleOpenFolder = (projectPath) => {
    try {
      let normalizedPath = projectPath.replace(/\\/g, '/')
      const serverIndex = normalizedPath.lastIndexOf('/server/')
      
      if (serverIndex !== -1) {
        let relativePath = normalizedPath.substring(serverIndex + 8)
        if (!relativePath.startsWith('/')) {
          relativePath = '/' + relativePath
        }
        navigate(`/files${relativePath}`)
      } else {
        const pathParts = normalizedPath.split('/').filter(p => p)
        const projectName = pathParts[pathParts.length - 1]
        navigate(`/files/${projectName}`)
      }
    } catch (err) {
      console.error('Path parsing error:', err)
      toast.error('无法解析项目路径')
    }
  }

  return (
    <div className="projects-page">
      <div className="projects-header">
        <h1 className="projects-title">项目</h1>
        <div className="projects-actions">
          <button className="btn-new" onClick={() => setShowCreateModal(true)}>
            <Plus size={16} />
            <span>新建</span>
          </button>
        </div>
      </div>
      
      <div className="projects-content">
        {projects.length === 0 ? (
          <div className="empty-state">
            <p>暂无项目</p>
            <p className="empty-hint">点击"新建"按钮创建你的第一个项目</p>
          </div>
        ) : (
          <div className="projects-grid">
            {projects.map((project, index) => (
              <div
                key={project.id}
                className={`project-card ${draggedItem === index ? 'dragging' : ''}`}
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
              >
                <div className="drag-handle">
                  <GripVertical size={20} color="hsl(272, 15%, 70%)" />
                </div>
                <div className="project-icon">
                  <Globe size={32} />
                </div>
                <div className="project-info">
                  <h3 className="project-name">{project.name}</h3>
                  <div className="project-meta">
                    <span className="project-type">
                      {project.type === 'static' ? '静态网站' : project.type === 'minecraft' ? 'Minecraft 服务器' : project.type === 'docker' ? 'Docker 项目' : '自定义项目'}
                    </span>
                    <span className="project-port">端口: {project.port || '未设置'}</span>
                    <div className={`project-status ${project.status}`}>
                      {project.status === 'running' ? '运行中' : '已停止'}
                    </div>
                  </div>
                </div>
                <div className="project-actions">
                  <button 
                    className="btn-action btn-settings" 
                    onClick={() => navigate(`/projects/${project.id}`, { state: { projectName: project.name } })}
                    title="项目详情"
                  >
                    <Settings size={16} />
                  </button>
                  {project.status === 'stopped' ? (
                    <button 
                      className="btn-action btn-start" 
                      onClick={() => handleStartProject(project.id)}
                      disabled={loading}
                    >
                      <Play size={16} />
                      <span>启动</span>
                    </button>
                  ) : (
                    <>
                      <button 
                        className="btn-action btn-stop" 
                        onClick={() => handleStopProject(project.id)}
                        disabled={loading}
                      >
                        <Square size={16} />
                        <span>停止</span>
                      </button>
                      {project.type !== 'minecraft' && (
                        <a 
                          href={`http://localhost:${project.port}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="btn-action btn-open"
                        >
                          <ExternalLink size={16} />
                          <span>访问</span>
                        </a>
                      )}
                    </>
                  )}
                  <button 
                    className="btn-action btn-folder" 
                    onClick={() => handleOpenFolder(project.path)}
                    title="打开项目文件夹"
                  >
                    <FolderOpen size={16} />
                  </button>
                  <button 
                    className="btn-action btn-delete" 
                    onClick={() => setDeleteProject(project)}
                    disabled={loading}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>创建新项目</h2>
              <button className="btn-close-modal" onClick={() => setShowCreateModal(false)}>
                <X size={20} />
              </button>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label>项目名称</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="输入项目名称"
                />
              </div>

              <div className="form-group">
                <label>项目类型</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                >
                  <option value="static">静态网站</option>
                  <option value="custom">自定义项目</option>
                  <option value="minecraft">Minecraft 服务器</option>
                  <option value="docker">Docker 项目</option>
                </select>
              </div>

              {formData.type === 'static' && (
                <div className="form-group">
                  <label>端口号</label>
                  <input
                    type="number"
                    value={formData.port}
                    onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) || '' })}
                    placeholder="-"
                  />
                </div>
              )}

              {formData.type === 'custom' && (
                <>
                  <div className="form-group">
                    <label>端口号（可选）</label>
                    <input
                      type="number"
                      value={formData.port || ''}
                      onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) || null })}
                      placeholder="如果项目需要端口可填写"
                    />
                  </div>
                  <div className="form-group">
                    <label>启动命令（可选）</label>
                    <input
                      type="text"
                      value={formData.startCommand || ''}
                      onChange={(e) => setFormData({ ...formData, startCommand: e.target.value })}
                      placeholder="-"
                    />
                    <small>创建后可在详情页修改</small>
                  </div>
                </>
              )}

              {formData.type === 'minecraft' && (
                <>
                  <div className="form-group">
                    <label>服务器端口</label>
                    <input
                      type="number"
                      value={formData.port || 25565}
                      onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) || 25565 })}
                      placeholder="25565"
                    />
                  </div>
                  <div className="form-group">
                    <label>启动命令（可选）</label>
                    <input
                      type="text"
                      value={formData.startCommand || ''}
                      onChange={(e) => setFormData({ ...formData, startCommand: e.target.value })}
                      placeholder="-"
                    />
                    <small>创建后可在详情页配置核心和插件</small>
                  </div>
                </>
              )}

              {formData.type === 'docker' && (
                <>
                  <div className="form-group">
                    <label>Docker Compose 文件（可选）</label>
                    <input
                      type="text"
                      value={formData.dockerConfig.dockerComposeFile}
                      onChange={(e) => setFormData({ ...formData, dockerConfig: { ...formData.dockerConfig, dockerComposeFile: e.target.value } })}
                      placeholder="docker-compose.yml"
                    />
                    <small>填写后将使用 Compose 模式，忽略下方镜像配置</small>
                  </div>
                  <div className="form-group">
                    <label>镜像名称 {!formData.dockerConfig.dockerComposeFile && <span style={{color: 'red'}}>*</span>}</label>
                    <input
                      type="text"
                      value={formData.dockerConfig.image}
                      onChange={(e) => setFormData({ ...formData, dockerConfig: { ...formData.dockerConfig, image: e.target.value } })}
                      placeholder="nginx:latest"
                      required={!formData.dockerConfig.dockerComposeFile}
                    />
                  </div>
                  <div className="form-group">
                    <label>容器名称（可选）</label>
                    <input
                      type="text"
                      value={formData.dockerConfig.containerName}
                      onChange={(e) => setFormData({ ...formData, dockerConfig: { ...formData.dockerConfig, containerName: e.target.value } })}
                      placeholder="留空自动生成"
                    />
                  </div>
                  <div className="form-group">
                    <label>端口映射</label>
                    <input
                      type="text"
                      value={formData.dockerConfig.ports}
                      onChange={(e) => setFormData({ ...formData, dockerConfig: { ...formData.dockerConfig, ports: e.target.value } })}
                      placeholder="8080:80, 3306:3306"
                    />
                    <small>多个端口用逗号分隔</small>
                  </div>
                  <div className="form-group">
                    <label>卷挂载（可选）</label>
                    <input
                      type="text"
                      value={formData.dockerConfig.volumes}
                      onChange={(e) => setFormData({ ...formData, dockerConfig: { ...formData.dockerConfig, volumes: e.target.value } })}
                      placeholder="./data:/app/data"
                    />
                    <small>多个挂载用逗号分隔</small>
                  </div>
                  <div className="form-group">
                    <label>环境变量（可选）</label>
                    <input
                      type="text"
                      value={formData.dockerConfig.envVars}
                      onChange={(e) => setFormData({ ...formData, dockerConfig: { ...formData.dockerConfig, envVars: e.target.value } })}
                      placeholder="NODE_ENV=production, PORT=3000"
                    />
                    <small>多个变量用逗号分隔</small>
                  </div>
                </>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setShowCreateModal(false)}>
                取消
              </button>
              <button className="btn-create" onClick={handleCreateProject}>
                创建项目
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteProject && (
        <DeleteProjectDialog
          projectName={deleteProject.name}
          onConfirm={handleDeleteProject}
          onCancel={() => setDeleteProject(null)}
        />
      )}
    </div>
  )
}

export default Projects
