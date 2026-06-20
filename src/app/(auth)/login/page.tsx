import type { Metadata } from 'next'
import { Logo } from '@/components/brand/logo'
import { Card } from '@/components/ui/card'
import { LoginForm } from './login-form'

export const metadata: Metadata = { title: 'Login' }

export default function LoginPage() {
  return (
    <Card className="w-full max-w-sm p-6">
      <div className="mb-6 flex justify-center">
        <Logo variant="wordmark" />
      </div>
      <LoginForm />
      <p className="mt-4 text-center text-xs text-muted">เข้าสู่ระบบเพื่อจัดการร้าน</p>
    </Card>
  )
}
