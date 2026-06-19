# MR.BANANA'S OS

Integrated operating system for a beverage & bakery business — Retail POS, QR ordering,
KDS, multi-day batch production, traceable inventory, Thai VAT invoicing, recall &
quarantine, and HR/KPI export. Single-store first, franchise-scalable.

> **Status:** 🏗️ Phase 0 — foundation & security de-risking. **No frontend, no business
> modules, no mock data yet.** See [`docs/architecture/`](docs/architecture/00-README.md)
> for the approved design and [the Phase 0 checklist](docs/architecture/12-phase-0-checklist.md)
> for build progress.

## Tech stack

TypeScript · Supabase (PostgreSQL, Auth, Storage, Edge Functions) · Row Level Security ·
Vercel. A Next.js (App Router) + Tailwind + shadcn/ui PWA frontend is added in a later
phase — Phase 0 is data-plane and tooling only.

## Prerequisites

- Node.js `>=20` (see [`.nvmrc`](.nvmrc))
- npm `>=10`

## Setup

```bash
npm install
cp .env.example .env.local   # fill in once data-plane vars land (W3)
```

## Scripts

| Command                | Purpose              |
| ---------------------- | -------------------- |
| `npm run lint`         | ESLint (flat config) |
| `npm run format:check` | Prettier check       |
| `npm run format`       | Prettier write       |
| `npm run typecheck`    | `tsc --noEmit`       |
| `npm test`             | Vitest (run once)    |
| `npm run test:watch`   | Vitest (watch)       |

## Project structure

```
src/
  lib/        Shared kernel utilities (e.g. Result)
  server/     Server-only infrastructure (db clients, auth) — added W3+
  modules/    Business modules (feature-vertical) — Phase 1+
supabase/
  migrations/ Versioned SQL (schema, RLS, audit) — added W4+
tests/        Integration & schema tests — added W11+
docs/
  architecture/  Approved architecture (12 documents)
```

See [`docs/architecture/03-folder-structure.md`](docs/architecture/03-folder-structure.md)
for the full layout and conventions.

## Security posture

RLS is the final authority on access — the application layer never gatekeeps alone. Every
business table ships with Row Level Security enabled and is enforced by a CI guard that
fails the build otherwise. See
[`docs/architecture/05-security-model.md`](docs/architecture/05-security-model.md).
