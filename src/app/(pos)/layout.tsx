import type { ReactNode } from 'react'
import { Clock } from 'lucide-react'
import { Logo } from '@/components/brand/logo'

export default function PosLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-cream-50">
      <header className="flex h-14 shrink-0 items-center gap-3 bg-navy-700 px-4 text-white">
        <Logo variant="roundel" />
        <span className="font-display font-bold">POS</span>
        <div className="ml-auto flex items-center gap-3 text-sm text-navy-100">
          <span>สาขา Downtown</span>
          <span className="text-navy-300">·</span>
          <span>Cashier</span>
          <Clock className="h-4 w-4" aria-hidden="true" />
        </div>
      </header>
      <main className="min-h-0 flex-1">{children}</main>
    </div>
  )
}
