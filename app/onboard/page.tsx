'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components'
import CatalogFilePicker from '@/components/file-management/CatalogFilePicker'
import ImageList from '@/components/file-management/ImageList'
import { authAPI, catalogAPI, productAPI } from '@/lib/api'
import { detectImageUrlColumn, detectSkuColumn } from '@/lib/catalog-column-detection'
import { User } from '@/types'
import styles from './page.module.scss'

export default function CatalogsPage() {
  const [refreshKey, setRefreshKey] = useState(0)
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadSuccess, setUploadSuccess] = useState('')
  const [uploadError, setUploadError] = useState<string | null>(null)
  
  const [selectedCatalogFile, setSelectedCatalogFile] = useState<File | null>(null)
  const [isProcessingCatalog, setIsProcessingCatalog] = useState(false)
  const [isUploadCompleted, setIsUploadCompleted] = useState(false)

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

  const handleBackToUploadStep = () => {
    setIsUploadCompleted(false)
    setUploadSuccess('')
    setUploadError(null)
  }

  const handleUploadCatalog = async () => {
    if (!selectedCatalogFile) {
      setUploadError('Please select a catalog file')
      return
    }

    setIsUploading(true)
    setIsProcessingCatalog(false)
    setUploadError(null)
    setUploadSuccess('')

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

      if (catalogResult.id) {
        try {
          await catalogAPI.sendUploadNotification(catalogResult.id, 0, 0)
        } catch (err) {
          console.error('Failed to send admin notification:', err)
        }
      }

      const catalogName = catalogResult.name || 'catalog'
      const catalogIdStr = catalogResult.id ? ` (ID: ${catalogResult.id})` : ''

      let processingNote = ''
      if (catalogResult.id && columns.length) {
        setIsProcessingCatalog(true)
        setUploadError(null)
        try {
          const skuCol = detectSkuColumn(columns)
          if (!skuCol) {
            setUploadError(
              'Catalog uploaded, but no SKU column was detected. Use the downloaded template and include a column named "sku" (or rename your SKU column to match).'
            )
          } else {
            const productResult = await productAPI.createProductsFromCatalog(
              catalogResult.id,
              skuCol,
              manufacturerIdNum
            )
            const created = productResult.created_count ?? 0
            const imgCol = detectImageUrlColumn(columns, skuCol)
            if (imgCol && imgCol !== skuCol) {
              const ingestResult = await catalogAPI.ingestImagesFromSpreadsheetUrls(
                catalogResult.id,
                skuCol,
                imgCol,
                manufacturerIdNum
              )
              processingNote =
                ` Created ${created} product(s) from "${skuCol}". Imported images from "${imgCol}" (${ingestResult.images_created ?? 0} linked, ` +
                `${ingestResult.upload_failures ?? 0} fetch/upload issue(s)).`
            } else {
              processingNote = ` Created ${created} product(s) from "${skuCol}". No image URL column found (expected e.g. "images") — skipped link import.`
            }
          }
        } catch (procErr) {
          console.error('Catalog processing error:', procErr)
          setUploadError(
            procErr instanceof Error
              ? procErr.message
              : 'Catalog uploaded, but automatic product/image processing failed.'
          )
        } finally {
          setIsProcessingCatalog(false)
        }
      } else if (catalogResult.id && !columns.length) {
        setUploadError(
          'Catalog uploaded, but column headers could not be read. Check the file format; automatic processing was skipped.'
        )
      }

      const successMessage = `Catalog "${catalogName}"${catalogIdStr} uploaded.${processingNote}${
        catalogResult.id ? ' Admin users have been notified.' : ''
      }`

      setUploadSuccess(successMessage)
      setSelectedCatalogFile(null)
      setIsUploadCompleted(true)
      setRefreshKey((prev) => prev + 1)
    } catch (err) {
      console.error('Upload error:', err)
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setIsUploading(false)
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
              <div className={styles.welcomeTitlePanel}>
                <h2 className={styles.welcomeTitle}>Catalog Upload Process</h2>
              </div>
              <div className={styles.welcomeDivider} aria-hidden="true"></div>
              <div className={styles.welcomeDescriptionPanel}>
                <p className={styles.welcomeDescription}>
                  Upload your excel or CSV file using the{' '}
                  <span className={styles.welcomeHighlight}>catalog template</span> column names: a{' '}
                  <span className={styles.welcomeHighlight}>sku</span> column for products and an{' '}
                  <span className={styles.welcomeHighlight}>images</span> column for public image URLs.
                  After upload we create products and import those URLs into the DAM automatically. Download
                  templates from <span className={styles.welcomeHighlight}>catalog template</span> in the
                  navigation (one file per product line if needed).
                </p>
              </div>
            </div>
          </section>

          {!isUploadCompleted && (
            <>
              {/* Upload Steps */}
              <section className={styles.uploadSteps}>
                <div className={styles.stepsGrid}>
                  <div className={`${styles.stepCard} ${styles.catalogUploadStepCard}`}>
                    <div className={styles.stepCardHeader}>
                      <div className={styles.stepCardTitleArea}>
                        <h3 className={styles.stepCardTitle}>1. Select Catalog File</h3>
                        <p className={styles.stepCardDescription}>
                          Choose your product catalog in CSV or Excel format
                        </p>
                      </div>
                    </div>
                    <div className={styles.stepCardContent}>
                      <CatalogFilePicker
                        size="large"
                        onFileSelect={handleCatalogFileSelect}
                        selectedFile={selectedCatalogFile}
                      />
                      <div className={styles.catalogUploadActions}>
                        <button
                          type="button"
                          onClick={() => void handleUploadCatalog()}
                          disabled={!selectedCatalogFile || isUploading}
                          className={styles.uploadAllButton}
                        >
                          {isUploading ? (
                            <>
                              <span className={styles.spinner}></span>
                              {isProcessingCatalog ? 'Processing catalog…' : 'Uploading…'}
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
                            'Ready to upload - products and image URLs from the spreadsheet are processed automatically.'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </>
          )}

          {isUploadCompleted && (
            <section className={styles.uploadButtonSection}>
              <button type="button" onClick={handleBackToUploadStep} className={styles.backButton}>
                Back
              </button>
            </section>
          )}

          <section className={styles.mediaLibrarySection} aria-labelledby="onboard-media-heading">
            <div className={styles.mediaLibraryHeadingBlock}>
              <h2 id="onboard-media-heading" className={styles.mediaLibraryTitle}>
                Your Upload Images
              </h2>
              <p className={styles.mediaLibraryIntro}>
                Same library as in the admin Images view: files linked to your manufacturer (including images imported from your catalog URLs).
              </p>
              <hr className={styles.mediaLibraryDivider} />
            </div>
            <ImageList key={refreshKey} />
          </section>
        </div>
      </div>
    </main>
  )
}

