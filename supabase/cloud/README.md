# Cloud apply (manual, dashboard)

For applying MR.BANANA'S OS to a hosted Supabase project **without sharing the DB password
or service-role key**. Everything runs in the Dashboard SQL Editor (the `postgres` role) — no
secret leaves your browser.

## Steps

1. **Schema + grants + auth hook** — SQL Editor → paste [`apply-all.sql`](./apply-all.sql) →
   Run. (Validated migrations `0000–0020`, role grants, and the Custom Access Token Hook.)
2. **Seed master data** — SQL Editor → paste [`../../tests/runtime/seed.sql`](../../tests/runtime/seed.sql)
   → Run. (tenant, branch, products, recipes, a production batch.)
3. **Register the hook** — Authentication → Hooks → **Custom Access Token** → select
   `public.custom_access_token_hook` → enable.
4. **Auth settings** (optional but recommended) — Authentication → Settings: access-token
   expiry **900s**, refresh-token rotation **on**.
5. **Test user** — Authentication → Users → Add user (email + password). Then SQL Editor →
   [`link-test-user.sql`](./link-test-user.sql), fill in the UID/email/role → Run. (Repeat per
   role you want to validate.)

## Then send me (only these — nothing privileged)

- **Project URL** (`https://jmrmyzvajhaujuntlrug.supabase.co`)
- **anon key** (Settings → API → `anon` `public`)
- The **test user email + password** (and which role(s) you linked)

With those, I run the JWT/RLS validation (decode the real token → confirm
`tenant_id`/`branch_roles`/`session_version` → run role-isolation queries → bump
`session_version` and confirm revocation). No service-role key, no DB password.
