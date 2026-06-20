import type { Metadata } from 'next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const metadata: Metadata = { title: 'Settings' }

const sections = [
  { th: 'ผู้ใช้และสิทธิ์', en: 'Users & roles' },
  { th: 'สาขา', en: 'Branches' },
  { th: 'จุดทำงาน', en: 'Workstations' },
  { th: 'ซัพพลายเออร์', en: 'Suppliers' },
]

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold text-navy-800">
        ตั้งค่า <span className="text-base font-normal text-muted">Settings</span>
      </h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {sections.map((s) => (
          <Card key={s.en}>
            <CardHeader>
              <CardTitle>{s.th}</CardTitle>
              <p className="text-sm text-muted">{s.en}</p>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted">Admin UI lands in Phase 3.</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
