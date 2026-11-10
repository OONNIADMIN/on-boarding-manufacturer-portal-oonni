import { NextRequest } from 'next/server'
import { effectiveManufacturerId, isAdminUser, requireAuth } from '@/lib/auth'
import { err, forbidden, ok, unauthorized } from '@/lib/api-response'
import { parseBrandPageContent, type BrandPageContent } from '@/lib/brand-page'
import { fetchCmsBrandPage, saveCmsBrandPage } from '@/lib/cms-brand-page'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'])
const MAX_IMAGE_BYTES = 8 * 1024 * 1024

async function manufacturerOf(req: NextRequest) {
  const { user, error } = await requireAuth(req)
  if (error || !user) return { error: unauthorized(error ?? undefined) as Response }
  if (isAdminUser(user)) return { error: forbidden('Brand pages are edited from a manufacturer account') as Response }
  const manufacturerId = effectiveManufacturerId(user)
  if (!manufacturerId) return { error: forbidden('Manufacturer is required') as Response }
  const manufacturer = await prisma.manufacturer.findFirst({
    where: { id: manufacturerId, deleted_at: null },
    select: { id: true, name: true, slug: true },
  })
  if (!manufacturer) return { error: forbidden('Manufacturer is required') as Response }
  return { manufacturer }
}

export async function GET(req: NextRequest) {
  const scoped = await manufacturerOf(req)
  if ('error' in scoped) return scoped.error
  try {
    const page = await fetchCmsBrandPage(scoped.manufacturer.slug)
    return ok({ ...page, manufacturer: scoped.manufacturer })
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Could not load the brand page'
    return err(message, 503)
  }
}

function appendFile(form: FormData, key: string, file: File) {
  if (!IMAGE_TYPES.has(file.type)) {
    throw new Error('Brand files must be JPEG, PNG, WebP, GIF, or SVG images')
  }
  if (file.size > MAX_IMAGE_BYTES) throw new Error('Each brand image must be 8MB or smaller')
  form.append(key, file, file.name)
}

export async function PUT(req: NextRequest) {
  const scoped = await manufacturerOf(req)
  if ('error' in scoped) return scoped.error

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return err('Invalid form data')
  }

  let parsed: { ok: true; value: BrandPageContent } | { ok: false; error: string }
  try {
    parsed = parseBrandPageContent(JSON.parse(String(form.get('payload') ?? '')))
  } catch {
    return err('Brand page details are required')
  }
  if (!parsed.ok) return err(parsed.error)

  const outbound = new FormData()
  outbound.append(
    'payload',
    JSON.stringify({
      ...parsed.value,
      slug: scoped.manufacturer.slug,
      name: scoped.manufacturer.name,
    })
  )

  try {
    for (const key of ['logo', 'heroImage', 'shopTheLook']) {
      const file = form.get(key)
      if (file instanceof File && file.size > 0) appendFile(outbound, key, file)
    }
    for (let index = 0; index < parsed.value.distributors.length; index += 1) {
      const file = form.get(`distributorLogo_${index}`)
      if (file instanceof File && file.size > 0) appendFile(outbound, `distributorLogo_${index}`, file)
    }
    const page = await saveCmsBrandPage(outbound)
    return ok({ ...page, manufacturer: scoped.manufacturer })
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Could not save the brand page'
    const status = /not configured|CMS request failed|did not return/.test(message) ? 503 : 400
    return err(message, status)
  }
}
