'use client'

import { useState, useEffect } from 'react'
import { imageAPI, ImageInfo } from '@/lib/api'
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

  const startItem = safeFiltered.length ? (currentPage - 1) * itemsPerPage + 1 : 0
  const endItem = Math.min(currentPage * itemsPerPage, safeFiltered.length)

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
          <button type="button" onClick={loadImages} className={styles.refreshButton}>
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
        <hr className={styles.sectionDivider} />

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
              placeholder="Search Images"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'name' | 'date' | 'size')}
            className={styles.sortSelect}
          >
            <option value="date">Sort By Date</option>
            <option value="name">Sort By Name</option>
            <option value="size">Sort By Size</option>
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
        <button type="button" onClick={loadImages} className={styles.refreshButton}>
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
      <hr className={styles.sectionDivider} />

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
            placeholder="Search Images"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'name' | 'date' | 'size')}
          className={styles.sortSelect}
        >
          <option value="date">Sort By Date</option>
          <option value="name">Sort By Name</option>
          <option value="size">Sort By Size</option>
        </select>
      </div>

      <div className={styles.imageGrid}>
        {paginatedImages.map((image) => (
          <div key={image.s3_key} className={styles.imageCard}>
            <div className={styles.imageThumbColumn}>
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
            </div>

            <div className={styles.imageInfo}>
              <div className={styles.imageDetails}>
                <div className={styles.imageIcon} aria-hidden>
                  <svg className={styles.imageTypeIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3a1.5 1.5 0 0 0-1.5 1.5v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h2.25"
                    />
                  </svg>
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
                  type="button"
                  onClick={() => handleOpenInNewTab(image.s3_url)}
                  className={styles.actionIconButton}
                  title="Open public URL"
                >
                  <svg className={styles.actionIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .763-.042 1.511-.122 2.244"
                    />
                  </svg>
                </button>
                <a
                  href={image.s3_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.actionIconButton}
                  title="View image"
                >
                  <svg className={styles.actionIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
                    />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </a>
                {!image.imagekit_only && (
                  <button
                    type="button"
                    onClick={() => handleDelete(image.s3_key)}
                    className={`${styles.actionIconButton} ${styles.actionDeleteButton}`}
                    title="Delete image"
                  >
                    <svg className={styles.actionIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.038-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                      />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <>
          <div className={styles.paginationSummary}>
            <span className={styles.paginationCount}>
              Showing {startItem}-{endItem} of {safeFiltered.length} items
            </span>
            <div className={styles.paginationItemsPerPage}>
              <label htmlFor="images-items-per-page">Items per page</label>
              <select
                id="images-items-per-page"
                value={itemsPerPage}
                onChange={(e) => handleItemsPerPageChange(Number(e.target.value))}
                className={styles.paginationSelect}
              >
                {[5, 10, 20, 50].map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.paginationControls}>
            <button
              type="button"
              className={styles.paginationEdgeButton}
              onClick={() => handlePageChange(1)}
              disabled={currentPage === 1}
            >
              First
            </button>
            <button
              type="button"
              className={styles.paginationCircleButton}
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              aria-label="Previous page"
            >
              &lt;
            </button>
            <span className={styles.paginationPageNumber}>{currentPage}</span>
            <button
              type="button"
              className={styles.paginationCircleButton}
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              aria-label="Next page"
            >
              &gt;
            </button>
            <button
              type="button"
              className={styles.paginationEdgeButton}
              onClick={() => handlePageChange(totalPages)}
              disabled={currentPage === totalPages}
            >
              Last
            </button>
          </div>
        </>
      )}
    </div>
  )
}
