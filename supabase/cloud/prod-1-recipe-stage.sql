-- =============================================================================
-- prod-1-recipe-stage.sql — Phase D: recipe stage template + bakery stages. REVIEW ONLY.
-- Additive. Extends batch_stage.stage (superset CHECK — existing rows stay valid) and adds a
-- per-recipe stage template so batches auto-generate their multi-day stage list.
-- No change to production_batch / consume_for_batch / complete_batch / recipe / inventory.
-- =============================================================================
begin;

-- Extend the batch_stage vocabulary (add bakery stages: shape / assemble / decorate).
alter table public.batch_stage drop constraint if exists batch_stage_stage_check;
alter table public.batch_stage add constraint batch_stage_stage_check
  check (stage in ('mix','ferment','proof','shape','bake','cool','pack','assemble','decorate'));

-- Per-recipe_version ordered stage template with multi-day scheduling offsets.
create table if not exists public.recipe_stage (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null,
  recipe_version_id uuid not null,
  stage             text not null
                      check (stage in ('mix','ferment','proof','shape','bake','cool','pack','assemble','decorate')),
  seq               integer not null check (seq > 0),
  offset_hours      integer not null default 0 check (offset_hours >= 0),   -- start offset from batch start (multi-day)
  duration_minutes  integer check (duration_minutes is null or duration_minutes > 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  foreign key (recipe_version_id, tenant_id) references public.recipe_version (id, tenant_id) on delete cascade,
  unique (recipe_version_id, seq)
);
comment on table public.recipe_stage is
  'Ordered stage template per recipe_version. offset_hours drives multi-day scheduling of batch_stage at start_batch.';
create index if not exists recipe_stage_version_idx on public.recipe_stage (recipe_version_id, seq);

alter table public.recipe_stage enable row level security;
create policy recipe_stage_owner_all on public.recipe_stage for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_tenant_owner())
  with check (tenant_id = app.current_tenant_id() and app.is_tenant_owner());
create policy recipe_stage_read on public.recipe_stage for select to authenticated
  using (tenant_id = app.current_tenant_id() and app.has_any_role(array['owner','manager','staff','baker']));

create trigger recipe_stage_set_updated_at
  before update on public.recipe_stage for each row execute function app.set_updated_at();

commit;
