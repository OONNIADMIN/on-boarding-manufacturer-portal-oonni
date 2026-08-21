'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components'
import CatalogFilePicker, { type CatalogFileSelection } from '@/components/file-management/CatalogFilePicker'
import ImageList from '@/components/file-management/ImageList'
import { authAPI, catalogAPI, catalogColumnRulesAPI, imageAPI } from '@/lib/api'
import { detectImageUrlColumns, detectSkuColumn } from '@/lib/catalog-column-detection'
import { User } from '@/types'
import styles from './page.module.scss'

type CatalogUploadReport = {
  catalogName: string
  catalogId: number | null
  productsCreated: number | null
  imagesUploaded: number
  imageColumns: number
  uploadFailures: number
}

export default function CatalogsPage() {
  const [refreshKey, setRefreshKey] = useState(0)
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadReport, setUploadReport] = useState<CatalogUploadReport | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [selectedCatalogFile, setSelectedCatalogFile] = useState<File | null>(null)
  const [catalogHeaderRowIndex, setCatalogHeaderRowIndex] = useState<number | null>(null)
  const [catalogColumnNames, setCatalogColumnNames] = useState<string[]>([])
  const [catalogColumnMappings, setCatalogColumnMappings] = useState<Record<string, string>>({})
  const [transferPercent, setTransferPercent] = useState<number | null>(null)
  const [isUploadCompleted, setIsUploadCompleted] = useState(false)
  const [hasUploadImages, setHasUploadImages] = useState(false)

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
    if (!user) return
    let cancelled = false
    ;(async () => {
      try {
        const response = await imageAPI.listImages()
        const count = response?.images?.length ?? 0
        if (!cancelled) setHasUploadImages(count > 0)
      } catch {
        if (!cancelled) setHasUploadImages(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user, refreshKey])

  const handleImagesLoaded = (count: number) => {
    setHasUploadImages(count > 0)
  }

  const resolveManufacturerId = (currentUser: User | null): number | null => {
    const raw = currentUser?.manufacturer_id ?? currentUser?.manufacturer?.id
    if (raw == null) return null
    const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10)
    return Number.isFinite(n) && n > 0 ? n : null
  }

  const handleCatalogFileSelect = (selection: CatalogFileSelection) => {
    setSelectedCatalogFile(selection.file)
    setCatalogHeaderRowIndex(selection.headerRowIndex)
    setCatalogColumnNames(selection.columnNames)
    setCatalogColumnMappings(selection.columnMappings)
    setUploadError(null)
    setUploadReport(null)
    void handleUploadCatalog(selection)
  }

  const handleBackToUploadStep = () => {
    setIsUploadCompleted(false)
    setUploadReport(null)
    setUploadError(null)
  }

  const handleUploadCatalog = async (selection?: CatalogFileSelection) => {
    const catalogFile = selection?.file ?? selectedCatalogFile
    const headerRowIndex = selection?.headerRowIndex ?? catalogHeaderRowIndex ?? 0
    const columnNames = selection?.columnNames?.length ? selection.columnNames : catalogColumnNames
    const columnMappings = selection?.columnMappings ?? catalogColumnMappings

    if (!catalogFile) {
      setUploadError('Please select a catalog file')
      return
    }

    setIsUploading(true)
    setTransferPercent(0)
    setUploadError(null)
    setUploadReport(null)

    try {
      const manufacturerIdNum = resolveManufacturerId(user)
      if (!manufacturerIdNum) {
        setUploadError('Manufacturer ID is missing. Please contact support.')
        return
      }

      const columnRules = await catalogColumnRulesAPI.listForUpload().catch(() => [])
      const columnsForUpload = columnNames.length ? columnNames : []
      const skuColForUpload =
        columnsForUpload.length
          ? columnMappings['sku'] ?? detectSkuColumn(columnsForUpload, columnRules)
          : null
      const imgCols = [
        ...new Set(
          [
            ...(selection?.imageColumns ?? []),
            ...detectImageUrlColumns(
              selection?.headerCells?.length ? selection.headerCells : columnsForUpload,
              skuColForUpload,
              columnRules,
              selection?.sampleRows
            ),
          ]
            .map((name) => String(name ?? '').trim())
            .filter((name) => name && name !== skuColForUpload)
        ),
      ]

      const accepted = await catalogAPI.uploadFile(catalogFile, manufacturerIdNum, headerRowIndex, {
        skuColumn: skuColForUpload || undefined,
        imageColumns: imgCols,
        onProgress: (percent) => {
          setTransferPercent(percent)
        },
      })

      setUploadReport({
        catalogName: catalogFile.name,
        catalogId: null,
        productsCreated: null,
        imagesUploaded: 0,
        imageColumns: imgCols.length,
        uploadFailures: 0,
      })
      setSelectedCatalogFile(null)
      setCatalogHeaderRowIndex(null)
      setCatalogColumnNames([])
      setCatalogColumnMappings({})
      setIsUploadCompleted(true)
      setRefreshKey((prev) => prev + 1)
      void accepted
    } catch (err) {
      console.error('Upload error:', err)
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setIsUploading(false)
      setTransferPercent(null)
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
          subtitle={`Welcome, ${user.name}`}
          user={user}
          showNavigation={true}
          currentPage="Onboard"
        />

        <div className={styles.content}>
          {uploadReport && (
            <section className={styles.uploadReport} aria-labelledby="catalog-upload-report-title">
              <div className={styles.uploadReportHeader}>
                <svg className={styles.successIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <h2 id="catalog-upload-report-title" className={styles.uploadReportTitle}>
                    File received
                  </h2>
                  <p className={styles.uploadReportLead}>
                    <strong>{uploadReport.catalogName}</strong> is on the server. Products and photos
                    continue in the background — you can leave this page and keep using the portal.
                    Progress stays in the header until the import finishes.
                  </p>
                </div>
              </div>
              <dl className={styles.uploadReportStats} />
            </section>
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
                  Upload your Excel or CSV file (up to 150MB) using the{' '}
                  <span className={styles.welcomeHighlight}>catalog template</span> column names: a{' '}
                  <span className={styles.welcomeHighlight}>sku</span> column for products and an{' '}
                  <span className={styles.welcomeHighlight}>images</span> column for public image URLs.
                  Keep this page open only until the file is fully received. After that you can go to
                  inventory or images while we create products and import photos in batches.
                  Download templates from <span className={styles.welcomeHighlight}>catalog template</span> in the
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
                        <h3 className={styles.stepCardTitle}>1. Select  File</h3>
                        
                      </div>
                    </div>
                    <div className={styles.stepCardContent}>
                      <CatalogFilePicker
                        size="large"
                        onFileSelect={handleCatalogFileSelect}
                        onValidationError={setUploadError}
                        selectedFile={selectedCatalogFile}
                        headerRowIndex={catalogHeaderRowIndex}
                      />
                      {(selectedCatalogFile || isUploading) && (
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
                                {transferPercent != null
                                  ? `Sending file… ${transferPercent}%`
                                  : 'Sending file…'}
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
                            Stay on this page until the file is received (up to 150MB). After that you can
                            keep working while products and photos are processed in the background.
                          </p>
                          {isUploading && transferPercent != null && (
                            <div
                              className={styles.imageKitProgress}
                              role="status"
                              aria-live="polite"
                              aria-busy={isUploading}
                            >
                              <div className={styles.imageKitProgressHeader}>
                                <span className={styles.imageKitProgressLabel}>
                                  Sending catalog file to the server…
                                </span>
                                <span className={styles.imageKitProgressPct}>{transferPercent}%</span>
                              </div>
                              <div className={styles.imageKitProgressTrack}>
                                <div
                                  className={styles.imageKitProgressFill}
                                  style={{ width: `${transferPercent}%` }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )}
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

          {hasUploadImages && (
            <section className={styles.mediaLibrarySection} aria-labelledby="onboard-media-heading">
              <div className={styles.mediaLibraryHeadingBlock}>
                <h2 id="onboard-media-heading" className={styles.mediaLibraryTitle}>
                  Your Upload Images
                </h2>
                <p className={styles.mediaLibraryIntro}>
                  Photos imported from your catalog file, linked to your company.
                </p>
                <hr className={styles.mediaLibraryDivider} />
              </div>
              <ImageList key={refreshKey} onImagesLoaded={handleImagesLoaded} />
            </section>
          )}
        </div>
      </div>
    </main>
  )
}

