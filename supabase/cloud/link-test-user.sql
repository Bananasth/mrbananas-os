-- link-test-user.sql — link a Supabase Auth user to an app_user + role, for RLS validation.
--
-- Steps:
--   1) Apply apply-all.sql, then tests/runtime/seed.sql (gives the tenant + branch below).
--   2) Authentication -> Users -> Add user (email + password). Copy its User UID.
--   3) Replace <AUTH_USER_ID> below with that UID, pick the role, and run this.
--   4) Send me: Project URL, anon key, and the test user's email + password.
--
-- The seeded tenant/branch:
--   tenant = 11111111-1111-1111-1111-111111111111
--   branch = 22222222-2222-2222-2222-222222222222
--
-- Repeat for additional roles (owner/manager/staff/baker/customer) to validate each.

insert into public.app_user (id, tenant_id, email)
values ('<AUTH_USER_ID>', '11111111-1111-1111-1111-111111111111', '<AUTH_USER_EMAIL>')
on conflict (id) do nothing;

insert into public.user_branch_role (user_id, branch_id, role_id)
  select '<AUTH_USER_ID>', '22222222-2222-2222-2222-222222222222', id
    from public.role
   where key = '<ROLE_KEY>'  -- one of: owner, manager, staff, baker, customer
  on conflict (user_id, branch_id) do nothing;
