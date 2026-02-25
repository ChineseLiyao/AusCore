import { AlertTriangle } from 'lucide-react'
import './ConfirmDialog.css'

function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-icon">
          <AlertTriangle size={48} />
        </div>
        <div className="confirm-message">{message}</div>
        <div className="confirm-actions">
          <button className="btn-confirm-cancel" onClick={onCancel}>
            取消
          </button>
          <button className="btn-confirm-ok" onClick={onConfirm}>
            确定
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmDialog
