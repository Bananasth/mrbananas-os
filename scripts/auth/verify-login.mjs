// scripts/auth/verify-login.mjs
//
// Live login + JWT custom-claims validation against the real Supabase project.
// Uses ONLY the public URL + publishable/anon key (from .env.local) and the test
// user's LOGIN password. Never touches the service_role key or DB password.
//
// Run:
//   TEST_PASSWORD='the-login-password' node scripts/auth/verify-login.mjs
//   # or pass it as the first arg:
//   node scripts/auth/verify-login.mjs 'the-login-password'
//
// Optional overrides: TEST_EMAIL (default owner@misterbananas.com),
//   EXPECT_ROLE (default owner), EXPECT_TENANT, EXPECT_BRANCH.
//
// Prints the decoded JWT + a PASS/FAIL checklist. Output contains no password.

import { readFileSync } from 'node:fs'

const EXPECT_TENANT = process.env.EXPECT_TENANT ?? '11111111-1111-1111-1111-111111111111'
const EXPECT_BRANCH = process.env.EXPECT_BRANCH ?? '22222222-2222-2222-2222-222222222222'
const EXPECT_ROLE = process.env.EXPECT_ROLE ?? 'owner'
const EMAIL = process.env.TEST_EMAIL ?? 'owner@misterbananas.com'
const PASSWORD = process.env.TEST_PASSWORD ?? process.argv[2]

// Mirror src/server/auth/routing.ts
const PRECEDENCE = ['owner', 'manager', 'staff', 'baker', 'customer']
const ROUTE = {
  owner: '/dashboard',
  manager: '/dashboard',
  staff: '/pos',
  baker: '/kds',
  customer: '/no-access',
}

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

function b64url(s) {
  return JSON.parse(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
}

const checks = []
const ok = (name, pass, detail) => checks.push({ name, pass, detail })

async function main() {
  if (!PASSWORD) {
    console.error('ERROR: no password. Run:  TEST_PASSWORD=... node scripts/auth/verify-login.mjs')
    process.exit(2)
  }
  const e = env()
  const URL_ = e.NEXT_PUBLIC_SUPABASE_URL
  const KEY = e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? e.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!URL_ || !KEY) {
    console.error('ERROR: missing URL/key in .env.local')
    process.exit(2)
  }

  // 1) Sign in (password grant) -> real access token
  const res = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  const body = await res.json()
  if (!res.ok || !body.access_token) {
    console.error(`LOGIN FAILED (HTTP ${res.status}):`, body.error_description ?? body.msg ?? body)
    process.exit(1)
  }
  ok('Login (password grant) succeeds', true, `HTTP ${res.status}`)

  // 2) Decode JWT
  const [, payloadB64] = body.access_token.split('.')
  const claims = b64url(payloadB64)
  console.log('\n=== Decoded JWT claims ===')
  console.log(JSON.stringify(claims, null, 2))

  // 3) Validate custom claims stamped by the access-token hook
  ok(
    'claim sub is a uuid',
    typeof claims.sub === 'string' && /^[0-9a-f-]{36}$/.test(claims.sub),
    claims.sub,
  )
  ok('claim tenant_id === seeded tenant', claims.tenant_id === EXPECT_TENANT, `${claims.tenant_id}`)
  ok(
    'claim session_version is an integer',
    Number.isInteger(claims.session_version),
    `${claims.session_version}`,
  )
  const roles = Array.isArray(claims.branch_roles) ? claims.branch_roles : []
  ok('claim branch_roles is a non-empty array', roles.length > 0, JSON.stringify(roles))
  const hasOwner = roles.some((r) => r.branch_id === EXPECT_BRANCH && r.role === EXPECT_ROLE)
  ok(
    `branch_roles includes {${EXPECT_BRANCH.slice(0, 8)}…, ${EXPECT_ROLE}}`,
    hasOwner,
    JSON.stringify(roles),
  )
  ok('supabase role === authenticated', claims.role === 'authenticated', `${claims.role}`)

  // 4) Role-based routing (mirrors the app)
  const primary = PRECEDENCE.find((r) => roles.some((br) => br.role === r))
  ok('primaryRole resolves', primary === EXPECT_ROLE, `${primary}`)
  ok(
    `default route for ${EXPECT_ROLE} === /dashboard`,
    ROUTE[primary] === '/dashboard',
    ROUTE[primary],
  )

  // 5) RLS self-read: the user can read their own app_user.session_version,
  //    and it matches the JWT (this is exactly getAuthContext's revocation check).
  const r2 = await fetch(`${URL_}/rest/v1/app_user?select=session_version&id=eq.${claims.sub}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${body.access_token}` },
  })
  const rows = await r2.json()
  const dbVer = Array.isArray(rows) && rows[0] ? rows[0].session_version : undefined
  ok(
    'RLS app_user_self_select returns own row',
    Array.isArray(rows) && rows.length === 1,
    JSON.stringify(rows),
  )
  ok(
    'DB session_version === JWT session_version (session current)',
    dbVer === claims.session_version,
    `db=${dbVer} jwt=${claims.session_version}`,
  )

  // Report
  console.log('\n=== Validation checklist ===')
  let failed = 0
  for (const c of checks) {
    if (!c.pass) failed++
    console.log(`  ${c.pass ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? `  (${c.detail})` : ''}`)
  }
  console.log(`\n${failed === 0 ? 'ALL CHECKS PASSED ✓' : `${failed} CHECK(S) FAILED ✗`}`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('UNEXPECTED ERROR:', err)
  process.exit(1)
})
