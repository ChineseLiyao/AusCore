import { useState, useEffect, useRef } from 'react'
import { Folder, File, ChevronRight, Edit, Trash2, X, Save, Upload, Download, Archive, FolderInput, Move, Edit2 } from 'lucide-react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import Editor from '@monaco-editor/react'
import './Files.css'
import { API_BASE } from '../config'

const MAX_EDIT_SIZE = 5 * 1024 * 1024 // 5MB

function Files({ toast, confirm }) {
  const params = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const fileInputRef = useRef(null)
  const dropZoneRef = useRef(null)
  const [files, setFiles] = useState([])
  const [selectedFiles, setSelectedFiles] = useState(new Set())
  const [editingFile, setEditingFile] = useState(null)
  const [fileContent, setFileContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [renamingFile, setRenamingFile] = useState(null)
  const [newFileName, setNewFileName] = useState('')
  const [movingFile, setMovingFile] = useState(null)

  // 从路由路径获取当前目录路径
  const currentPath = params['*'] ? '/' + params['*'] : '/'

  useEffect(() => {
    fetchFiles(currentPath)
  }, [currentPath])

  // 拖拽上传处理
  useEffect(() => {
    const dropZone = dropZoneRef.current
    if (!dropZone) return

    const handleDragEnter = (e) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(true)
    }

    const handleDragLeave = (e) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.target === dropZone) {
        setIsDragging(false)
      }
    }

    const handleDragOver = (e) => {
      e.preventDefault()
      e.stopPropagation()
    }

    const handleDrop = async (e) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)

      const droppedFiles = Array.from(e.dataTransfer.files)
      if (droppedFiles.length > 0) {
        await uploadFiles(droppedFiles)
      }
    }

    dropZone.addEventListener('dragenter', handleDragEnter)
    dropZone.addEventListener('dragleave', handleDragLeave)
    dropZone.addEventListener('dragover', handleDragOver)
    dropZone.addEventListener('drop', handleDrop)

    return () => {
      dropZone.removeEventListener('dragenter', handleDragEnter)
      dropZone.removeEventListener('dragleave', handleDragLeave)
      dropZone.removeEventListener('dragover', handleDragOver)
      dropZone.removeEventListener('drop', handleDrop)
    }
  }, [currentPath])

  const fetchFiles = async (path) => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`${API_BASE}/api/files?path=${encodeURIComponent(path)}`)
      if (!response.ok) throw new Error('Failed to fetch files')
      const data = await response.json()
      setFiles(data.files)
    } catch (err) {
      setError('无法加载文件列表')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleFileClick = async (file) => {
    if (file.type === 'directory') {
      const newPath = currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`
      navigate(`/files${newPath}`, { state: location.state })
    } else {
      if (file.size > MAX_EDIT_SIZE) {
        toast.warning(`文件大小超过 ${(MAX_EDIT_SIZE / 1024 / 1024).toFixed(0)}MB，无法在线编辑`)
        return
      }
      await openFileEditor(file)
    }
  }

  const openFileEditor = async (file) => {
    setLoading(true)
    try {
      const filePath = currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`
      const response = await fetch(`${API_BASE}/api/files/read?path=${encodeURIComponent(filePath)}`)
      if (!response.ok) throw new Error('Failed to read file')
      const data = await response.json()
      setFileContent(data.content)
      setEditingFile({ ...file, path: filePath })
    } catch (err) {
      toast.error('无法读取文件内容')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveFile = async () => {
    if (!editingFile) return
    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/api/files/write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: editingFile.path,
          content: fileContent
        })
      })
      if (!response.ok) throw new Error('Failed to save file')
      setError(null)
      toast.success('文件已保存到服务器')
    } catch (err) {
      setError('保存文件失败')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const getFileLanguage = (filename) => {
    const ext = filename.split('.').pop().toLowerCase()
    const languageMap = {
      'js': 'javascript',
      'jsx': 'javascript',
      'ts': 'typescript',
      'tsx': 'typescript',
      'json': 'json',
      'html': 'html',
      'htm': 'html',
      'css': 'css',
      'scss': 'scss',
      'less': 'less',
      'md': 'markdown',
      'py': 'python',
      'java': 'java',
      'cpp': 'cpp',
      'c': 'c',
      'cs': 'csharp',
      'php': 'php',
      'rb': 'ruby',
      'go': 'go',
      'rs': 'rust',
      'sql': 'sql',
      'xml': 'xml',
      'yaml': 'yaml',
      'yml': 'yaml',
      'sh': 'shell',
      'bash': 'shell',
      'txt': 'plaintext'
    }
    return languageMap[ext] || 'plaintext'
  }

  const handleDeleteFile = async (file) => {
    const confirmed = await confirm(`确定要删除 ${file.name} 吗？`)
    if (!confirmed) return
    
    try {
      const filePath = currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`
      const response = await fetch(`${API_BASE}/api/files/delete?path=${encodeURIComponent(filePath)}`, {
        method: 'DELETE'
      })
      if (!response.ok) throw new Error('Failed to delete file')
      fetchFiles(currentPath)
      toast.success('文件已删除')
    } catch (err) {
      toast.error('删除文件失败')
      console.error(err)
    }
  }

  const uploadFiles = async (filesList) => {
    if (filesList.length === 0) return

    const formData = new FormData()
    filesList.forEach(file => formData.append('files', file))
    formData.append('path', currentPath)

    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/api/files/upload-batch`, {
        method: 'POST',
        body: formData
      })
      if (!response.ok) throw new Error('Failed to upload files')
      const data = await response.json()
      
      fetchFiles(currentPath)
      
      if (data.summary.failed > 0) {
        toast.warning(`上传完成：${data.summary.success} 成功，${data.summary.failed} 失败`)
      } else {
        toast.success(`成功上传 ${data.summary.success} 个文件`)
      }
    } catch (err) {
      toast.error('文件上传失败')
      console.error(err)
    } finally {
      setLoading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleUpload = async (e) => {
    const filesList = Array.from(e.target.files || [])
    await uploadFiles(filesList)
  }

  const handleDeleteSelected = async () => {
    if (selectedFiles.size === 0) {
      toast.warning('请先选择要删除的文件')
      return
    }

    const confirmed = await confirm(`确定要删除选中的 ${selectedFiles.size} 个项目吗？`)
    if (!confirmed) return

    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/api/files/delete-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: currentPath,
          items: Array.from(selectedFiles)
        })
      })
      if (!response.ok) throw new Error('Failed to delete files')
      const data = await response.json()
      
      fetchFiles(currentPath)
      setSelectedFiles(new Set())
      
      if (data.summary.failed > 0) {
        toast.warning(`删除完成：${data.summary.success} 成功，${data.summary.failed} 失败`)
      } else {
        toast.success(`成功删除 ${data.summary.success} 个项目`)
      }
    } catch (err) {
      toast.error('删除失败')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = async (file) => {
    try {
      const filePath = currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`
      window.open(`${API_BASE}/api/files/download?path=${encodeURIComponent(filePath)}`, '_blank')
    } catch (err) {
      toast.error('下载失败')
      console.error(err)
    }
  }

  const handleRename = (file) => {
    setRenamingFile(file)
    setNewFileName(file.name)
  }

  const handleRenameSubmit = async () => {
    if (!renamingFile || !newFileName.trim()) return

    if (newFileName === renamingFile.name) {
      setRenamingFile(null)
      return
    }

    setLoading(true)
    try {
      const filePath = currentPath === '/' ? `/${renamingFile.name}` : `${currentPath}/${renamingFile.name}`
      const response = await fetch(`${API_BASE}/api/files/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: filePath,
          newName: newFileName.trim()
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error)
      }

      toast.success('重命名成功')
      fetchFiles(currentPath)
      setRenamingFile(null)
      setNewFileName('')
    } catch (err) {
      toast.error(err.message || '重命名失败')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleMove = (file) => {
    setMovingFile(file)
  }

  const handleMoveSubmit = async (targetPath) => {
    if (!movingFile) return

    setLoading(true)
    try {
      const sourcePath = currentPath === '/' ? `/${movingFile.name}` : `${currentPath}/${movingFile.name}`
      const response = await fetch(`${API_BASE}/api/files/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourcePath,
          targetPath
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error)
      }

      toast.success('移动成功')
      fetchFiles(currentPath)
      setMovingFile(null)
    } catch (err) {
      toast.error(err.message || '移动失败')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleCompress = async () => {
    if (selectedFiles.size === 0) {
      toast.warning('请先选择要压缩的文件')
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/api/files/compress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: currentPath,
          items: Array.from(selectedFiles)
        })
      })
      if (!response.ok) throw new Error('Failed to compress')
      const data = await response.json()
      fetchFiles(currentPath)
      setSelectedFiles(new Set())
      toast.success(`已压缩为 ${data.filename}`)
    } catch (err) {
      toast.error('压缩失败')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleExtract = async (file) => {
    if (!file.name.endsWith('.zip')) {
      toast.warning('只支持解压 .zip 文件')
      return
    }

    setLoading(true)
    try {
      const filePath = currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`
      const response = await fetch(`${API_BASE}/api/files/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath })
      })
      if (!response.ok) throw new Error('Failed to extract')
      fetchFiles(currentPath)
      toast.success('解压成功')
    } catch (err) {
      toast.error('解压失败')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const toggleFileSelection = (fileName) => {
    setSelectedFiles(prev => {
      const newSet = new Set(prev)
      if (newSet.has(fileName)) {
        newSet.delete(fileName)
      } else {
        newSet.add(fileName)
      }
      return newSet
    })
  }

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  const goToParent = () => {
    const parts = currentPath.split('/').filter(p => p)
    parts.pop()
    const newPath = parts.length === 0 ? '' : '/' + parts.join('/')
    navigate(`/files${newPath}`, { state: location.state })
  }

  if (editingFile) {
    return (
      <div className="files-page">
        {error && <div className="error-banner">{error}</div>}
        <div className="editor-header">
          <div className="editor-title">
            <File size={20} />
            <span>{editingFile.name}</span>
            <span className="file-size">({formatSize(editingFile.size)})</span>
          </div>
          <div className="editor-actions">
            <button className="btn-save" onClick={handleSaveFile} disabled={loading}>
              <Save size={16} />
              <span>{loading ? '保存中...' : '保存'}</span>
            </button>
            <button className="btn-close" onClick={() => {
              setEditingFile(null)
              setFileContent('')
              setError(null)
            }}>
              <X size={16} />
              <span>关闭</span>
            </button>
          </div>
        </div>
        <div className="editor-container">
          <Editor
            height="calc(100vh - 140px)"
            language={getFileLanguage(editingFile.name)}
            value={fileContent}
            onChange={(value) => setFileContent(value || '')}
            theme="vs-dark"
            options={{
              fontSize: 14,
              minimap: { enabled: true },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
              wordWrap: 'on',
              formatOnPaste: true,
              formatOnType: true
            }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="files-page">
      <div className="files-header">
        <h1 className="files-title">文件管理</h1>
        <div className="files-toolbar">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={handleUpload}
          />
          <button className="btn-toolbar" onClick={() => fileInputRef.current?.click()} disabled={loading}>
            <Upload size={16} />
            <span>上传</span>
          </button>
          <button className="btn-toolbar" onClick={handleCompress} disabled={loading || selectedFiles.size === 0}>
            <Archive size={16} />
            <span>压缩</span>
          </button>
          <button className="btn-toolbar btn-delete" onClick={handleDeleteSelected} disabled={loading || selectedFiles.size === 0}>
            <Trash2 size={16} />
            <span>删除</span>
          </button>
          {selectedFiles.size > 0 && (
            <span className="selection-count">{selectedFiles.size} 项已选</span>
          )}
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div 
        ref={dropZoneRef}
        className={`files-content ${isDragging ? 'dragging' : ''}`}
      >
        {isDragging && (
          <div className="drop-overlay">
            <Upload size={48} />
            <p>拖放文件到这里上传</p>
          </div>
        )}
        
        {currentPath !== '/' && (
          <div className="file-item" onClick={goToParent}>
            <Folder size={20} color="hsl(208, 40%, 35%)" />
            <span className="file-name">..</span>
          </div>
        )}

        {loading ? (
          <div className="loading">加载中...</div>
        ) : files.length === 0 ? (
          <div className="empty-state">此目录为空</div>
        ) : (
          files.map((file, index) => (
            <div key={index} className={`file-item ${selectedFiles.has(file.name) ? 'selected' : ''}`}>
              <input
                type="checkbox"
                checked={selectedFiles.has(file.name)}
                onChange={() => toggleFileSelection(file.name)}
                onClick={(e) => e.stopPropagation()}
              />
              <div className="file-info" onClick={() => handleFileClick(file)}>
                {file.type === 'directory' ? (
                  <Folder size={20} color="hsl(208, 40%, 35%)" />
                ) : (
                  <File size={20} color="hsl(272, 15%, 42%)" />
                )}
                {renamingFile?.name === file.name ? (
                  <input
                    type="text"
                    className="rename-input"
                    value={newFileName}
                    onChange={(e) => setNewFileName(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleRenameSubmit()}
                    onBlur={handleRenameSubmit}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className="file-name">{file.name}</span>
                )}
                {file.type === 'file' && !renamingFile && (
                  <span className="file-size">{formatSize(file.size)}</span>
                )}
              </div>
              <div className="file-actions">
                <button className="btn-icon" onClick={() => handleRename(file)} title="重命名">
                  <Edit2 size={16} />
                </button>
                <button className="btn-icon" onClick={() => handleMove(file)} title="移动">
                  <Move size={16} />
                </button>
                {file.type === 'file' && (
                  <>
                    <button className="btn-icon" onClick={() => handleDownload(file)} title="下载">
                      <Download size={16} />
                    </button>
                    {file.name.endsWith('.zip') ? (
                      <button className="btn-icon" onClick={() => handleExtract(file)} title="解压">
                        <FolderInput size={16} />
                      </button>
                    ) : (
                      <button className="btn-icon" disabled style={{ opacity: 0, pointerEvents: 'none' }}>
                        <FolderInput size={16} />
                      </button>
                    )}
                    {file.size <= MAX_EDIT_SIZE ? (
                      <button className="btn-icon" onClick={() => openFileEditor(file)} title="编辑">
                        <Edit size={16} />
                      </button>
                    ) : (
                      <button className="btn-icon" disabled style={{ opacity: 0, pointerEvents: 'none' }}>
                        <Edit size={16} />
                      </button>
                    )}
                  </>
                )}
                {file.type === 'directory' && (
                  <>
                    <button className="btn-icon" disabled style={{ opacity: 0, pointerEvents: 'none' }}>
                      <Download size={16} />
                    </button>
                    <button className="btn-icon" disabled style={{ opacity: 0, pointerEvents: 'none' }}>
                      <FolderInput size={16} />
                    </button>
                    <button className="btn-icon" disabled style={{ opacity: 0, pointerEvents: 'none' }}>
                      <Edit size={16} />
                    </button>
                  </>
                )}
                <button className="btn-icon" onClick={() => handleDeleteFile(file)} title="删除">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 移动文件模态框 */}
      {movingFile && (
        <div className="modal-overlay" onClick={() => setMovingFile(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>移动 {movingFile.name}</h2>
              <button className="btn-close-modal" onClick={() => setMovingFile(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <p className="modal-hint">选择目标位置：</p>
              <div className="path-selector">
                <button 
                  className="path-option"
                  onClick={() => {
                    handleMoveSubmit('/')
                  }}
                >
                  <Folder size={16} />
                  <span>根目录 (/)</span>
                </button>
                {currentPath !== '/' && (
                  <button 
                    className="path-option"
                    onClick={() => {
                      const parts = currentPath.split('/').filter(p => p)
                      parts.pop()
                      const parentPath = parts.length === 0 ? '/' : '/' + parts.join('/')
                      handleMoveSubmit(parentPath)
                    }}
                  >
                    <Folder size={16} />
                    <span>上级目录</span>
                  </button>
                )}
                {files.filter(f => f.type === 'directory' && f.name !== movingFile.name).map((dir) => (
                  <button 
                    key={dir.name}
                    className="path-option"
                    onClick={() => {
                      const targetPath = currentPath === '/' ? `/${dir.name}` : `${currentPath}/${dir.name}`
                      handleMoveSubmit(targetPath)
                    }}
                  >
                    <Folder size={16} />
                    <span>{dir.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Files
