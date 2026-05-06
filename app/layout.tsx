import type { Metadata } from 'next'
import { Quicksand } from 'next/font/google'
import './globals.scss'

const quicksand = Quicksand({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-quicksand',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Oonni - Catalog Upload',
  description: 'Platform for onboarding manufacturers product catalogs',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={quicksand.variable}>
      <body className={quicksand.className}>{children}</body>
    </html>
  )
}

