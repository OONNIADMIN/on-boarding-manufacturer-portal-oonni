'use client'

import styles from './ConfirmDialog.module.scss'

type ConfirmDialogProps = {
  isOpen: boolean
  title: string
  message: string
  confirmLabel?: string
  isLoading?: boolean
  onCancel: () => void
  onConfirm: () => void
}

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Delete',
  isLoading = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  if (!isOpen) return null

  return (
    <div className={styles.overlay} onClick={() => !isLoading && onCancel()}>
      <div className={styles.modal} onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.message}>{message}</p>
        <div className={styles.actions}>
          <button type="button" className={styles.cancelButton} onClick={onCancel} disabled={isLoading}>
            Cancel
          </button>
          <button type="button" className={styles.confirmButton} onClick={onConfirm} disabled={isLoading}>
            {isLoading ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
