import type { Metadata } from 'next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { listInventoryItems, listProducts } from '@/server/services'
import { toggleProductAction } from '../actions'
import { ServiceErrorCard } from '../_components/service-error'
import { ProductForm } from './product-form'

export const metadata: Metadata = { title: 'Products · Setup' }

export default async function ProductsPage() {
  const [products, items] = await Promise.all([listProducts(), listInventoryItems()])
  if (!products.ok) return <ServiceErrorCard error={products.error} />

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>เพิ่มสินค้า · New product</CardTitle>
        </CardHeader>
        <CardContent>
          <ProductForm items={items.ok ? items.value : []} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>สินค้าทั้งหมด · Catalog ({products.value.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {products.value.length === 0 ? (
            <p className="text-sm text-muted">ยังไม่มีสินค้า · No products yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className="py-2 pr-3 font-medium">SKU</th>
                  <th className="py-2 pr-3 font-medium">ชื่อ · Name</th>
                  <th className="py-2 pr-3 font-medium">หมวด · Category</th>
                  <th className="py-2 pr-3 font-medium">ประเภท · Type</th>
                  <th className="py-2 pr-3 font-medium">สถานะ · Status</th>
                  <th className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {products.value.map((p) => (
                  <tr key={p.id} className="border-b border-border/60">
                    <td className="py-2 pr-3 font-mono text-xs">{p.sku}</td>
                    <td className="py-2 pr-3">{p.name}</td>
                    <td className="py-2 pr-3">
                      <Badge variant={p.category === 'beverage' ? 'navy' : 'brand'}>
                        {p.category}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3 text-muted">{p.type}</td>
                    <td className="py-2 pr-3">
                      {p.is_active ? (
                        <Badge variant="success">active</Badge>
                      ) : (
                        <Badge variant="danger">inactive</Badge>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      <form action={toggleProductAction}>
                        <input type="hidden" name="productId" value={p.id} />
                        <input
                          type="hidden"
                          name="isActive"
                          value={p.is_active ? 'false' : 'true'}
                        />
                        <Button type="submit" variant="outline" size="sm">
                          {p.is_active ? 'ปิดการขาย' : 'เปิดการขาย'}
                        </Button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
