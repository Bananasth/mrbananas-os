import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { Baloo_2, IBM_Plex_Mono, IBM_Plex_Sans_Thai } from 'next/font/google'
import { SwRegister } from '@/components/pwa/sw-register'
import './globals.css'

const sans = IBM_Plex_Sans_Thai({
  subsets: ['latin', 'thai'],
  weight: ['400', '500', '600'],
  variable: '--font-ibm-plex-sans-thai',
})
const display = Baloo_2({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-baloo',
})
const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-ibm-plex-mono',
})

export const metadata: Metadata = {
  title: { default: "MR.BANANA'S OS", template: "%s · MR.BANANA'S OS" },
  description: 'Operating system for a beverage & bakery business.',
  applicationName: "MR.BANANA'S OS",
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', shortcut: '/icon.svg', apple: '/icon.svg' },
  appleWebApp: { capable: true, title: 'Mr.Bananas', statusBarStyle: 'default' },
}

export const viewport: Viewport = {
  themeColor: '#1a2862',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="th" className={`${sans.variable} ${display.variable} ${mono.variable}`}>
      <body>
        {children}
        <SwRegister />
      </body>
    </html>
  )
}
