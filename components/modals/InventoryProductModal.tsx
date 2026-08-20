'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import type { InventoryAttribute, InventoryCategoryOption, InventoryProductInput, InventoryProductRow } from '@/lib/api'
import { mapInventoryAttributes } from '@/lib/inventory-attributes'
import styles from './InventoryFormModal.module.scss'

type Mode = 'create' | 'edit' | 'view'

type InventoryProductModalProps = {
  isOpen: boolean
  mode: Mode
  product?: InventoryProductRow | null
  categories?: InventoryCategoryOption[]
  isSaving?: boolean
  onClose: () => void
  onSubmit: (payload: InventoryProductInput) => Promise<void> | void
}

type AttrRow = { name: string; value: string }

type ProductCategory = InventoryProductRow['category']

function categoryField(category: ProductCategory, key: 'id' | 'slug' | 'name'): string {
  if (!category) return ''
  return String(category[key] ?? '').trim()
}

function matchProductCategory(
  options: InventoryCategoryOption[],
  category: ProductCategory,
  fallbackId = '',
  fallbackName = ''
): InventoryCategoryOption | null {
  const id = categoryField(category, 'id') || fallbackId.trim()
  if (id) {
    const byId = options.find((row) => row.id === id)
    if (byId) return byId
  }
  const slug = categoryField(category, 'slug').toLowerCase()
  if (slug) {
    const bySlug = options.find((row) => row.slug.toLowerCase() === slug)
    if (bySlug) return bySlug
  }
  const name = (categoryField(category, 'name') || fallbackName).trim().toLowerCase()
  if (!name) return null
  const byPath = options.find((row) => row.path.toLowerCase() === name)
  if (byPath) return byPath
  const byName = options.filter((row) => row.name.toLowerCase() === name)
  return byName[0] ?? null
}

function attributeRows(attrs: InventoryAttribute[] | undefined): AttrRow[] {
  const mapped = mapInventoryAttributes(attrs)
  if (!mapped.length) return [{ name: '', value: '' }]
  return mapped.map((attr) => ({ name: attr.name, value: attr.value }))
}

const emptyForm = {
  name: '',
  slug: '',
  external_id: '',
  status: 'DRAFT',
  is_published: false,
  available_for_purchase: true,
  description: '',
  seo_title: '',
  seo_description: '',
  category_id: '',
  category_name: '',
  product_type_name: '',
}

export default function InventoryProductModal({
  isOpen,
  mode,
  product,
  categories = [],
  isSaving = false,
  onClose,
  onSubmit,
}: InventoryProductModalProps) {
  const readOnly = mode === 'view'
  const [error, setError] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [attributes, setAttributes] = useState<AttrRow[]>([{ name: '', value: '' }])
  const [categoryQuery, setCategoryQuery] = useState('')

  useEffect(() => {
    if (!isOpen) return
    setError('')
    if (product && mode !== 'create') {
      setForm({
        name: product.name ?? '',
        slug: product.slug ?? '',
        external_id: product.external_id ?? '',
        status: product.status || (product.is_published ? 'PUBLISHED' : 'DRAFT'),
        is_published: Boolean(product.is_published),
        available_for_purchase: product.available_for_purchase !== false,
        description: product.description ?? '',
        seo_title: product.seo_title ?? '',
        seo_description: product.seo_description ?? '',
        category_id: categoryField(product.category, 'id'),
        category_name: categoryField(product.category, 'name'),
        product_type_name: product.product_type?.name ?? '',
      })
      setAttributes(attributeRows(product.attributes))
      setCategoryQuery('')
      return
    }
    setForm(emptyForm)
    setAttributes([{ name: '', value: '' }])
    setCategoryQuery('')
  }, [isOpen, mode, product])

  useEffect(() => {
    if (!isOpen || mode === 'create' || !categories.length) return
    setForm((prev) => {
      const matched = matchProductCategory(categories, product?.category, prev.category_id, prev.category_name)
      if (!matched || prev.category_id === matched.id) return prev
      if (prev.category_id && categories.some((row) => row.id === prev.category_id)) return prev
      return { ...prev, category_id: matched.id, category_name: matched.name }
    })
  }, [isOpen, mode, product, categories])

  const selectedCategory = useMemo(
    () => matchProductCategory(categories, product?.category, form.category_id, form.category_name),
    [categories, product, form.category_id, form.category_name]
  )
  const selectedCategoryValue = selectedCategory?.id || form.category_id
  const selectedCategoryLabel =
    selectedCategory?.path || form.category_name || (selectedCategoryValue ? 'Current category' : '')

  const filteredCategories = useMemo(() => {
    const needle = categoryQuery.trim().toLowerCase()
    if (!needle) return categories
    return categories.filter((row) => {
      return (
        row.name.toLowerCase().includes(needle) ||
        row.path.toLowerCase().includes(needle) ||
        row.slug.toLowerCase().includes(needle)
      )
    })
  }, [categories, categoryQuery])

  const visibleCategories = filteredCategories.slice(0, 80)

  if (!isOpen) return null

  const title = mode === 'create' ? 'Add product' : mode === 'edit' ? 'Edit product' : 'View product'

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (readOnly || isSaving) return
    const active = document.activeElement
    if (active instanceof HTMLElement && active.dataset.categorySearch === 'true') return
    setError('')
    try {
      await onSubmit({
        ...form,
        attributes: attributes.filter((row) => row.name.trim()),
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save product')
    }
  }

  const setField = (key: keyof typeof emptyForm, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className={styles.overlay} onClick={() => !isSaving && onClose()}>
      <div className={styles.modal} onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button type="button" className={styles.closeButton} onClick={onClose} disabled={isSaving} aria-label="Close">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form className={styles.form} onSubmit={(event) => void handleSubmit(event)}>
          {error ? <div className={styles.error}>{error}</div> : null}

          <div className={styles.grid}>
            <label className={`${styles.formGroup} ${styles.full}`}>
              <span className={styles.label}>Name *</span>
              <input
                className={styles.input}
                value={form.name}
                onChange={(event) => setField('name', event.target.value)}
                required
                readOnly={readOnly}
              />
            </label>
            <label className={styles.formGroup}>
              <span className={styles.label}>Slug</span>
              <input
                className={styles.input}
                value={form.slug}
                onChange={(event) => setField('slug', event.target.value)}
                readOnly={readOnly}
                placeholder="Generated from name"
              />
            </label>
            <label className={styles.formGroup}>
              <span className={styles.label}>External ID</span>
              <input
                className={styles.input}
                value={form.external_id}
                onChange={(event) => setField('external_id', event.target.value)}
                readOnly={readOnly}
              />
            </label>
            <label className={styles.formGroup}>
              <span className={styles.label}>Status</span>
              <select className={styles.select} value={form.status} disabled>
                {form.status && !['DRAFT', 'PUBLISHED', 'HIDDEN'].includes(form.status) ? (
                  <option value={form.status}>{form.status}</option>
                ) : null}
                <option value="DRAFT">Draft</option>
                <option value="PUBLISHED">Published</option>
                <option value="HIDDEN">Hidden</option>
              </select>
              <p className={styles.hint}>Publication status is set automatically and cannot be changed here.</p>
            </label>
            <div className={`${styles.formGroup} ${styles.full}`}>
              <span className={styles.label}>Category</span>
              {readOnly ? (
                <input className={styles.input} value={selectedCategoryLabel} readOnly />
              ) : (
                <>
                  <div className={styles.categorySelected} aria-live="polite">
                    {selectedCategoryLabel || 'No category assigned'}
                  </div>
                  <input
                    className={styles.input}
                    type="search"
                    data-category-search="true"
                    value={categoryQuery}
                    onChange={(event) => setCategoryQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.preventDefault()
                    }}
                    placeholder={categories.length ? 'Type to find a category' : 'Categories will appear here when they are available'}
                    disabled={!categories.length}
                    autoComplete="off"
                    enterKeyHint="search"
                  />
                  {categories.length ? (
                    <div className={styles.categoryResults} role="listbox" aria-label="Matching categories">
                      {visibleCategories.length ? (
                        visibleCategories.map((row) => {
                          const isSelected = row.id === selectedCategoryValue
                          return (
                            <button
                              key={row.id}
                              type="button"
                              role="option"
                              aria-selected={isSelected}
                              className={`${styles.categoryResult} ${isSelected ? styles.categoryResultActive : ''}`}
                              onClick={() => {
                                setForm((prev) => ({
                                  ...prev,
                                  category_id: row.id,
                                  category_name: row.name,
                                }))
                                setCategoryQuery('')
                              }}
                            >
                              <span className={styles.categoryResultName} style={{ paddingLeft: `${Math.max(0, row.level - 1) * 0.75}rem` }}>
                                {row.name}
                              </span>
                              <span className={styles.categoryResultPath}>{row.path}</span>
                            </button>
                          )
                        })
                      ) : (
                        <p className={styles.categoryEmpty}>No categories match “{categoryQuery.trim()}”.</p>
                      )}
                      {filteredCategories.length > visibleCategories.length ? (
                        <p className={styles.categoryEmpty}>
                          Showing {visibleCategories.length} of {filteredCategories.length}. Type more to narrow the list.
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <p className={styles.hint}>Your current category is kept. Search the list to choose a different one.</p>
                  )}
                  <p className={styles.hint}>
                    {selectedCategoryLabel
                      ? `Selected: ${selectedCategoryLabel}`
                      : 'Search and click a category to assign it.'}
                  </p>
                </>
              )}
            </div>
            <label className={styles.formGroup}>
              <span className={styles.label}>Type</span>
              <input
                className={styles.input}
                value={form.product_type_name}
                onChange={(event) => setField('product_type_name', event.target.value)}
                readOnly={readOnly}
              />
            </label>
            <label className={`${styles.checkRow} ${styles.full}`}>
              <input
                type="checkbox"
                checked={form.available_for_purchase}
                onChange={(event) => setField('available_for_purchase', event.target.checked)}
                disabled={readOnly}
              />
              Available for purchase
            </label>
            <label className={`${styles.formGroup} ${styles.full}`}>
              <span className={styles.label}>Description</span>
              <textarea
                className={styles.textarea}
                value={form.description}
                onChange={(event) => setField('description', event.target.value)}
                readOnly={readOnly}
              />
            </label>
            <label className={styles.formGroup}>
              <span className={styles.label}>SEO title</span>
              <input
                className={styles.input}
                value={form.seo_title}
                onChange={(event) => setField('seo_title', event.target.value)}
                readOnly={readOnly}
              />
            </label>
            <label className={`${styles.formGroup} ${styles.full}`}>
              <span className={styles.label}>SEO description</span>
              <textarea
                className={styles.textarea}
                value={form.seo_description}
                onChange={(event) => setField('seo_description', event.target.value)}
                readOnly={readOnly}
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
            <button type="button" className={styles.cancelButton} onClick={onClose} disabled={isSaving}>
              {readOnly ? 'Close' : 'Cancel'}
            </button>
            {readOnly ? null : (
              <button type="submit" className={styles.submitButton} disabled={isSaving}>
                {isSaving ? 'Saving…' : mode === 'create' ? 'Create product' : 'Save changes'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
