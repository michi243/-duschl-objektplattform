-- Duschl Service v3.57.30 – Ergänzung für aktiv beauftragte Fremdobjekte.
-- Verhindert explizit Zugriff über gekündigte Objekt-Kooperationen.
create or replace function private.ds_waste_can_access(p_organization_id uuid, p_object_id uuid, p_write boolean default false)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1 from public.profiles p
      where p.id=(select auth.uid()) and p.active is true and p.deleted_at is null
    )
    and exists (
      select 1 from public.objects o
      where o.id=p_object_id and o.active is true
        and (
          o.organization_id=p_organization_id
          or exists (
            select 1 from public.object_collaborations c
            where c.object_id=o.id
              and c.service_organization_id=p_organization_id
              and c.active is true and c.status='active'
              and (c.owner_organization_id is null or c.owner_organization_id=o.organization_id)
          )
        )
    )
    and (
      public.is_platform_admin()
      or exists (
        select 1 from public.organization_memberships m
        where m.user_id=(select auth.uid()) and m.organization_id=p_organization_id
          and (
            m.role in ('tenant_admin','admin_delegate')
            or (
              m.role in ('object_manager','staff','employee','property_manager')
              and (not p_write or m.role <> 'property_manager')
              and (
                exists (
                  select 1 from public.object_user_assignments a
                  where a.object_id=p_object_id and a.user_id=(select auth.uid())
                    and a.active is true
                    and (a.valid_from is null or a.valid_from <= current_date)
                    and (a.valid_until is null or a.valid_until >= current_date)
                )
                or exists (
                  select 1 from public.shared_object_user_assignments sa
                  join public.object_collaborations c on c.id=sa.collaboration_id
                  where sa.user_id=(select auth.uid()) and sa.active is true
                    and c.object_id=p_object_id and c.service_organization_id=p_organization_id
                    and c.active is true and c.status='active'
                )
              )
            )
          )
      )
    );
$$;

create or replace function private.ds_waste_service_commissioned(p_organization_id uuid,p_object_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.object_service_assignments a
    join public.service_types t on t.id=a.service_type_id
    join public.objects o on o.id=a.object_id
    left join public.object_collaborations c on c.id=a.collaboration_id
    where a.organization_id=p_organization_id and a.object_id=p_object_id
      and o.active is true and a.active is true and t.active is true
      and (a.valid_from is null or a.valid_from <= current_date)
      and (a.valid_until is null or a.valid_until >= current_date)
      and (t.name ~* 'müll|abfall' or coalesce(t.code,'') ~* 'waste|muell|abfall')
      and (
        (a.collaboration_id is null and o.organization_id=p_organization_id)
        or (
          a.collaboration_id is not null
          and c.object_id=o.id and c.service_organization_id=p_organization_id
          and c.active is true and c.status='active'
          and (c.owner_organization_id is null or c.owner_organization_id=o.organization_id)
        )
      )
  );
$$;
