'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components'
import { authAPI, nauticalAPI, type NauticalProductTypeSummary } from '@/lib/api'
import { User } from '@/types'
import styles from './page.module.scss'

export default function CatalogTemplatePage() {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [productTypes, setProductTypes] = useState<NauticalProductTypeSummary[]>([])
  const [typesLoading, setTypesLoading] = useState(false)
  const [typesError, setTypesError] = useState<string | null>(null)
  const [selectedProductTypeId, setSelectedProductTypeId] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)

  const router = useRouter()

  useEffect(() => {
    const token = authAPI.getToken()
    const storedUser = authAPI.getStoredUser()

    if (!token || !storedUser) {
      router.push('/login')
      return
    }

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
      setTypesLoading(true)
      setTypesError(null)
      try {
        const list = await nauticalAPI.listProductTypes()
        if (!cancelled) setProductTypes(list)
      } catch (e) {
        if (!cancelled) {
          setProductTypes([])
          setTypesError(e instanceof Error ? e.message : 'Could not load Nautical product types')
        }
      } finally {
        if (!cancelled) setTypesLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user])

  const handleDownload = async () => {
    if (!selectedProductTypeId) {
      setPageError('Select a Nautical product type before downloading the template.')
      return
    }
    setDownloading(true)
    setPageError(null)
    try {
      await nauticalAPI.downloadCatalogTemplate(selectedProductTypeId)
    } catch (e) {
      setPageError(e instanceof Error ? e.message : 'Failed to download template')
    } finally {
      setDownloading(false)
    }
  }

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          backgroundColor: 'var(--oonni-bg)',
        }}
      >
        <div style={{ textAlign: 'center', color: 'var(--gray-700)' }}>
          <div
            className="spinner"
            style={{
              border: '4px solid rgba(90, 158, 142, 0.2)',
              borderTop: '4px solid var(--oonni-green)',
              borderRadius: '50%',
              width: '40px',
              height: '40px',
              animation: 'spin 1s linear infinite',
              margin: '0 auto',
            }}
          />
          <p style={{ marginTop: '1rem' }}>Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) return null

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <Header
          title="Catalog template"
          subtitle={`Welcome, ${user.name} — align your file with what you manufacture`}
          user={user}
          showNavigation={true}
          currentPage="catalogTemplate"
        />

        <div className={styles.content}>
          <section className={styles.introCard} aria-labelledby="template-intro-heading">
            <h2 id="template-intro-heading" className={styles.introHeading}>
              <span className={styles.introTitleLine1}>Match The Template To</span>
              <span className={styles.introTitleLine2}>Your Products Lines</span>
            </h2>
            <p className={styles.introText}>
              Each template corresponds to a product type in our catalogue (for example tools, textiles, or
              electronics). Choose the type that best matches what your company actually produces for the
              assortment you are about to load - that way columns, attributes, and categories line up with how
              those products are structured in the platform.
            </p>
            <p className={styles.introText}>
              If you manufacture more than one distinct products line, download a separate template for each
              line: pick a type, download the excel file, then repeat for the next line. You can fill each
              file and upload them when you continue to Onboard Catalog (one upload at the time or as your
              process requires).
            </p>
          </section>

          <section className={styles.nauticalSection} aria-labelledby="nautical-template-heading">
            {pageError && (
              <div className={styles.errorMessage} role="alert">
                <svg className={styles.errorIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                {pageError}
              </div>
            )}

            <div className={styles.nauticalCard}>
              <h2 id="nautical-template-heading" className={styles.nauticalTitle}>
                <span className={styles.nauticalTitleLine1}>Download Your</span>
                <span className={styles.nauticalTitleLine2}>Excel Template</span>
              </h2>
              <p className={styles.nauticalDescription}>
                Select the product type that matches the line you are preparing. Your file will include the
                right column layout for that type, example rows to guide you, and a Categories sheet with the
                category tree relevant to that template, plus a dropdown on the Catalog sheet so category
                values stay consistent.
              </p>
              <p className={styles.nauticalDescription}>
                Need another line? Change the selection and download again—each template is independent.
              </p>
              {typesLoading && (
                <div className={styles.nauticalProgress} aria-busy="true" aria-live="polite">
                  <div className={styles.nauticalProgressHeader}>
                    <span className={styles.nauticalProgressLabel}>
                      Loading product types from Nautical...
                    </span>
                    <span className={styles.nauticalProgressPct}>65%</span>
                  </div>
                  <div className={styles.nauticalProgressTrack}>
                    <div className={styles.nauticalProgressFill} />
                  </div>
                </div>
              )}
              {typesError && (
                <p className={styles.nauticalWarning} role="status">
                  {typesError}
                </p>
              )}
              {!typesLoading && !typesError && productTypes.length === 0 && (
                <p className={styles.nauticalHint}>No product types returned from Nautical.</p>
              )}
              <div className={styles.nauticalRow}>
                <select
                  className={styles.nauticalSelect}
                  aria-label="Nautical product type"
                  value={selectedProductTypeId}
                  onChange={(e) => setSelectedProductTypeId(e.target.value)}
                  disabled={typesLoading || productTypes.length === 0}
                >
                  <option value="">Select Product Line/Type</option>
                  {productTypes.map((pt) => (
                    <option key={pt.id} value={pt.id}>
                      {pt.name}
                      {pt.slug ? ` (${pt.slug})` : ''}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void handleDownload()}
                  disabled={downloading || !selectedProductTypeId || productTypes.length === 0}
                  className={styles.downloadTemplateButton}
                >
                  {downloading ? 'Preparing…' : 'Download Excel Template'}
                </button>
              </div>
              <p className={styles.nauticalHint}>
                If the list is empty or a download fails, contact your OONNI administrator so the connection to
                the product catalogue can be checked.
              </p>

              <div className={styles.nextSection}>
                <p className={styles.nextLabel}>When your spreadsheet is ready to upload:</p>
                <button type="button" className={styles.nextButton} onClick={() => router.push('/onboard')}>
                  Continue to Onboard catalog
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
