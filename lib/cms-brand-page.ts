import type { BrandPageRecord } from '@/lib/brand-page'

function readEnv(name: string): string {
  return (process.env[name] || '').trim()
}

function cmsConfig(): { base: string; token: string } | { error: string } {
  const base = (readEnv('CMS_URL') || readEnv('STRAPI_URL')).replace(/\/+$/, '')
  const token = readEnv('CMS_PORTAL_TOKEN') || readEnv('PORTAL_CMS_TOKEN')
  if (!base || !token) {
    return { error: 'Brand page CMS is  not configured. Set CMS_URL and CMS_PORTAL_TOKEN.' }
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
  let response: Response
  try {
    response = await fetch(
      `${config.base}/api/brand-page/portal?slug=${encodeURIComponent(slug)}`,
      {
        headers: { Authorization: `Bearer ${config.token}` },
        cache: 'no-store',
      }
    )
  } catch {
    throw new Error(`Could not reach the CMS at ${config.base}.`)
  }
  if (!response.ok) throw new Error(await cmsError(response))
  const body = (await response.json()) as { data?: BrandPageRecord }
  return body.data ?? { brand: null, landing: null, designs: { catalog: null, category: null } }
}

export async function saveCmsBrandPage(form: FormData): Promise<BrandPageRecord> {
  const config = cmsConfig()
  if ('error' in config) throw new Error(config.error)
  let response: Response
  try {
    response = await fetch(`${config.base}/api/brand-page/portal`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${config.token}` },
      body: form,
      cache: 'no-store',
    })
  } catch {
    throw new Error(`Could not reach the CMS at ${config.base}.`)
  }
  if (!response.ok) throw new Error(await cmsError(response))
  const body = (await response.json()) as { data?: BrandPageRecord }
  if (!body.data) throw new Error('CMS did not return the saved brand page')
  return body.data
}
