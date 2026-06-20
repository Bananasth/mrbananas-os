import type { ReactNode } from 'react'
import { Sidebar } from './sidebar'
import { Topbar } from './topbar'

/** Back-office shell: sidebar + top bar + content. Used by the (backoffice) route group. */
export function AppShell({
  children,
  branchName,
  role,
}: {
  children: ReactNode
  branchName?: string
  role?: string
}) {
  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar branchName={branchName} role={role} />
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  )
}
