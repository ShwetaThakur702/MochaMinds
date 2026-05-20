import { useEffect, useState } from 'react'

export type ToastType = 'success' | 'error' | 'info'

export interface ToastMessage {
  id: number
  type: ToastType
  text: string
}

interface ToastItemProps {
  toast: ToastMessage
  onDismiss: (id: number) => void
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Trigger enter animation
    requestAnimationFrame(() => setVisible(true))
    const t = setTimeout(() => {
      setVisible(false)
      setTimeout(() => onDismiss(toast.id), 300)
    }, 4000)
    return () => clearTimeout(t)
  }, [toast.id, onDismiss])

  const icon = toast.type === 'success' ? '✅' : toast.type === 'error' ? '❌' : 'ℹ️'

  return (
    <div className={`toast toast-${toast.type} ${visible ? 'toast-visible' : ''}`}>
      <span className="toast-icon">{icon}</span>
      <span className="toast-text">{toast.text}</span>
      <button className="toast-close" onClick={() => onDismiss(toast.id)} aria-label="Dismiss">×</button>
    </div>
  )
}

interface ToastContainerProps {
  toasts: ToastMessage[]
  onDismiss: (id: number) => void
}

export default function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  )
}
