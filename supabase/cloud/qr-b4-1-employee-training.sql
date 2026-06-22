-- =============================================================================
-- qr-b4-1-employee-training.sql — QR Ordering B4.1: employee.training_mode. PROPOSAL.
-- Adds ONE additive column to the EXISTING public.employee table. Existing rows default
-- to false; no business data is modified. Used by B5 to (a) snapshot prep_item.made_in_training
-- at claim time and (b) enforce QC four-eyes when the maker is in training.
-- This is the only B4 change to an existing table.
-- =============================================================================
begin;

alter table public.employee
  add column if not exists training_mode boolean not null default false;

comment on column public.employee.training_mode is
  'When true, this employee is in training: items they make require QC by a different employee.';

notify pgrst, 'reload schema';
commit;
