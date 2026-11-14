import { describe, expect, it } from 'vitest'
import { parseBrandPageContent } from '@/lib/brand-page'

describe('parseBrandPageContent', () => {
  it('requires one of the two brand page designs', () => {
    expect(parseBrandPageContent({ layout: 'grid' }).ok).toBe(false)
  })

  it('keeps brand copy and drops unnamed distributors', () => {
    const parsed = parseBrandPageContent({
      layout: 'catalog',
      aboutTitle: 'ABOUT THE BRAND',
      aboutBody: 'Glassware since 1818',
      distributors: [
        { name: '  Wasserstrom  ', url: 'https://www.wasserstrom.com', logoId: 4 },
        { name: '   ', url: 'https://example.com' },
      ],
      shopTheLook: { title: 'SHOP THE LOOK', url: '/look', imageId: '12' },
      logoId: 3,
    })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.layout).toBe('catalog')
    expect(parsed.value.distributors).toEqual([
      { name: 'Wasserstrom', url: 'https://www.wasserstrom.com', logoId: 4 },
    ])
    expect(parsed.value.shopTheLook.imageId).toBe(12)
    expect(parsed.value.logoId).toBe(3)
    expect(parsed.value.menuCategories).toEqual([])
  })

  it('keeps catalog category ids used to filter the brand menu', () => {
    const parsed = parseBrandPageContent({
      layout: 'catalog',
      menuCategories: [
        { categoryId: 'Q2F0ZWdvcnk6MQ', name: 'Baskets', slug: 'baskets', imageId: 9 },
        { categoryId: 'not an id', name: 'Skipped' },
        { categoryId: 'Q2F0ZWdvcnk6Mg', name: '   ' },
      ],
    })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.menuCategories).toEqual([
      { categoryId: 'Q2F0ZWdvcnk6MQ', name: 'Baskets', slug: 'baskets', imageId: 9 },
    ])
  })

  it('rejects a link that is not a web address', () => {
    const parsed = parseBrandPageContent({
      layout: 'category',
      shopTheLook: { url: 'javascript:alert(1)' },
    })
    expect(parsed.ok).toBe(false)
  })
})
