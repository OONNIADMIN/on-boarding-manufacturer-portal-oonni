'use client'

import { useMemo, useState } from 'react'
import type { CatalogCategoryOption } from '@/lib/api'
import styles from './page.module.scss'

export type MenuCategoryDraft = {
  categoryId: string
  name: string
  slug: string
  imageId: number | null
  imageUrl: string | null
  file: File | null
}

const childrenOf = (categories: CatalogCategoryOption[]) => {
  const ids = new Set(categories.map((category) => category.id))
  const grouped = new Map<string | null, CatalogCategoryOption[]>()
  for (const category of categories) {
    const parent =
      category.parentId && ids.has(category.parentId) ? category.parentId : null
    const list = grouped.get(parent) ?? []
    list.push(category)
    grouped.set(parent, list)
  }
  for (const list of grouped.values()) {
    list.sort((left, right) => left.name.localeCompare(right.name))
  }
  return grouped
}

const pathOf = (
  category: CatalogCategoryOption,
  byId: Map<string, CatalogCategoryOption>
) => {
  const names: string[] = []
  const seen = new Set<string>()
  let current: CatalogCategoryOption | undefined = category
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    names.unshift(current.name)
    current = current.parentId ? byId.get(current.parentId) : undefined
  }
  return names.slice(0, -1).join(' / ')
}

export function MenuCategoriesField({
  catalog,
  selected,
  onChange,
}: {
  catalog: CatalogCategoryOption[]
  selected: MenuCategoryDraft[]
  onChange: (next: MenuCategoryDraft[]) => void
}) {
  const [query, setQuery] = useState('')
  const [path, setPath] = useState<CatalogCategoryOption[]>([])
  const grouped = useMemo(() => childrenOf(catalog), [catalog])
  const byId = useMemo(
    () => new Map(catalog.map((category) => [category.id, category])),
    [catalog]
  )
  const selectedIds = new Set(selected.map((item) => item.categoryId))
  const needle = query.trim().toLowerCase()
  const currentParent = path[path.length - 1] ?? null
  const level = grouped.get(currentParent?.id ?? null) ?? []

  const isLeaf = (category: CatalogCategoryOption) =>
    (grouped.get(category.id) ?? []).length === 0

  const selectedInBranch = (categoryId: string): number => {
    const pending = [categoryId]
    let count = 0
    const seen = new Set<string>()
    while (pending.length) {
      const current = pending.pop()
      if (!current || seen.has(current)) continue
      seen.add(current)
      const children = grouped.get(current) ?? []
      if (children.length === 0) {
        if (selectedIds.has(current)) count += 1
        continue
      }
      for (const child of children) pending.push(child.id)
    }
    return count
  }

  const toggle = (category: CatalogCategoryOption) => {
    if (!isLeaf(category)) return
    if (selectedIds.has(category.id)) {
      onChange(selected.filter((item) => item.categoryId !== category.id))
      return
    }
    onChange([
      ...selected,
      {
        categoryId: category.id,
        name: category.name,
        slug: category.slug,
        imageId: null,
        imageUrl: null,
        file: null,
      },
    ])
  }

  const leaves = needle
    ? catalog
        .filter((category) => isLeaf(category) && category.name.toLowerCase().includes(needle))
        .sort((left, right) => left.name.localeCompare(right.name))
    : []

  return (
    <div className={styles.fields}>
      <label className={styles.field}>
        Search leaf categories
        <input
          className={styles.input}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Baskets, beer mugs…"
        />
      </label>

      {needle ? null : (
        <nav className={styles.categoryNav} aria-label="Category levels">
          <button type="button" className={styles.categoryCrumb} onClick={() => setPath([])}>
            All categories
          </button>
          {path.map((category, index) => (
            <span key={category.id}>
              <span aria-hidden> / </span>
              <button
                type="button"
                className={styles.categoryCrumb}
                onClick={() => setPath(path.slice(0, index + 1))}
              >
                {category.name}
              </button>
            </span>
          ))}
        </nav>
      )}

      <div className={styles.categoryTree}>
        {catalog.length === 0 ? (
          <p className={styles.sectionHint}>No catalog categories are available yet.</p>
        ) : needle ? (
          leaves.length === 0 ? (
            <p className={styles.sectionHint}>No leaf categories match that search.</p>
          ) : (
            leaves.map((category) => (
              <label key={category.id} className={styles.categoryRow}>
                <input
                  type="checkbox"
                  checked={selectedIds.has(category.id)}
                  onChange={() => toggle(category)}
                />
                <span>
                  {category.name}
                  {pathOf(category, byId) ? (
                    <span className={styles.sectionHint}> {pathOf(category, byId)}</span>
                  ) : null}
                </span>
              </label>
            ))
          )
        ) : level.length === 0 ? (
          <p className={styles.sectionHint}>This category has no subcategories.</p>
        ) : (
          level.map((category) => {
            const leaf = isLeaf(category)
            if (!leaf) {
              const chosen = selectedInBranch(category.id)
              return (
                <button
                  key={category.id}
                  type="button"
                  className={styles.categoryOpen}
                  onClick={() => setPath((current) => [...current, category])}
                >
                  <span>{category.name}</span>
                  <span>
                    {chosen > 0 ? `${chosen} selected · ` : ''}
                    Open
                  </span>
                </button>
              )
            }
            return (
              <label key={category.id} className={styles.categoryRow}>
                <input
                  type="checkbox"
                  checked={selectedIds.has(category.id)}
                  onChange={() => toggle(category)}
                />
                <span>{category.name}</span>
              </label>
            )
          })
        )}
      </div>

      {selected.length > 0 ? (
        <div className={styles.selectedCategories}>
          {selected.map((item, index) => (
            <div key={item.categoryId} className={styles.selectedCategory}>
              {item.imageUrl ? (
                <img src={item.imageUrl} alt="" className={styles.mediaPreview} />
              ) : (
                <div className={styles.mediaPreview} />
              )}
              <div>
                <strong>{item.name}</strong>
                <div className={styles.actions}>
                  <label className={styles.fileButton}>
                    Category image
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        if (!file) return
                        onChange(
                          selected.map((row, rowIndex) =>
                            rowIndex === index
                              ? { ...row, file, imageUrl: URL.createObjectURL(file) }
                              : row
                          )
                        )
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className={styles.secondary}
                    disabled={index === 0}
                    onClick={() => {
                      const next = [...selected]
                      const [moved] = next.splice(index, 1)
                      next.splice(index - 1, 0, moved)
                      onChange(next)
                    }}
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    className={styles.secondary}
                    disabled={index === selected.length - 1}
                    onClick={() => {
                      const next = [...selected]
                      const [moved] = next.splice(index, 1)
                      next.splice(index + 1, 0, moved)
                      onChange(next)
                    }}
                  >
                    Down
                  </button>
                </div>
              </div>
              <button
                type="button"
                className={styles.secondary}
                onClick={() =>
                  onChange(selected.filter((row) => row.categoryId !== item.categoryId))
                }
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className={styles.sectionHint}>
          Selected leaf categories appear here. Upload an image for each card.
        </p>
      )}
    </div>
  )
}
