# 15 — Supabase Auth Integration

> Part of the [MR.BANANA'S OS architecture set](./00-README.md). Status: **Steps 1–3 authored (no secrets). Steps 4–6 pending your keys.**
> Target project: `https://jmrmyzvajhaujuntlrug.supabase.co`

The **validated backend (migrations 0000–0020) is frozen** and is not modified by this
integration. Auth integration is purely additive: one access-token hook + dashboard config.

---

## 1. JWT claims design

The validated RLS already reads these claims (see `src/server/auth/claims.ts` and
`0007_rls_policies.sql`). Auth's job is to put them into real tokens.

```jsonc
{
  "sub": "<auth user id>",            // = app_user.id
  "tenant_id": "<uuid>",             // app.current_tenant_id()
  "branch_roles": [                   // app.current_branch_ids() / has_branch_role()
    { "branch_id": "<uuid>", "role": "owner|manager|staff|baker|customer" }
  ],
  "session_version": 1                // revocation (S1); compared to app_user.session_version
}
```

- `tenant_id` and `branch_id` are emitted as strings; the helpers cast `(claims ->> 'x')::uuid`.
- `role` is exactly one of the five approved keys.
- `session_version` is the per-user revocation counter from `app_user`.

## 2. The access-token hook

[`supabase/auth/custom_access_token_hook.sql`](../../supabase/auth/custom_access_token_hook.sql)
defines `public.custom_access_token_hook(event jsonb)` which, on token issuance, looks up the
user's `tenant_id` + `session_version` (from `app_user`) and `branch_roles` (from
`user_branch_role` × `role`) and injects them into the JWT claims.

- `SECURITY DEFINER`, pinned `search_path` — reads the identity tables past RLS, read-only.
- `EXECUTE` granted only to `supabase_auth_admin`; revoked from everyone else.
- **Not** part of the frozen migration set — applied separately.

## 3. Supabase configuration (dashboard / config)

| Setting | Value | Where |
| ------- | ----- | ----- |
| Email auth | enabled | Authentication → Providers |
| **Custom Access Token Hook** | `public.custom_access_token_hook` | Authentication → Hooks |
| Access-token (JWT) expiry | **900s (15 min)** — supports S1 revocation | Authentication → Settings |
| Refresh token rotation | enabled | Authentication → Settings |
| MFA | required for Owner & Manager (app-enforced) | Authentication → MFA |

### Session-version enforcement (S1)
The hook stamps `session_version` at issuance. On each request, the app/middleware compares
the token's `session_version` to the user's current `app_user.session_version` (or re-derives
it) and rejects on mismatch — using the already-built `src/server/auth/session-version.ts`
logic and the `app.bump_session_version()` primitive. This is wired in the API layer (next
phase), not here.

## 4. Linking auth users to app_user

Supabase Auth users live in `auth.users`. Our `app_user.id` is intended to equal the auth
user id. On sign-up, an `app_user` row (and `user_branch_role`) must exist for the claims to
populate — otherwise the hook adds no tenant/role claims (a user with no tenant sees nothing,
which is safe-by-default). Provisioning flow (who creates `app_user`/`user_branch_role`) is
an Owner/admin workflow handled in the API layer.

---

## 5. Remaining steps & exactly what each needs

| Step | Action | Secret required |
| ---- | ------ | --------------- |
| 4 | Apply migrations 0000–0020 to the cloud project | **DB connection string (password)** or Supabase CLI **access token** |
| 5 | Apply `custom_access_token_hook.sql` + register the hook | **DB password** + **dashboard access** |
| 6 | Validate RLS with real JWTs (create test user → sign in → decode token → run queries) | **anon key** (+ a test user) |

> Per your instruction, I will **stop and ask** before any step requiring the anon key,
> service-role key, DB password, or any other secret.

## 6. RLS-against-real-JWT validation plan (Step 6, when unblocked)

Once keys are available, validation mirrors the local runtime suite but with **real tokens**:

1. Seed an `app_user` + `user_branch_role` for a test auth user (per role).
2. Sign in via the anon key → obtain a real access token.
3. Decode it → assert it carries `tenant_id`, `branch_roles`, `session_version`.
4. Open a Postgres session with that JWT (PostgREST or `set request.jwt.claims`) and re-run
   the role-isolation checks (owner/manager/staff/baker/customer) against the **real** claims.
5. Bump `session_version` → assert the stale token is rejected (S1).

No backend logic changes — this only proves the hook feeds the validated RLS correctly.
