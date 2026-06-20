import type { Metadata } from 'next'
import Link from 'next/link'
import { Boxes, ChefHat, PackagePlus, Tags, Warehouse, Wallet } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const metadata: Metadata = { title: 'Setup' }

const sections = [
  {
    href: '/admin/products',
    icon: Boxes,
    th: 'สินค้า',
    en: 'Products',
    desc: 'เพิ่ม/แก้ไขเมนูสินค้า',
  },
  {
    href: '/admin/categories',
    icon: Tags,
    th: 'หมวดหมู่',
    en: 'Categories',
    desc: 'beverage · bakery',
  },
  {
    href: '/admin/pricing',
    icon: Wallet,
    th: 'ราคาสาขา',
    en: 'Branch pricing',
    desc: 'ตั้งราคาต่อสาขา',
  },
  { href: '/admin/recipes', icon: ChefHat, th: 'สูตร', en: 'Recipes', desc: 'สูตรและเวอร์ชัน' },
  {
    href: '/admin/inventory/receive',
    icon: PackagePlus,
    th: 'รับสต๊อก',
    en: 'Receive',
    desc: 'รับวัตถุดิบเข้าคลัง',
  },
  {
    href: '/admin/inventory/stock',
    icon: Warehouse,
    th: 'สต๊อกคงเหลือ',
    en: 'Stock',
    desc: 'ยอดคงเหลือปัจจุบัน',
  },
]

export default function AdminHubPage() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {sections.map((s) => {
        const Icon = s.icon
        return (
          <Link key={s.href} href={s.href} className="block">
            <Card className="h-full transition-colors hover:border-banana-400">
              <CardHeader className="flex-row items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-banana-500">
                  <Icon className="h-6 w-6 text-navy-900" aria-hidden="true" />
                </div>
                <div>
                  <CardTitle>{s.th}</CardTitle>
                  <p className="text-sm text-muted">{s.en}</p>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted">{s.desc}</p>
              </CardContent>
            </Card>
          </Link>
        )
      })}
    </div>
  )
}
