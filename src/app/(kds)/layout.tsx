import type { ReactNode } from 'react'
import { ChefHat } from 'lucide-react'

export default function KdsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-navy-900 text-white">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-navy-800 px-4">
        <ChefHat className="h-6 w-6 text-banana-500" aria-hidden="true" />
        <span className="font-display font-bold">Kitchen Display · จอครัว</span>
        <span className="ml-auto text-sm text-navy-300">สาขา Downtown</span>
      </header>
      <main className="min-h-0 flex-1 p-4">{children}</main>
    </div>
  )
}
