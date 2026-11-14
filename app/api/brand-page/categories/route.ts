import { NextRequest } from 'next/server'
import { effectiveManufacturerId, isAdminUser, requireAuth } from '@/lib/auth'
import { err, forbidden, ok, unauthorized } from '@/lib/api-response'
import { fetchAllNauticalCategories } from '@/lib/marketplace/operations/categories'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req)
  if (error || !user) return unauthorized(error ?? undefined)
  if (isAdminUser(user)) return forbidden('Brand pages are edited from a manufacturer account')
  if (!effectiveManufacturerId(user)) return forbidden('Manufacturer is required')

  try {
    const categories = await fetchAllNauticalCategories()
    return ok(
      categories.map((category) => ({
        id: category.id,
        name: category.name,
        slug: category.slug,
        parentId: category.parent_id,
      }))
    )
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Could not load categories'
    return err(message, 503)
  }
}
