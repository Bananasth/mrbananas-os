-- supabase/auth/custom_access_token_hook.sql
--
-- Supabase "Custom Access Token Hook": stamps tenant_id, branch_roles, and session_version
-- into the JWT at token issuance, so the validated RLS helpers (app.current_tenant_id(),
-- app.has_branch_role(), app.is_tenant_owner(), session-version checks) work against REAL
-- Supabase Auth tokens.
--
-- IMPORTANT: this is NOT part of the validated/frozen migration set (0000-0020). It is auth
-- integration, applied separately, and reads the existing identity tables read-only.
--
-- After applying, register it in the dashboard: Authentication -> Hooks ->
-- "Custom Access Token" -> public.custom_access_token_hook.

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user   uuid := (event ->> 'user_id')::uuid;
  v_claims jsonb := coalesce(event -> 'claims', '{}'::jsonb);
  v_tenant uuid;
  v_sv     integer;
  v_roles  jsonb;
begin
  select tenant_id, session_version
    into v_tenant, v_sv
    from public.app_user
   where id = v_user;

  if v_tenant is not null then
    -- tenant_id and branch_id are emitted as text/uuid strings to match the RLS helpers,
    -- which cast (claims ->> '...')::uuid.
    v_claims := jsonb_set(v_claims, '{tenant_id}', to_jsonb(v_tenant::text));
    v_claims := jsonb_set(v_claims, '{session_version}', to_jsonb(v_sv));

    select coalesce(
             jsonb_agg(jsonb_build_object('branch_id', ubr.branch_id, 'role', r.key)),
             '[]'::jsonb
           )
      into v_roles
      from public.user_branch_role ubr
      join public.role r on r.id = ubr.role_id
     where ubr.user_id = v_user;

    v_claims := jsonb_set(v_claims, '{branch_roles}', v_roles);
  end if;

  return jsonb_set(event, '{claims}', v_claims);
end;
$$;

-- Only the Supabase auth admin may execute the hook; nobody else.
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

-- The hook is SECURITY DEFINER (runs as owner), so it reads the identity tables past RLS.
-- No additional table grants to supabase_auth_admin are required.
