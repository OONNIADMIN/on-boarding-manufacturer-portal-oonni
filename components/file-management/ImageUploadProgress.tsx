'use client'

import { useState, useEffect } from 'react'
import styles from './ImageUploadProgress.module.scss'

interface ImageUploadProgressProps {
  totalImages: number
  uploadedImages: number
  failedImages: number
  isUploading: boolean
  onCancel?: () => void
}

export default function ImageUploadProgress({
  totalImages,
  uploadedImages,
  failedImages,
  isUploading,
  onCancel
}: ImageUploadProgressProps) {
  const [progress, setProgress] = useState(0)
  const [missingImages, setMissingImages] = useState(0)

  useEffect(() => {
    if (totalImages > 0) {
      const progressPercentage = (uploadedImages / totalImages) * 100
      setProgress(progressPercentage)
      setMissingImages(totalImages - uploadedImages - failedImages)
    } else {
      setProgress(0)
      setMissingImages(0)
    }
  }, [totalImages, uploadedImages, failedImages])

  if (!isUploading && totalImages === 0) {
    return null
  }

  return (
    <div className={styles.progressContainer}>
      <div className={styles.progressHeader}>
        <div className={styles.progressTitle}>
          <svg className={styles.uploadIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <span>Uploading Product Images</span>
        </div>
        {onCancel && isUploading && (
          <button 
            className={styles.cancelButton}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
        )}
      </div>

      <div className={styles.progressBar}>
        <div 
          className={styles.progressFill}
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className={styles.progressStats}>
        <div className={styles.statItem}>
          <span className={styles.statLabel}>Total Images:</span>
          <span className={styles.statValue}>{totalImages || 'Preparing...'}</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statLabel}>Uploaded:</span>
          <span className={`${styles.statValue} ${styles.success}`}>{uploadedImages}</span>
        </div>
        {failedImages > 0 && (
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Failed:</span>
            <span className={`${styles.statValue} ${styles.error}`}>{failedImages}</span>
          </div>
        )}
        {missingImages > 0 && (
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Remaining:</span>
            <span className={`${styles.statValue} ${styles.warning}`}>{missingImages}</span>
          </div>
        )}
      </div>

      <div className={styles.progressPercentage}>
        {Math.round(progress)}% Complete
      </div>

      {isUploading && (
        <div className={styles.uploadingIndicator}>
          <div className={styles.spinner}></div>
          <span>
            {totalImages === 0 ? 'Preparing upload...' : 'Uploading images...'}
          </span>
        </div>
      )}

      {!isUploading && uploadedImages > 0 && (
        <div className={styles.completionMessage}>
          <svg className={styles.successIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>
            {uploadedImages === totalImages 
              ? `Successfully uploaded all ${totalImages} images!`
              : `Uploaded ${uploadedImages} of ${totalImages} images${failedImages > 0 ? ` (${failedImages} failed)` : ''}`
            }
          </span>
        </div>
      )}
    </div>
  )
}
