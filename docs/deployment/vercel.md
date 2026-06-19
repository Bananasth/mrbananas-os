# Vercel Deployment — Requirements (Documentation Only)

> **Status:** 📄 Documentation only. **No Vercel project is connected. No preview or
> production deployments are configured.** This file records the *intended* settings so the
> wiring is fast and correct when the frontend phase begins. Do not connect Vercel during
> Phase 0.

## Why not now

Phase 0 ships **no frontend** — there is nothing to render or deploy. Connecting Vercel
would create empty deployments and tempt premature coupling. Deployment is wired in the
frontend phase, once the Next.js app shell exists.

## Intended project settings (for later)

| Setting | Value |
|---------|-------|
| Framework preset | Next.js (App Router) — added in the frontend phase |
| Node.js version | 20.x (match [`.nvmrc`](../../.nvmrc)) |
| Install command | `npm ci` |
| Build command | `next build` (default once Next.js is added) |
| Output | Framework default (`.next`) |
| Root directory | repository root |
| Preview deployments | One per pull request |
| Production branch | `main` |

## Environment variables (configured in Vercel, NOT committed)

Set per environment (Preview / Production) in the Vercel dashboard. Never commit real
values; [`.env.example`](../../.env.example) documents names only.

| Variable | Exposure | Notes |
|----------|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Client-safe | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client-safe | RLS-gated anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-only** | Bypasses RLS — never exposed to the browser; used only in server/Edge contexts |
| `SUPABASE_DB_URL` | **Server-only** | Direct DB connection for server jobs/migrations (CI uses its own) |

> The service-role key must be marked as a non-`NEXT_PUBLIC_` server environment variable.
> A build/bundle check (planned) confirms it never appears in client output.

## Data plane separation

The **Supabase** data plane (PostgreSQL, Auth, Storage, Edge Functions) is provisioned and
deployed independently of Vercel. Database migrations are **not** run by Vercel and **not**
run in Phase 0 CI — they are managed via the Supabase migration pipeline introduced in W4.

## Deployment requirements checklist (gate for the frontend phase)

- [ ] Next.js app shell exists and builds locally
- [ ] Vercel project linked; Preview-per-PR + production-on-`main`
- [ ] All environment variables set per environment; service-role key server-only
- [ ] Supabase project reachable from the deployment
- [ ] CI green before any deploy is promoted
