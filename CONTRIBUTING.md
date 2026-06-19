# Contributing to MR.BANANA'S OS

> **Phase 0** is foundation work: data plane, security, tooling. **No frontend, no
> business modules, no mock data.** Keep PRs within the current work package.

## Local development

```bash
nvm use            # Node 20 (see .nvmrc)
npm install
npm run typecheck
npm run lint
npm run format:check
npm test
```

`npm run format` auto-fixes formatting; `npm run lint:fix` auto-fixes lint where possible.

## Required checks

Every push and pull request runs the CI pipeline
([`.github/workflows/ci.yml`](.github/workflows/ci.yml)):

| Check     | Command                |
| --------- | ---------------------- |
| Typecheck | `npm run typecheck`    |
| Lint      | `npm run lint`         |
| Format    | `npm run format:check` |
| Test      | `npm test`             |

All four must be green before merge. CI is **integration only** in Phase 0 — it does not
deploy, does not connect to any production service, and does not run database migrations.

## Branching & commits

- Branch off the default branch; one work package (or sub-task) per PR.
- Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`,
  `chore:`, `docs:`, `test:`, `refactor:`, `ci:`.
- Keep PRs small and reviewable; use the PR template checklist.

## Security-first rules (apply from the first schema PR onward)

- Every business table **must** have Row Level Security enabled with at least one policy.
  A later CI guard (W12) fails the build otherwise.
- RLS is the final authority on access; application checks are convenience only.
- The Supabase **service-role key is server-only** and must never reach a client bundle.
- Inventory, production, audit, and tax records are **append-only** — corrections are new
  rows, never edits.

See [`docs/architecture/`](docs/architecture/00-README.md) for the full design and
[`docs/architecture/12-phase-0-checklist.md`](docs/architecture/12-phase-0-checklist.md)
for current build status.
