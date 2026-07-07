-- =============================================================================
-- receipt-1-business-profile-seed.sql — Phase E-2: seed the company profile. REVIEW ONLY.
-- Idempotent (on conflict do nothing → will NOT clobber later admin-UI edits). Logos are
-- seeded NULL and uploaded later from the app. Assumes a SINGLE tenant; for multi-tenant,
-- replace the `select … from public.tenant … limit 1` with the explicit tenant_id.
-- Requires receipt-1-business-profile.sql applied first.
-- =============================================================================
begin;

insert into public.business_profile (
  tenant_id,
  legal_name, registered_address, phone, tax_id, email,
  color_primary, color_secondary, color_accent, color_text, color_background,
  receipt_logo_mode, is_vat_registered, vat_rate,
  logo_color_url, logo_mono_url
)
select
  t.id,
  'บจก.มิสเตอร์ บานาน่าส์',
  '252 ม.2 ต.ตาลเดี่ยว อ.หล่มสัก จ.เพชรบูรณ์ 67110',
  '0992425242',
  '0675566000058',
  'owner@misterbananas.com',
  '#374e9f', '#ffde11', '#ef4238', '#111827', '#ffffff',
  'auto', true, 0.07,
  null, null
from public.tenant t
order by t.created_at
limit 1
on conflict (tenant_id) do nothing;

commit;

-- Note: branch_profile is NOT seeded here. Until a branch has its own row, receipts fall back
-- to business_profile.registered_address + branch_code '00000' (HQ). Seed per-branch rows when
-- branch addresses / codes are configured, e.g.:
--   insert into public.branch_profile (tenant_id, branch_id, branch_code, is_head_office, display_name, address, phone)
--   select b.tenant_id, b.id, '00000', true, '<name>', '<address>', '<phone>' from public.branch b limit 1
--   on conflict (branch_id) do nothing;
