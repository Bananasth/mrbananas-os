// scripts/auth/verify-receive.mjs
//
// Proves Receive -> Stock works end to end against the LIVE project, as the owner.
// Signs in (publishable key + owner password), reads stock_on_hand for a raw item,
// calls public.receive_inventory, then re-reads stock and asserts it increased.
// No service_role key, no DB password — only the public key + the owner's login.
//
// Run:  TEST_PASSWORD='owner-login-password' node scripts/auth/verify-receive.mjs
// Optional: QTY (default 7), TEST_EMAIL (default owner@misterbananas.com).

import { readFileSync } from 'node:fs'

const BRANCH = '22222222-2222-2222-2222-222222222222'
const EMAIL = process.env.TEST_EMAIL ?? 'owner@misterbananas.com'
const PASSWORD = process.env.TEST_PASSWORD ?? process.argv[2]
const QTY = Number(process.env.QTY ?? 7)

function env() {
  const out = {}
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i > 0) out[t.slice(0, i).trim()] = t.slice(i + 1).trim()
  }
  return out
}

async function main() {
  if (!PASSWORD) {
    console.error('ERROR: TEST_PASSWORD=... node scripts/auth/verify-receive.mjs')
    process.exit(2)
  }
  const e = env()
  const URL_ = e.NEXT_PUBLIC_SUPABASE_URL
  const KEY = e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? e.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const rest = (path, init = {}) =>
    fetch(`${URL_}/rest/v1/${path}`, {
      ...init,
      headers: { apikey: KEY, Authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
    })

  // 1) sign in as owner
  const auth = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  }).then((r) => r.json())
  if (!auth.access_token) {
    console.error('LOGIN FAILED:', auth.error_description ?? auth.msg ?? auth)
    process.exit(1)
  }
  const token = auth.access_token
  console.log('PASS  owner login')

  // 2) pick a raw inventory item
  const items = await rest('inventory_item?item_kind=eq.raw&select=id,base_unit&limit=1').then((r) => r.json())
  if (!Array.isArray(items) || items.length === 0) {
    console.error('No raw inventory item found — create one in /admin/inventory/items first.')
    process.exit(1)
  }
  const item = items[0]
  const stockOf = async () => {
    const rows = await rest(
      `stock_on_hand?branch_id=eq.${BRANCH}&item_id=eq.${item.id}&select=qty_available`,
    ).then((r) => r.json())
    return Array.isArray(rows) && rows[0] ? Number(rows[0].qty_available) : 0
  }

  const before = await stockOf()
  console.log(`      item ${item.id.slice(0, 8)} (${item.base_unit}) stock before = ${before}`)

  // 3) receive via the public wrapper RPC
  const recv = await rest('rpc/receive_inventory', {
    method: 'POST',
    body: JSON.stringify({
      p_branch_id: BRANCH,
      p_item_id: item.id,
      p_qty: QTY,
      p_unit: item.base_unit,
      p_expires_at: null,
      p_employee_id: null,
      p_ref_type: null,
      p_ref_id: null,
    }),
  })
  const recvBody = await recv.json().catch(() => null)
  if (!recv.ok) {
    console.error(`FAIL  receive_inventory HTTP ${recv.status}:`, recvBody)
    process.exit(1)
  }
  console.log(`PASS  receive_inventory -> lot ${String(recvBody).slice(0, 8)} (qty ${QTY})`)

  // 4) stock increased
  const after = await stockOf()
  console.log(`      stock after = ${after}`)
  if (after === before + QTY) {
    console.log(`PASS  stock increased by exactly ${QTY} (${before} -> ${after})`)
    console.log('\nRECEIVE -> STOCK: VERIFIED ✓')
    process.exit(0)
  }
  console.error(`FAIL  expected ${before + QTY}, got ${after}`)
  process.exit(1)
}

main().catch((err) => {
  console.error('UNEXPECTED:', err)
  process.exit(1)
})
