'use client'

import { useRef, ChangeEvent } from 'react'
import styles from './FilePicker.module.scss'

interface CatalogFilePickerProps {
  onFileSelect: (file: File) => void
  selectedFile: File | null
}

export default function CatalogFilePicker({ onFileSelect, selectedFile }: CatalogFilePickerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      handleFileSelect(files[0])
    }
  }

  const handleFileSelect = (file: File) => {
    // Validate file type
    const allowedTypes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]
    const allowedExtensions = ['.csv', '.xls', '.xlsx']
    const fileExtension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'))

    if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExtension)) {
      alert('Invalid file type. Please upload a CSV or Excel file.')
      return
    }

    // Validate file size (10MB max)
    const maxSize = 10 * 1024 * 1024
    if (file.size > maxSize) {
      alert('File size exceeds 10MB limit.')
      return
    }

    onFileSelect(file)
  }

  const handleClickUpload = () => {
    fileInputRef.current?.click()
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
  }

  return (
    <div className={styles.filePicker}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.xls,.xlsx"
        onChange={handleFileInputChange}
        className={styles.fileInput}
      />
      
      <div 
        className={`${styles.dropzone} ${selectedFile ? styles.hasFile : ''}`}
        onClick={handleClickUpload}
      >
        <button 
          type="button"
          className={styles.selectButton}
          onClick={(e) => {
            e.stopPropagation()
            handleClickUpload()
          }}
        >
          Select Catalog File
        </button>
        
        <div className={styles.dropzoneContent}>
          {selectedFile ? (
            <>
              <svg className={styles.fileIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <div className={styles.fileDetails}>
                <span className={styles.fileName}>{selectedFile.name}</span>
                <span className={styles.fileSize}>{formatFileSize(selectedFile.size)}</span>
              </div>
            </>
          ) : (
            <span className={styles.dropzoneText}>No file selected</span>
          )}
        </div>
      </div>
    </div>
  )
}

