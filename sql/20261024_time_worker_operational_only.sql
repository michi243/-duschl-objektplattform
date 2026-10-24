-- v3.57.16: HR administrators review time records; only operational users clock in.
-- Applied to Supabase on 2026-10-24; kept here for audit/reproducibility.
-- Do not replace employee_time_events SELECT policy: admins still require read access.
create or replace function private.ds_time_worker(p_org uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
 select (select auth.uid()) is not null
 and exists (
  select 1 from public.profiles p
  where p.id=(select auth.uid()) and p.active and p.deleted_at is null
  and p.role::text not in ('platform_admin','platform_admin_delegate')
 )
 and exists (
  select 1 from public.organization_memberships m
  where m.organization_id=p_org and m.user_id=(select auth.uid())
    and m.role in ('object_manager','staff','employee','external_contractor')
 )
 and exists (
  select 1 from public.employee_time_permissions a
  where a.organization_id=p_org and a.user_id=(select auth.uid()) and a.enabled
 );
$$;
