import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import './DeleteProjectDialog.css'

function DeleteProjectDialog({ projectName, onConfirm, onCancel }) {
  const [deleteFiles, setDeleteFiles] = useState(false)

  const handleConfirm = () => {
    onConfirm(deleteFiles)
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="delete-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="delete-dialog-header">
          <AlertTriangle size={24} color="hsl(0, 84%, 60%)" />
          <h2>删除项目</h2>
        </div>

        <div className="delete-dialog-body">
          <p>确定要删除项目 <strong>{projectName}</strong> 吗？</p>

          <label className="delete-option">
            <input
              type="checkbox"
              checked={deleteFiles}
              onChange={(e) => setDeleteFiles(e.target.checked)}
            />
            <span>同时删除项目文件</span>
          </label>

          {deleteFiles && (
            <p className="warning-text">
              <span>警告！此操作无法撤回。</span>
            </p>
          )}
        </div>

        <div className="delete-dialog-footer">
          <button className="btn-cancel" onClick={onCancel}>
            取消
          </button>
          <button className="btn-delete-confirm" onClick={handleConfirm}>
            删除
          </button>
        </div>
      </div>
    </div>
  )
}

export default DeleteProjectDialog
