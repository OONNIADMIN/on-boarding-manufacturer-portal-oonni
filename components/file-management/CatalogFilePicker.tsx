'use client'

import { useRef, ChangeEvent, useState } from 'react'
import CatalogHeaderRowModal, { type CatalogFileSelection } from '@/components/modals/CatalogHeaderRowModal'
import { parseSpreadsheetPreviewFromFile } from '@/lib/catalog-file-headers'
import { catalogColumnRulesAPI } from '@/lib/api'
import type { CatalogColumnRuleRecord } from '@/lib/catalog-column-validation'
import styles from './FilePicker.module.scss'

export type { CatalogFileSelection }

interface CatalogFilePickerProps {
  onFileSelect: (selection: CatalogFileSelection) => void
  selectedFile: File | null
  headerRowIndex?: number | null
  onValidationError?: (message: string) => void
  /** Larger dropzone for layouts that span full width (e.g. onboard catalog-only step). */
  size?: 'default' | 'large'
}

export default function CatalogFilePicker({
  onFileSelect,
  selectedFile,
  headerRowIndex,
  onValidationError,
  size = 'default',
}: CatalogFilePickerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isReadingFile, setIsReadingFile] = useState(false)
  const [previewRows, setPreviewRows] = useState<string[][]>([])
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [columnRules, setColumnRules] = useState<CatalogColumnRuleRecord[]>([])
  const [isHeaderModalOpen, setIsHeaderModalOpen] = useState(false)

  const resetFileInput = () => {
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      void handleFileSelect(files[0])
    }
  }

  const handleFileSelect = async (file: File) => {
    const allowedTypes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ]
    const allowedExtensions = ['.csv', '.xls', '.xlsx']
    const fileExtension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'))

    if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExtension)) {
      const message = 'Invalid file type. Please upload a CSV or Excel file.'
      onValidationError?.(message)
      alert(message)
      resetFileInput()
      return
    }

    const maxSize = 10 * 1024 * 1024
    if (file.size > maxSize) {
      const message = 'File size exceeds 10MB limit.'
      onValidationError?.(message)
      alert(message)
      resetFileInput()
      return
    }

    setIsReadingFile(true)
    try {
      const rows = await parseSpreadsheetPreviewFromFile(file)
      if (!rows.length) {
        const message = 'The file appears to be empty. Add your catalog data and try again.'
        onValidationError?.(message)
        resetFileInput()
        return
      }

      const rules = await catalogColumnRulesAPI.listForUpload()
      if (!rules.length) {
        onValidationError?.('No catalog column rules are configured. Contact your administrator.')
        resetFileInput()
        return
      }

      setPendingFile(file)
      setPreviewRows(rows)
      setColumnRules(rules)
      setIsHeaderModalOpen(true)
    } catch {
      const message =
        'Could not read the file. Check the format and use the catalog template with  column headers.'
      onValidationError?.(message)
      resetFileInput()
    } finally {
      setIsReadingFile(false)
    }
  }

  const handleHeaderModalClose = () => {
    setIsHeaderModalOpen(false)
    setPendingFile(null)
    setPreviewRows([])
    resetFileInput()
  }

  const handleHeaderModalConfirm = (selection: CatalogFileSelection) => {
    setIsHeaderModalOpen(false)
    setPendingFile(null)
    setPreviewRows([])
    onFileSelect(selection)
  }

  const handleClickUpload = () => {
    fileInputRef.current?.click()
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
  }

  const dropzoneClass =
    size === 'large'
      ? `${styles.dropzone} ${styles.dropzoneLarge}`
      : styles.dropzone

  const isLarge = size === 'large'

  return (
    <>
      <div className={`${styles.filePicker} ${isLarge ? styles.filePickerStretch : ''}`}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xls,.xlsx"
          onChange={handleFileInputChange}
          className={styles.fileInput}
        />

        <div
          className={`${dropzoneClass} ${selectedFile ? styles.hasFile : ''}`}
          onClick={handleClickUpload}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              handleClickUpload()
            }
          }}
        >
          {isLarge ? (
            <div className={styles.dropzoneInner}>
              <button
                type="button"
                className={styles.selectButton}
                disabled={isReadingFile}
                onClick={(e) => {
                  e.stopPropagation()
                  handleClickUpload()
                }}
              >
                {isReadingFile ? 'Reading file…' : 'Upload Excel or CSV Template'}
              </button>
              {selectedFile && (
                <div className={styles.dropzoneContent}>
                  <svg className={styles.fileIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.75}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <div className={styles.fileDetails}>
                    <span className={styles.fileName}>{selectedFile.name}</span>
                    <span className={styles.fileSize}>
                      {formatFileSize(selectedFile.size)}
                      {headerRowIndex != null ? ` · Header row ${headerRowIndex + 1}` : ''}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              <button
                type="button"
                className={styles.selectButton}
                disabled={isReadingFile}
                onClick={(e) => {
                  e.stopPropagation()
                  handleClickUpload()
                }}
              >
                {isReadingFile ? 'Reading file…' : 'Select File'}
              </button>
              <div className={styles.dropzoneContent}>
                {selectedFile ? (
                  <>
                    <svg className={styles.fileIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    <div className={styles.fileDetails}>
                      <span className={styles.fileName}>{selectedFile.name}</span>
                      <span className={styles.fileSize}>
                        {formatFileSize(selectedFile.size)}
                        {headerRowIndex != null ? ` · Header row ${headerRowIndex + 1}` : ''}
                      </span>
                    </div>
                  </>
                ) : (
                  <span className={styles.dropzoneText}>No file selected</span>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <CatalogHeaderRowModal
        isOpen={isHeaderModalOpen}
        file={pendingFile}
        previewRows={previewRows}
        columnRules={columnRules}
        onClose={handleHeaderModalClose}
        onConfirm={handleHeaderModalConfirm}
      />
    </>
  )
}
