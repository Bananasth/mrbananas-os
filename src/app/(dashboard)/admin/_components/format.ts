/** Format integer minor units (satang) as Thai Baht. Pure — safe in server components. */
export function baht(satang: number | null | undefined): string {
  if (satang === null || satang === undefined) return '—'
  return (satang / 100).toLocaleString('th-TH', { style: 'currency', currency: 'THB' })
}
