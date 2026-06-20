import type { Metadata } from 'next'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireRole } from '@/server/auth/guard'
import { listInventoryItems } from '@/server/services'
import { ServiceErrorCard } from '../../_components/service-error'
import { ReceiveForm } from './receive-form'

export const metadata: Metadata = { title: 'Receive inventory · Setup' }

export default async function ReceivePage() {
  const ctx = await requireRole(['owner'])
  const branchId = ctx.branchIds[0]
  if (!branchId) {
    return (
      <p className="text-sm text-muted">ไม่พบสาขาในสิทธิ์ของคุณ · No branch in your context.</p>
    )
  }
  const items = await listInventoryItems()
  if (!items.ok) return <ServiceErrorCard error={items.error} />

  return (
    <Card>
      <CardHeader>
        <CardTitle>รับวัตถุดิบเข้าคลัง · Receive inventory</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ReceiveForm branchId={branchId} items={items.value} />
        <p className="text-xs text-muted">
          สร้างล็อตใหม่ผ่าน app.receive_inventory แล้วดูยอดได้ที่{' '}
          <Link href="/admin/inventory/stock" className="text-navy-700 hover:text-banana-600">
            สต๊อกคงเหลือ · Stock
          </Link>
          .
        </p>
      </CardContent>
    </Card>
  )
}
