import type { Metadata } from 'next'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = { title: 'POS' }

export default function PosPage() {
  return (
    <div className="grid h-full gap-4 p-4 lg:grid-cols-[1fr_22rem]">
      {/* Menu area (placeholder) */}
      <section className="space-y-3">
        <div className="flex gap-2">
          {['ทั้งหมด', 'กาแฟ', 'เบเกอรี่', 'ของหวาน'].map((c, i) => (
            <span
              key={c}
              className={
                i === 0
                  ? 'rounded-full bg-banana-500 px-4 py-2 text-sm font-medium text-navy-900'
                  : 'rounded-full bg-surface px-4 py-2 text-sm text-navy-700'
              }
            >
              {c}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex aspect-square flex-col justify-end rounded-lg border border-border bg-surface p-3"
            >
              <div className="mb-2 h-16 rounded-md bg-stone-100" />
              <p className="text-sm font-medium text-navy-800">สินค้า {i + 1}</p>
              <p className="font-display font-bold text-navy-700 tabular-nums">฿0</p>
            </div>
          ))}
        </div>
      </section>

      {/* Order panel (placeholder) */}
      <aside className="flex flex-col rounded-lg border border-border bg-surface">
        <div className="border-b border-border p-4 font-display font-bold text-navy-800">
          ออเดอร์ · Order
        </div>
        <div className="flex-1 p-4 text-sm text-muted">ยังไม่มีรายการ · No items yet.</div>
        <div className="space-y-2 border-t border-border p-4">
          <div className="flex justify-between text-sm text-muted">
            <span>VAT 7%</span>
            <span className="tabular-nums">฿0</span>
          </div>
          <div className="flex justify-between font-display text-lg font-bold text-navy-800">
            <span>รวม · Total</span>
            <span className="tabular-nums">฿0</span>
          </div>
          <Button variant="cta" size="pos" className="w-full" disabled>
            ชำระเงิน · Charge
          </Button>
        </div>
      </aside>
    </div>
  )
}
