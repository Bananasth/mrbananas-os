// tests/runtime/phase2-owner.mjs — Phase 2 owner-flow integration test.
//
// Proves the service-layer operations succeed UNDER RLS as the OWNER, end to end, against a
// local Postgres with the schema + seed applied. Runs the same SQL/RPCs the TS services use.
//
// Prereqs (local DB in DATABASE_URL):
//   node tests/runtime/runtime.mjs apply     # roles + migrations + seed
//   node tests/runtime/phase2-owner.mjs
//
// Talks only to the local DB — no external services, no secrets.
import pg from 'pg'

const { Client } = pg
const DB_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const newClient = () => new Client({ connectionString: DB_URL })

// Seed IDs (match tests/runtime/seed.sql).
const ID = {
  tenant: '11111111-1111-1111-1111-111111111111',
  branch: '22222222-2222-2222-2222-222222222222',
  owner: '33333333-3333-3333-3333-333333330001',
  customer: '33333333-3333-3333-3333-333333330005',
  oven: '44444444-4444-4444-4444-444444440003',
  breadItem: '77777777-7777-7777-7777-777777770003', // finished 'loaf' inventory_item
  breadProd: '88888888-8888-8888-8888-888888880001', // product (type=batch) -> breadItem
  breadRv: '99999999-9999-9999-9999-9999999900a1', // active recipe_version
}

const num = (v) => Number(v)
function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

// Run fn on a fresh connection acting as `role` (sets the JWT claims RLS reads).
async function as(role, fn) {
  const branchRoles = [{ branch_id: ID.branch, role }]
  const claims = JSON.stringify({
    sub: ID[role] ?? ID.owner,
    tenant_id: ID.tenant,
    branch_roles: branchRoles,
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

const stockOf = (c, itemId) =>
  c
    .query('select qty_available from public.stock_on_hand where branch_id=$1 and item_id=$2', [
      ID.branch,
      itemId,
    ])
    .then((r) => (r.rows[0] ? num(r.rows[0].qty_available) : 0))

const results = []
async function step(name, fn) {
  try {
    await fn()
    results.push({ name, ok: true })
    console.log(`PASS  ${name}`)
  } catch (e) {
    results.push({ name, ok: false, err: e.message })
    console.log(`FAIL  ${name}\n      ${e.message}`)
  }
}

async function main() {
  let orderId
  let orderItemId
  let stockAfterReceive

  await step('owner receives 12 loaves (app.receive_inventory)', async () => {
    await as('owner', async (c) => {
      const before = await stockOf(c, ID.breadItem)
      await c.query('select app.receive_inventory($1,$2,$3,$4)', [
        ID.branch,
        ID.breadItem,
        12,
        'loaf',
      ])
      stockAfterReceive = await stockOf(c, ID.breadItem)
      assert(stockAfterReceive === before + 12, `stock ${before} -> ${stockAfterReceive}, expected +12`)
    })
  })

  await step('owner sets branch price (branch_product upsert)', async () => {
    await as('owner', (c) =>
      c.query(
        `insert into public.branch_product (tenant_id, branch_id, product_id, price_override, is_available)
         values ($1,$2,$3,5000,true)
         on conflict (branch_id, product_id) do update set price_override = excluded.price_override`,
        [ID.tenant, ID.branch, ID.breadProd],
      ),
    )
  })

  await step('owner creates a POS order with VAT-inclusive totals', async () => {
    await as('owner', async (c) => {
      // 2 loaves @ 5000 (incl) = 10000; VAT = 10000 - round(10000/1.07) = 654; subtotal 9346.
      const o = await c.query(
        `insert into public.sales_order (tenant_id, branch_id, channel, subtotal, tax_total, total)
         values ($1,$2,'pos',9346,654,10000) returning id`,
        [ID.tenant, ID.branch],
      )
      orderId = o.rows[0].id
      const it = await c.query(
        `insert into public.order_item
           (tenant_id, branch_id, order_id, product_id, recipe_version_id, workstation_id, qty, unit_price, line_tax)
         values ($1,$2,$3,$4,$5,$6,2,5000,654) returning id`,
        [ID.tenant, ID.branch, orderId, ID.breadProd, ID.breadRv, ID.oven],
      )
      orderItemId = it.rows[0].id
    })
  })

  await step('customer CANNOT create an order (RLS denies)', async () => {
    let denied = false
    try {
      await as('customer', (c) =>
        c.query(
          `insert into public.sales_order (tenant_id, branch_id, channel, subtotal, tax_total, total)
           values ($1,$2,'pos',0,0,0)`,
          [ID.tenant, ID.branch],
        ),
      )
    } catch {
      denied = true
    }
    assert(denied, 'customer insert into sales_order should have been denied by RLS')
  })

  await step('owner records a cash payment', async () => {
    await as('owner', (c) =>
      c.query(
        `insert into public.payment (tenant_id, branch_id, order_id, method, amount, status, client_uuid)
         values ($1,$2,$3,'cash',10000,'captured',gen_random_uuid())`,
        [ID.tenant, ID.branch, orderId],
      ),
    )
  })

  await step('owner fulfils the line — FEFO deducts 2 loaves', async () => {
    await as('owner', async (c) => {
      await c.query('select app.fulfil_order_item($1)', [orderItemId])
      const after = await stockOf(c, ID.breadItem)
      assert(
        after === stockAfterReceive - 2,
        `stock ${stockAfterReceive} -> ${after}, expected -2`,
      )
    })
  })

  await step('owner completes the order', async () => {
    await as('owner', (c) =>
      c.query(`update public.sales_order set status='completed' where id=$1`, [orderId]),
    )
  })

  await step('owner issues a tax invoice (sequential number, order linked)', async () => {
    await as('owner', async (c) => {
      const inv = await c.query('select app.issue_tax_invoice($1) as id', [orderId])
      const invoiceId = inv.rows[0].id
      const row = await c.query(
        'select invoice_no, total, vat_amount from public.tax_invoice where id=$1',
        [invoiceId],
      )
      assert(num(row.rows[0].invoice_no) >= 1, 'invoice_no should be >= 1')
      assert(num(row.rows[0].total) === 10000, 'invoice total should be 10000')
      assert(num(row.rows[0].vat_amount) === 654, 'invoice vat should be 654')
      const ord = await c.query('select invoice_id from public.sales_order where id=$1', [orderId])
      assert(ord.rows[0].invoice_id === invoiceId, 'order should link to the invoice')
    })
  })

  const failed = results.filter((r) => !r.ok)
  console.log(`\n${failed.length === 0 ? 'ALL PASSED' : `${failed.length} FAILED`} (${results.length} steps)`)
  process.exit(failed.length === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('UNEXPECTED:', e)
  process.exit(1)
})
