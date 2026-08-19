'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ColumnDef, ExpandedState, OnChangeFn, PaginationState, SortingState } from '@tanstack/react-table'
import { ChevronDown, ChevronRight, Download, Plus, Upload } from 'lucide-react'
import {
  Header,
  DataTable,
  RowActions,
  ConfirmDialog,
  InventoryProductModal,
  InventoryVariantModal,
  CompletenessMeter,
  CompletenessChart,
  CompletenessBreakdown,
} from '@/components'
import {
  authAPI,
  inventoryAPI,
  type InventoryProductInput,
  type InventoryProductRow,
  type InventoryVariantInput,
  type InventoryVariantRow,
} from '@/lib/api'
import { User } from '@/types'
import { mapInventoryAttributes } from '@/lib/inventory-attributes'
import {
  evaluateProductCompleteness,
  evaluateVariantCompleteness,
  type CompletenessIssueKind,
  type CompletenessStatus,
} from '@/lib/inventory-completeness'
import styles from './page.module.scss'

const COMPLETENESS_ISSUE_OPTIONS: Array<{ id: CompletenessIssueKind; label: string }> = [
  { id: 'empty', label: 'Empty' },
  { id: 'na', label: 'N/A' },
  { id: 'zero', label: 'Zeros' },
  { id: 'short', label: 'Short text' },
]

function imageUrls(images: Array<{ url?: string | null }> | null | undefined): string[] {
  if (!Array.isArray(images)) return []
  return images.map((image) => String(image?.url ?? '').trim()).filter(Boolean)
}

function firstImageUrl(product: InventoryProductRow): string | null {
  return imageUrls(product.images)[0] ?? null
}

function ImageGallery({
  urls,
  alt,
  size = 'sm',
}: {
  urls: string[]
  alt: string
  size?: 'sm' | 'md'
}) {
  if (!urls.length) {
    return <span className={styles.thumbFallback} aria-hidden="true" />
  }
  return (
    <div className={size === 'md' ? styles.imageGalleryMd : styles.imageGallery} role="list">
      {urls.map((url, index) => (
        <a
          key={`${url}-${index}`}
          href={url}
          target="_blank"
          rel="noreferrer"
          className={styles.imageLink}
          title={`${alt} image ${index + 1}`}
          onClick={(event) => event.stopPropagation()}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={`${alt} ${index + 1}`} className={styles.thumb} />
        </a>
      ))}
    </div>
  )
}

function traideSaveNotice(
  kind: 'product' | 'variant',
  result: { traide_synced?: number; traide_errors?: string[] }
) {
  const extra = result.traide_errors?.length ? ` ${result.traide_errors.slice(0, 2).join(' ')}` : ''
  return `Saved ${kind} locally. Synced ${result.traide_synced ?? 0} to Traide.${extra}`
}

function attributeRows(attrs: InventoryProductRow['attributes']): Array<{ name: string; value: string }> {
  return mapInventoryAttributes(attrs).map((attr) => ({
    name: attr.name,
    value: attr.value.trim() || '—',
  }))
}

function AttributeTable({
  title,
  rows,
}: {
  title: string
  rows: Array<{ name: string; value: string }>
}) {
  return (
    <div className={styles.attributesBlock}>
      <h3 className={styles.detailLabel}>{title}</h3>
      {rows.length ? (
        <table className={styles.nestedTable}>
          <thead>
            <tr>
              <th>Attribute</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name}>
                <td title={row.name}>{row.name}</td>
                <td title={row.value}>{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className={styles.detailText}>No attributes</p>
      )}
    </div>
  )
}

function VariantInnerTable({
  productId,
  variants,
  productImages,
  onCreate,
  onView,
  onEdit,
  onDelete,
}: {
  productId: number
  variants: InventoryVariantRow[]
  productImages?: InventoryProductRow['images']
  onCreate: (productId: number) => void
  onView: (productId: number, variant: InventoryVariantRow) => void
  onEdit: (productId: number, variant: InventoryVariantRow) => void
  onDelete: (productId: number, variant: InventoryVariantRow) => void
}) {
  const [search, setSearch] = useState('')
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 })
  const [sorting, setSorting] = useState<SortingState>([])

  const columns = useMemo<ColumnDef<InventoryVariantRow>[]>(
    () => [
      {
        id: 'images',
        header: 'Images',
        enableSorting: false,
        cell: ({ row }) => (
          <div className={styles.imageCell}>
            <ImageGallery
              urls={imageUrls(row.original.images?.length ? row.original.images : productImages)}
              alt={row.original.name || 'Variant'}
            />
          </div>
        ),
      },
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <span className={styles.truncateCell} title={row.original.name}>
            {row.original.name || '—'}
          </span>
        ),
      },
      {
        accessorKey: 'sku',
        header: 'SKU',
        cell: ({ row }) => (
          <span className={styles.truncateCell} title={row.original.sku || ''}>
            {row.original.sku || '—'}
          </span>
        ),
      },
      {
        id: 'completeness',
        header: 'Completeness',
        enableSorting: false,
        cell: ({ row }) => {
          const report = row.original.completeness ?? evaluateVariantCompleteness(row.original)
          return <CompletenessMeter report={report} />
        },
      },
      {
        id: 'actions',
        header: 'Actions',
        enableSorting: false,
        cell: ({ row }) => (
          <RowActions
            onView={() => onView(productId, row.original)}
            onEdit={() => onEdit(productId, row.original)}
            onDelete={() => onDelete(productId, row.original)}
          />
        ),
      },
    ],
    [onDelete, onEdit, onView, productId, productImages]
  )

  useEffect(() => {
    setPagination((prev) => (prev.pageIndex === 0 ? prev : { ...prev, pageIndex: 0 }))
  }, [search, variants])

  return (
    <div className={styles.nestedBlock}>
      <div className={styles.nestedHeader}>
        <h3 className={styles.detailLabel}>Variants for this product</h3>
        <button type="button" className={styles.addVariantButton} onClick={() => onCreate(productId)}>
          Add variant
        </button>
      </div>
      {variants.length ? (
        <DataTable
          mode="client"
          columns={columns}
          data={variants}
          total={variants.length}
          pageIndex={pagination.pageIndex}
          pageSize={pagination.pageSize}
          search={search}
          sorting={sorting}
          onSearchChange={setSearch}
          onPaginationChange={setPagination}
          onSortingChange={setSorting}
          searchPlaceholder="Search variants…"
          getRowId={(row) => String(row.id)}
          embedded
        />
      ) : (
        <p className={styles.detailText}>This product has no variants.</p>
      )}
    </div>
  )
}

export default function InventoryPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [products, setProducts] = useState<InventoryProductRow[]>([])
  const [total, setTotal] = useState(0)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 })
  const [sorting, setSorting] = useState<SortingState>([{ id: 'name', desc: false }])
  const [completenessStatus, setCompletenessStatus] = useState<CompletenessStatus | ''>('')
  const [issueFilters, setIssueFilters] = useState<CompletenessIssueKind[]>([])
  const [expanded, setExpanded] = useState<ExpandedState>({})
  const [variantsByProduct, setVariantsByProduct] = useState<Record<number, InventoryVariantRow[]>>({})
  const [loadingVariantsId, setLoadingVariantsId] = useState<number | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isBulkBusy, setIsBulkBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const bulkFileRef = useRef<HTMLInputElement>(null)
  const [productDialog, setProductDialog] = useState<{ mode: 'create' } | { mode: 'edit' | 'view'; product: InventoryProductRow } | null>(null)
  const [variantDialog, setVariantDialog] = useState<
    | { mode: 'create'; productId: number }
    | { mode: 'edit' | 'view'; productId: number; variant: InventoryVariantRow }
    | null
  >(null)
  const [deleteDialog, setDeleteDialog] = useState<
    | { kind: 'product'; product: InventoryProductRow }
    | { kind: 'variant'; productId: number; variant: InventoryVariantRow }
    | null
  >(null)
  const didBootstrapSync = useRef(false)

  const loadProducts = useCallback(
    async (nextPage: number, nextLimit: number, nextSearch: string, nextSorting: SortingState) => {
      setError(null)
      const sort = nextSorting[0]
      const response = await inventoryAPI.listProducts(nextPage, nextLimit, {
        search: nextSearch,
        sort: sort?.id === 'external_id' || sort?.id === 'status' ? sort.id : 'name',
        order: sort?.desc ? 'desc' : 'asc',
        completeness: completenessStatus || undefined,
        issues: issueFilters,
      })
      setProducts(response.products ?? [])
      setTotal(response.total ?? 0)
      return response
    },
    [completenessStatus, issueFilters]
  )

  useEffect(() => {
    const token = authAPI.getToken()
    const storedUser = authAPI.getStoredUser()
    if (!token || !storedUser) {
      router.push('/login')
      return
    }
    if (authAPI.isAdmin(storedUser)) {
      router.push('/dashboard')
      return
    }
    setUser(storedUser)
  }, [router])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (searchInput === search) return
      setSearch(searchInput)
      setPagination((prev) => (prev.pageIndex === 0 ? prev : { ...prev, pageIndex: 0 }))
    }, 300)
    return () => window.clearTimeout(timer)
  }, [searchInput, search])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    ;(async () => {
      setIsLoading(true)
      try {
        const listed = await loadProducts(
          pagination.pageIndex + 1,
          pagination.pageSize,
          search,
          sorting
        )
        if (
          !cancelled &&
          !didBootstrapSync.current &&
          !search &&
          pagination.pageIndex === 0 &&
          (listed.total ?? 0) === 0
        ) {
          didBootstrapSync.current = true
          setIsSyncing(true)
          await inventoryAPI.sync()
          if (!cancelled) {
            await loadProducts(pagination.pageIndex + 1, pagination.pageSize, search, sorting)
          }
        } else {
          didBootstrapSync.current = true
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load inventory')
      } finally {
        if (!cancelled) {
          setIsLoading(false)
          setIsSyncing(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user, pagination.pageIndex, pagination.pageSize, search, sorting, loadProducts])

  const loadVariants = useCallback(async (productId: number) => {
    setLoadingVariantsId(productId)
    try {
      const response = await inventoryAPI.listVariants(productId)
      setVariantsByProduct((prev) => ({ ...prev, [productId]: response.variants ?? [] }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load variants')
    } finally {
      setLoadingVariantsId(null)
    }
  }, [])

  const refreshList = useCallback(async () => {
    await loadProducts(pagination.pageIndex + 1, pagination.pageSize, search, sorting)
  }, [loadProducts, pagination.pageIndex, pagination.pageSize, search, sorting])

  const handleExpandedChange: OnChangeFn<ExpandedState> = (next) => {
    const resolved = typeof next === 'function' ? next(expanded) : next
    setExpanded(resolved)
    if (resolved === true || typeof resolved !== 'object' || resolved == null) return
    const openIds = Object.entries(resolved)
      .filter(([, isOpen]) => isOpen)
      .map(([id]) => Number(id))
    for (const id of openIds) {
      if (variantsByProduct[id] == null) void loadVariants(id)
    }
  }

  const handleSortingChange: OnChangeFn<SortingState> = (next) => {
    setSorting(next)
    setPagination((prev) => (prev.pageIndex === 0 ? prev : { ...prev, pageIndex: 0 }))
  }

  const handleSaveProduct = async (payload: InventoryProductInput) => {
    if (!productDialog || productDialog.mode === 'view') return
    setIsSaving(true)
    setError(null)
    setNotice(null)
    try {
      if (productDialog.mode === 'create') {
        const created = await inventoryAPI.createProduct(payload)
        setNotice(traideSaveNotice('product', created))
        setProductDialog(null)
        if (pagination.pageIndex !== 0) {
          setPagination((prev) => ({ ...prev, pageIndex: 0 }))
        } else {
          await loadProducts(1, pagination.pageSize, search, sorting)
        }
        return
      }
      const updated = await inventoryAPI.updateProduct(productDialog.product.id, payload)
      setNotice(traideSaveNotice('product', updated))
      setProductDialog(null)
      await refreshList()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save product')
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveVariant = async (payload: InventoryVariantInput) => {
    if (!variantDialog || variantDialog.mode === 'view') return
    setIsSaving(true)
    setError(null)
    setNotice(null)
    try {
      const result =
        variantDialog.mode === 'create'
          ? await inventoryAPI.createVariant(variantDialog.productId, payload)
          : await inventoryAPI.updateVariant(variantDialog.productId, variantDialog.variant.id, payload)
      setNotice(traideSaveNotice('variant', result))
      const productId = variantDialog.productId
      setVariantDialog(null)
      await loadVariants(productId)
      await refreshList()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save variant')
    } finally {
      setIsSaving(false)
    }
  }

  const handleConfirmDelete = async () => {
    if (!deleteDialog) return
    setIsSaving(true)
    setError(null)
    try {
      if (deleteDialog.kind === 'product') {
        await inventoryAPI.deleteProduct(deleteDialog.product.id)
        setVariantsByProduct((prev) => {
          const next = { ...prev }
          delete next[deleteDialog.product.id]
          return next
        })
        setExpanded((prev) => {
          if (prev === true || typeof prev !== 'object' || prev == null) return prev
          const next = { ...prev }
          delete next[String(deleteDialog.product.id)]
          return next
        })
        await refreshList()
      } else {
        await inventoryAPI.deleteVariant(deleteDialog.productId, deleteDialog.variant.id)
        await loadVariants(deleteDialog.productId)
        await refreshList()
      }
      setDeleteDialog(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete')
    } finally {
      setIsSaving(false)
    }
  }

  const bulkFilter = {
    search,
    completeness: completenessStatus || undefined,
    issues: issueFilters,
  }

  const handleDownloadBulk = async (kind: 'products' | 'variants') => {
    setIsBulkBusy(true)
    setError(null)
    setNotice(null)
    try {
      await inventoryAPI.downloadBulk(kind, bulkFilter)
      setNotice(
        kind === 'variants'
          ? 'Variants spreadsheet downloaded. Keep variant_id and product_id unchanged so each variant stays with its product.'
          : 'Products spreadsheet downloaded. Keep product_id unchanged so variants stay linked.'
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to download inventory')
    } finally {
      setIsBulkBusy(false)
    }
  }

  const handleUploadBulk = async (file: File) => {
    setIsBulkBusy(true)
    setError(null)
    setNotice(null)
    try {
      const result = await inventoryAPI.uploadBulk(file)
      const extra = result.errors.length ? ` ${result.errors.slice(0, 3).join(' ')}` : ''
      setNotice(
        `Updated ${result.updated} ${result.kind} locally. Synced ${result.traide_synced ?? 0} to Traide. Skipped ${result.skipped}.${extra}`
      )
      setVariantsByProduct({})
      setExpanded({})
      await refreshList()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to import inventory')
    } finally {
      setIsBulkBusy(false)
    }
  }

  const handleSync = async () => {
    setIsSyncing(true)
    setError(null)
    try {
      await inventoryAPI.sync()
      setVariantsByProduct({})
      setExpanded({})
      await loadProducts(1, pagination.pageSize, search, sorting)
      setPagination((prev) => ({ ...prev, pageIndex: 0 }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to sync inventory')
    } finally {
      setIsSyncing(false)
    }
  }

  const columns = useMemo<ColumnDef<InventoryProductRow>[]>(
    () => [
      {
        id: 'expand',
        header: '',
        enableSorting: false,
        size: 36,
        cell: ({ row }) => (
          <button
            type="button"
            className={styles.expandButton}
            onClick={row.getToggleExpandedHandler()}
            aria-label={row.getIsExpanded() ? 'Collapse product' : 'Expand product'}
          >
            {row.getIsExpanded() ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        ),
      },
      {
        accessorKey: 'name',
        header: 'Product',
        size: 280,
        cell: ({ row }) => {
          const product = row.original
          const imageUrl = firstImageUrl(product)
          return (
            <button type="button" className={styles.productCell} onClick={row.getToggleExpandedHandler()}>
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="" className={styles.thumb} />
              ) : (
                <span className={styles.thumbFallback} />
              )}
              <span className={styles.productText}>
                <strong title={product.name}>{product.name}</strong>
                <span className={styles.slug} title={product.slug}>{product.slug}</span>
              </span>
            </button>
          )
        },
      },
      {
        id: 'category',
        header: 'Category',
        enableSorting: false,
        size: 140,
        accessorFn: (row) => row.category?.name || '—',
        cell: ({ getValue }) => (
          <span className={styles.truncateCell} title={String(getValue() || '')}>
            {String(getValue() || '—')}
          </span>
        ),
      },
      {
        id: 'type',
        header: 'Type',
        enableSorting: false,
        size: 140,
        accessorFn: (row) => row.product_type?.name || '—',
        cell: ({ getValue }) => (
          <span className={styles.truncateCell} title={String(getValue() || '')}>
            {String(getValue() || '—')}
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <span className={row.original.is_published ? styles.badgeOk : styles.badgeMuted}>
            {row.original.status || (row.original.is_published ? 'Published' : 'Unpublished')}
          </span>
        ),
      },
      {
        id: 'variants',
        header: 'Variants',
        enableSorting: false,
        accessorFn: (row) => row.variant_count ?? 0,
      },
      {
        id: 'completeness',
        header: 'Completeness',
        enableSorting: false,
        cell: ({ row }) =>
          row.original.completeness ? <CompletenessMeter report={row.original.completeness} /> : '—',
      },
      {
        id: 'actions',
        header: 'Actions',
        enableSorting: false,
        cell: ({ row }) => (
          <RowActions
            onView={() => setProductDialog({ mode: 'view', product: row.original })}
            onEdit={() => setProductDialog({ mode: 'edit', product: row.original })}
            onDelete={() => setDeleteDialog({ kind: 'product', product: row.original })}
          />
        ),
      },
    ],
    []
  )

  if (!user && isLoading) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.spinner} />
        <p>Loading...</p>
      </div>
    )
  }

  if (!user) return null

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <Header
          subtitle="Traide products and variants"
          user={user}
          showNavigation={true}
          currentPage="inventory"
        />

        <section className={styles.content}>
          <div className={styles.toolbar}>
            <div>
              <h2 className={styles.title}>Manage all inventory</h2>
              <p className={styles.subtitle}>
                Search, sort and paginate products. Completeness flags N/A, zeros, short text, and empty fields.
                Download products or variants separately to bulk-edit; gray ID columns keep the product–variant link.
              </p>
            </div>
            <div className={styles.toolbarActions}>
              <button
                type="button"
                className={styles.addButton}
                onClick={() => setProductDialog({ mode: 'create' })}
              >
                <Plus size={16} />
                Add product
              </button>
              <button
                type="button"
                className={styles.addButton}
                onClick={() => void handleDownloadBulk('products')}
                disabled={isBulkBusy || isSyncing}
              >
                <Download size={16} />
                {isBulkBusy ? 'Working…' : 'Download products'}
              </button>
              <button
                type="button"
                className={styles.addButton}
                onClick={() => void handleDownloadBulk('variants')}
                disabled={isBulkBusy || isSyncing}
              >
                <Download size={16} />
                {isBulkBusy ? 'Working…' : 'Download variants'}
              </button>
              <button
                type="button"
                className={styles.addButton}
                onClick={() => bulkFileRef.current?.click()}
                disabled={isBulkBusy || isSyncing}
              >
                <Upload size={16} />
                Upload edits
              </button>
              <input
                ref={bulkFileRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ''
                  if (file) void handleUploadBulk(file)
                }}
              />
              <button type="button" className={styles.syncButton} onClick={() => void handleSync()} disabled={isSyncing || isBulkBusy}>
                {isSyncing ? 'Syncing…' : 'Refresh from Traide'}
              </button>
            </div>
          </div>

          {error ? <div className={styles.error}>{error}</div> : null}
          {notice ? <div className={styles.notice}>{notice}</div> : null}

          <div className={styles.tableCard}>
            {isSyncing ? (
              <div className={styles.loadingRow}>
                <div className={styles.spinner} />
                <p>Syncing products from Traide…</p>
              </div>
            ) : (
              <DataTable
                columns={columns}
                data={products}
                total={total}
                pageIndex={pagination.pageIndex}
                pageSize={pagination.pageSize}
                search={searchInput}
                sorting={sorting}
                onSearchChange={setSearchInput}
                onPaginationChange={setPagination}
                onSortingChange={handleSortingChange}
                searchPlaceholder="Search products, SKUs or variants…"
                isLoading={isLoading}
                emptyMessage="No inventory products match this search."
                toolbarExtra={
                  <div className={styles.completenessFilters}>
                    <label>
                      <span>Completeness</span>
                      <select
                        value={completenessStatus}
                        onChange={(event) => {
                          setCompletenessStatus(event.target.value as CompletenessStatus | '')
                          setPagination((prev) => (prev.pageIndex === 0 ? prev : { ...prev, pageIndex: 0 }))
                        }}
                        aria-label="Filter by completeness status"
                      >
                        <option value="">All</option>
                        <option value="complete">Complete</option>
                        <option value="needs_review">Needs review</option>
                        <option value="incomplete">Incomplete</option>
                      </select>
                    </label>
                    {COMPLETENESS_ISSUE_OPTIONS.map((option) => (
                      <label key={option.id} className={styles.issueChip}>
                        <input
                          type="checkbox"
                          checked={issueFilters.includes(option.id)}
                          onChange={() => {
                            setIssueFilters((prev) =>
                              prev.includes(option.id)
                                ? prev.filter((item) => item !== option.id)
                                : [...prev, option.id]
                            )
                            setPagination((prev) => (prev.pageIndex === 0 ? prev : { ...prev, pageIndex: 0 }))
                          }}
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                }
                getRowId={(row) => String(row.id)}
                expanded={expanded}
                onExpandedChange={handleExpandedChange}
                getRowCanExpand={() => true}
                renderSubComponent={(product) => {
                  const loadedVariants = variantsByProduct[product.id]
                  const completeness = loadedVariants
                    ? evaluateProductCompleteness(product, loadedVariants)
                    : product.completeness
                  if (loadingVariantsId === product.id && loadedVariants == null && !completeness) {
                    return <p className={styles.detailText}>Loading variants…</p>
                  }
                  return (
                    <div className={styles.detailStack}>
                      {completeness ? (
                        <div className={styles.nestedBlock}>
                          <CompletenessChart
                            title="Completeness for this product"
                            items={[completeness.product, ...completeness.variants]}
                          />
                          <CompletenessBreakdown report={completeness} />
                          {completeness.issues.length ? (
                            <ul className={styles.issueList}>
                              {completeness.issues.slice(0, 12).map((issue, index) => (
                                <li key={`${issue.field}-${issue.kind}-${index}`}>{issue.message}</li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      ) : null}
                      <AttributeTable title="Product attributes" rows={attributeRows(product.attributes)} />
                      {loadingVariantsId === product.id && loadedVariants == null ? (
                        <p className={styles.detailText}>Loading variants…</p>
                      ) : (
                        <VariantInnerTable
                          productId={product.id}
                          productImages={product.images}
                          variants={loadedVariants ?? []}
                          onCreate={(productId) => setVariantDialog({ mode: 'create', productId })}
                          onView={(productId, variant) => setVariantDialog({ mode: 'view', productId, variant })}
                          onEdit={(productId, variant) => setVariantDialog({ mode: 'edit', productId, variant })}
                          onDelete={(productId, variant) => setDeleteDialog({ kind: 'variant', productId, variant })}
                        />
                      )}
                    </div>
                  )
                }}
              />
            )}
          </div>
        </section>
      </div>

      <InventoryProductModal
        isOpen={Boolean(productDialog)}
        mode={productDialog?.mode ?? 'create'}
        product={productDialog && productDialog.mode !== 'create' ? productDialog.product : null}
        isSaving={isSaving}
        onClose={() => setProductDialog(null)}
        onSubmit={handleSaveProduct}
      />
      <InventoryVariantModal
        isOpen={Boolean(variantDialog)}
        mode={variantDialog?.mode ?? 'create'}
        variant={variantDialog && variantDialog.mode !== 'create' ? variantDialog.variant : null}
        manufacturerId={user?.manufacturer_id}
        isSaving={isSaving}
        onClose={() => setVariantDialog(null)}
        onSubmit={handleSaveVariant}
      />
      <ConfirmDialog
        isOpen={Boolean(deleteDialog)}
        title={deleteDialog?.kind === 'variant' ? 'Delete variant' : 'Delete product'}
        message={
          deleteDialog?.kind === 'variant'
            ? `Delete “${deleteDialog.variant.name}”? This cannot be undone.`
            : `Delete “${deleteDialog?.kind === 'product' ? deleteDialog.product.name : 'this product'}”? It will be removed from inventory.`
        }
        isLoading={isSaving}
        onCancel={() => setDeleteDialog(null)}
        onConfirm={() => void handleConfirmDelete()}
      />
    </main>
  )
}
