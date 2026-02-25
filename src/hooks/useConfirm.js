import { useState, useCallback } from 'react'

export function useConfirm() {
  const [confirmState, setConfirmState] = useState(null)

  const confirm = useCallback((message) => {
    return new Promise((resolve) => {
      setConfirmState({
        message,
        onConfirm: () => {
          setConfirmState(null)
          resolve(true)
        },
        onCancel: () => {
          setConfirmState(null)
          resolve(false)
        }
      })
    })
  }, [])

  return { confirmState, confirm }
}
