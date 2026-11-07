-- v3.57.32 · Objektbezogene Navigation zum Müllmonitoring.
-- Rein lesender Endpunkt für einen laufenden, tatsächlich beauftragten Müllservice.
-- Kein Eingriff in bestehende RLS-Policies oder Bestandsdaten.
create or replace function public.ds_list_commissioned_waste_objects_v1(p_organization_id uuid)
returns table(object_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id
  from public.objects o
  where (select auth.uid()) is not null
    and p_organization_id is not null
    and o.active is true
    and private.ds_waste_can_access(p_organization_id,o.id,false)
    and private.ds_waste_service_commissioned(p_organization_id,o.id)
  order by o.id;
$$;
revoke all on function public.ds_list_commissioned_waste_objects_v1(uuid) from public, anon;
grant execute on function public.ds_list_commissioned_waste_objects_v1(uuid) to authenticated;
comment on function public.ds_list_commissioned_waste_objects_v1(uuid)
is 'Listet nur aktuell beauftragte, im gewählten Mandanten autorisierte Müllmanagement-Objekte; kein anonymer Zugriff.';
