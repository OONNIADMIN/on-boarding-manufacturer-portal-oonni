'use client'

import { Dispatch, FormEvent, SetStateAction, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components'
import { authAPI, brandPageAPI, inventoryAPI } from '@/lib/api'
import type { BrandLayout, BrandPageContent, BrandPageRecord } from '@/lib/brand-page'
import type { InventoryProductRow } from '@/lib/api'
import type { User } from '@/types'
import styles from './page.module.scss'

type DistributorDraft = {
  key: string
  name: string
  url: string
  logoId: number | null
  logoUrl: string | null
  file: File | null
}

const DESIGNS: { id: BrandLayout; title: string; copy: string; image: string }[] = [
  {
    id: 'catalog',
    title: 'About the Brand',
    copy: 'Full-width banner, a short brand story, then the product grid with filters.',
    image: '/brand-layouts/catalog.png',
  },
  {
    id: 'category',
    title: 'Browse by Category',
    copy: 'Banner beside a headline and description, then products grouped by category.',
    image: '/brand-layouts/category.png',
  },
]

function emptyDistributor(key = 'distributor-1'): DistributorDraft {
  return { key, name: '', url: '', logoId: null, logoUrl: null, file: null }
}

export default function BrandPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [step, setStep] = useState<'choose' | 'edit'>('choose')
  const [layout, setLayout] = useState<BrandLayout | null>(null)
  const [aboutTitle, setAboutTitle] = useState('ABOUT THE BRAND')
  const [aboutBody, setAboutBody] = useState('')
  const [heroTitle, setHeroTitle] = useState('')
  const [heroBody, setHeroBody] = useState('')
  const [logoId, setLogoId] = useState<number | null>(null)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [heroId, setHeroId] = useState<number | null>(null)
  const [heroUrl, setHeroUrl] = useState<string | null>(null)
  const [heroFile, setHeroFile] = useState<File | null>(null)
  const [shopTitle, setShopTitle] = useState('SHOP THE LOOK')
  const [shopUrl, setShopUrl] = useState('')
  const [shopImageId, setShopImageId] = useState<number | null>(null)
  const [shopImageUrl, setShopImageUrl] = useState<string | null>(null)
  const [shopFile, setShopFile] = useState<File | null>(null)
  const [distributorsHeading, setDistributorsHeading] = useState('DISTRIBUTORS')
  const [distributors, setDistributors] = useState<DistributorDraft[]>([emptyDistributor()])
  const [metaTitle, setMetaTitle] = useState('')
  const [metaDescription, setMetaDescription] = useState('')
  const [products, setProducts] = useState<InventoryProductRow[]>([])
  const [previewDesign, setPreviewDesign] = useState<(typeof DESIGNS)[number] | null>(null)

  const applyRecord = (record: BrandPageRecord) => {
    const landing = record.landing
    if (!landing) {
      setStep('choose')
      return
    }
    setLayout(landing.layout)
    setStep('edit')
    setAboutTitle(landing.aboutTitle || 'ABOUT THE BRAND')
    setAboutBody(landing.aboutBody || '')
    setHeroTitle(landing.heroTitle || '')
    setHeroBody(landing.heroBody || '')
    setLogoId(landing.logo?.id ?? null)
    setLogoUrl(landing.logo?.url ?? null)
    setHeroId(landing.heroImage?.id ?? null)
    setHeroUrl(landing.heroImage?.url ?? null)
    setShopTitle(landing.shopTheLook?.title || 'SHOP THE LOOK')
    setShopUrl(landing.shopTheLook?.url || '')
    setShopImageId(landing.shopTheLook?.image?.id ?? null)
    setShopImageUrl(landing.shopTheLook?.image?.url ?? null)
    setDistributorsHeading(landing.distributorsHeading || 'DISTRIBUTORS')
    setDistributors(
      landing.distributors.length
        ? landing.distributors.map((row) => ({
            key: crypto.randomUUID(),
            name: row.name,
            url: row.url,
            logoId: row.logo?.id ?? null,
            logoUrl: row.logo?.url ?? null,
            file: null,
          }))
        : [emptyDistributor()]
    )
    setMetaTitle(landing.seo?.metaTitle || '')
    setMetaDescription(landing.seo?.metaDescription || '')
  }

  useEffect(() => {
    const stored = authAPI.getStoredUser()
    const token = authAPI.getToken()
    if (!token || !stored) {
      router.push('/login')
      return
    }
    if (authAPI.isAdmin(stored)) {
      router.push('/dashboard')
      return
    }
    setUser(stored)
    void (async () => {
      try {
        const [page, catalog] = await Promise.all([
          brandPageAPI.get(),
          inventoryAPI.listProducts(1, 8).catch(() => ({ products: [] as InventoryProductRow[] })),
        ])
        applyRecord(page)
        setProducts(catalog.products || [])
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not load the brand page')
      } finally {
        setLoading(false)
      }
    })()
  }, [router])

  useEffect(() => {
    if (!previewDesign) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreviewDesign(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [previewDesign])

  const content = (): BrandPageContent | null => {
    if (!layout) return null
    return {
      layout,
      aboutTitle,
      aboutBody,
      heroTitle,
      heroBody,
      distributorsHeading,
      shopTheLook: { title: shopTitle, url: shopUrl, imageId: shopImageId },
      distributors: distributors
        .filter((row) => row.name.trim())
        .map((row) => ({ name: row.name.trim(), url: row.url.trim(), logoId: row.logoId })),
      seo: { metaTitle, metaDescription },
      logoId,
      heroImageId: heroId,
    }
  }

  const save = async (event: FormEvent) => {
    event.preventDefault()
    const payload = content()
    if (!payload) {
      setError('Choose a brand page design first')
      return
    }
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const saved = await brandPageAPI.save(payload, {
        logo: logoFile,
        heroImage: heroFile,
        shopTheLook: shopFile,
        distributorLogos: distributors.filter((row) => row.name.trim()).map((row) => row.file),
      })
      setLogoFile(null)
      setHeroFile(null)
      setShopFile(null)
      applyRecord(saved)
      setNotice('Brand page published. The storefront reads this design from the CMS.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the brand page')
    } finally {
      setSaving(false)
    }
  }

  if (loading || !user) {
    return (
      <main className={styles.main}>
        <div className={styles.container}>
          <p className={styles.subtitle}>Loading brand page…</p>
        </div>
      </main>
    )
  }

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <Header subtitle="Choose a brand page and publish your brand content" user={user} showNavigation currentPage="brandPage" />
        <div className={styles.content}>
          <div className={styles.intro}>
            <h2 className={styles.title}>Brand page</h2>
            <p className={styles.subtitle}>
              Pick one of the two storefront designs, then add your logo, banners, and copy.
              Product grids stay in sync with your catalog for this brand.
            </p>
          </div>
          {error ? <div className={`${styles.banner} ${styles.error}`}>{error}</div> : null}
          {notice ? <div className={`${styles.banner} ${styles.notice}`}>{notice}</div> : null}

          {step === 'choose' ? (
            <>
              <div className={styles.designGrid}>
                {DESIGNS.map((design) => (
                  <div
                    key={design.id}
                    className={`${styles.designCard} ${layout === design.id ? styles.selected : ''}`}
                  >
                    <div className={styles.previewFrame}>
                      <img src={design.image} alt="" className={styles.preview} />
                      <button
                        type="button"
                        className={styles.previewButton}
                        onClick={() => setPreviewDesign(design)}
                      >
                        Preview
                      </button>
                    </div>
                    <button type="button" className={styles.designSelect} onClick={() => setLayout(design.id)}>
                      <h3 className={styles.designTitle}>{design.title}</h3>
                      <p className={styles.designCopy}>{design.copy}</p>
                    </button>
                  </div>
                ))}
              </div>
              <div className={styles.actions}>
                <button type="button" className={styles.primary} disabled={!layout} onClick={() => setStep('edit')}>
                  Continue with this design
                </button>
              </div>
            </>
          ) : (
            <form className={styles.form} onSubmit={save}>
              <div className={styles.selectedNote}>
                <strong>{layout === 'category' ? 'Browse by Category' : 'About the Brand'}</strong>
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.secondary}
                    onClick={() => setPreviewDesign(DESIGNS.find((design) => design.id === layout) ?? null)}
                  >
                    Preview design
                  </button>
                  <button type="button" className={styles.secondary} onClick={() => setStep('choose')}>
                    Change design
                  </button>
                </div>
              </div>

              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>Logo and banner</h3>
                <p className={styles.sectionHint}>Used on both designs. The banner is the large image at the top of the page.</p>
                <div className={styles.fields}>
                  <MediaField label="Logo" url={logoUrl} onFile={(file, preview) => { setLogoFile(file); setLogoUrl(preview) }} />
                  <MediaField label="Banner" url={heroUrl} onFile={(file, preview) => { setHeroFile(file); setHeroUrl(preview) }} />
                </div>
              </section>

              {layout === 'catalog' ? (
                <section className={styles.section}>
                  <h3 className={styles.sectionTitle}>About the brand</h3>
                  <div className={styles.fields}>
                    <label className={styles.field}>
                      Heading
                      <input className={styles.input} value={aboutTitle} onChange={(event) => setAboutTitle(event.target.value)} />
                    </label>
                    <label className={styles.field}>
                      Description
                      <textarea className={styles.textarea} value={aboutBody} onChange={(event) => setAboutBody(event.target.value)} />
                    </label>
                  </div>
                </section>
              ) : (
                <section className={styles.section}>
                  <h3 className={styles.sectionTitle}>Hero copy</h3>
                  <p className={styles.sectionHint}>Headline and paragraph shown beside the banner.</p>
                  <div className={styles.fields}>
                    <label className={styles.field}>
                      Headline
                      <input className={styles.input} value={heroTitle} onChange={(event) => setHeroTitle(event.target.value)} />
                    </label>
                    <label className={styles.field}>
                      Description
                      <textarea className={styles.textarea} value={heroBody} onChange={(event) => setHeroBody(event.target.value)} />
                    </label>
                  </div>
                </section>
              )}

              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>Shop the Look</h3>
                <div className={styles.fields}>
                  <label className={styles.field}>
                    Label
                    <input className={styles.input} value={shopTitle} onChange={(event) => setShopTitle(event.target.value)} />
                  </label>
                  <label className={styles.field}>
                    Link
                    <input className={styles.input} value={shopUrl} onChange={(event) => setShopUrl(event.target.value)} placeholder="https://" />
                  </label>
                  <MediaField label="Banner image" url={shopImageUrl} onFile={(file, preview) => { setShopFile(file); setShopImageUrl(preview) }} />
                </div>
              </section>

              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>Distributors</h3>
                <label className={styles.field}>
                  Heading
                  <input className={styles.input} value={distributorsHeading} onChange={(event) => setDistributorsHeading(event.target.value)} />
                </label>
                {distributors.map((row, index) => (
                  <div key={row.key} className={styles.distributor}>
                    {row.logoUrl ? <img src={row.logoUrl} alt="" className={styles.logoThumb} /> : <div className={styles.logoThumb} />}
                    <input
                      className={styles.input}
                      placeholder="Distributor name"
                      value={row.name}
                      onChange={(event) => updateDistributor(setDistributors, index, { name: event.target.value })}
                    />
                    <input
                      className={styles.input}
                      placeholder="https://"
                      value={row.url}
                      onChange={(event) => updateDistributor(setDistributors, index, { url: event.target.value })}
                    />
                    <label className={styles.fileButton}>
                      Logo
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(event) => {
                          const file = event.target.files?.[0] ?? null
                          updateDistributor(setDistributors, index, {
                            file,
                            logoUrl: file ? URL.createObjectURL(file) : row.logoUrl,
                          })
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className={styles.remove}
                      onClick={() => setDistributors((current) => current.filter((item) => item.key !== row.key))}
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button type="button" className={styles.secondary} onClick={() => setDistributors((current) => [...current, emptyDistributor(crypto.randomUUID())])}>
                  Add distributor
                </button>
              </section>

              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>Search description</h3>
                <div className={styles.fields}>
                  <label className={styles.field}>
                    Page title
                    <input className={styles.input} value={metaTitle} onChange={(event) => setMetaTitle(event.target.value)} />
                  </label>
                  <label className={styles.field}>
                    Description
                    <textarea className={styles.textarea} value={metaDescription} onChange={(event) => setMetaDescription(event.target.value)} />
                  </label>
                </div>
              </section>

              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>Products</h3>
                <p className={styles.sectionHint}>
                  These come from your catalog, filtered to this brand. They are not typed in here.
                  Recommendations and category groups on the storefront use the same catalog.
                </p>
                {products.length === 0 ? (
                  <p className={styles.emptyProducts}>No products in your catalog yet.</p>
                ) : (
                  <div className={styles.productGrid}>
                    {products.map((product) => (
                      <article key={product.id} className={styles.productCard}>
                        {product.images?.[0]?.url ? (
                          <img src={product.images[0].url} alt="" className={styles.productImage} />
                        ) : (
                          <div className={styles.productImage} />
                        )}
                        <p className={styles.productName}>{product.name}</p>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <div className={styles.actions}>
                <button type="submit" className={styles.primary} disabled={saving}>
                  {saving ? 'Publishing…' : 'Publish brand page'}
                </button>
              </div>
            </form>
          )}
          {previewDesign ? (
            <div
              className={styles.previewOverlay}
              role="dialog"
              aria-modal="true"
              aria-label={`${previewDesign.title} preview`}
              onClick={() => setPreviewDesign(null)}
            >
              <div className={styles.previewDialog} onClick={(event) => event.stopPropagation()}>
                <div className={styles.previewHeader}>
                  <h3 className={styles.designTitle}>{previewDesign.title}</h3>
                  <button type="button" className={styles.secondary} onClick={() => setPreviewDesign(null)}>
                    Close
                  </button>
                </div>
                <div className={styles.previewScroll}>
                  <img src={previewDesign.image} alt={previewDesign.title} className={styles.previewFull} />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  )
}

function updateDistributor(
  setRows: Dispatch<SetStateAction<DistributorDraft[]>>,
  index: number,
  patch: Partial<DistributorDraft>
) {
  setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)))
}

function MediaField({
  label,
  url,
  onFile,
}: {
  label: string
  url: string | null
  onFile: (file: File, preview: string) => void
}) {
  return (
    <div className={styles.mediaRow}>
      {url ? <img src={url} alt="" className={styles.mediaPreview} /> : <div className={styles.mediaPreview} />}
      <label className={styles.fileButton}>
        {label}
        <input
          type="file"
          accept="image/*"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (!file) return
            onFile(file, URL.createObjectURL(file))
          }}
        />
      </label>
    </div>
  )
}
