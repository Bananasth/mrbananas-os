-- 0004_session_version.sql — JWT revocation: per-user session_version (single source of truth).
--
-- Adds session_version to app_user (no new table) plus a bump primitive. app_user already
-- has RLS enabled with a deny-by-default policy (0002); no policy change is needed here.
-- No Supabase Auth integration, no data, no secrets.

alter table public.app_user
  add column session_version integer not null default 1;

comment on column public.app_user.session_version is 'Single source of truth for JWT revocation: each JWT embeds this value at issue; a request is rejected when the token value no longer matches. Bump to revoke all of a user''s tokens.';

-- Revocation primitive: increment a user's session_version, invalidating all prior tokens.
-- SECURITY DEFINER with an empty search_path; every reference is schema-qualified.
create or replace function app.bump_session_version(p_user_id uuid)
returns integer
language sql
security definer
set search_path = ''
as $$
  update public.app_user
     set session_version = session_version + 1
   where id = p_user_id
  returning session_version;
$$;

comment on function app.bump_session_version(uuid) is 'Increments app_user.session_version for the given user, revoking all outstanding JWTs. SECURITY DEFINER; intended for trusted server/Edge contexts only.';

-- Execution is locked to the trusted backend; general roles cannot bump.
revoke all on function app.bump_session_version(uuid) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function app.bump_session_version(uuid) to service_role;
  end if;
end
$$;
