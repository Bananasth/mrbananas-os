import { Banana } from 'lucide-react'
import { cn } from '@/lib/utils'

type LogoProps = {
  variant?: 'wordmark' | 'roundel'
  tone?: 'default' | 'inverse'
  className?: string
}

export function Logo({ variant = 'wordmark', tone = 'default', className }: LogoProps) {
  if (variant === 'roundel') {
    return (
      <div
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-full bg-navy-700',
          className,
        )}
        aria-label="Mr.Bananas"
      >
        <Banana className="h-5 w-5 text-banana-500" aria-hidden="true" />
      </div>
    )
  }
  return (
    <div className={cn('flex items-center gap-2', className)} aria-label="Mr.Bananas">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-700">
        <Banana className="h-5 w-5 text-banana-500" aria-hidden="true" />
      </div>
      <span
        className={cn(
          'font-display text-xl font-bold tracking-tight',
          tone === 'inverse' ? 'text-white' : 'text-navy-800',
        )}
      >
        Mr.Bananas
      </span>
    </div>
  )
}
