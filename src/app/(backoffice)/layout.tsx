import type { ReactNode } from 'react'
import { AppShell } from '@/components/layout/app-shell'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireRole } from '@/server/auth/guard'

async function loadBranchName(branchId: string | undefined): Promise<string | undefined> {
  if (!branchId) return undefined
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase.from('branch').select('name').eq('id', branchId).maybeSingle()
  return (data as { name: string } | null)?.name
}

export default async function BackofficeLayout({ children }: { children: ReactNode }) {
  const ctx = await requireRole(['owner', 'manager'])
  const branchName = await loadBranchName(ctx.branchIds[0])
  return (
    <AppShell branchName={branchName} role={ctx.primaryRole}>
      {children}
    </AppShell>
  )
}
