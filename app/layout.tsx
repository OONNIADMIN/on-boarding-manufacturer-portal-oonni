import type { Metadata } from 'next'
import { Quicksand } from 'next/font/google'
import { PORTAL_TITLE } from '@/lib/constants'
import './globals.scss'

const quicksand = Quicksand({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
  preload: true,
  fallback: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
})

export const metadata: Metadata = {
  title: PORTAL_TITLE,
  description: 'Platform for onboarding manufacturers product catalogs',
  icons: {
    icon: '/oonni.ico',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={quicksand.className}>
      <body>{children}</body>
    </html>
  )
}

