'use client'

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react'
import type { InventoryAttribute, InventoryVariantInput, InventoryVariantRow } from '@/lib/api'
import { imageAPI } from '@/lib/api'
import { mapInventoryAttributes } from '@/lib/inventory-attributes'
import styles from './InventoryFormModal.module.scss'

type Mode = 'create' | 'edit' | 'view'

type InventoryVariantModalProps = {
  isOpen: boolean
  mode: Mode
  variant?: InventoryVariantRow | null
  isSaving?: boolean
  manufacturerId?: number | null
  onClose: () => void
  onSubmit: (payload: InventoryVariantInput) => Promise<void> | void
}

type AttrRow = { name: string; value: string }
type ImageRow = { id?: string | null; url: string }

function attributeRows(attrs: InventoryAttribute[] | undefined): AttrRow[] {
  const mapped = mapInventoryAttributes(attrs)
  if (!mapped.length) return [{ name: '', value: '' }]
  return mapped.map((attr) => ({ name: attr.name, value: attr.value }))
}

function imageRows(images: InventoryVariantRow['images'] | undefined): ImageRow[] {
  if (!Array.isArray(images)) return []
  return images
    .map((image) => ({
      id: image?.id ?? null,
      url: String(image?.url ?? '').trim(),
    }))
    .filter((image) => image.url)
}

const emptyForm = {
  name: '',
  sku: '',
  seo_description: '',
  length: '',
  width: '',
  height: '',
  unit: 'in',
}

export default function InventoryVariantModal({
  isOpen,
  mode,
  variant,
  isSaving = false,
  manufacturerId,
  onClose,
  onSubmit,
}: InventoryVariantModalProps) {
  const readOnly = mode === 'view'
  const [error, setError] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [attributes, setAttributes] = useState<AttrRow[]>([{ name: '', value: '' }])
  const [images, setImages] = useState<ImageRow[]>([])
  const [imageUrl, setImageUrl] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isOpen) return
    setError('')
    setImageUrl('')
    setIsUploading(false)
    if (variant && mode !== 'create') {
      setForm({
        name: variant.name ?? '',
        sku: variant.sku ?? '',
        seo_description: variant.seo_description ?? '',
        length: variant.dimensions?.length == null ? '' : String(variant.dimensions.length),
        width: variant.dimensions?.width == null ? '' : String(variant.dimensions.width),
        height: variant.dimensions?.height == null ? '' : String(variant.dimensions.height),
        unit: variant.dimensions?.unit || 'in',
      })
      setAttributes(attributeRows(variant.attributes))
      setImages(imageRows(variant.images))
      return
    }
    setForm(emptyForm)
    setAttributes([{ name: '', value: '' }])
    setImages([])
  }, [isOpen, mode, variant])

  if (!isOpen) return null

  const title = mode === 'create' ? 'Add variant' : mode === 'edit' ? 'Edit variant' : 'View variant'

  const toNumber = (value: string): number | null => {
    const trimmed = value.trim()
    if (!trimmed) return null
    const num = Number(trimmed)
    return Number.isFinite(num) ? num : null
  }

  const addImageUrls = (raw: string) => {
    const parts = raw
      .split(/[\n|;,]+/)
      .map((part) => part.trim())
      .filter(Boolean)
    if (!parts.length) return
    setImages((prev) => {
      const seen = new Set(prev.map((image) => image.url))
      const next = [...prev]
      for (const url of parts) {
        if (seen.has(url)) continue
        seen.add(url)
        next.push({ url })
      }
      return next
    })
    setImageUrl('')
  }

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!files.length) return
    if (!manufacturerId) {
      setError('Manufacturer ID is required to upload images to ImageKit.')
      return
    }
    setError('')
    setIsUploading(true)
    try {
      for (const file of files) {
        const uploaded = await imageAPI.uploadImage(file, manufacturerId)
        const url = (uploaded.imagekit_url || uploaded.s3_url || '').trim()
        if (!url) throw new Error(`ImageKit did not return a public URL for ${file.name}`)
        setImages((prev) => (prev.some((image) => image.url === url) ? prev : [...prev, { url }]))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to upload image to ImageKit')
    } finally {
      setIsUploading(false)
    }
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (readOnly) return
    setError('')
    try {
      await onSubmit({
        name: form.name,
        sku: form.sku,
        seo_description: form.seo_description,
        length: toNumber(form.length),
        width: toNumber(form.width),
        height: toNumber(form.height),
        unit: form.unit,
        attributes: attributes.filter((row) => row.name.trim()),
        images,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save variant')
    }
  }

  return (
    <div className={styles.overlay} onClick={() => !isSaving && !isUploading && onClose()}>
      <div className={styles.modal} onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button type="button" className={styles.closeButton} onClick={onClose} disabled={isSaving || isUploading} aria-label="Close">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form className={styles.form} onSubmit={(event) => void handleSubmit(event)}>
          {error ? <div className={styles.error}>{error}</div> : null}

          <div className={styles.formGroup}>
            <span className={styles.label}>Images</span>
            {images.length ? (
              <div className={styles.imageGallery}>
                {images.map((image, index) => (
                  <div className={styles.imageCard} key={`${image.id ?? image.url}-${index}`}>
                    <a href={image.url} target="_blank" rel="noreferrer" className={styles.imageLink} title={`Variant image ${index + 1}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={image.url} alt={`Variant ${index + 1}`} className={styles.imageThumb} />
                    </a>
                    {readOnly ? null : (
                      <button
                        type="button"
                        className={styles.imageRemove}
                        onClick={() => setImages((prev) => prev.filter((_, i) => i !== index))}
                        aria-label="Remove image"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className={styles.hint}>No images yet.</p>
            )}
            {readOnly ? null : (
              <>
                <p className={styles.hint}>
                  Upload files to ImageKit (DAM). Traide receives the public ImageKit URL. External URLs are imported to ImageKit on save.
                </p>
                <div className={styles.imageAddRow}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
                    multiple
                    hidden
                    onChange={(event) => void handleFileUpload(event)}
                  />
                  <button
                    type="button"
                    className={styles.addButton}
                    disabled={isUploading || isSaving}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {isUploading ? 'Uploading…' : 'Upload to ImageKit'}
                  </button>
                  <input
                    className={styles.input}
                    value={imageUrl}
                    placeholder="Or paste a URL (imported to ImageKit on save)"
                    disabled={isUploading || isSaving}
                    onChange={(event) => setImageUrl(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter') return
                      event.preventDefault()
                      addImageUrls(imageUrl)
                    }}
                  />
                  <button type="button" className={styles.addButton} disabled={isUploading || isSaving} onClick={() => addImageUrls(imageUrl)}>
                    Add URL
                  </button>
                </div>
              </>
            )}
          </div>

          <div className={styles.grid}>
            <label className={`${styles.formGroup} ${styles.full}`}>
              <span className={styles.label}>Name *</span>
              <input
                className={styles.input}
                value={form.name}
                required
                readOnly={readOnly}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </label>
            <label className={styles.formGroup}>
              <span className={styles.label}>SKU</span>
              <input
                className={styles.input}
                value={form.sku}
                readOnly={readOnly}
                onChange={(event) => setForm((prev) => ({ ...prev, sku: event.target.value }))}
              />
            </label>
            <label className={styles.formGroup}>
              <span className={styles.label}>Unit</span>
              <input
                className={styles.input}
                value={form.unit}
                readOnly={readOnly}
                onChange={(event) => setForm((prev) => ({ ...prev, unit: event.target.value }))}
              />
            </label>
            <label className={styles.formGroup}>
              <span className={styles.label}>Length</span>
              <input
                className={styles.input}
                type="number"
                step="any"
                value={form.length}
                readOnly={readOnly}
                onChange={(event) => setForm((prev) => ({ ...prev, length: event.target.value }))}
              />
            </label>
            <label className={styles.formGroup}>
              <span className={styles.label}>Width</span>
              <input
                className={styles.input}
                type="number"
                step="any"
                value={form.width}
                readOnly={readOnly}
                onChange={(event) => setForm((prev) => ({ ...prev, width: event.target.value }))}
              />
            </label>
            <label className={styles.formGroup}>
              <span className={styles.label}>Height</span>
              <input
                className={styles.input}
                type="number"
                step="any"
                value={form.height}
                readOnly={readOnly}
                onChange={(event) => setForm((prev) => ({ ...prev, height: event.target.value }))}
              />
            </label>
            <label className={`${styles.formGroup} ${styles.full}`}>
              <span className={styles.label}>SEO description</span>
              <textarea
                className={styles.textarea}
                value={form.seo_description}
                readOnly={readOnly}
                onChange={(event) => setForm((prev) => ({ ...prev, seo_description: event.target.value }))}
              />
            </label>
          </div>

          <div className={styles.formGroup}>
            <span className={styles.label}>Attributes</span>
            <div className={styles.attrList}>
              {attributes.map((row, index) => (
                <div className={styles.attrRow} key={`attr-${index}`}>
                  <input
                    className={styles.input}
                    placeholder="Name"
                    value={row.name}
                    readOnly={readOnly}
                    onChange={(event) => {
                      const next = [...attributes]
                      next[index] = { ...row, name: event.target.value }
                      setAttributes(next)
                    }}
                  />
                  <input
                    className={styles.input}
                    placeholder="Value"
                    value={row.value}
                    readOnly={readOnly}
                    onChange={(event) => {
                      const next = [...attributes]
                      next[index] = { ...row, value: event.target.value }
                      setAttributes(next)
                    }}
                  />
                  {readOnly ? null : (
                    <button
                      type="button"
                      className={styles.removeButton}
                      onClick={() => setAttributes((prev) => prev.filter((_, i) => i !== index))}
                      aria-label="Remove attribute"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className={styles.actions}>
            <button type="button" className={styles.cancelButton} onClick={onClose} disabled={isSaving || isUploading}>
              {readOnly ? 'Close' : 'Cancel'}
            </button>
            {readOnly ? null : (
              <button type="submit" className={styles.submitButton} disabled={isSaving || isUploading}>
                {isSaving ? 'Saving…' : mode === 'create' ? 'Create variant' : 'Save changes'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
