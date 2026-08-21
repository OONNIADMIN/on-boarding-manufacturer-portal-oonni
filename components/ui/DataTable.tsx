'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type UIEvent } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ExpandedState,
  type OnChangeFn,
  type PaginationState,
  type SortingState,
} from '@tanstack/react-table'
import { Search } from 'lucide-react'
import styles from './DataTable.module.scss'

export type DataTableProps<T> = {
  columns: ColumnDef<T, unknown>[]
  data: T[]
  total: number
  pageIndex: number
  pageSize: number
  search: string
  sorting?: SortingState
  onSearchChange: (value: string) => void
  onPaginationChange: (next: PaginationState) => void
  onSortingChange?: OnChangeFn<SortingState>
  searchPlaceholder?: string
  isLoading?: boolean
  emptyMessage?: string
  mode?: 'server' | 'client'
  getRowId?: (row: T) => string
  expanded?: ExpandedState
  onExpandedChange?: OnChangeFn<ExpandedState>
  getRowCanExpand?: (row: T) => boolean
  renderSubComponent?: (row: T) => ReactNode
  embedded?: boolean
  toolbarExtra?: ReactNode
}

export default function DataTable<T>({
  columns,
  data,
  total,
  pageIndex,
  pageSize,
  search,
  sorting = [],
  onSearchChange,
  onPaginationChange,
  onSortingChange,
  searchPlaceholder = 'Search…',
  isLoading = false,
  emptyMessage = 'No results found.',
  mode = 'server',
  getRowId,
  expanded,
  onExpandedChange,
  getRowCanExpand,
  renderSubComponent,
  embedded = false,
  toolbarExtra,
}: DataTableProps<T>) {
  const isServer = mode === 'server'
  const pageCount = isServer ? Math.max(1, Math.ceil(total / pageSize) || 1) : undefined

  const table = useReactTable({
    data,
    columns,
    ...(isServer ? { pageCount } : {}),
    state: {
      pagination: { pageIndex, pageSize },
      globalFilter: search,
      sorting,
      expanded: expanded ?? {},
    },
    manualPagination: isServer,
    manualFiltering: isServer,
    manualSorting: isServer && Boolean(onSortingChange),
    onPaginationChange: (updater) => {
      const current = { pageIndex, pageSize }
      const next = typeof updater === 'function' ? updater(current) : updater
      onPaginationChange(next)
    },
    onGlobalFilterChange: onSearchChange,
    onSortingChange,
    onExpandedChange,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: getRowId ? (row) => getRowId(row) : undefined,
    getRowCanExpand: getRowCanExpand ? (row) => getRowCanExpand(row.original) : undefined,
    globalFilterFn: (row, _columnId, filterValue) => {
      const query = String(filterValue ?? '').trim().toLowerCase()
      if (!query) return true
      return row.getAllCells().some((cell) =>
        String(cell.getValue() ?? '').toLowerCase().includes(query)
      )
    },
  })

  const filteredTotal = isServer ? total : table.getFilteredRowModel().rows.length
  const visiblePageCount = table.getPageCount() || 1

  const pageButtons = useMemo(() => {
    const current = pageIndex + 1
    const buttons: Array<number | '…'> = []
    for (let i = 1; i <= visiblePageCount; i++) {
      if (i === 1 || i === visiblePageCount || Math.abs(i - current) <= 2) {
        buttons.push(i)
      } else if (buttons[buttons.length - 1] !== '…') {
        buttons.push('…')
      }
    }
    return buttons
  }, [pageIndex, visiblePageCount])

  const startItem = filteredTotal === 0 ? 0 : pageIndex * pageSize + 1
  const endItem = Math.min((pageIndex + 1) * pageSize, filteredTotal)
  const topScrollRef = useRef<HTMLDivElement>(null)
  const tableWrapRef = useRef<HTMLDivElement>(null)
  const syncingScroll = useRef(false)
  const [topScrollWidth, setTopScrollWidth] = useState(0)
  const [showTopScroll, setShowTopScroll] = useState(false)

  const measureTableScroll = useCallback(() => {
    const wrap = tableWrapRef.current
    if (!wrap) return
    setTopScrollWidth(wrap.scrollWidth)
    setShowTopScroll(wrap.scrollWidth > wrap.clientWidth + 1)
  }, [])

  useEffect(() => {
    const wrap = tableWrapRef.current
    if (!wrap) return
    measureTableScroll()
    const observer = new ResizeObserver(measureTableScroll)
    observer.observe(wrap)
    const table = wrap.querySelector('table')
    if (table) observer.observe(table)
    window.addEventListener('resize', measureTableScroll)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measureTableScroll)
    }
  }, [measureTableScroll, data, columns, expanded, isLoading, pageSize])

  const onTopScroll = (event: UIEvent<HTMLDivElement>) => {
    if (syncingScroll.current) return
    syncingScroll.current = true
    if (tableWrapRef.current) tableWrapRef.current.scrollLeft = event.currentTarget.scrollLeft
    syncingScroll.current = false
  }

  const onTableScroll = (event: UIEvent<HTMLDivElement>) => {
    if (syncingScroll.current) return
    syncingScroll.current = true
    if (topScrollRef.current) topScrollRef.current.scrollLeft = event.currentTarget.scrollLeft
    syncingScroll.current = false
  }

  return (
    <div className={embedded ? `${styles.wrapper} ${styles.embedded}` : styles.wrapper}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarStart}>
          <label className={styles.search}>
            <Search size={16} aria-hidden />
            <input
              type="search"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={searchPlaceholder}
              aria-label="Search table"
            />
          </label>
          {toolbarExtra}
        </div>
        <div className={styles.pageSize}>
          <span>Rows</span>
          <select
            value={pageSize}
            onChange={(event) => onPaginationChange({ pageIndex: 0, pageSize: Number(event.target.value) })}
          >
            {[10, 20, 50].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>
      </div>

      {showTopScroll ? (
        <div
          ref={topScrollRef}
          className={styles.topScroll}
          onScroll={onTopScroll}
          aria-label="Table horizontal scroll"
        >
          <div className={styles.topScrollInner} style={{ width: topScrollWidth }} />
        </div>
      ) : null}

      <div ref={tableWrapRef} className={styles.tableWrap} onScroll={onTableScroll}>
        <table className={styles.table}>
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort()
                  return (
                    <th key={header.id} style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}>
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          className={styles.sortButton}
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <span className={styles.sortMark}>
                            {header.column.getIsSorted() === 'asc'
                              ? '↑'
                              : header.column.getIsSorted() === 'desc'
                                ? '↓'
                                : '↕'}
                          </span>
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={columns.length} className={styles.centered}>
                  Loading…
                </td>
              </tr>
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className={styles.centered}>
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <Fragment key={row.id}>
                  <tr className={row.getIsExpanded() ? styles.expandedRow : undefined}>
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                    ))}
                  </tr>
                  {row.getIsExpanded() && renderSubComponent ? (
                    <tr className={styles.subRow}>
                      <td colSpan={row.getVisibleCells().length}>{renderSubComponent(row.original)}</td>
                    </tr>
                  ) : null}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className={styles.footer}>
        <span className={styles.count}>
          Showing {startItem}-{endItem} of {filteredTotal}
        </span>
        <div className={styles.pager}>
          <button
            type="button"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
          >
            Previous
          </button>
          {pageButtons.map((item, index) =>
            item === '…' ? (
              <span key={`dots-${index}`} className={styles.dots}>
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                className={item === pageIndex + 1 ? styles.activePage : undefined}
                onClick={() => table.setPageIndex(item - 1)}
              >
                {item}
              </button>
            )
          )}
          <button
            type="button"
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )
}
