'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components'
import CatalogFilePicker from '@/components/file-management/CatalogFilePicker'
import ImageFilesPicker from '@/components/file-management/ImageFilesPicker'
import FilesList from '@/components/file-management/FilesList'
import ImageList from '@/components/file-management/ImageList'
import ImageUploadProgress from '@/components/file-management/ImageUploadProgress'
import { authAPI, catalogAPI, imageAPI, productAPI } from '@/lib/api'
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


  // Handle catalog file selection
  const handleCatalogFileSelect = (file: File) => {
    setSelectedCatalogFile(file)
    setUploadError(null)
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

  // Upload both catalog and images
  const handleUploadAll = async () => {
    console.log('=== UPLOAD STARTED ===')
    console.log('Selected catalog file:', selectedCatalogFile?.name)
    console.log('Selected images count:', selectedImages.length)
    console.log('User manufacturer_id:', user?.manufacturer_id)

    if (!selectedCatalogFile || selectedImages.length === 0) {
      setUploadError('Please select both catalog file and images')
      return
    }

    setIsUploading(true)
    setUploadError(null)
    setUploadSuccess('')

    // Initialize progress tracking
    setUploadProgress({
      totalImages: selectedImages.length,
      uploadedImages: 0,
      failedImages: 0,
      isUploading: true
    })

    try {
      // Validate manufacturer_id exists
      if (!user?.manufacturer_id) {
        setUploadError('Manufacturer ID is missing. Please contact support.')
        setIsUploading(false)
        setUploadProgress(prev => ({ ...prev, isUploading: false }))
        return
      }

      const manufacturerIdNum = parseInt(user.manufacturer_id.toString())
      console.log('Manufacturer ID for upload:', manufacturerIdNum)

      // Upload catalog first (this will trigger admin notification)
      console.log('Uploading catalog file...')
      const catalogResult = await catalogAPI.uploadFile(selectedCatalogFile, manufacturerIdNum)
      console.log('Catalog upload result:', catalogResult)
      
      // Store catalog info and extract available columns
      setUploadedCatalog(catalogResult)
      if (catalogResult.data_info && catalogResult.data_info.column_names) {
        setAvailableColumns(catalogResult.data_info.column_names)
      }

      // Upload images with progress tracking
      console.log('Uploading images...')
      let uploadedCount = 0
      let failedCount = 0

      // Upload images sequentially to track progress properly
      for (let i = 0; i < selectedImages.length; i++) {
        const image = selectedImages[i]
        try {
          console.log(`Uploading image ${i + 1}/${selectedImages.length}: ${image.name}`)
          const result = await imageAPI.uploadImage(image, manufacturerIdNum)
          console.log(`Image ${i + 1} uploaded:`, result)
          uploadedCount++
          
          // Update progress
          setUploadProgress(prev => ({
            ...prev,
            uploadedImages: uploadedCount,
            failedImages: failedCount
          }))
        } catch (err) {
          console.error(`Failed to upload image ${i + 1}:`, err)
          failedCount++
          
          // Update progress
          setUploadProgress(prev => ({
            ...prev,
            uploadedImages: uploadedCount,
            failedImages: failedCount
          }))
        }
      }

      console.log('Image upload completed:', { uploadedCount, failedCount })

      // Send notification after both catalog and images are uploaded
      if (catalogResult.id) {
        console.log('Sending admin notification...')
        try {
          await catalogAPI.sendUploadNotification(catalogResult.id, uploadedCount, failedCount)
          console.log('Admin notification sent successfully')
        } catch (err) {
          console.error('Failed to send admin notification:', err)
          // Don't fail the upload if notification fails
        }
      }

      // Success!
      const catalogName = catalogResult.name || 'catalog'
      const catalogId = catalogResult.id ? ` (ID: ${catalogResult.id})` : ''
      const successMessage = failedCount === 0 
        ? `Successfully uploaded "${catalogName}"${catalogId} and ${uploadedCount} image(s)! Admin users have been notified.`
        : `Uploaded "${catalogName}"${catalogId} and ${uploadedCount} of ${selectedImages.length} images successfully. ${failedCount} images failed to upload. Admin users have been notified.`
      
      setUploadSuccess(successMessage)
      setSelectedCatalogFile(null)
      setSelectedImages([])
      setRefreshKey(prev => prev + 1)

      // Clear success message after 8 seconds
      setTimeout(() => setUploadSuccess(''), 8000)

    } catch (err) {
      console.error('Upload error:', err)
      const errorMessage = err instanceof Error ? err.message : 'Upload failed'
      setUploadError(errorMessage)
    } finally {
      setIsUploading(false)
      setUploadProgress(prev => ({ ...prev, isUploading: false }))
      console.log('=== UPLOAD FINISHED ===')
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
    
    if (!uploadedCatalog || !user?.manufacturer_id) return
    
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
      setUploadSuccess(`Successfully created ${result.created_count} products from column "${selectedSkuColumn}"`)
      
      // Clear success message after 8 seconds
      setTimeout(() => setUploadSuccess(''), 8000)
      
    } catch (err) {
      console.error('Error creating products:', err)
      setUploadError(err instanceof Error ? err.message : 'Failed to create products')
    } finally {
      setIsCreatingProducts(false)
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
          title="Catalogs"
          subtitle={`Welcome, ${user.name}`}
          user={user}
          showNavigation={true}
          currentPage="catalogs"
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
                  Select your catalog file and product images below, then click the upload button to process both at once.
                </p>
              </div>
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
              <div className={`${styles.progressStep} ${selectedImages.length > 0 ? styles.stepComplete : (selectedCatalogFile ? styles.stepActive : styles.stepInactive)}`}>
                <div className={`${styles.stepNumber} ${selectedImages.length > 0 ? styles.stepComplete : ''}`}>
                  {selectedImages.length > 0 ? (
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    '2'
                  )}
                </div>
                <span className={styles.stepLabel}>Select Images</span>
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

              {/* Step 2: Select Images */}
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
                    <h3 className={styles.stepCardTitle}>Select Product Images</h3>
                    <p className={styles.stepCardDescription}>
                      Choose one or more product images to upload
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
              disabled={!selectedCatalogFile || selectedImages.length === 0 || isUploading}
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
                  Upload Catalog and Images
                </>
              )}
            </button>
            <p className={styles.uploadButtonHint}>
              {!selectedCatalogFile && !selectedImages.length && 'Please select both catalog and images to continue'}
              {selectedCatalogFile && !selectedImages.length && 'Please select images to continue'}
              {!selectedCatalogFile && selectedImages.length > 0 && 'Please select a catalog file to continue'}
              {selectedCatalogFile && selectedImages.length > 0 && `Ready to upload catalog and ${selectedImages.length} image(s)`}
            </p>
          </section>

          {/* Upload Progress - Right after upload button */}
          {(isUploading || uploadProgress.totalImages > 0) && (
            <ImageUploadProgress
              totalImages={uploadProgress.totalImages || selectedImages.length}
              uploadedImages={uploadProgress.uploadedImages}
              failedImages={uploadProgress.failedImages}
              isUploading={uploadProgress.isUploading || isUploading}
            />
          )}
        </div>

        <footer className={styles.footer}>
          <p>Powered by Oonni Platform</p>
        </footer>
      </div>
    </main>
  )
}

