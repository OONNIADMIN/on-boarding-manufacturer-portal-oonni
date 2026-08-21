'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  extractColumnNamesFromRows,
  extractHeaderRowCells,
  MAX_HEADER_PREVIEW_ROWS,
} from '@/lib/catalog-file-headers'
import {
  getCatalogColumnChecks,
  scoreCatalogColumnMatches,
  type CatalogColumnRuleRecord,
} from '@/lib/catalog-column-validation'
import {
  detectImageUrlColumns,
  detectSkuColumn,
  IMAGE_COLUMN_SAMPLE_ROWS,
} from '@/lib/catalog-column-detection'
import styles from './CatalogHeaderRowModal.module.scss'

export type CatalogFileSelection = {
  file: File
  headerRowIndex: number
  columnNames: string[]
  /** Rule label (lowercase) → matched spreadsheet header from validation */
  columnMappings: Record<string, string>
  /** Every header that holds image URLs (Image 1, Image 2, images, …) */
  imageColumns: string[]
  /** Full header row (empty cells kept) so image-column indexes stay aligned */
  headerCells: string[]
  /** First data rows after the header, used to detect image URL columns */
  sampleRows: string[][]
}

interface CatalogHeaderRowModalProps {
  isOpen: boolean
  file: File | null
  previewRows: string[][]
  columnRules: CatalogColumnRuleRecord[]
  onClose: () => void
  onConfirm: (selection: CatalogFileSelection) => void
}

function suggestHeaderRowIndex(rows: string[][], rules: CatalogColumnRuleRecord[]): number {
  const limit = Math.min(rows.length, MAX_HEADER_PREVIEW_ROWS)
  let bestIndex = 0
  let bestScore = -1

  for (let index = 0; index < limit; index++) {
    const columns = extractColumnNamesFromRows(rows, index)
    const headerCells = extractHeaderRowCells(rows, index)
    const skuColumn = detectSkuColumn(columns, rules)
    const imageHits = detectImageUrlColumns(
      headerCells,
      skuColumn,
      rules,
      rows.slice(index + 1, index + 1 + IMAGE_COLUMN_SAMPLE_ROWS)
    ).length
    const score = columns.length
      ? (rules.length ? scoreCatalogColumnMatches(columns, rules) : columns.length) + imageHits
      : 0
    if (score > bestScore) {
      bestScore = score
      bestIndex = index
    }
  }

  return bestIndex
}

function formatPreviewCell(value: string): string {
  if (!value) return '—'
  return value.length > 42 ? `${value.slice(0, 39)}…` : value
}

export default function CatalogHeaderRowModal({
  isOpen,
  file,
  previewRows,
  columnRules,
  onClose,
  onConfirm,
}: CatalogHeaderRowModalProps) {
  const [headerRowIndex, setHeaderRowIndex] = useState(0)

  useEffect(() => {
    if (!isOpen || !previewRows.length) return
    setHeaderRowIndex(suggestHeaderRowIndex(previewRows, columnRules))
  }, [isOpen, previewRows, file?.name, columnRules])

  const columnNames = useMemo(
    () => extractColumnNamesFromRows(previewRows, headerRowIndex),
    [previewRows, headerRowIndex]
  )

  const columnChecks = useMemo(
    () => getCatalogColumnChecks(columnNames, columnRules),
    [columnNames, columnRules]
  )

  const headerCells = useMemo(
    () => extractHeaderRowCells(previewRows, headerRowIndex),
    [previewRows, headerRowIndex]
  )

  const sampleRows = useMemo(
    () => previewRows.slice(headerRowIndex + 1, headerRowIndex + 1 + IMAGE_COLUMN_SAMPLE_ROWS),
    [previewRows, headerRowIndex]
  )

  const detectedImageColumns = useMemo(() => {
    const skuColumn =
      columnChecks.find((check) => check.label.trim().toLowerCase() === 'sku')?.matchedColumn ??
      detectSkuColumn(columnNames, columnRules)
    return detectImageUrlColumns(headerCells, skuColumn, columnRules, sampleRows)
  }, [headerCells, sampleRows, columnNames, columnRules, columnChecks])

  const maxColumns = useMemo(
    () => Math.max(1, ...previewRows.map((row) => row.length)),
    [previewRows]
  )

  if (!isOpen || !file) return null

  const handleConfirm = () => {
    const columnMappings: Record<string, string> = {}
    for (const check of columnChecks) {
      if (check.matchedColumn) {
        columnMappings[check.label.trim().toLowerCase()] = check.matchedColumn
      }
    }
    if (detectedImageColumns[0]) {
      columnMappings.images = detectedImageColumns[0]
    }
    onConfirm({
      file,
      headerRowIndex,
      columnNames,
      columnMappings,
      imageColumns: detectedImageColumns,
      headerCells,
      sampleRows,
    })
  }

  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div
        className={styles.modal}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="catalog-header-row-title"
      >
        <div className={styles.header}>
          <div>
            <h2 id="catalog-header-row-title" className={styles.title}>
              Select header row
            </h2>
            <p className={styles.subtitle}>
              Choose the row that contains the column names. Each column is checked
              in the next 10 rows for image URLs (.jpg, .png, or an /image/ path).
            </p>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className={styles.body}>
          <p className={styles.fileName}>{file.name}</p>

          <div className={styles.previewWrap}>
            <table className={styles.previewTable}>
              <tbody>
                {previewRows.map((row, rowIndex) => {
                  const isSelected = rowIndex === headerRowIndex
                  const paddedRow = [...row]
                  while (paddedRow.length < maxColumns) paddedRow.push('')

                  return (
                    <tr key={rowIndex} className={isSelected ? styles.selectedRow : undefined}>
                      <th scope="row" className={styles.rowSelectorCell}>
                        <label className={styles.rowSelectorLabel}>
                          <input
                            type="radio"
                            name="catalog-header-row"
                            checked={isSelected}
                            onChange={() => setHeaderRowIndex(rowIndex)}
                          />
                          <span>Row {rowIndex + 1}</span>
                        </label>
                      </th>
                      {paddedRow.map((cell, cellIndex) => (
                        <td key={`${rowIndex}-${cellIndex}`} title={cell || undefined}>
                          {formatPreviewCell(cell)}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className={styles.validationPanel}>
            <h3 className={styles.validationTitle}>Expected columns (informational)</h3>
            <p className={styles.validationHint}>
              Image columns are detected from URLs in the next 10 rows (.jpg, .png, or an /image/
              path), not only from the header name. Missing columns will not block upload.
            </p>
            {!columnNames.length ? (
              <p className={styles.validationNote}>This row has no column headers.</p>
            ) : columnChecks.length === 0 ? (
              <p className={styles.validationNote}>
                No column guide is configured. You can continue with the selected header row.
              </p>
            ) : (
              <ul className={styles.validationList}>
                {columnChecks.map((check) => {
                  const isImagesRule = check.label.trim().toLowerCase() === 'images'
                  const matchedNames = isImagesRule
                    ? detectedImageColumns
                    : check.matchedColumn
                      ? [check.matchedColumn]
                      : []
                  const satisfied = matchedNames.length > 0

                  return (
                    <li
                      key={check.label}
                      className={satisfied ? styles.checkOk : styles.checkMissing}
                    >
                      <span>{check.label}</span>
                      {matchedNames.length ? (
                        <span className={styles.matchedColumn}>→ {matchedNames.join(', ')}</span>
                      ) : (
                        <span className={styles.notFoundLabel}>Not found in this row</span>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.cancelButton} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={styles.confirmButton} onClick={handleConfirm}>
            Use this header row
          </button>
        </div>
      </div>
    </div>
  )
}
