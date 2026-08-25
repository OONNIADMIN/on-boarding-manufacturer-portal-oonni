'use client'

import { useEffect, useRef, useState, type MouseEvent, type PointerEvent, type WheelEvent } from 'react'
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from 'lucide-react'
import styles from './ImageZoomLightbox.module.scss'

const MIN_ZOOM = 1
const MAX_ZOOM = 4
const ZOOM_STEP = 0.25

type ImageZoomLightboxProps = {
  urls: string[]
  index: number
  alt?: string
  onClose: () => void
  onIndexChange?: (index: number) => void
}

export default function ImageZoomLightbox({
  urls,
  index,
  alt = 'Photo',
  onClose,
  onIndexChange,
}: ImageZoomLightboxProps) {
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const safeIndex = urls.length ? Math.min(Math.max(index, 0), urls.length - 1) : 0
  const url = urls[safeIndex] ?? ''

  const setScale = (next: number) => {
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(next.toFixed(2))))
    setZoom(clamped)
    if (clamped <= MIN_ZOOM) setOffset({ x: 0, y: 0 })
  }

  const bumpZoom = (delta: number) => {
    setZoom((current) => {
      const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number((current + delta).toFixed(2))))
      if (clamped <= MIN_ZOOM) setOffset({ x: 0, y: 0 })
      return clamped
    })
  }

  useEffect(() => {
    setZoom(1)
    setOffset({ x: 0, y: 0 })
    dragRef.current = null
  }, [safeIndex, url])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key === 'ArrowLeft' && urls.length > 1) {
        event.preventDefault()
        onIndexChange?.((safeIndex - 1 + urls.length) % urls.length)
        return
      }
      if (event.key === 'ArrowRight' && urls.length > 1) {
        event.preventDefault()
        onIndexChange?.((safeIndex + 1) % urls.length)
        return
      }
      if (event.key === '+' || event.key === '=') {
        event.preventDefault()
        bumpZoom(ZOOM_STEP)
        return
      }
      if (event.key === '-' || event.key === '_') {
        event.preventDefault()
        bumpZoom(-ZOOM_STEP)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onIndexChange, safeIndex, urls.length])

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    bumpZoom(event.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP)
  }

  const handlePointerDown = (event: PointerEvent<HTMLImageElement>) => {
    if (zoom <= MIN_ZOOM) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y }
  }

  const handlePointerMove = (event: PointerEvent<HTMLImageElement>) => {
    const drag = dragRef.current
    if (!drag) return
    setOffset({
      x: drag.ox + (event.clientX - drag.x),
      y: drag.oy + (event.clientY - drag.y),
    })
  }

  const stopPan = (event: PointerEvent<HTMLImageElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    dragRef.current = null
  }

  const stop = (event: MouseEvent) => event.stopPropagation()

  if (!url) return null

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={`${alt} zoom`}
      onClick={(event) => {
        event.stopPropagation()
        onClose()
      }}
      onWheel={handleWheel}
    >
      <div className={styles.toolbar} onClick={stop}>
        <span className={styles.meta}>
          {urls.length > 1 ? `${safeIndex + 1} / ${urls.length}` : '1 / 1'} · {Math.round(zoom * 100)}%
        </span>
        <div className={styles.actions}>
          <button type="button" className={styles.toolButton} onClick={() => bumpZoom(-ZOOM_STEP)} aria-label="Zoom out">
            <ZoomOut size={18} />
          </button>
          <button type="button" className={styles.toolButton} onClick={() => bumpZoom(ZOOM_STEP)} aria-label="Zoom in">
            <ZoomIn size={18} />
          </button>
          <button type="button" className={styles.toolButton} onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
      </div>

      {urls.length > 1 ? (
        <>
          <button
            type="button"
            className={`${styles.nav} ${styles.navPrev}`}
            onClick={(event) => {
              event.stopPropagation()
              onIndexChange?.((safeIndex - 1 + urls.length) % urls.length)
            }}
            aria-label="Previous photo"
          >
            <ChevronLeft size={28} />
          </button>
          <button
            type="button"
            className={`${styles.nav} ${styles.navNext}`}
            onClick={(event) => {
              event.stopPropagation()
              onIndexChange?.((safeIndex + 1) % urls.length)
            }}
            aria-label="Next photo"
          >
            <ChevronRight size={28} />
          </button>
        </>
      ) : null}

      <div className={styles.stage} onClick={stop}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={`${alt} ${safeIndex + 1}`}
          className={styles.image}
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
            cursor: zoom > MIN_ZOOM ? 'grab' : 'zoom-in',
          }}
          onClick={() => setScale(zoom >= 2 ? 1 : zoom + 1)}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={stopPan}
          onPointerCancel={stopPan}
          draggable={false}
        />
      </div>
    </div>
  )
}
