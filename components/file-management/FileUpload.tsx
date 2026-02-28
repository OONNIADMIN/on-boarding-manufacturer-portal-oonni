'use client'

import { useState, useRef, DragEvent, ChangeEvent } from 'react'
import { catalogAPI, UploadResponse } from '@/lib/api'
import styles from './FileUpload.module.scss'

interface FileUploadProps {
  onSuccess?: (data: UploadResponse) => void
  onError?: (error: Error) => void
}

export default function FileUpload({ onSuccess, onError }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [scriptType, setScriptType] = useState<string>('categories')
  const [manufacturerId, setManufacturerId] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)

    const files = e.dataTransfer.files
    if (files.length > 0) {
      handleFileSelect(files[0])
    }
  }

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      handleFileSelect(files[0])
    }
  }

  const handleFileSelect = (file: File) => {
    setError(null)

    // Validate file type
    const allowedTypes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]
    const allowedExtensions = ['.csv', '.xls', '.xlsx']
    const fileExtension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'))

    if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExtension)) {
      setError('Invalid file type. Please upload a CSV or Excel file.')
      return
    }

    // Validate file size (10MB max)
    const maxSize = 10 * 1024 * 1024
    if (file.size > maxSize) {
      setError('File size exceeds 10MB limit.')
      return
    }

    setSelectedFile(file)
  }

  const handleUpload = async () => {
    if (!selectedFile) {
      setError('Please select a file first.')
      return
    }

    setIsUploading(true)
    setError(null)

    try {
      const manufacturerIdNum = manufacturerId ? parseInt(manufacturerId) : undefined
      const result = await catalogAPI.uploadFile(selectedFile, manufacturerIdNum)
      
      setSelectedFile(null)
      setManufacturerId('')
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      
      if (onSuccess) {
        onSuccess(result)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Upload failed'
      setError(errorMessage)
      if (onError) {
        onError(err as Error)
      }
    } finally {
      setIsUploading(false)
    }
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
    <div className={styles.container}>
      <div className={styles.uploadHeader}>
        {/* Script Selector */}
        <div className={styles.inputGroup}>
          
        </div>

        {/* File Chooser */}
        <div className={styles.inputGroup}>
          <label className={styles.sectionLabel}>Choose CSV File</label>
          <div
            className={`${styles.dropzone} ${isDragging ? styles.dragging : ''} ${selectedFile ? styles.hasFile : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xls,.xlsx"
              onChange={handleFileInputChange}
              className={styles.fileInput}
            />
            <button 
              type="button"
              className={styles.selectButton}
              onClick={handleClickUpload}
              disabled={isUploading}
            >
              Select File
            </button>
            <div className={styles.dropzoneContent}>
              {selectedFile ? (
                <span className={styles.fileName}>{selectedFile.name}</span>
              ) : (
                <span className={styles.dropzoneText}>No file selected</span>
              )}
            </div>
          </div>
        </div>

        {/* Run Script Button */}
        <div className={styles.inputGroup} style={{ paddingTop: '1.5rem' }}>
          <button
            onClick={handleUpload}
            disabled={!selectedFile || isUploading}
            className={styles.uploadButton}
          >
            {isUploading ? (
              <>
                <span className={styles.spinner}></span>
                Running...
              </>
            ) : (
              'Run Script'
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className={styles.error}>
          <span className={styles.errorIcon}>⚠️</span>
          {error}
        </div>
      )}
    </div>
  )
}

