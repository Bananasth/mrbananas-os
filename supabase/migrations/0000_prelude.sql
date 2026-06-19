-- 0000_prelude.sql — Migration prelude.
--
-- Establishes the foundations every later migration relies on. Idempotent and safe to
-- re-run. Contains NO business tables, NO data, NO secrets.

-- Extensions ---------------------------------------------------------------------------
-- pgcrypto provides gen_random_uuid(), used as the default for primary keys.
create extension if not exists pgcrypto;

-- Private schema -----------------------------------------------------------------------
-- `app` holds internal helpers, RLS functions, and audit machinery, kept out of `public`
-- so it is never part of the auto-generated API surface for business data.
create schema if not exists app;

comment on schema app is
  'Internal helpers, RLS functions, and audit machinery. Not exposed as API surface.';

-- Shared trigger function --------------------------------------------------------------
-- BEFORE UPDATE trigger that maintains an `updated_at` timestamp. Attached per-table in
-- later migrations (every mutable business table carries created_at + updated_at).
create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function app.set_updated_at() is
  'BEFORE UPDATE trigger: sets updated_at to now(). Attached per-table in later migrations.';
