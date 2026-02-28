'use client'

import { useRef, ChangeEvent } from 'react'
import styles from './FilePicker.module.scss'

interface ImageFilesPickerProps {
  onFilesSelect: (files: File[]) => void
  selectedFiles: File[]
}

export default function ImageFilesPicker({ onFilesSelect, selectedFiles }: ImageFilesPickerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      handleFilesSelect(Array.from(files))
    }
  }

  const handleFilesSelect = (files: File[]) => {
    // Validate file types
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
    const invalidFiles = files.filter(file => !allowedTypes.includes(file.type))
    
    if (invalidFiles.length > 0) {
      alert(`Invalid file type(s). Please upload only images (JPEG, PNG, WebP, GIF).\nInvalid: ${invalidFiles.map(f => f.name).join(', ')}`)
      return
    }

    // Validate file sizes (50MB max per file)
    const maxSize = 50 * 1024 * 1024
    const oversizedFiles = files.filter(file => file.size > maxSize)
    
    if (oversizedFiles.length > 0) {
      alert(`Some files exceed 50MB limit:\n${oversizedFiles.map(f => f.name).join(', ')}`)
      return
    }

    onFilesSelect(files)
  }

  const handleClickUpload = () => {
    fileInputRef.current?.click()
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
  }

  const handleRemoveFile = (index: number, e: React.MouseEvent) => {
    e.stopPropagation()
    const newFiles = selectedFiles.filter((_, i) => i !== index)
    onFilesSelect(newFiles)
  }

  return (
    <div className={styles.filePicker}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
        onChange={handleFileInputChange}
        multiple
        className={styles.fileInput}
      />
      
      <div 
        className={`${styles.dropzone} ${selectedFiles.length > 0 ? styles.hasFile : ''}`}
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
          Select Images
        </button>
        
        <div className={styles.dropzoneContent}>
          {selectedFiles.length > 0 ? (
            <div className={styles.imagesList}>
              <div className={styles.imagesHeader}>
                <svg className={styles.fileIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className={styles.imagesCount}>{selectedFiles.length} image(s) selected</span>
              </div>
              <div className={styles.filesListContainer}>
                {selectedFiles.map((file, index) => (
                  <div key={index} className={styles.fileItem}>
                    <span className={styles.fileName}>{file.name}</span>
                    <span className={styles.fileSize}>{formatFileSize(file.size)}</span>
                    <button
                      type="button"
                      className={styles.removeButton}
                      onClick={(e) => handleRemoveFile(index, e)}
                      title="Remove file"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <span className={styles.dropzoneText}>No images selected</span>
          )}
        </div>
      </div>
    </div>
  )
}

