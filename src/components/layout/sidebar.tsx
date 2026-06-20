'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Logo } from '@/components/brand/logo'
import { cn } from '@/lib/utils'
import { backofficeNav } from './nav'

export function Sidebar() {
  const pathname = usePathname()
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-navy-800 bg-navy-700 md:flex">
      <div className="flex h-16 items-center px-4">
        <Logo variant="wordmark" tone="inverse" />
      </div>
      <nav className="flex-1 space-y-1 px-3 py-2">
        {backofficeNav.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
                active
                  ? 'bg-banana-500 font-medium text-navy-900'
                  : 'text-navy-100 hover:bg-navy-600',
              )}
            >
              <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span>{item.labelTh}</span>
              <span className={cn('ml-auto text-xs', active ? 'text-navy-800' : 'text-navy-300')}>
                {item.label}
              </span>
            </Link>
          )
        })}
      </nav>
      <div className="border-t border-navy-800 p-3 text-xs text-navy-300">v0 · scaffold</div>
    </aside>
  )
}
