import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getImageKitIntegrationStatus } from '@/lib/imagekit'

export async function GET() {
  const imagekit = getImageKitIntegrationStatus()
  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({
      status: 'ok',
      service: 'OONNI On Boarding',
      db: 'connected',
      imagekit,
      timestamp: new Date().toISOString(),
    })
  } catch {
    return NextResponse.json({
      status: 'degraded',
      service: 'OONNI On Boarding',
      db: 'disconnected',
      imagekit,
      timestamp: new Date().toISOString(),
    }, { status: 503 })
  }
}

