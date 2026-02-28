'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authAPI, imageAPI, manufacturerAPI, productAPI, ImageInfo } from '@/lib/api'
import { User, ManufacturerListItem, Product } from '@/types'
import { Header } from '@/components'
import Pagination from '@/components/ui/Pagination'
import styles from './page.module.scss'

export default function ImagesPage() {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [images, setImages] = useState<ImageInfo[]>([])
  const [manufacturers, setManufacturers] = useState<ManufacturerListItem[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [filteredImages, setFilteredImages] = useState<ImageInfo[]>([])
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedManufacturer, setSelectedManufacturer] = useState<number | null>(null)
  const [selectedProduct, setSelectedProduct] = useState<number | null>(null)
  const [sortBy, setSortBy] = useState<'filename' | 'date' | 'size' | 'manufacturer'>('date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(20)
  const [totalImages, setTotalImages] = useState(0)
  
  // Image selection state
  const [selectedImageIds, setSelectedImageIds] = useState<Set<number>>(new Set())
  const [assignToProductId, setAssignToProductId] = useState<number | null>(null)
  const [isAssigning, setIsAssigning] = useState(false)

  const router = useRouter()

  useEffect(() => {
    // Check authentication and admin status
    const storedUser = authAPI.getStoredUser()
    const token = authAPI.getToken()

    if (!token || !storedUser) {
      router.push('/login')
      return
    }

    if (!authAPI.isAdmin(storedUser)) {
      router.push('/catalogs')
      return
    }

    setUser(storedUser)
    setIsLoading(false)
    loadData(token)
  }, [router])

  const loadData = async (token: string) => {
    try {
      // Load manufacturers for filter dropdown
      const manufacturersData = await manufacturerAPI.getManufacturers(token)
      setManufacturers(manufacturersData)
      
      // Load products for filter dropdown
      const productsData = await productAPI.getAllProducts()
      setProducts(productsData.products)
      
      // Load images
      await loadImages()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    }
  }

  const loadImages = async () => {
    try {
      setError(null)
      const offset = (currentPage - 1) * itemsPerPage
      const response = await imageAPI.listImagesWithFilters(
        selectedManufacturer || undefined,
        selectedProduct || undefined,
        itemsPerPage,
        offset
      )
      
      setImages(response.images)
      setTotalImages(response.total_images)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load images')
    }
  }

  useEffect(() => {
    if (!isLoading) {
      loadImages()
    }
  }, [currentPage, itemsPerPage, selectedManufacturer, selectedProduct])

  useEffect(() => {
    let filtered = [...images]

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(image => 
        (image.original_filename || image.s3_key).toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    // Sort images
    filtered.sort((a, b) => {
      let comparison = 0
      
      switch (sortBy) {
        case 'filename':
          const aName = a.original_filename || a.s3_key
          const bName = b.original_filename || b.s3_key
          comparison = aName.localeCompare(bName)
          break
        case 'size':
          comparison = a.size_bytes - b.size_bytes
          break
        case 'manufacturer':
          comparison = (a.manufacturer_id || 0) - (b.manufacturer_id || 0)
          break
        case 'date':
        default:
          comparison = new Date(a.last_modified).getTime() - new Date(b.last_modified).getTime()
          break
      }
      
      return sortOrder === 'asc' ? comparison : -comparison
    })

    setFilteredImages(filtered)
  }, [images, searchTerm, sortBy, sortOrder])

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getManufacturerName = (manufacturerId?: number): string => {
    if (!manufacturerId) return 'Unknown'
    const manufacturer = manufacturers.find(m => m.id === manufacturerId)
    return manufacturer?.name || `Manufacturer ${manufacturerId}`
  }

  const getProductSku = (productId?: number): string => {
    if (!productId) return 'Unassigned'
    const product = products.find(p => p.id === productId)
    return product?.sku || `Product ${productId}`
  }

  const handleOpenInNewTab = (url: string) => {
    if (!url) return
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const handleSort = (field: 'filename' | 'date' | 'size' | 'manufacturer') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortOrder('asc')
    }
  }

  const handleImageSelect = (imageId: number) => {
    setSelectedImageIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(imageId)) {
        newSet.delete(imageId)
      } else {
        newSet.add(imageId)
      }
      return newSet
    })
  }

  const handleSelectAll = () => {
    if (selectedImageIds.size === filteredImages.length) {
      setSelectedImageIds(new Set())
    } else {
      setSelectedImageIds(new Set(filteredImages.filter(img => img.id).map(img => img.id!)))
    }
  }

  const handleAssignToProduct = async () => {
    if (!assignToProductId || selectedImageIds.size === 0) {
      setError('Please select images and a product')
      return
    }

    const imageIds = Array.from(selectedImageIds)
    setIsAssigning(true)
    setError(null)

    imageAPI.bulkAssignToProduct(imageIds, assignToProductId)
      .then((response) => {
        // Reload images
        loadImages()
        // Clear selection
        setSelectedImageIds(new Set())
        setAssignToProductId(null)
        alert(`Successfully assigned ${response.assigned_count} image(s) to product ${response.product_sku}`)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to assign images to product')
      })
      .finally(() => {
        setIsAssigning(false)
      })
  }

  if (isLoading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        {/* Header */}
        <Header
          title="Images Management"
          subtitle="Manage all uploaded images across manufacturers"
          user={user}
          showNavigation={true}
          currentPage="images"
        />

        <div className={styles.content}>
          {/* Error Message */}
          {error && (
            <div className={styles.errorMessage}>
              <svg className={styles.errorIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}

          {/* Filters and Controls */}
          <div className={styles.controls}>
            <div className={styles.searchContainer}>
              <div className={styles.searchInput}>
                <svg className={styles.searchIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search images..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div className={styles.filters}>
              <select
                value={selectedManufacturer || ''}
                onChange={(e) => setSelectedManufacturer(e.target.value ? parseInt(e.target.value) : null)}
                className={styles.filterSelect}
              >
                <option value="">All Manufacturers</option>
                {manufacturers.map((manufacturer) => (
                  <option key={manufacturer.id} value={manufacturer.id}>
                    {manufacturer.name}
                  </option>
                ))}
              </select>

              <select
                value={selectedProduct || ''}
                onChange={(e) => setSelectedProduct(e.target.value ? parseInt(e.target.value) : null)}
                className={styles.filterSelect}
              >
                <option value="">All Products</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.sku}
                  </option>
                ))}
              </select>

              <select
                value={`${sortBy}-${sortOrder}`}
                onChange={(e) => {
                  const [field, order] = e.target.value.split('-')
                  setSortBy(field as any)
                  setSortOrder(order as any)
                }}
                className={styles.filterSelect}
              >
                <option value="date-desc">Sort by Date (Newest)</option>
                <option value="date-asc">Sort by Date (Oldest)</option>
                <option value="filename-asc">Sort by Name (A-Z)</option>
                <option value="filename-desc">Sort by Name (Z-A)</option>
                <option value="size-desc">Sort by Size (Largest)</option>
                <option value="size-asc">Sort by Size (Smallest)</option>
                <option value="manufacturer-asc">Sort by Manufacturer (A-Z)</option>
              </select>

              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(parseInt(e.target.value))
                  setCurrentPage(1)
                }}
                className={styles.filterSelect}
              >
                <option value={10}>10 per page</option>
                <option value={20}>20 per page</option>
                <option value={50}>50 per page</option>
                <option value={100}>100 per page</option>
              </select>
            </div>
          </div>

          {/* Assignment Controls */}
          {selectedImageIds.size > 0 && (
            <div className={styles.assignmentControls}>
              <div className={styles.assignmentInfo}>
                <strong>{selectedImageIds.size}</strong> image(s) selected
              </div>
              <div className={styles.assignmentActions}>
                <select
                  value={assignToProductId || ''}
                  onChange={(e) => setAssignToProductId(e.target.value ? parseInt(e.target.value) : null)}
                  className={styles.productSelect}
                  disabled={isAssigning}
                >
                  <option value="">Select Product...</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.sku}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleAssignToProduct}
                  disabled={!assignToProductId || isAssigning}
                  className={styles.assignButton}
                >
                  {isAssigning ? 'Assigning...' : 'Assign to Product'}
                </button>
                <button
                  onClick={() => {
                    setSelectedImageIds(new Set())
                    setAssignToProductId(null)
                  }}
                  className={styles.cancelButton}
                  disabled={isAssigning}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Images Table */}
          <div className={styles.tableContainer}>
            <table className={styles.imagesTable}>
              <thead>
                <tr>
                  <th className={styles.checkboxColumn}>
                    <input
                      type="checkbox"
                      checked={selectedImageIds.size === filteredImages.length && filteredImages.length > 0}
                      onChange={handleSelectAll}
                      aria-label="Select all images"
                    />
                  </th>
                  <th 
                    className={styles.sortable}
                    onClick={() => handleSort('filename')}
                  >
                    Image Name
                    {sortBy === 'filename' && (
                      <span className={styles.sortIndicator}>
                        {sortOrder === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </th>
                  <th 
                    className={styles.sortable}
                    onClick={() => handleSort('manufacturer')}
                  >
                    Manufacturer
                    {sortBy === 'manufacturer' && (
                      <span className={styles.sortIndicator}>
                        {sortOrder === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </th>
                  <th>Product</th>
                  <th>Preview</th>
                  <th>Actions</th>
                  <th 
                    className={styles.sortable}
                    onClick={() => handleSort('size')}
                  >
                    Size
                    {sortBy === 'size' && (
                      <span className={styles.sortIndicator}>
                        {sortOrder === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </th>
                  <th>Dimensions</th>
                  <th 
                    className={styles.sortable}
                    onClick={() => handleSort('date')}
                  >
                    Upload Date
                    {sortBy === 'date' && (
                      <span className={styles.sortIndicator}>
                        {sortOrder === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredImages.length === 0 ? (
                  <tr>
                    <td colSpan={8} className={styles.emptyState}>
                      <div className={styles.emptyContent}>
                        <svg className={styles.emptyIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <p>No images found</p>
                        <p className={styles.emptySubtext}>
                          {searchTerm || selectedManufacturer 
                            ? 'Try adjusting your search criteria' 
                            : 'Images will appear here once manufacturers upload them'
                          }
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredImages.map((image) => (
                    <tr key={image.id || image.s3_key}>
                      <td className={styles.checkboxColumn}>
                        <input
                          type="checkbox"
                          checked={image.id ? selectedImageIds.has(image.id) : false}
                          onChange={() => image.id && handleImageSelect(image.id)}
                          aria-label={`Select ${image.original_filename || 'image'}`}
                        />
                      </td>
                      <td className={styles.imageName}>
                        <div className={styles.nameContent}>
                          <div className={styles.filename}>
                            {image.original_filename || 'Unknown'}
                          </div>
                          <div className={styles.fileType}>
                            {image.file_type?.toUpperCase() || 'WEBP'}
                          </div>
                        </div>
                      </td>
                      <td className={styles.manufacturer}>
                        {getManufacturerName(image.manufacturer_id)}
                      </td>
                      <td className={styles.product}>
                        {getProductSku(image.product_id)}
                      </td>
                      <td className={styles.preview}>
                        <div className={styles.imagePreview}>
                          <img 
                            src={image.s3_url} 
                            alt={image.original_filename || 'Image'}
                            className={styles.previewImage}
                            loading="lazy"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement
                              target.style.display = 'none'
                              target.nextElementSibling?.classList.add(styles.show)
                            }}
                          />
                          <div className={styles.imagePlaceholder}>
                            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                        </div>
                      </td>
                      <td className={styles.size}>
                        {formatFileSize(image.size_bytes)}
                      </td>
                      <td className={styles.actions}>
                        <button
                          onClick={() => handleOpenInNewTab(image.s3_url)}
                          className={styles.assignButton}
                          title="Open in new tab"
                        >
                          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="20" height="20">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 3h7m0 0v7m0-7L10 14" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10v11h11" />
                          </svg>
                        </button>
                      </td>
                      <td className={styles.dimensions}>
                        {image.width && image.height ? `${image.width} × ${image.height}` : 'Unknown'}
                      </td>
                      <td className={styles.date}>
                        {formatDate(image.last_modified)}
                      </td>
                      <td className={styles.status}>
                        <div className={styles.statusBadge}>
                          {image.optimized ? (
                            <span className={styles.optimized}>Optimized</span>
                          ) : (
                            <span className={styles.original}>Original</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalImages > itemsPerPage && (
            <div className={styles.paginationContainer}>
              <Pagination
                currentPage={currentPage}
                totalPages={Math.ceil(totalImages / itemsPerPage)}
                onPageChange={setCurrentPage}
                itemsPerPage={itemsPerPage}
                totalItems={totalImages}
              />
            </div>
          )}

          {/* Summary */}
          <div className={styles.summary}>
            <p>
              Showing {filteredImages.length} of {totalImages} images
              {selectedManufacturer && (
                <span> for {getManufacturerName(selectedManufacturer)}</span>
              )}
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}
