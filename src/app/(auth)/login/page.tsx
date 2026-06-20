import type { Metadata } from 'next'
import { Logo } from '@/components/brand/logo'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

export const metadata: Metadata = { title: 'Login' }

export default function LoginPage() {
  return (
    <Card className="w-full max-w-sm p-6">
      <div className="mb-6 flex justify-center">
        <Logo variant="wordmark" />
      </div>
      <form className="space-y-3">
        <div className="space-y-1">
          <label htmlFor="email" className="text-sm font-medium text-navy-800">
            อีเมล · Email
          </label>
          <Input id="email" type="email" autoComplete="email" placeholder="you@example.com" />
        </div>
        <div className="space-y-1">
          <label htmlFor="password" className="text-sm font-medium text-navy-800">
            รหัสผ่าน · Password
          </label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
          />
        </div>
        <Button type="button" variant="cta" size="lg" className="w-full">
          เข้าสู่ระบบ · Sign in
        </Button>
      </form>
      <p className="mt-4 text-center text-xs text-muted">
        Authentication is wired in Phase 1 (Supabase Auth).
      </p>
    </Card>
  )
}
