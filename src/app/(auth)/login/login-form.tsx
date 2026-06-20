'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { login } from '@/server/auth/actions'

const initialState: { error?: string } = {}

export function LoginForm() {
  const [state, action, pending] = useActionState(login, initialState)
  return (
    <form action={action} className="space-y-3">
      <div className="space-y-1">
        <label htmlFor="email" className="text-sm font-medium text-navy-800">
          อีเมล · Email
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="password" className="text-sm font-medium text-navy-800">
          รหัสผ่าน · Password
        </label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
        />
      </div>
      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      <Button type="submit" variant="cta" size="lg" className="w-full" disabled={pending}>
        {pending ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ · Sign in'}
      </Button>
    </form>
  )
}
