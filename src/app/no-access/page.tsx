import type { Metadata } from 'next'
import { Logo } from '@/components/brand/logo'
import { Button } from '@/components/ui/button'
import { logout } from '@/server/auth/actions'

export const metadata: Metadata = { title: 'No access' }

export default function NoAccessPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-navy-700 p-4 text-center">
      <Logo variant="wordmark" tone="inverse" />
      <p className="max-w-xs text-navy-100">
        บัญชีนี้ไม่มีสิทธิ์เข้าใช้งานระบบ · This account has no access to the system.
      </p>
      <form action={logout}>
        <Button variant="cta">ออกจากระบบ · Sign out</Button>
      </form>
    </div>
  )
}
