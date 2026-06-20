import type { ReactNode } from 'react'
import { ChefHat, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { logout } from '@/server/auth/actions'
import { requireRole } from '@/server/auth/guard'

export default async function KdsLayout({ children }: { children: ReactNode }) {
  await requireRole(['owner', 'manager', 'staff', 'baker'])
  return (
    <div className="flex min-h-dvh flex-col bg-navy-900 text-white">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-navy-800 px-4">
        <ChefHat className="h-6 w-6 text-banana-500" aria-hidden="true" />
        <span className="font-display font-bold">Kitchen Display · จอครัว</span>
        <div className="ml-auto flex items-center gap-3 text-sm text-navy-300">
          <span>สาขา Downtown</span>
          <form action={logout}>
            <Button type="submit" variant="ghost" size="icon" aria-label="Sign out">
              <LogOut className="h-5 w-5 text-white" aria-hidden="true" />
            </Button>
          </form>
        </div>
      </header>
      <main className="min-h-0 flex-1 p-4">{children}</main>
    </div>
  )
}
