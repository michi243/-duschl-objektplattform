-- Duschl Service v3.57.30 | QR-Müllmonitoring, additive Tabellen/RLS.
-- Keine vorhandenen Touren-, Leistungs- oder Personal-Daten werden verändert.
-- Neue Tabellen werden durch explizite GRANTs für die Data API freigegeben (Supabase 2026).
create or replace function private.ds_waste_can_access(p_organization_id uuid, p_object_id uuid, p_write boolean default false)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.active is true and p.deleted_at is null
    )
    and exists (
      select 1 from public.objects o
      where o.id = p_object_id
        and o.organization_id = p_organization_id
        and o.active is true
    )
    and (
      -- Plattform-Admin, aber keine automatische Freigabe für Delegierte.
      public.is_platform_admin()
      or exists (
        select 1 from public.organization_memberships m
        where m.user_id = (select auth.uid())
          and m.organization_id = p_organization_id
          and (
            m.role in ('tenant_admin','admin_delegate')
            or (
              m.role in ('object_manager','staff','employee','property_manager')
              and (not p_write or m.role <> 'property_manager')
              and exists (
                select 1 from public.object_user_assignments a
                where a.object_id = p_object_id
                  and a.user_id = (select auth.uid())
                  and a.active is true
                  and (a.valid_from is null or a.valid_from <= current_date)
                  and (a.valid_until is null or a.valid_until >= current_date)
              )
            )
          )
      )
    );
$$;
revoke all on function private.ds_waste_can_access(uuid,uuid,boolean) from public, anon;
grant execute on function private.ds_waste_can_access(uuid,uuid,boolean) to authenticated;

create or replace function private.ds_waste_is_admin(p_organization_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1 from public.profiles p where p.id = (select auth.uid())
        and p.active is true and p.deleted_at is null
    )
    and (
      public.is_platform_admin()
      or exists (
        select 1 from public.organization_memberships m
        where m.organization_id = p_organization_id
          and m.user_id = (select auth.uid())
          and m.role in ('tenant_admin','admin_delegate')
      )
    );
$$;
revoke all on function private.ds_waste_is_admin(uuid) from public, anon;
grant execute on function private.ds_waste_is_admin(uuid) to authenticated;

create or replace function private.ds_waste_service_commissioned(p_organization_id uuid, p_object_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.object_service_assignments a
      join public.service_types t on t.id = a.service_type_id
    where a.organization_id = p_organization_id
      and a.object_id = p_object_id
      and a.active is true and t.active is true
      and (a.valid_from is null or a.valid_from <= current_date)
      and (a.valid_until is null or a.valid_until >= current_date)
      and (t.name ~* 'müll|abfall' or coalesce(t.code,'') ~* 'waste|muell|abfall')
  );
$$;
revoke all on function private.ds_waste_service_commissioned(uuid,uuid) from public, anon;
grant execute on function private.ds_waste_service_commissioned(uuid,uuid) to authenticated;

create table if not exists public.waste_bins (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  object_id uuid not null references public.objects(id),
  code text not null check (length(trim(code)) between 1 and 32),
  waste_type text not null check (waste_type in ('rest','paper','bio','plastic','glass','other')),
  volume_liters integer not null check (volume_liters between 20 and 5000),
  pickups_per_week numeric(5,2) check (pickups_per_week > 0 and pickups_per_week <= 14),
  annual_fee_eur numeric(12,2) check (annual_fee_eur >= 0),
  active boolean not null default true,
  qr_token uuid not null default gen_random_uuid() unique,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint waste_bins_org_object_code_unique unique(organization_id,object_id,code)
);
create index if not exists waste_bins_object_idx on public.waste_bins(organization_id,object_id,active);
alter table public.waste_bins enable row level security;
create policy waste_bins_select on public.waste_bins
  for select to authenticated using (
    private.ds_waste_can_access(organization_id,object_id,false)
  );
create policy waste_bins_insert on public.waste_bins
  for insert to authenticated with check (
    created_by = (select auth.uid())
    and private.ds_waste_is_admin(organization_id)
    and private.ds_waste_can_access(organization_id,object_id,true)
    and private.ds_waste_service_commissioned(organization_id,object_id)
  );
create policy waste_bins_update on public.waste_bins
  for update to authenticated
  using (
    private.ds_waste_is_admin(organization_id)
    and private.ds_waste_can_access(organization_id,object_id,true)
  )
  with check (
    private.ds_waste_is_admin(organization_id)
    and private.ds_waste_can_access(organization_id,object_id,true)
  );
-- Weder QR-Token noch Mandant/Objekt/Ersteller nach Anlage veränderbar.
revoke all on public.waste_bins from anon, authenticated;
grant select on public.waste_bins to authenticated;
grant insert(organization_id,object_id,code,waste_type,volume_liters,pickups_per_week,annual_fee_eur,active)
  on public.waste_bins to authenticated;
grant update(code,waste_type,volume_liters,pickups_per_week,annual_fee_eur,active)
  on public.waste_bins to authenticated;

create table if not exists public.waste_bin_scans (
  id uuid primary key default gen_random_uuid(),
  bin_id uuid not null references public.waste_bins(id) on delete restrict,
  fill_percent smallint not null check (fill_percent in (0,25,50,75,100)),
  note text check (length(note) <= 500),
  observed_by uuid not null default auth.uid(),
  observed_at timestamptz not null default now(),
  -- Tonne wird unmittelbar vor der Leerung erfasst; Datum serverseitig,
  -- nicht clientseitig setzbar. Eine Erfassung je Behälter/Tag (Duplikat-Schutz).
  observed_date date not null default (now() at time zone 'Europe/Berlin')::date,
  constraint waste_bin_scans_one_per_day unique(bin_id,observed_date)
);
create index if not exists waste_bin_scans_bin_date_idx on public.waste_bin_scans(bin_id,observed_date desc);
alter table public.waste_bin_scans enable row level security;
create policy waste_bin_scans_select on public.waste_bin_scans
  for select to authenticated using (
    exists (
      select 1 from public.waste_bins b
      where b.id = bin_id
        and private.ds_waste_can_access(b.organization_id,b.object_id,false)
    )
  );
create policy waste_bin_scans_insert on public.waste_bin_scans
  for insert to authenticated with check (
    observed_by = (select auth.uid())
    and exists (
      select 1 from public.waste_bins b
      where b.id = bin_id and b.active is true
        and private.ds_waste_can_access(b.organization_id,b.object_id,true)
        and private.ds_waste_service_commissioned(b.organization_id,b.object_id)
    )
  );
-- Append-only; keine UPDATE-/DELETE-Berechtigung und kein stilles Überschreiben.
revoke all on public.waste_bin_scans from anon, authenticated;
grant select on public.waste_bin_scans to authenticated;
grant insert(bin_id,fill_percent,note) on public.waste_bin_scans to authenticated;
comment on table public.waste_bins is 'Objektgebundene, einzeln mit QR identifizierte Müllbehälter.';
comment on table public.waste_bin_scans is 'Unveränderliche tägliche Füllstandserfassung vor der Leerung; kein anonymer Zugriff.';
