'use client'

import { useEffect } from 'react'

/** Registers the service worker so the app is installable (PWA baseline). */
export function SwRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // registration is best-effort; failures must not break the app
      })
    }
  }, [])
  return null
}
