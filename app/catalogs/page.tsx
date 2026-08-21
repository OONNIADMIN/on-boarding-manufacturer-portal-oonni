'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ColumnDef, PaginationState, SortingState } from '@tanstack/react-table'
import { RefreshCw } from 'lucide-react'
import { Header, DataTable, RowActions, ConfirmDialog } from '@/components'
import { authAPI, catalogAPI, manufacturerAPI } from '@/lib/api'
import { Catalog, ManufacturerListItem, User } from '@/types'
import styles from './page.module.scss'

const MANUFACTURER_STORAGE_KEY = 'oonni.catalogs.manufacturerId'

function asList<T>(value: unknown): T[] {
  return Array.isArray(value) ? value : []
}

function fileKind(filePath?: string | null): { label: string; variant: 'xlsx' | 'csv' | 'file' } {
  const path = String(filePath ?? '').toLowerCase()
  if (path.includes('.csv')) return { label: 'CSV', variant: 'csv' }
  if (path.includes('.xlsx') || path.includes('.xls')) return { label: 'Excel', variant: 'xlsx' }
  if (!path) return { label: 'No file', variant: 'file' }
  return { label: 'File', variant: 'file' }
}

function formatDate(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString()
}

export default function CatalogsPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [catalogs, setCatalogs] = useState<Catalog[]>([])
  const [manufacturers, setManufacturers] = useState<ManufacturerListItem[]>([])
  const [selectedManufacturerId, setSelectedManufacturerId] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 })
  const [sorting, setSorting] = useState<SortingState>([{ id: 'created_at', desc: true }])
  const [deleteTarget, setDeleteTarget] = useState<Catalog | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const loadCatalogs = async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setIsRefreshing(true)
    setError('')
    try {
      const data = await catalogAPI.listCatalogs()
      setCatalogs(asList<Catalog>(data))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load catalogs')
      setCatalogs([])
    } finally {
      setIsRefreshing(false)
      setIsLoading(false)
    }
  }

  useEffect(() => {
    const storedUser = authAPI.getStoredUser()
    const token = authAPI.getToken()
    if (!token || !storedUser) {
      router.push('/login')
      return
    }
    if (!authAPI.isAdmin(storedUser)) {
      router.push('/onboard/template')
      return
    }

    setUser(storedUser)
    setIsAdmin(true)
    const storedManufacturer = window.sessionStorage.getItem(MANUFACTURER_STORAGE_KEY)
    const parsed = storedManufacturer ? Number.parseInt(storedManufacturer, 10) : NaN
    if (Number.isFinite(parsed) && parsed > 0) setSelectedManufacturerId(parsed)

    void loadCatalogs()
    manufacturerAPI
      .getManufacturers(token)
      .then((rows) => setManufacturers(asList<ManufacturerListItem>(rows)))
      .catch(() => setManufacturers([]))
  }, [router])

  const filteredCatalogs = useMemo(() => {
    if (!selectedManufacturerId) return catalogs
    return catalogs.filter((row) => row.manufacturer_id === selectedManufacturerId)
  }, [catalogs, selectedManufacturerId])

  const columns = useMemo<ColumnDef<Catalog>[]>(
    () => [
      {
        id: 'type',
        header: 'Type',
        enableSorting: false,
        size: 90,
        accessorFn: (row) => fileKind(row.catalog_file).label,
        cell: ({ row }) => {
          const kind = fileKind(row.original.catalog_file)
          return (
            <span className={kind.variant === 'file' ? styles.badgeMuted : styles.badgeOk}>
              {kind.label}
            </span>
          )
        },
      },
      {
        accessorKey: 'id',
        header: 'ID',
        size: 70,
        cell: ({ getValue }) => <span className={styles.idCell}>#{String(getValue())}</span>,
      },
      {
        accessorKey: 'name',
        header: 'Catalog',
        cell: ({ row }) => (
          <div className={styles.nameCell}>
            <strong title={row.original.name}>{row.original.name}</strong>
            <span className={styles.slug} title={row.original.slug}>
              {row.original.slug}
            </span>
          </div>
        ),
      },
      {
        id: 'manufacturer',
        header: 'Manufacturer',
        accessorFn: (row) => row.manufacturer?.name || '—',
        cell: ({ getValue }) => (
          <span className={styles.truncateCell} title={String(getValue() || '')}>
            {String(getValue() || '—')}
          </span>
        ),
      },
      {
        accessorKey: 'created_at',
        header: 'Uploaded',
        cell: ({ getValue }) => (
          <span className={styles.dateCell}>{formatDate(String(getValue() || ''))}</span>
        ),
      },
      {
        id: 'actions',
        header: 'Actions',
        enableSorting: false,
        cell: ({ row }) => (
          <RowActions
            viewLabel="Preview"
            editLabel="Open file"
            deleteLabel="Delete"
            onView={() => router.push(`/catalogs/${row.original.id}/preview`)}
            onEdit={
              row.original.catalog_file
                ? () => window.open(row.original.catalog_file, '_blank', 'noopener,noreferrer')
                : undefined
            }
            onDelete={() => setDeleteTarget(row.original)}
          />
        ),
      },
    ],
    [router]
  )

  const handleDelete = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    setError('')
    setNotice('')
    try {
      await catalogAPI.deleteCatalog(deleteTarget.id)
      setNotice(`Deleted ${deleteTarget.name}.`)
      setDeleteTarget(null)
      await loadCatalogs({ silent: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete catalog')
    } finally {
      setIsDeleting(false)
    }
  }

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
          subtitle="Uploaded manufacturer catalogs"
          user={user}
          showNavigation={true}
          currentPage="catalogs"
        />

        <section className={styles.content}>
          <div className={styles.toolbar}>
            <div>
              <h2 className={styles.title}>Catalogs</h2>
              <p className={styles.subtitle}>
                Search, sort and paginate uploaded catalog files. Filter by manufacturer, preview rows, or open the original spreadsheet.
              </p>
            </div>
            <div className={styles.toolbarActions}>
              {isAdmin ? (
                <label className={styles.manufacturerFilter}>
                  <span>Manufacturer</span>
                  <select
                    value={selectedManufacturerId ?? ''}
                    onChange={(event) => {
                      const next = event.target.value ? Number.parseInt(event.target.value, 10) : null
                      const manufacturer = Number.isFinite(next) && next && next > 0 ? next : null
                      setSelectedManufacturerId(manufacturer)
                      if (manufacturer) {
                        window.sessionStorage.setItem(MANUFACTURER_STORAGE_KEY, String(manufacturer))
                      } else {
                        window.sessionStorage.removeItem(MANUFACTURER_STORAGE_KEY)
                      }
                      setPagination((prev) => (prev.pageIndex === 0 ? prev : { ...prev, pageIndex: 0 }))
                    }}
                    aria-label="Select manufacturer"
                  >
                    <option value="">All manufacturers</option>
                    {manufacturers.map((manufacturer) => (
                      <option key={manufacturer.id} value={manufacturer.id}>
                        {manufacturer.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <button
                type="button"
                className={styles.addButton}
                onClick={() => void loadCatalogs()}
                disabled={isRefreshing}
              >
                <RefreshCw size={16} />
                {isRefreshing ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
          </div>

          {error ? <div className={styles.error}>{error}</div> : null}
          {notice ? <div className={styles.notice}>{notice}</div> : null}

          <div className={styles.tableCard}>
            <DataTable
              columns={columns}
              data={filteredCatalogs}
              total={filteredCatalogs.length}
              pageIndex={pagination.pageIndex}
              pageSize={pagination.pageSize}
              search={searchInput}
              sorting={sorting}
              onSearchChange={(value) => {
                setSearchInput(value)
                setPagination((prev) => (prev.pageIndex === 0 ? prev : { ...prev, pageIndex: 0 }))
              }}
              onPaginationChange={setPagination}
              onSortingChange={setSorting}
              searchPlaceholder="Search catalogs, slugs or manufacturers…"
              isLoading={isLoading}
              emptyMessage="No catalogs match this search."
              mode="client"
              getRowId={(row) => String(row.id)}
            />
          </div>
        </section>
      </div>

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Delete catalog"
        message={
          deleteTarget
            ? `Delete “${deleteTarget.name}”? This removes the uploaded file record.`
            : ''
        }
        confirmLabel="Delete catalog"
        isLoading={isDeleting}
        onCancel={() => !isDeleting && setDeleteTarget(null)}
        onConfirm={() => void handleDelete()}
      />
    </main>
  )
}
