import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'KDS' }

const stations = [
  { th: 'เบเกอรี่', en: 'Bakery', color: 'bg-banana-500' },
  { th: 'เครื่องดื่ม', en: 'Beverage', color: 'bg-leaf-500' },
]

export default function KdsPage() {
  return (
    <div className="grid h-full gap-4 md:grid-cols-2">
      {stations.map((s) => (
        <section key={s.en} className="flex flex-col rounded-lg bg-navy-800 p-3">
          <div className="mb-3 flex items-center gap-2">
            <span className={`h-3 w-3 rounded-full ${s.color}`} />
            <h2 className="font-display text-lg font-bold">
              {s.th} <span className="text-sm font-normal text-navy-300">{s.en}</span>
            </h2>
          </div>
          <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-navy-700 p-6 text-sm text-navy-300">
            ไม่มีออเดอร์ · No tickets — realtime wiring lands in Phase 5.
          </div>
        </section>
      ))}
    </div>
  )
}
