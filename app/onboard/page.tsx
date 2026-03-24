'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components'
import CatalogFilePicker from '@/components/file-management/CatalogFilePicker'
import ImageFilesPicker from '@/components/file-management/ImageFilesPicker'
import ImageUploadProgress from '@/components/file-management/ImageUploadProgress'
import ImageList from '@/components/file-management/ImageList'
import { authAPI, catalogAPI, imageAPI, nauticalAPI, productAPI, type NauticalProductTypeSummary } from '@/lib/api'
import { User } from '@/types'
import styles from './page.module.scss'

export default function CatalogsPage() {
  const [refreshKey, setRefreshKey] = useState(0)
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadSuccess, setUploadSuccess] = useState('')
  const [uploadError, setUploadError] = useState<string | null>(null)
  
  // File selection state
  const [selectedCatalogFile, setSelectedCatalogFile] = useState<File | null>(null)
  const [selectedImages, setSelectedImages] = useState<File[]>([])
  
  // Product creation state
  const [uploadedCatalog, setUploadedCatalog] = useState<any>(null)
  const [availableColumns, setAvailableColumns] = useState<string[]>([])
  const [selectedSkuColumn, setSelectedSkuColumn] = useState<string>('')
  const [skuPreview, setSkuPreview] = useState<string[]>([])
  const [isCreatingProducts, setIsCreatingProducts] = useState(false)
  const [productCreationResult, setProductCreationResult] = useState<any>(null)
  const [selectedImageUrlColumn, setSelectedImageUrlColumn] = useState<string>('')
  const [isIngestingUrls, setIsIngestingUrls] = useState(false)

  const [nauticalProductTypes, setNauticalProductTypes] = useState<NauticalProductTypeSummary[]>([])
  const [nauticalTypesLoading, setNauticalTypesLoading] = useState(false)
  const [nauticalTypesError, setNauticalTypesError] = useState<string | null>(null)
  const [selectedNauticalProductTypeId, setSelectedNauticalProductTypeId] = useState('')
  const [nauticalDownloading, setNauticalDownloading] = useState(false)

  // Progress tracking state
  const [uploadProgress, setUploadProgress] = useState({
    totalImages: 0,
    uploadedImages: 0,
    failedImages: 0,
    isUploading: false
  })
  
  const router = useRouter()

  useEffect(() => {
    // Check authentication
    const token = authAPI.getToken()
    const storedUser = authAPI.getStoredUser()
    
    console.log('=== CATALOGS PAGE AUTH CHECK ===')
    console.log('Token exists:', !!token)
    console.log('User:', storedUser)
    console.log('Manufacturer ID:', storedUser?.manufacturer_id)
    console.log('User Role:', storedUser?.role?.name)
    
    if (!token || !storedUser) {
      router.push('/login')
      return
    }

    // Check if user is admin - admins should not access catalogs page
    if (authAPI.isAdmin(storedUser)) {
      router.push('/dashboard')
      return
    }
    
    setUser(storedUser)
    setIsLoading(false)
  }, [router])

  useEffect(() => {
    if (!user || authAPI.isAdmin(user)) return
    let cancelled = false
    ;(async () => {
      setNauticalTypesLoading(true)
      setNauticalTypesError(null)
      try {
        const list = await nauticalAPI.listProductTypes()
        if (!cancelled) setNauticalProductTypes(list)
      } catch (e) {
        if (!cancelled) {
          setNauticalProductTypes([])
          setNauticalTypesError(e instanceof Error ? e.message : 'Could not load Nautical product types')
        }
      } finally {
        if (!cancelled) setNauticalTypesLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user])

  const handleDownloadNauticalTemplate = async () => {
    if (!selectedNauticalProductTypeId) {
      setUploadError('Select a Nautical product type before downloading the template.')
      return
    }
    setNauticalDownloading(true)
    setUploadError(null)
    try {
      await nauticalAPI.downloadCatalogTemplate(selectedNauticalProductTypeId)
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Failed to download template')
    } finally {
      setNauticalDownloading(false)
    }
  }

  // Handle catalog file selection
  const handleCatalogFileSelect = (file: File) => {
    setSelectedCatalogFile(file)
    setUploadError(null)
    setUploadedCatalog(null)
    setAvailableColumns([])
    setSelectedSkuColumn('')
    setSelectedImageUrlColumn('')
    setSkuPreview([])
    setProductCreationResult(null)
  }

  // Handle image files selection
  const handleImageFilesSelect = (files: File[]) => {
    setSelectedImages(files)
    setUploadError(null)
    // Reset progress when new files are selected
    setUploadProgress({
      totalImages: 0,
      uploadedImages: 0,
      failedImages: 0,
      isUploading: false
    })
  }

  // Upload catalog (required). Optional: extra image files from disk.
  const handleUploadAll = async () => {
    if (!selectedCatalogFile) {
      setUploadError('Please select a catalog file')
      return
    }

    setIsUploading(true)
    setUploadError(null)
    setUploadSuccess('')

    const n = selectedImages.length
    setUploadProgress({
      totalImages: n,
      uploadedImages: 0,
      failedImages: 0,
      isUploading: true,
    })

    try {
      if (!user?.manufacturer_id) {
        setUploadError('Manufacturer ID is missing. Please contact support.')
        return
      }

      const manufacturerIdNum = parseInt(user.manufacturer_id.toString())

      const catalogResult = await catalogAPI.uploadFile(selectedCatalogFile, manufacturerIdNum)

      let columns: string[] = catalogResult.data_info?.column_names ?? []
      if (!columns.length && catalogResult.id) {
        try {
          const colRes = await catalogAPI.getColumns(catalogResult.id)
          columns = colRes.list_columns ?? []
        } catch {
          /* columns optional until user opens mapping */
        }
      }

      setUploadedCatalog(catalogResult)
      setAvailableColumns(columns)
      setSelectedSkuColumn('')
      setSelectedImageUrlColumn('')
      setSkuPreview([])
      setProductCreationResult(null)

      let uploadedCount = 0
      let failedCount = 0

      for (let i = 0; i < selectedImages.length; i++) {
        const image = selectedImages[i]
        try {
          await imageAPI.uploadImage(image, manufacturerIdNum)
          uploadedCount++
          setUploadProgress((prev) => ({
            ...prev,
            uploadedImages: uploadedCount,
            failedImages: failedCount,
          }))
        } catch (err) {
          console.error(`Failed to upload image ${i + 1}:`, err)
          failedCount++
          setUploadProgress((prev) => ({
            ...prev,
            uploadedImages: uploadedCount,
            failedImages: failedCount,
          }))
        }
      }

      if (catalogResult.id) {
        try {
          await catalogAPI.sendUploadNotification(catalogResult.id, uploadedCount, failedCount)
        } catch (err) {
          console.error('Failed to send admin notification:', err)
        }
      }

      const catalogName = catalogResult.name || 'catalog'
      const catalogId = catalogResult.id ? ` (ID: ${catalogResult.id})` : ''
      let successMessage = `Catalog "${catalogName}"${catalogId} uploaded. Map SKU and image columns below to finish.`
      if (n > 0) {
        successMessage =
          failedCount === 0
            ? `Uploaded "${catalogName}"${catalogId} and ${uploadedCount} image file(s) from disk. Admin users have been notified.`
            : `Uploaded "${catalogName}"${catalogId} and ${uploadedCount} of ${n} disk image(s). ${failedCount} failed. Admin users have been notified.`
      } else {
        successMessage += ' Admin users have been notified.'
      }

      setUploadSuccess(successMessage)
      setSelectedCatalogFile(null)
      setSelectedImages([])
      setRefreshKey((prev) => prev + 1)
      setTimeout(() => setUploadSuccess(''), 12000)
    } catch (err) {
      console.error('Upload error:', err)
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setIsUploading(false)
      setUploadProgress((prev) => ({ ...prev, isUploading: false }))
    }
  }

  const handleLogout = () => {
    authAPI.logout()
    router.push('/login')
  }

  const handleDashboard = () => {
    router.push('/dashboard')
  }

  const handleProfile = () => {
    router.push('/profile')
  }

  // Handle SKU column selection
  const handleSkuColumnSelect = async (columnName: string) => {
    setSelectedSkuColumn(columnName)
    setSkuPreview([])

    if (!columnName.trim() || !uploadedCatalog || !user?.manufacturer_id) return
    
    try {
      const previewResult = await productAPI.previewSKUsFromCatalog(
        uploadedCatalog.id,
        columnName,
        parseInt(user.manufacturer_id.toString())
      )
      setSkuPreview(previewResult.preview_skus)
    } catch (err) {
      console.error('Error previewing SKUs:', err)
      setUploadError(err instanceof Error ? err.message : 'Failed to preview SKUs')
    }
  }

  // Handle product creation
  const handleCreateProducts = async () => {
    if (!uploadedCatalog || !selectedSkuColumn || !user?.manufacturer_id) {
      setUploadError('Please select a SKU column first')
      return
    }
    
    setIsCreatingProducts(true)
    setUploadError(null)
    
    try {
      const result = await productAPI.createProductsFromCatalog(
        uploadedCatalog.id,
        selectedSkuColumn,
        parseInt(user.manufacturer_id.toString())
      )
      
      setProductCreationResult(result)
      const created = result.created_count ?? 0
      setUploadSuccess(`Successfully created ${created} products from column "${selectedSkuColumn}"`)
      
      // Clear success message after 8 seconds
      setTimeout(() => setUploadSuccess(''), 8000)
      
    } catch (err) {
      console.error('Error creating products:', err)
      setUploadError(err instanceof Error ? err.message : 'Failed to create products')
    } finally {
      setIsCreatingProducts(false)
    }
  }

  const handleIngestImagesFromSpreadsheet = async () => {
    if (!uploadedCatalog?.id || !selectedSkuColumn || !selectedImageUrlColumn || !user?.manufacturer_id) {
      setUploadError('Select SKU column, image URL column, and ensure the catalog is uploaded.')
      return
    }
    if (selectedSkuColumn === selectedImageUrlColumn) {
      setUploadError('SKU column and image URL column must be different.')
      return
    }

    setIsIngestingUrls(true)
    setUploadError(null)

    try {
      const manufacturerIdNum = parseInt(user.manufacturer_id.toString())
      const result = await catalogAPI.ingestImagesFromSpreadsheetUrls(
        uploadedCatalog.id,
        selectedSkuColumn,
        selectedImageUrlColumn,
        manufacturerIdNum
      )

      setUploadedCatalog((prev: any) =>
        prev ? { ...prev, catalog_file: result.catalog_file } : prev
      )

      setUploadSuccess(
        `DAM import done: ${result.images_created} image(s) linked, ${result.unique_sources_fetched} unique URL(s) fetched. ` +
          `${result.upload_failures} fetch/upload failure(s). ` +
          `Column "${selectedImageUrlColumn}" in the catalog file now uses ImageKit URLs.`
      )
      setRefreshKey((prev) => prev + 1)
      setTimeout(() => setUploadSuccess(''), 14000)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to import images from spreadsheet URLs')
    } finally {
      setIsIngestingUrls(false)
    }
  }

  if (isLoading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        minHeight: '100vh',
        backgroundColor: 'var(--oonni-bg)'
      }}>
        <div style={{ textAlign: 'center', color: 'var(--gray-700)' }}>
          <div className="spinner" style={{
            border: '4px solid rgba(90, 158, 142, 0.2)',
            borderTop: '4px solid var(--oonni-green)',
            borderRadius: '50%',
            width: '40px',
            height: '40px',
            animation: 'spin 1s linear infinite',
            margin: '0 auto'
          }}></div>
          <p style={{ marginTop: '1rem' }}>Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <Header
          title="Onboard"
          subtitle={`Welcome, ${user.name}`}
          user={user}
          showNavigation={true}
          currentPage="Onboard"
        />

        <div className={styles.content}>
          {/* Success Messages */}
          {uploadSuccess && (
            <div className={styles.successMessage}>
              <svg className={styles.successIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {uploadSuccess}
            </div>
          )}

          {/* Error Messages */}
          {uploadError && (
            <div className={styles.errorMessage}>
              <svg className={styles.errorIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {uploadError}
            </div>
          )}

          {/* Welcome Section */}
          <section className={styles.welcomeSection}>
            <div className={styles.welcomeCard}>
              <div className={styles.welcomeIcon}>
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                </svg>
              </div>
              <div className={styles.welcomeContent}>
                <h2 className={styles.welcomeTitle}>Catalog Upload Process</h2>
                <p className={styles.welcomeDescription}>
                  Upload your Excel or CSV template (include a column with image URLs). Images are imported into the DAM from those links.
                  You may optionally add extra image files from your computer.
                </p>
              </div>
            </div>
          </section>

          <section className={styles.nauticalSection} aria-labelledby="nautical-template-heading">
            <div className={styles.nauticalCard}>
              <h2 id="nautical-template-heading" className={styles.nauticalTitle}>
                Excel catalog template (Nautical)
              </h2>
              <p className={styles.nauticalDescription}>
                Choose the product type you sell or use for this catalog. The download is an Excel file
                with Oonni priority columns first, then that type&apos;s product and variant attribute
                names from Nautical.
              </p>
              {nauticalTypesLoading && (
                <p className={styles.nauticalHint}>Loading product types from Nautical…</p>
              )}
              {nauticalTypesError && (
                <p className={styles.nauticalWarning} role="status">
                  {nauticalTypesError}
                </p>
              )}
              {!nauticalTypesLoading && !nauticalTypesError && nauticalProductTypes.length === 0 && (
                <p className={styles.nauticalHint}>No product types returned from Nautical.</p>
              )}
              <div className={styles.nauticalRow}>
                <select
                  className={styles.nauticalSelect}
                  aria-label="Nautical product type"
                  value={selectedNauticalProductTypeId}
                  onChange={(e) => setSelectedNauticalProductTypeId(e.target.value)}
                  disabled={nauticalTypesLoading || nauticalProductTypes.length === 0}
                >
                  <option value="">Select product type…</option>
                  {nauticalProductTypes.map((pt) => (
                    <option key={pt.id} value={pt.id}>
                      {pt.name}
                      {pt.slug ? ` (${pt.slug})` : ''}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void handleDownloadNauticalTemplate()}
                  disabled={
                    nauticalDownloading ||
                    !selectedNauticalProductTypeId ||
                    nauticalProductTypes.length === 0
                  }
                  className={styles.uploadAllButton}
                >
                  {nauticalDownloading ? 'Preparing…' : 'Download Excel template'}
                </button>
              </div>
              <p className={styles.nauticalHint}>
                Requires server env <code>NAUTICAL_API_URL</code> and <code>NAUTICAL_BEARER_TOKEN</code>.
                Username/password in env are not used by this flow; refresh the token in env when it
                expires.
              </p>
            </div>
          </section>

          {/* Progress Indicator */}
          <section className={styles.progressSection}>
            <div className={styles.progressBar}>
              <div className={`${styles.progressStep} ${selectedCatalogFile ? styles.stepComplete : styles.stepActive}`}>
                <div className={`${styles.stepNumber} ${selectedCatalogFile ? styles.stepComplete : ''}`}>
                  {selectedCatalogFile ? (
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    '1'
                  )}
                </div>
                <span className={styles.stepLabel}>Select Catalog</span>
              </div>
              <div className={`${styles.progressLine} ${selectedCatalogFile ? styles.lineComplete : ''}`}></div>
              <div
                className={`${styles.progressStep} ${
                  selectedImages.length > 0 ? styles.stepComplete : selectedCatalogFile ? styles.stepActive : styles.stepInactive
                }`}
              >
                <div className={`${styles.stepNumber} ${selectedImages.length > 0 ? styles.stepComplete : ''}`}>
                  {selectedImages.length > 0 ? (
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    '2'
                  )}
                </div>
                <span className={styles.stepLabel}>Optional: disk images</span>
              </div>
            </div>
          </section>

          {/* Upload Steps */}
          <section className={styles.uploadSteps}>
            <div className={styles.stepsGrid}>
              {/* Step 1: Select Catalog */}
              <div className={styles.stepCard}>
                <div className={styles.stepCardHeader}>
                  <div className={`${styles.stepBadge} ${selectedCatalogFile ? styles.stepBadgeComplete : ''}`}>
                    {selectedCatalogFile ? (
                      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      '1'
                    )}
                  </div>
                  <div className={styles.stepCardTitleArea}>
                    <h3 className={styles.stepCardTitle}>Select Catalog File</h3>
                    <p className={styles.stepCardDescription}>
                      Choose your product catalog in CSV or Excel format
                    </p>
                  </div>
                </div>
                <div className={styles.stepCardContent}>
                  <CatalogFilePicker
                    onFileSelect={handleCatalogFileSelect}
                    selectedFile={selectedCatalogFile}
                  />
                </div>
              </div>

              {/* Step 2: Optional disk images */}
              <div className={styles.stepCard}>
                <div className={styles.stepCardHeader}>
                  <div className={`${styles.stepBadge} ${selectedImages.length > 0 ? styles.stepBadgeComplete : ''}`}>
                    {selectedImages.length > 0 ? (
                      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      '2'
                    )}
                  </div>
                  <div className={styles.stepCardTitleArea}>
                    <h3 className={styles.stepCardTitle}>Optional: images from disk</h3>
                    <p className={styles.stepCardDescription}>
                      Skip this if your template already lists image URLs. Otherwise add extra files here.
                    </p>
                  </div>
                </div>
                <div className={styles.stepCardContent}>
                  <ImageFilesPicker
                    onFilesSelect={handleImageFilesSelect}
                    selectedFiles={selectedImages}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Upload Button */}
          <section className={styles.uploadButtonSection}>
            <button
              onClick={handleUploadAll}
              disabled={!selectedCatalogFile || isUploading}
              className={styles.uploadAllButton}
            >
              {isUploading ? (
                <>
                  <span className={styles.spinner}></span>
                  Uploading...
                </>
              ) : (
                <>
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  Upload catalog
                </>
              )}
            </button>
            <p className={styles.uploadButtonHint}>
              {!selectedCatalogFile && 'Select a catalog file to upload.'}
              {selectedCatalogFile &&
                (selectedImages.length > 0
                  ? `Ready: catalog + ${selectedImages.length} optional file(s) from disk.`
                  : 'Ready: catalog only (use URL column below after upload).')}
            </p>
          </section>

          {/* Upload Progress - only when uploading files from disk */}
          {selectedImages.length > 0 && (isUploading || uploadProgress.totalImages > 0) && (
            <ImageUploadProgress
              totalImages={uploadProgress.totalImages || selectedImages.length}
              uploadedImages={uploadProgress.uploadedImages}
              failedImages={uploadProgress.failedImages}
              isUploading={uploadProgress.isUploading || isUploading}
            />
          )}

          {/* After upload: map columns & DAM from URLs */}
          {uploadedCatalog?.id && (
            <section className={styles.uploadSteps} style={{ marginTop: '2rem' }}>
              <div className={styles.welcomeCard} style={{ marginBottom: '1.5rem' }}>
                <div className={styles.welcomeContent}>
                  <h2 className={styles.welcomeTitle} style={{ fontSize: '1.25rem' }}>
                    Catalog: {uploadedCatalog.name ?? 'Uploaded file'}
                  </h2>
                  <p className={styles.welcomeDescription} style={{ marginBottom: 0 }}>
                    1) Choose the SKU column and create products. 2) Choose the column that contains image URLs (e.g.{' '}
                    <strong>images</strong>) and import them into the DAM. The stored catalog file will be updated with ImageKit URLs.
                  </p>
                </div>
              </div>

              <div className={styles.stepsGrid}>
                <div className={styles.stepCard}>
                  <div className={styles.stepCardHeader}>
                    <div className={styles.stepBadge}>A</div>
                    <div className={styles.stepCardTitleArea}>
                      <h3 className={styles.stepCardTitle}>SKU column → products</h3>
                      <p className={styles.stepCardDescription}>
                        Each distinct SKU becomes a product linked to this catalog.
                      </p>
                    </div>
                  </div>
                  <div className={styles.stepCardContent}>
                    <label className={styles.stepCardDescription} htmlFor="sku-column">
                      Column
                    </label>
                    <select
                      id="sku-column"
                      value={selectedSkuColumn}
                      onChange={(e) => void handleSkuColumnSelect(e.target.value)}
                      style={{
                        width: '100%',
                        marginTop: 8,
                        padding: '10px 12px',
                        borderRadius: 8,
                        border: '1px solid var(--gray-300, #d1d5db)',
                        background: 'var(--oonni-bg, #fff)',
                      }}
                    >
                      <option value="">Select column…</option>
                      {availableColumns.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    {skuPreview.length > 0 && (
                      <p className={styles.stepCardDescription} style={{ marginTop: 12 }}>
                        Preview: {skuPreview.slice(0, 8).join(', ')}
                        {skuPreview.length > 8 ? '…' : ''}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleCreateProducts()}
                      disabled={!selectedSkuColumn || isCreatingProducts}
                      className={styles.uploadAllButton}
                      style={{ marginTop: 16 }}
                    >
                      {isCreatingProducts ? 'Creating…' : 'Create products from SKU column'}
                    </button>
                    {productCreationResult != null && (
                      <p className={styles.stepCardDescription} style={{ marginTop: 12 }}>
                        Last run: created {productCreationResult.created_count ?? 0}, skipped {productCreationResult.skipped ?? 0}.
                      </p>
                    )}
                  </div>
                </div>

                <div className={styles.stepCard}>
                  <div className={styles.stepCardHeader}>
                    <div className={styles.stepBadge}>B</div>
                    <div className={styles.stepCardTitleArea}>
                      <h3 className={styles.stepCardTitle}>Image URLs → DAM</h3>
                      <p className={styles.stepCardDescription}>
                        We download each public URL, upload it to ImageKit, attach it to the product in that row (by SKU), and replace
                        the cell with the ImageKit URL in your catalog file.
                      </p>
                    </div>
                  </div>
                  <div className={styles.stepCardContent}>
                    <label className={styles.stepCardDescription} htmlFor="img-column">
                      Column with image links
                    </label>
                    <select
                      id="img-column"
                      value={selectedImageUrlColumn}
                      onChange={(e) => setSelectedImageUrlColumn(e.target.value)}
                      style={{
                        width: '100%',
                        marginTop: 8,
                        padding: '10px 12px',
                        borderRadius: 8,
                        border: '1px solid var(--gray-300, #d1d5db)',
                        background: 'var(--oonni-bg, #fff)',
                      }}
                    >
                      <option value="">Select column…</option>
                      {availableColumns.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => void handleIngestImagesFromSpreadsheet()}
                      disabled={!selectedSkuColumn || !selectedImageUrlColumn || isIngestingUrls}
                      className={styles.uploadAllButton}
                      style={{ marginTop: 16 }}
                    >
                      {isIngestingUrls ? 'Importing images…' : 'Import images from spreadsheet URLs'}
                    </button>
                  </div>
                </div>
              </div>
            </section>
          )}

          <section className={styles.mediaLibrarySection} aria-labelledby="onboard-media-heading">
            <h2 id="onboard-media-heading" className={styles.mediaLibraryTitle}>
              Your uploaded images
            </h2>
            <p className={styles.mediaLibraryIntro}>
              Same library as in the admin Images view: files linked to your manufacturer (disk uploads and imports from your catalog).
            </p>
            <ImageList key={refreshKey} />
          </section>
        </div>

        <footer className={styles.footer}>
          <p>Powered by Oonni Platform</p>
        </footer>
      </div>
    </main>
  )
}

