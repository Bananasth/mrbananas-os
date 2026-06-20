import type { Metadata } from 'next'
import Link from 'next/link'
import { Logo } from '@/components/brand/logo'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { launchpad } from '@/components/layout/nav'

export const metadata: Metadata = { title: 'Dashboard' }

const kpis = [
  { label: 'ยอดขายวันนี้ · Sales today', value: '฿0' },
  { label: 'ออเดอร์ · Orders', value: '0' },
  { label: 'สต๊อกใกล้หมด · Low stock', value: '0' },
  { label: 'แบตช์กำลังผลิต · Batches', value: '0' },
]

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-navy-800">
          แดชบอร์ด <span className="text-base font-normal text-muted">Dashboard</span>
        </h1>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="rounded-md bg-stone-50 p-4">
            <p className="text-xs text-muted">{kpi.label}</p>
            <p className="mt-1 font-display text-2xl font-bold text-navy-800 tabular-nums">
              {kpi.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {launchpad.map((item) => {
          const Icon = item.icon
          return (
            <Link key={item.href} href={item.href} className="block">
              <Card className="transition-colors hover:border-banana-400">
                <CardHeader className="flex-row items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-banana-500">
                    <Icon className="h-6 w-6 text-navy-900" aria-hidden="true" />
                  </div>
                  <div>
                    <CardTitle>{item.labelTh}</CardTitle>
                    <p className="text-sm text-muted">{item.label}</p>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted">Placeholder — built in a later phase.</p>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>

      <div className="flex items-center gap-2 pt-2 text-xs text-muted">
        <Logo variant="roundel" className="h-6 w-6" />
        <span>MR.BANANA&apos;S OS · Phase 0 scaffold</span>
      </div>
    </div>
  )
}
