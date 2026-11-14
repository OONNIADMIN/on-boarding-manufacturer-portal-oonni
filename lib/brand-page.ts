export type BrandLayout = 'catalog' | 'category'

export type BrandPageMedia = {
  id: number | null
  url: string | null
  alternativeText?: string | null
}

export type BrandMenuCategory = {
  categoryId: string
  name: string
  slug: string
  imageId: number | null
}

export type BrandPageContent = {
  layout: BrandLayout
  aboutTitle: string
  aboutBody: string
  heroTitle: string
  heroBody: string
  distributorsHeading: string
  shopTheLook: { title: string; url: string; imageId: number | null }
  menuCategories: BrandMenuCategory[]
  distributors: { name: string; url: string; logoId: number | null }[]
  seo: { metaTitle: string; metaDescription: string }
  logoId: number | null
  heroImageId: number | null
}

export type BrandPageDesigns = {
  catalog: BrandPageMedia | null
  category: BrandPageMedia | null
}

export type BrandPageRecord = {
  brand: { documentId: string; name: string; slug: string } | null
  designs?: BrandPageDesigns
  landing: {
    documentId: string
    layout: BrandLayout
    logo: BrandPageMedia | null
    heroImage: BrandPageMedia | null
    aboutTitle: string
    aboutBody: string
    heroTitle: string
    heroBody: string
    shopTheLook: { title: string; url: string; image: BrandPageMedia | null }
    menuCategories: {
      categoryId: string
      name: string
      slug: string
      image: BrandPageMedia | null
    }[]
    distributorsHeading: string
    distributors: { name: string; url: string; logo: BrandPageMedia | null }[]
    seo: { metaTitle: string; metaDescription: string }
  } | null
}

const clip = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '')

const idOf = (value: unknown): number | null => {
  if (value == null || value === '') return null
  const id = typeof value === 'number' ? value : parseInt(String(value), 10)
  if (!Number.isFinite(id) || id < 1) return null
  return id
}

const linkOf = (value: unknown): string | { error: string } => {
  const text = clip(value, 500)
  if (!text) return ''
  if (text.startsWith('/') && !text.startsWith('//')) return text
  try {
    const url = new URL(text)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { error: 'Links must start with http:// or https://' }
    }
    return text
  } catch {
    return { error: 'Links must start with http:// or https://' }
  }
}

export function parseBrandPageContent(body: unknown): { ok: true; value: BrandPageContent } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Brand page details are required' }
  const raw = body as Record<string, unknown>
  if (raw.layout !== 'catalog' && raw.layout !== 'category') {
    return { ok: false, error: 'Choose a brand page design first' }
  }

  const look = (raw.shopTheLook && typeof raw.shopTheLook === 'object'
    ? raw.shopTheLook
    : {}) as Record<string, unknown>
  const lookUrl = linkOf(look.url)
  if (typeof lookUrl !== 'string') return { ok: false, error: lookUrl.error }

  const rows = Array.isArray(raw.distributors) ? raw.distributors.slice(0, 16) : []
  const distributors: BrandPageContent['distributors'] = []
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const item = row as Record<string, unknown>
    const name = clip(item.name, 120)
    if (!name) continue
    const url = linkOf(item.url)
    if (typeof url !== 'string') return { ok: false, error: url.error }
    distributors.push({ name, url, logoId: idOf(item.logoId) })
  }

  const categoryRows = Array.isArray(raw.menuCategories) ? raw.menuCategories.slice(0, 40) : []
  const menuCategories: BrandPageContent['menuCategories'] = []
  for (const row of categoryRows) {
    if (!row || typeof row !== 'object') continue
    const item = row as Record<string, unknown>
    const categoryId = clip(item.categoryId, 128)
    const name = clip(item.name, 180)
    if (!categoryId || !name || !/^[A-Za-z0-9:_=-]+$/.test(categoryId)) continue
    menuCategories.push({
      categoryId,
      name,
      slug: clip(item.slug, 160),
      imageId: idOf(item.imageId),
    })
  }

  const seo = (raw.seo && typeof raw.seo === 'object' ? raw.seo : {}) as Record<string, unknown>

  return {
    ok: true,
    value: {
      layout: raw.layout,
      aboutTitle: clip(raw.aboutTitle, 180),
      aboutBody: clip(raw.aboutBody, 8000),
      heroTitle: clip(raw.heroTitle, 180),
      heroBody: clip(raw.heroBody, 8000),
      distributorsHeading: clip(raw.distributorsHeading, 180) || 'DISTRIBUTORS',
      shopTheLook: {
        title: clip(look.title, 180) || 'SHOP THE LOOK',
        url: lookUrl,
        imageId: idOf(look.imageId),
      },
      menuCategories,
      distributors,
      seo: {
        metaTitle: clip(seo.metaTitle, 180),
        metaDescription: clip(seo.metaDescription, 320),
      },
      logoId: idOf(raw.logoId),
      heroImageId: idOf(raw.heroImageId),
    },
  }
}
