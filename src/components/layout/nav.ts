import type { LucideIcon } from 'lucide-react'
import {
  Boxes,
  ChefHat,
  Factory,
  LayoutDashboard,
  Settings,
  ShoppingCart,
  SlidersHorizontal,
} from 'lucide-react'

export type NavItem = {
  href: string
  label: string
  labelTh: string
  icon: LucideIcon
}

/** Back-office (owner/manager) sidebar sections. Placeholders — no pages wired yet. */
export const backofficeNav: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', labelTh: 'แดชบอร์ด', icon: LayoutDashboard },
  { href: '/catalog', label: 'Catalog', labelTh: 'เมนู', icon: Boxes },
  { href: '/inventory', label: 'Inventory', labelTh: 'สต๊อก', icon: Factory },
  { href: '/sales', label: 'Sales', labelTh: 'ยอดขาย', icon: ShoppingCart },
  { href: '/admin', label: 'Setup', labelTh: 'ตั้งค่าระบบ', icon: SlidersHorizontal },
  { href: '/settings', label: 'Settings', labelTh: 'ตั้งค่า', icon: Settings },
]

/** Operational surfaces launched from the dashboard. */
export const launchpad: NavItem[] = [
  { href: '/pos', label: 'POS', labelTh: 'ขายหน้าร้าน', icon: ShoppingCart },
  { href: '/kds', label: 'Kitchen Display', labelTh: 'จอครัว', icon: ChefHat },
]
