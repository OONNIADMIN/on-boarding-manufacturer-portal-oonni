'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MoreHorizontal, Eye, Pencil, Trash2 } from 'lucide-react'
import styles from './RowActions.module.scss'

type RowActionsProps = {
  viewLabel?: string
  editLabel?: string
  deleteLabel?: string
  onView: () => void
  onEdit: () => void
  onDelete: () => void
}

export default function RowActions({
  viewLabel = 'View',
  editLabel = 'Edit',
  deleteLabel = 'Delete',
  onView,
  onEdit,
  onDelete,
}: RowActionsProps) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, right: 0 })

  const close = () => setOpen(false)

  const toggle = () => {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (rect) {
      setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    }
    setOpen((prev) => !prev)
  }

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return
      close()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    const onReposition = () => close()
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onReposition, true)
    window.addEventListener('resize', onReposition)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onReposition, true)
      window.removeEventListener('resize', onReposition)
    }
  }, [open])

  return (
    <div className={styles.wrap} onClick={(event) => event.stopPropagation()}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Row actions"
        onClick={toggle}
      >
        <MoreHorizontal size={16} />
      </button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              className={styles.menu}
              style={{ top: pos.top, right: pos.right }}
              role="menu"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  close()
                  onView()
                }}
              >
                <Eye size={14} />
                {viewLabel}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  close()
                  onEdit()
                }}
              >
                <Pencil size={14} />
                {editLabel}
              </button>
              <button
                type="button"
                role="menuitem"
                className={styles.danger}
                onClick={() => {
                  close()
                  onDelete()
                }}
              >
                <Trash2 size={14} />
                {deleteLabel}
              </button>
            </div>,
            document.body
          )
        : null}
    </div>
  )
}
