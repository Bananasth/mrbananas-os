import { redirect } from 'next/navigation'
import { getAuthContext } from '@/server/auth/context'
import { defaultRouteForRole } from '@/server/auth/routing'

export default async function Home() {
  const ctx = await getAuthContext()
  redirect(ctx ? defaultRouteForRole(ctx.primaryRole) : '/login')
}
