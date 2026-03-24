'use client'

import { useState, useEffect } from 'react'
import { imageAPI, ImageInfo } from '@/lib/api'
import Pagination from '@/components/ui/Pagination'
import styles from './ImageList.module.scss'

export default function ImageList() {
  const [images, setImages] = useState<ImageInfo[]>([])
  const [filteredImages, setFilteredImages] = useState<ImageInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'size'>('date')
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(12)

  const loadImages = async () => {
    setIsLoading(true)
    setError(null)
    
    try {
      const response = await imageAPI.listImages()
      const list = response?.images
      setImages(Array.isArray(list) ? list : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load images')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadImages()
  }, [])

  useEffect(() => {
    const source = images ?? []
    let filtered = [...source]

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter((image) =>
        (image.s3_key ?? "").toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    // Sort images
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return (a.s3_key ?? "").localeCompare(b.s3_key ?? "")
        case 'size':
          return (b.size_bytes ?? 0) - (a.size_bytes ?? 0)
        case 'date':
        default:
          return new Date(b.last_modified ?? 0).getTime() - new Date(a.last_modified ?? 0).getTime()
      }
    })

    setFilteredImages(filtered)
    setCurrentPage(1) // Reset to first page when filters change
  }, [images, searchTerm, sortBy])

  const handleDelete = async (imageKey: string) => {
    if (!confirm(`Are you sure you want to delete this image?`)) {
      return
    }

    try {
      await imageAPI.deleteImage(imageKey)
      setImages(prev => prev.filter(img => img.s3_key !== imageKey))
    } catch (err) {
      alert(`Failed to delete image: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const handleOpenInNewTab = (url: string) => {
    if (!url) return
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
  }

  const formatDate = (dateString: string): string => {
    if (!dateString) return "—"
    const date = new Date(dateString)
    if (Number.isNaN(date.getTime())) return "—"
    return date.toLocaleString()
  }

  const displayImageName = (image: ImageInfo): string => {
    const orig = image.original_filename?.trim()
    if (orig) return orig
    const base = (image.s3_key ?? '').split('/').pop() ?? ''
    if (!base) return 'Unknown'
    const withoutStamp = base.replace(/^\d{4}-\d{2}-\d{2}T[\d-]+Z_/, '')
    return withoutStamp || base
  }

  const getFileIcon = (fileType: string | undefined): string => {
    if (!fileType) {
      return '📷'
    }
    
    switch (fileType.toLowerCase()) {
      case '.jpg':
      case '.jpeg':
        return '🖼️'
      case '.png':
        return '🖼️'
      case '.webp':
        return '🖼️'
      case '.gif':
        return '🎞️'
      case '.bmp':
        return '🖼️'
      case '.tiff':
        return '🖼️'
      default:
        return '📷'
    }
  }

  // Pagination calculations
  const safeFiltered = filteredImages ?? []
  const totalPages = Math.ceil(safeFiltered.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedImages = safeFiltered.slice(startIndex, endIndex)

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
  }

  const handleItemsPerPageChange = (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage)
    setCurrentPage(1) // Reset to first page when changing items per page
  }

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingContainer}>
          <div className={styles.spinner}></div>
          <p>Loading images...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.errorContainer}>
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" 
            />
          </svg>
          <p>{error}</p>
          <button onClick={loadImages} className={styles.retryButton}>
            Try Again
          </button>
        </div>
      </div>
    )
  }

  if (!images?.length) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyContainer}>
          <div className={styles.emptyIcon}>
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" 
              />
            </svg>
          </div>
          <h3>No images uploaded yet</h3>
          <p>Upload your first product image to get started.</p>
          <p className={styles.emptyHint}>
            This list combines your database records and files in your ImageKit images folder. If you still see nothing, confirm the manufacturer slug (or ImageKit media root) in admin matches the folder where your files live, then use Refresh.
          </p>
        </div>
      </div>
    )
  }

  if (!safeFiltered.length && searchTerm) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h2 className={styles.title}>Uploaded Images</h2>
          <button onClick={loadImages} className={styles.refreshButton}>
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" 
              />
            </svg>
            Refresh
          </button>
        </div>
        
        <div className={styles.searchControls}>
          <div className={styles.searchInput}>
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" 
              />
            </svg>
            <input
              type="text"
              placeholder="Search images..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'name' | 'date' | 'size')}
            className={styles.sortSelect}
          >
            <option value="date">Sort by Date</option>
            <option value="name">Sort by Name</option>
            <option value="size">Sort by Size</option>
          </select>
        </div>

        <div className={styles.emptyContainer}>
          <div className={styles.emptyIcon}>
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" 
              />
            </svg>
          </div>
          <h3>No images found</h3>
          <p>No images match your search criteria</p>
          <button 
            onClick={() => setSearchTerm('')} 
            className={styles.clearSearchButton}
          >
            Clear Search
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>Uploaded Images</h2>
        <button onClick={loadImages} className={styles.refreshButton}>
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" 
            />
          </svg>
          Refresh
        </button>
      </div>

      <div className={styles.searchControls}>
        <div className={styles.searchInput}>
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" 
            />
          </svg>
          <input
            type="text"
            placeholder="Search images..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'name' | 'date' | 'size')}
          className={styles.sortSelect}
        >
          <option value="date">Sort by Date</option>
          <option value="name">Sort by Name</option>
          <option value="size">Sort by Size</option>
        </select>
      </div>

      <div className={styles.imageGrid}>
        {paginatedImages.map((image) => (
          <div key={image.s3_key} className={styles.imageCard}>
            <div className={styles.imagePreview}>
              <img 
                src={image.s3_url} 
                alt="Uploaded image"
                className={styles.image}
                loading="lazy"
                onError={(e) => {
                  const target = e.target as HTMLImageElement
                  target.style.display = 'none'
                  target.nextElementSibling?.classList.add(styles.show)
                }}
              />
              <div className={styles.imagePlaceholder}>
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" 
                  />
                </svg>
              </div>
            </div>
            
            <div className={styles.imageInfo}>
              <div className={styles.imageDetails}>
                <div className={styles.imageIcon}>
                  {getFileIcon(image.file_type)}
                </div>
                <div className={styles.imageMeta}>
                  <p className={styles.imageName}>
                    {displayImageName(image)}
                  </p>
                  <p className={styles.imageSize}>{formatFileSize(image.size_bytes ?? 0)}</p>
                  <p className={styles.imageDate}>{formatDate(image.last_modified ?? image.created_at ?? "")}</p>
                </div>
              </div>
              
              <div className={styles.imageActions}>
                <button
                  onClick={() => handleOpenInNewTab(image.s3_url)}
                  className={styles.viewButton}
                  title="Open in new tab"
                >
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M14 3h7m0 0v7m0-7L10 14"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 10v11h11"
                    />
                  </svg>
                </button>
                <a 
                  href={image.s3_url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className={styles.viewButton}
                  title="View full size"
                >
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      strokeWidth={2} 
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" 
                    />
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      strokeWidth={2} 
                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" 
                    />
                  </svg>
                </a>
                {!image.imagekit_only && (
                  <button
                    onClick={() => handleDelete(image.s3_key)}
                    className={styles.deleteButton}
                    title="Delete image"
                  >
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                        strokeWidth={2} 
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" 
                      />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={handlePageChange}
        itemsPerPage={itemsPerPage}
        totalItems={safeFiltered.length}
        showItemsPerPage={true}
        onItemsPerPageChange={handleItemsPerPageChange}
      />
    </div>
  )
}
