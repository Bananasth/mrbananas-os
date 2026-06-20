import type { ReactNode } from 'react'
import { Clock, LogOut } from 'lucide-react'
import { Logo } from '@/components/brand/logo'
import { Button } from '@/components/ui/button'
import { logout } from '@/server/auth/actions'
import { requireRole } from '@/server/auth/guard'

export default async function PosLayout({ children }: { children: ReactNode }) {
  const ctx = await requireRole(['owner', 'manager', 'staff'])
  return (
    <div className="flex min-h-dvh flex-col bg-cream-50">
      <header className="flex h-14 shrink-0 items-center gap-3 bg-navy-700 px-4 text-white">
        <Logo variant="roundel" />
        <span className="font-display font-bold">POS</span>
        <div className="ml-auto flex items-center gap-3 text-sm text-navy-100">
          <span className="capitalize">{ctx.primaryRole}</span>
          <Clock className="h-4 w-4" aria-hidden="true" />
          <form action={logout}>
            <Button type="submit" variant="ghost" size="icon" aria-label="Sign out">
              <LogOut className="h-5 w-5 text-white" aria-hidden="true" />
            </Button>
          </form>
        </div>
      </header>
      <main className="min-h-0 flex-1">{children}</main>
    </div>
  )
}
