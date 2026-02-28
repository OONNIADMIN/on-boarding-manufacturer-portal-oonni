'use client'

import { useState, useRef, DragEvent, ChangeEvent } from 'react'
import { imageAPI, ImageUploadResponse } from '@/lib/api'
import styles from './ImageUpload.module.scss'

interface ImageUploadProps {
  onSuccess?: (result: ImageUploadResponse[]) => void
  onError?: (error: Error) => void
  manufacturerId?: number
  maxFiles?: number
}

export default function ImageUpload({ onSuccess, onError, manufacturerId, maxFiles = 10 }: ImageUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({})
  const fileInputRef = useRef<HTMLInputElement>(null)
  const justUploadedRef = useRef(false)

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

    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      handleFileSelect(files)
    }
  }

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      handleFileSelect(Array.from(files))
    }
  }

  const handleFileSelect = (files: File[]) => {
    setError(null)

    // Check if adding these files would exceed the maximum
    if (selectedFiles.length + files.length > maxFiles) {
      setError(`Maximum ${maxFiles} files allowed. You can upload ${maxFiles - selectedFiles.length} more files.`)
      return
    }

    const allowedTypes = [
      'image/jpeg',
      'image/jpg', 
      'image/png',
      'image/webp',
      'image/gif',
      'image/bmp',
      'image/tiff'
    ]
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff']
    const maxSize = 50 * 1024 * 1024 // 50MB

    const validFiles: File[] = []
    const errors: string[] = []

    files.forEach((file, index) => {
      const fileExtension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'))
      
      if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExtension)) {
        errors.push(`${file.name}: Invalid file type`)
        return
      }

      if (file.size > maxSize) {
        errors.push(`${file.name}: File size exceeds 50MB`)
        return
      }

      validFiles.push(file)
    })

    if (errors.length > 0) {
      setError(errors.join(', '))
      return
    }

    setSelectedFiles(prev => [...prev, ...validFiles])
  }

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      setError('Please select at least one image.')
      return
    }
    
    if (!manufacturerId) {
      setError('Manufacturer ID is required for uploading images.')
      return
    }

    setIsUploading(true)
    setError(null)
    setUploadProgress({})

    const results: ImageUploadResponse[] = []
    const errors: string[] = []

    try {
      // Upload files sequentially to avoid overwhelming the server
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i]
        const fileKey = `${file.name}-${file.size}`
        
        try {
          setUploadProgress(prev => ({ ...prev, [fileKey]: 0 }))
          
          const result = await imageAPI.uploadImage(file, manufacturerId)
          results.push(result)
          
          setUploadProgress(prev => ({ ...prev, [fileKey]: 100 }))
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Upload failed'
          errors.push(`${file.name}: ${errorMessage}`)
        }
      }

      if (errors.length > 0) {
        setError(errors.join(', '))
        if (onError) {
          onError(new Error(errors.join(', ')))
        }
      }

      if (results.length > 0) {
        // Reset file input and state
        setSelectedFiles([])
        justUploadedRef.current = true
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
        
        if (onSuccess) {
          onSuccess(results)
        }
        
        // Reset the justUploaded flag after a short delay
        setTimeout(() => {
          justUploadedRef.current = false
        }, 1000)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Upload failed'
      setError(errorMessage)
      if (onError) {
        onError(err as Error)
      }
    } finally {
      setIsUploading(false)
      setUploadProgress({})
    }
  }

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index))
  }

  const clearAllFiles = () => {
    setSelectedFiles([])
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>Upload Product Images</h3>
        <p className={styles.subtitle}>
          Upload and optimize multiple product images at once. Images will be automatically converted to WebP format and resized for optimal performance. (Max {maxFiles} files)
        </p>
      </div>

      <div
        className={`${styles.dropZone} ${isDragging ? styles.dragging : ''} ${error ? styles.error : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileInputChange}
          className={styles.fileInput}
        />
        
        <div className={styles.dropContent}>
          <div className={styles.uploadIcon}>
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" 
              />
            </svg>
          </div>
          
          <div className={styles.uploadText}>
            <p className={styles.primaryText}>
              {isDragging ? 'Drop your images here' : 'Click to upload or drag and drop'}
            </p>
            <p className={styles.secondaryText}>
              JPG, PNG, WebP, GIF, BMP, or TIFF (max 50MB each, up to {maxFiles} files)
            </p>
          </div>
        </div>
      </div>

      {selectedFiles.length > 0 && (
        <div className={styles.filesPreview}>
          <div className={styles.filesHeader}>
            <h4 className={styles.filesTitle}>
              Selected Files ({selectedFiles.length}/{maxFiles})
            </h4>
            <button
              onClick={clearAllFiles}
              className={styles.clearAllButton}
              disabled={isUploading}
            >
              Clear All
            </button>
          </div>
          
          <div className={styles.filesList}>
            {selectedFiles.map((file, index) => {
              const fileKey = `${file.name}-${file.size}`
              const progress = uploadProgress[fileKey] || 0
              
              return (
                <div key={fileKey} className={styles.fileItem}>
                  <div className={styles.fileInfo}>
                    <div className={styles.fileIcon}>
                      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path 
                          strokeLinecap="round" 
                          strokeLinejoin="round" 
                          strokeWidth={2} 
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" 
                        />
                      </svg>
                    </div>
                    <div className={styles.fileDetails}>
                      <p className={styles.fileName}>{file.name}</p>
                      <p className={styles.fileSize}>{formatFileSize(file.size)}</p>
                      {progress > 0 && progress < 100 && (
                        <div className={styles.progressBar}>
                          <div 
                            className={styles.progressFill} 
                            style={{ width: `${progress}%` }}
                          ></div>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <button
                    onClick={() => removeFile(index)}
                    className={styles.removeButton}
                    disabled={isUploading}
                    title="Remove file"
                  >
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                        strokeWidth={2} 
                        d="M6 18L18 6M6 6l12 12" 
                      />
                    </svg>
                  </button>
                </div>
              )
            })}
          </div>
          
          <div className={styles.uploadActions}>
            <button
              onClick={handleUpload}
              disabled={isUploading || selectedFiles.length === 0}
              className={styles.uploadButton}
            >
              {isUploading ? (
                <>
                  <div className={styles.spinner}></div>
                  Uploading {selectedFiles.length} files...
                </>
              ) : (
                <>
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      strokeWidth={2} 
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" 
                    />
                  </svg>
                  Upload {selectedFiles.length} Images
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className={styles.errorMessage}>
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" 
            />
          </svg>
          {error}
        </div>
      )}
    </div>
  )
}
