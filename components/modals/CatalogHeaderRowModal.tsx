'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  extractColumnNamesFromRows,
  MAX_HEADER_PREVIEW_ROWS,
} from '@/lib/catalog-file-headers'
import {
  getCatalogColumnChecks,
  validateCatalogColumns,
  type CatalogColumnRuleRecord,
} from '@/lib/catalog-column-validation'
import styles from './CatalogHeaderRowModal.module.scss'

export type CatalogFileSelection = {
  file: File
  headerRowIndex: number
  columnNames: string[]
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
  for (let index = 0; index < limit; index++) {
    const columns = extractColumnNamesFromRows(rows, index)
    if (validateCatalogColumns(columns, rules).valid) return index
  }
  return 0
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
    if (!isOpen || !previewRows.length || !columnRules.length) return
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
  const validation = useMemo(
    () => validateCatalogColumns(columnNames, columnRules),
    [columnNames, columnRules]
  )

  const maxColumns = useMemo(
    () => Math.max(1, ...previewRows.map((row) => row.length)),
    [previewRows]
  )

  if (!isOpen || !file) return null

  const handleConfirm = () => {
    if (!validation.valid) return
    onConfirm({ file, headerRowIndex, columnNames })
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
              Choose the row that contains the column names used for catalog upload and image import.
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
            <h3 className={styles.validationTitle}>Required columns</h3>
            {!columnNames.length ? (
              <p className={styles.validationError}>This row has no column headers.</p>
            ) : (
              <ul className={styles.validationList}>
                {columnChecks.map((check) => (
                  <li
                    key={check.label}
                    className={check.satisfied ? styles.checkOk : styles.checkMissing}
                  >
                    <span>{check.label}</span>
                    {check.matchedColumn ? (
                      <span className={styles.matchedColumn}>→ {check.matchedColumn}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {!validation.valid && columnNames.length > 0 ? (
              <p className={styles.validationError}>{validation.message}</p>
            ) : null}
          </div>
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.cancelButton} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={styles.confirmButton}
            onClick={handleConfirm}
            disabled={!validation.valid}
          >
            Use this header row
          </button>
        </div>
      </div>
    </div>
  )
}
