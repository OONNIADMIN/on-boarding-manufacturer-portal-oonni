import type { BrandPageRecord } from '@/lib/brand-page'

function cmsConfig(): { base: string; token: string } | { error: string } {
  const base = (process.env.CMS_URL || process.env.STRAPI_URL || '').trim().replace(/\/+$/, '')
  const token = (process.env.CMS_PORTAL_TOKEN || process.env.PORTAL_CMS_TOKEN || '').trim()
  if (!base || !token) {
    return { error: 'Brand page CMS is not configured. Set CMS_URL and CMS_PORTAL_TOKEN.' }
  }
  return { base, token }
}

async function cmsError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as {
    error?: { message?: string } | string
    message?: string
  }
  if (typeof body.error === 'string' && body.error) return body.error
  if (body.error && typeof body.error === 'object' && body.error.message) return body.error.message
  if (body.message) return body.message
  return `CMS request failed (${response.status})`
}

export async function fetchCmsBrandPage(slug: string): Promise<BrandPageRecord> {
  const config = cmsConfig()
  if ('error' in config) throw new Error(config.error)
  const response = await fetch(
    `${config.base}/api/brand-page/portal?slug=${encodeURIComponent(slug)}`,
    {
      headers: { Authorization: `Bearer ${config.token}` },
      cache: 'no-store',
    }
  )
  if (!response.ok) throw new Error(await cmsError(response))
  const body = (await response.json()) as { data?: BrandPageRecord }
  return body.data ?? { brand: null, landing: null }
}

export async function saveCmsBrandPage(form: FormData): Promise<BrandPageRecord> {
  const config = cmsConfig()
  if ('error' in config) throw new Error(config.error)
  const response = await fetch(`${config.base}/api/brand-page/portal`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${config.token}` },
    body: form,
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(await cmsError(response))
  const body = (await response.json()) as { data?: BrandPageRecord }
  if (!body.data) throw new Error('CMS did not return the saved brand page')
  return body.data
}
