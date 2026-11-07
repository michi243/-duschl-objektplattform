-- v3.57.32 Security hardening:
-- Public RPC runs as invoker, and delegates to a private, non-exposed
-- SECURITY DEFINER helper with explicit auth.uid, assignment and tenant checks.
-- Removes public SECURITY DEFINER warning while retaining admin visibility
-- independent of the legacy objects SELECT policy.
create or replace function private.ds_list_commissioned_waste_objects_impl_v1(p_organization_id uuid)
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
revoke all on function private.ds_list_commissioned_waste_objects_impl_v1(uuid) from public, anon;
grant execute on function private.ds_list_commissioned_waste_objects_impl_v1(uuid) to authenticated;

create or replace function public.ds_list_commissioned_waste_objects_v1(p_organization_id uuid)
returns table(object_id uuid)
language sql
stable
security invoker
set search_path = ''
as $$
  select v.object_id from private.ds_list_commissioned_waste_objects_impl_v1(p_organization_id) v;
$$;
revoke all on function public.ds_list_commissioned_waste_objects_v1(uuid) from public, anon;
grant execute on function public.ds_list_commissioned_waste_objects_v1(uuid) to authenticated;
comment on function public.ds_list_commissioned_waste_objects_v1(uuid)
is 'Lesende RPC-Fassade (SECURITY INVOKER), interne ACL-Prüfung in private.ds_list_commissioned_waste_objects_impl_v1; keine anonymen Rechte.';
