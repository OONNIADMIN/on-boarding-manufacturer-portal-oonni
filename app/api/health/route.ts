import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({ status: 'ok', service: 'OONNI On Boarding', db: 'connected', timestamp: new Date().toISOString() })
  } catch {
    return NextResponse.json({ status: 'degraded', service: 'OONNI On Boarding', db: 'disconnected', timestamp: new Date().toISOString() }, { status: 503 })
  }
}

