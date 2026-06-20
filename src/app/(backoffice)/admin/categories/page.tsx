import type { Metadata } from 'next'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { listProducts } from '@/server/services'
import { ServiceErrorCard } from '../_components/service-error'

export const metadata: Metadata = { title: 'Categories · Setup' }

// Product categories are a FIXED schema enum (product.category CHECK in (...)). They are not a
// CRUD table — changing the set would require a schema change, which is out of scope. This
// screen is a read-only overview with live counts.
const CATEGORIES = [
  { key: 'beverage', th: 'เครื่องดื่ม', en: 'Beverage', variant: 'navy' as const },
  { key: 'bakery', th: 'เบเกอรี่', en: 'Bakery', variant: 'brand' as const },
]

export default async function CategoriesPage() {
  const products = await listProducts()
  if (!products.ok) return <ServiceErrorCard error={products.error} />

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {CATEGORIES.map((c) => {
          const inCat = products.value.filter((p) => p.category === c.key)
          const active = inCat.filter((p) => p.is_active).length
          return (
            <Card key={c.key}>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>
                  {c.th} <span className="text-sm font-normal text-muted">{c.en}</span>
                </CardTitle>
                <Badge variant={c.variant}>{c.key}</Badge>
              </CardHeader>
              <CardContent>
                <p className="font-display text-2xl font-bold text-navy-800 tabular-nums">
                  {inCat.length}
                </p>
                <p className="text-sm text-muted">
                  {active} เปิดขาย · active / {inCat.length - active} ปิด · inactive
                </p>
              </CardContent>
            </Card>
          )
        })}
      </div>
      <p className="text-xs text-muted">
        หมวดหมู่เป็นค่าคงที่ในสคีมา (CHECK constraint) — แก้ไขชุดหมวดหมู่ต้องเปลี่ยนสคีมา ·
        Categories are a fixed schema enum; changing the set requires a schema change.
      </p>
    </div>
  )
}
