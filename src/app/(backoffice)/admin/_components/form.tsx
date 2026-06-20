'use client'

import type { ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import { Button, type ButtonProps } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** Submit button that shows a pending state while the server action runs. */
export function SubmitButton({ children, ...props }: ButtonProps) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} {...props}>
      {pending ? 'กำลังบันทึก…' : children}
    </Button>
  )
}

/** Inline success / error feedback for a form action result. */
export function FormMessage({ ok, error }: { ok?: boolean; error?: string }) {
  if (error) return <p className="text-sm text-danger">{error}</p>
  if (ok) return <p className="text-sm text-leaf-700">บันทึกแล้ว · Saved</p>
  return null
}

/** Labelled field wrapper. */
export function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor?: string
  children: ReactNode
}) {
  return (
    <label htmlFor={htmlFor} className="block space-y-1">
      <span className="text-sm font-medium text-navy-800">{label}</span>
      {children}
    </label>
  )
}

/** Native select styled to match the Input primitive. */
export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'flex h-11 w-full rounded-md border border-input bg-surface px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}
