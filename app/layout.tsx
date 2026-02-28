import type { Metadata } from 'next'
import './globals.scss'

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
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

