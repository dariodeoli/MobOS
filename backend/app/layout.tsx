import type { Metadata } from 'next'
import { MOBOS_IDENTITY } from '../lib/identity'

export const metadata: Metadata = {
  title: MOBOS_IDENTITY.apiName,
  description: MOBOS_IDENTITY.description,
  icons: [{ rel: 'icon', url: MOBOS_IDENTITY.faviconPath, type: MOBOS_IDENTITY.faviconType }],
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-PY">
      <body>{children}</body>
    </html>
  )
}
