import type { Metadata } from 'next'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireRole } from '@/server/auth/guard'
import { listBranchPricing, listProducts } from '@/server/services'
import { ServiceErrorCard } from '../_components/service-error'
import { baht } from '../_components/format'
import { PriceForm } from './price-form'

export const metadata: Metadata = { title: 'Branch pricing · Setup' }

export default async function PricingPage() {
  const ctx = await requireRole(['owner'])
  const branchId = ctx.branchIds[0]
  if (!branchId) {
    return (
      <p className="text-sm text-muted">ไม่พบสาขาในสิทธิ์ของคุณ · No branch in your context.</p>
    )
  }

  const [products, pricing] = await Promise.all([listProducts(), listBranchPricing(branchId)])
  if (!products.ok) return <ServiceErrorCard error={products.error} />
  if (!pricing.ok) return <ServiceErrorCard error={pricing.error} />

  const byProduct = new Map(pricing.value.map((bp) => [bp.product_id, bp]))

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>ตั้งราคาต่อสาขา · Set branch price</CardTitle>
        </CardHeader>
        <CardContent>
          <PriceForm branchId={branchId} products={products.value} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ราคาปัจจุบัน · Current pricing</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="py-2 pr-3 font-medium">สินค้า · Product</th>
                <th className="py-2 pr-3 font-medium">ราคา · Price</th>
                <th className="py-2 pr-3 font-medium">เมนู · Section</th>
                <th className="py-2 font-medium">สถานะ · Available</th>
              </tr>
            </thead>
            <tbody>
              {products.value.map((p) => {
                const bp = byProduct.get(p.id)
                return (
                  <tr key={p.id} className="border-b border-border/60">
                    <td className="py-2 pr-3">
                      <span className="font-mono text-xs text-muted">{p.sku}</span> {p.name}
                    </td>
                    <td className="py-2 pr-3 tabular-nums">{baht(bp?.price_override ?? null)}</td>
                    <td className="py-2 pr-3 text-muted">{bp?.menu_section ?? '—'}</td>
                    <td className="py-2">
                      {bp ? (
                        bp.is_available ? (
                          <Badge variant="success">available</Badge>
                        ) : (
                          <Badge variant="warning">hidden</Badge>
                        )
                      ) : (
                        <span className="text-xs text-muted">ยังไม่ตั้งราคา · unpriced</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
