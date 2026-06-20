import { redirect } from 'next/navigation'

export default function Home() {
  // Phase 1 will route by auth state; for the scaffold, land on the dashboard.
  redirect('/dashboard')
}
