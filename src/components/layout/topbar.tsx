import { Bell, LogOut, UserRound } from 'lucide-react'
import { Logo } from '@/components/brand/logo'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { logout } from '@/server/auth/actions'

export function Topbar({ branchName, role }: { branchName?: string; role?: string }) {
  return (
    <header className="flex h-16 items-center gap-3 border-b border-border bg-surface px-4">
      <div className="md:hidden">
        <Logo variant="roundel" />
      </div>
      <div className="ml-auto flex items-center gap-2">
        {branchName ? (
          <Badge variant="brand" className="hidden sm:inline-flex">
            สาขา · {branchName}
          </Badge>
        ) : null}
        {role ? (
          <Badge variant="navy" className="hidden capitalize sm:inline-flex">
            {role}
          </Badge>
        ) : null}
        <Button variant="ghost" size="icon" aria-label="Notifications">
          <Bell className="h-5 w-5" aria-hidden="true" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Account">
          <UserRound className="h-5 w-5" aria-hidden="true" />
        </Button>
        <form action={logout}>
          <Button type="submit" variant="ghost" size="icon" aria-label="Sign out">
            <LogOut className="h-5 w-5" aria-hidden="true" />
          </Button>
        </form>
      </div>
    </header>
  )
}
