// tests/runtime/runtime.mjs — live runtime validation harness for MR.BANANA'S OS.
//
// Usage (DATABASE_URL points at a LOCAL Postgres / Supabase):
//   node tests/runtime/runtime.mjs apply      # create roles, apply all migrations, seed
//   node tests/runtime/runtime.mjs seed        # seed only (after `supabase db reset`)
//   node tests/runtime/runtime.mjs validate    # run e2e + RLS + concurrency checks
//
// No external services, no real secrets — talks only to the local DB in DATABASE_URL.
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const { Client } = pg
const URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const here = (p) => fileURLToPath(new URL(p, import.meta.url))

const ID = {
  tenant: '11111111-1111-1111-1111-111111111111',
  branch: '22222222-2222-2222-2222-222222222222',
  owner: '33333333-3333-3333-3333-333333330001',
  manager: '33333333-3333-3333-3333-333333330002',
  staff: '33333333-3333-3333-3333-333333330003',
  baker: '33333333-3333-3333-3333-333333330004',
  customer: '33333333-3333-3333-3333-333333330005',
  oven: '44444444-4444-4444-4444-444444440003',
  flour: '77777777-7777-7777-7777-777777770001',
  milk: '77777777-7777-7777-7777-777777770002',
  breadItem: '77777777-7777-7777-7777-777777770003',
  breadProd: '88888888-8888-8888-8888-888888880001',
  latteProd: '88888888-8888-8888-8888-888888880002',
  breadRv: '99999999-9999-9999-9999-9999999900a1',
  latteRv: '99999999-9999-9999-9999-9999999900a2',
  batch: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0001',
  bakerEmp: '66666666-6666-6666-6666-666666660001',
  staffEmp: '66666666-6666-6666-6666-666666660002',
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const newClient = () => new Client({ connectionString: URL })
const num = (v) => Number(v)
function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

const results = []
async function scenario(name, fn) {
  try {
    await fn()
    results.push({ name, ok: true })
    console.log(`PASS  ${name}`)
  } catch (e) {
    results.push({ name, ok: false, detail: e.message })
    console.log(`FAIL  ${name}\n        ${e.message}`)
  }
}

// Run fn with a fresh connection acting as a given role (sets JWT claims).
async function as(role, fn) {
  const claimsByRole = {
    owner: [{ branch_id: ID.branch, role: 'owner' }],
    manager: [{ branch_id: ID.branch, role: 'manager' }],
    staff: [{ branch_id: ID.branch, role: 'staff' }],
    baker: [{ branch_id: ID.branch, role: 'baker' }],
    customer: [{ branch_id: ID.branch, role: 'customer' }],
  }
  const claims = JSON.stringify({
    sub: ID[role],
    tenant_id: ID.tenant,
    branch_roles: claimsByRole[role],
    session_version: 1,
  })
  const c = newClient()
  await c.connect()
  try {
    await c.query('set role authenticated')
    await c.query('select set_config($1, $2, false)', ['request.jwt.claims', claims])
    return await fn(c)
  } finally {
    await c.end()
  }
}

// ----------------------------- apply / seed -----------------------------
async function applyAll() {
  const c = newClient()
  await c.connect()
  // Roles our policies reference (Supabase already has these; plain PG needs them).
  await c.query(`do $$ begin
    if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin noinherit; end if;
    if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin noinherit; end if;
    if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin noinherit bypassrls; end if;
  end $$;`)
  const dir = here('../../supabase/migrations')
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    process.stdout.write(`apply ${f} ... `)
    await c.query(readFileSync(`${dir}/${f}`, 'utf8'))
    console.log('ok')
  }
  await c.end()
  await seed()
}

async function seed() {
  const c = newClient()
  await c.connect()
  await c.query(readFileSync(here('./seed.sql'), 'utf8'))
  await c.end()
  console.log('seeded')
}

// ----------------------------- validate -----------------------------
async function validate() {
  // ---- Task 5: end-to-end ----
  await scenario('purchase -> inventory lot (FEFO receive)', () =>
    as('staff', async (c) => {
      const r = await c.query('select app.receive_inventory($1,$2,$3,$4) as lot', [
        ID.branch, ID.flour, 100, 'kg',
      ])
      const lot = r.rows[0].lot
      const q = await c.query('select qty_on_hand from public.inventory_lot where id=$1', [lot])
      assert(num(q.rows[0].qty_on_hand) === 100, 'flour lot should be 100')
    }),
  )

  await scenario('production consumes inventory', () =>
    as('baker', async (c) => {
      await c.query('select app.consume_for_batch($1,$2,$3)', [ID.batch, ID.flour, 5])
      const q = await c.query(
        `select sum(qty_on_hand) s from public.inventory_lot where item_id=$1 and status='available'`,
        [ID.flour],
      )
      assert(num(q.rows[0].s) === 95, 'flour should be 95 after consuming 5')
    }),
  )

  await scenario('production creates finished lot', () =>
    as('baker', async (c) => {
      const r = await c.query('select app.complete_batch($1,$2,$3) as lot', [ID.batch, 10, 'loaf'])
      const lot = r.rows[0].lot
      const q = await c.query('select qty_on_hand, batch_id from public.inventory_lot where id=$1', [lot])
      assert(num(q.rows[0].qty_on_hand) === 10, 'bread lot should be 10')
      assert(q.rows[0].batch_id === ID.batch, 'finished lot should link to the batch')
      const b = await c.query(`select status from public.production_batch where id=$1`, [ID.batch])
      assert(b.rows[0].status === 'completed', 'batch should be completed')
    }),
  )

  await scenario('sale deducts inventory (FEFO) + stamps batch', () =>
    as('staff', async (c) => {
      const oid = (await c.query(
        `insert into public.sales_order (tenant_id, branch_id, employee_id, channel, status)
         values ($1,$2,$3,'pos','open') returning id`,
        [ID.tenant, ID.branch, ID.staffEmp],
      )).rows[0].id
      const oi = (await c.query(
        `insert into public.order_item
           (tenant_id, branch_id, order_id, product_id, recipe_version_id, workstation_id, employee_id, qty, unit_price)
         values ($1,$2,$3,$4,$5,$6,$7,2,5000) returning id`,
        [ID.tenant, ID.branch, oid, ID.breadProd, ID.breadRv, ID.oven, ID.staffEmp],
      )).rows[0].id
      await c.query('select app.fulfil_order_item($1)', [oi])
      const q = await c.query(
        `select sum(qty_on_hand) s from public.inventory_lot where item_id=$1 and status='available'`,
        [ID.breadItem],
      )
      assert(num(q.rows[0].s) === 8, 'bread stock should be 8 after selling 2')
      const it = await c.query('select batch_id from public.order_item where id=$1', [oi])
      assert(it.rows[0].batch_id === ID.batch, 'order_item should be stamped with the batch')
    }),
  )

  await scenario('beverage sale deducts ingredients', () =>
    as('staff', async (c) => {
      await c.query('select app.receive_inventory($1,$2,$3,$4)', [ID.branch, ID.milk, 10, 'l'])
      const oid = (await c.query(
        `insert into public.sales_order (tenant_id, branch_id, employee_id, channel, status)
         values ($1,$2,$3,'pos','open') returning id`,
        [ID.tenant, ID.branch, ID.staffEmp],
      )).rows[0].id
      const oi = (await c.query(
        `insert into public.order_item
           (tenant_id, branch_id, order_id, product_id, recipe_version_id, workstation_id, employee_id, qty, unit_price)
         values ($1,$2,$3,$4,$5,$6,$7,1,8000) returning id`,
        [ID.tenant, ID.branch, oid, ID.latteProd, ID.latteRv, ID.oven, ID.staffEmp],
      )).rows[0].id
      await c.query('select app.fulfil_order_item($1)', [oi])
      const q = await c.query(
        `select sum(qty_on_hand) s from public.inventory_lot where item_id=$1 and status='available'`,
        [ID.milk],
      )
      assert(Math.abs(num(q.rows[0].s) - 9.8) < 1e-9, 'milk should be 9.8 after a latte')
    }),
  )

  await scenario('payment capture', () =>
    as('staff', async (c) => {
      const oid = (await c.query(
        `insert into public.sales_order (tenant_id, branch_id, employee_id, channel, status, subtotal, tax_total, total)
         values ($1,$2,$3,'pos','open',10000,700,10700) returning id`,
        [ID.tenant, ID.branch, ID.staffEmp],
      )).rows[0].id
      await c.query(
        `insert into public.payment (tenant_id, branch_id, order_id, method, amount, status, client_uuid)
         values ($1,$2,$3,'cash',10700,'captured', gen_random_uuid())`,
        [ID.tenant, ID.branch, oid],
      )
      const q = await c.query(`select status from public.payment where order_id=$1`, [oid])
      assert(q.rows[0].status === 'captured', 'payment should be captured')
      // stash for the invoice test
      validate._invoiceOrder = oid
    }),
  )

  await scenario('tax invoice issuance (VAT 7%, no.1)', () =>
    as('staff', async (c) => {
      const oid = validate._invoiceOrder
      await c.query(`update public.sales_order set status='completed' where id=$1`, [oid])
      const inv = (await c.query('select app.issue_tax_invoice($1) as id', [oid])).rows[0].id
      const q = await c.query('select invoice_no, vat_rate from public.tax_invoice where id=$1', [inv])
      assert(num(q.rows[0].invoice_no) === 1, 'first invoice should be no.1')
      assert(num(q.rows[0].vat_rate) === 0.07, 'vat_rate should be 0.07')
    }),
  )

  await scenario('quarantine blocks sale', () =>
    as('manager', async (c) => {
      const lot = (await c.query(
        `select id from public.inventory_lot where item_id=$1 and status='available' limit 1`,
        [ID.breadItem],
      )).rows[0].id
      await c.query('select app.quarantine_lot($1,$2)', [lot, 'runtime test'])
      // direct sell movement against the quarantined lot must be rejected
      let blocked = false
      try {
        await c.query(
          `insert into public.inventory_movement (tenant_id, branch_id, lot_id, item_id, qty_delta, reason)
           values ($1,$2,$3,$4,-1,'sell')`,
          [ID.tenant, ID.branch, lot, ID.breadItem],
        )
      } catch {
        blocked = true
      }
      assert(blocked, 'selling a quarantined lot should be blocked')
    }),
  )

  await scenario('recall traces affected orders', () =>
    as('manager', async (c) => {
      const lot = (await c.query(
        `select id from public.inventory_lot where item_id=$1 limit 1`,
        [ID.breadItem],
      )).rows[0].id
      const rec = (await c.query('select app.initiate_recall($1,$2,$3) as id', ['lot', lot, 'contamination'])).rows[0].id
      const q = await c.query(
        `select entity_type, count(*) n from public.recall_affected where recall_id=$1 group by entity_type`,
        [rec],
      )
      const kinds = Object.fromEntries(q.rows.map((r) => [r.entity_type, num(r.n)]))
      assert((kinds['order_item'] ?? 0) >= 1, 'recall should find affected order_items')
      assert((kinds['sales_order'] ?? 0) >= 1, 'recall should find affected sales_orders')
    }),
  )

  // ---- Task 6: RLS role simulation ----
  await scenario('RLS: owner sees the tenant', () =>
    as('owner', async (c) => {
      const q = await c.query('select count(*)::int n from public.tenant')
      assert(q.rows[0].n === 1, 'owner should see their tenant')
    }),
  )
  await scenario('RLS: staff can read products', () =>
    as('staff', async (c) => {
      const q = await c.query('select count(*)::int n from public.product')
      assert(q.rows[0].n >= 1, 'staff should read products')
    }),
  )
  await scenario('RLS: staff cannot write recipes', () =>
    as('staff', async (c) => {
      let denied = false
      try {
        await c.query(
          `insert into public.recipe (tenant_id, product_id, name) values ($1,$2,'hack')`,
          [ID.tenant, ID.breadProd],
        )
      } catch {
        denied = true
      }
      assert(denied, 'staff insert into recipe should be denied by RLS')
    }),
  )
  await scenario('RLS: baker cannot take payment', () =>
    as('baker', async (c) => {
      let denied = false
      try {
        await c.query(
          `insert into public.payment (tenant_id, branch_id, order_id, method, amount, status, client_uuid)
           select $1,$2,id,'cash',1,'captured',gen_random_uuid() from public.sales_order limit 1`,
          [ID.tenant, ID.branch],
        )
      } catch {
        denied = true
      }
      assert(denied, 'baker insert into payment should be denied by RLS')
    }),
  )
  await scenario('RLS: customer sees no internal data', () =>
    as('customer', async (c) => {
      const t = await c.query('select count(*)::int n from public.tenant')
      const p = await c.query('select count(*)::int n from public.product')
      assert(t.rows[0].n === 0 && p.rows[0].n === 0, 'customer should see no internal rows')
    }),
  )

  // ---- Task 7: concurrency ----
  await scenario('concurrency: stock cannot oversell', async () => {
    // make a fresh single-unit finished lot via a dedicated batch path is complex; instead use
    // a fresh raw item lot and two consume attempts that each need the whole quantity.
    await as('staff', (c) => c.query('select app.receive_inventory($1,$2,$3,$4)', [ID.branch, ID.flour, 1, 'kg']))
    const a = newClient(); const b = newClient()
    await a.connect(); await b.connect()
    for (const c of [a, b]) {
      await c.query('set role authenticated')
      await c.query('select set_config($1,$2,false)', [
        'request.jwt.claims',
        JSON.stringify({ sub: ID.baker, tenant_id: ID.tenant, branch_roles: [{ branch_id: ID.branch, role: 'baker' }], session_version: 1 }),
      ])
      await c.query('begin')
    }
    // Each tries to consume MORE than total available so exactly one can win on the last unit.
    const pa = a.query('select app.consume_for_batch($1,$2,$3)', [ID.batch, ID.flour, 95]).then(() => 'ok').catch((e) => e.message)
    await sleep(150)
    const pb = b.query('select app.consume_for_batch($1,$2,$3)', [ID.batch, ID.flour, 95]).then(() => 'ok').catch((e) => e.message)
    const ra = await pa
    await a.query('commit')
    const rb = await pb
    await b.query('commit').catch(() => {})
    await a.end(); await b.end()
    const oks = [ra, rb].filter((x) => x === 'ok').length
    assert(oks === 1, `exactly one consume should succeed (got a=${ra}, b=${rb})`)
  })

  await scenario('concurrency: invoice numbers cannot duplicate', async () => {
    // Two completed orders, issued concurrently, must get distinct numbers.
    const mk = async () =>
      as('staff', async (c) => {
        const oid = (await c.query(
          `insert into public.sales_order (tenant_id, branch_id, employee_id, channel, status, total)
           values ($1,$2,$3,'pos','completed',100) returning id`,
          [ID.tenant, ID.branch, ID.staffEmp],
        )).rows[0].id
        return oid
      })
    const o1 = await mk(); const o2 = await mk()
    const a = newClient(); const b = newClient()
    await a.connect(); await b.connect()
    for (const [c, oid] of [[a, o1], [b, o2]]) {
      await c.query('set role authenticated')
      await c.query('select set_config($1,$2,false)', [
        'request.jwt.claims',
        JSON.stringify({ sub: ID.staff, tenant_id: ID.tenant, branch_roles: [{ branch_id: ID.branch, role: 'staff' }], session_version: 1 }),
      ])
      c._oid = oid
    }
    const [r1, r2] = await Promise.all([
      a.query('select app.issue_tax_invoice($1) as id', [a._oid]),
      b.query('select app.issue_tax_invoice($1) as id', [b._oid]),
    ])
    const n1 = (await a.query('select invoice_no from public.tax_invoice where id=$1', [r1.rows[0].id])).rows[0].invoice_no
    const n2 = (await b.query('select invoice_no from public.tax_invoice where id=$1', [r2.rows[0].id])).rows[0].invoice_no
    await a.end(); await b.end()
    assert(num(n1) !== num(n2), `invoice numbers must differ (got ${n1}, ${n2})`)
  })

  // ---- report ----
  const passed = results.filter((r) => r.ok).length
  console.log(`\n${passed}/${results.length} checks passed`)
  if (passed !== results.length) process.exitCode = 1
}

const cmd = process.argv[2]
if (cmd === 'apply') await applyAll()
else if (cmd === 'seed') await seed()
else if (cmd === 'validate') await validate()
else {
  console.log('usage: node tests/runtime/runtime.mjs <apply|seed|validate>')
  process.exitCode = 2
}
