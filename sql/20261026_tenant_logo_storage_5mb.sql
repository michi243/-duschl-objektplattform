-- Tenant logos: private storage, 5 MB upload, per-organization authorization.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('tenant-logos','tenant-logos',false,5242880,array['image/png','image/jpeg','image/webp'])
on conflict(id) do update set public=false,file_size_limit=5242880,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists tenant_logo_select_admin on storage.objects;
create policy tenant_logo_select_admin on storage.objects for select to authenticated
using (bucket_id='tenant-logos' and
  (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$' and
  public.sales_admin_allowed_v1(((storage.foldername(name))[1])::uuid));
drop policy if exists tenant_logo_insert_admin on storage.objects;
create policy tenant_logo_insert_admin on storage.objects for insert to authenticated
with check (bucket_id='tenant-logos' and
  (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$' and
  public.sales_admin_allowed_v1(((storage.foldername(name))[1])::uuid));
drop policy if exists tenant_logo_delete_admin on storage.objects;
create policy tenant_logo_delete_admin on storage.objects for delete to authenticated
using (bucket_id='tenant-logos' and
  (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$' and
  public.sales_admin_allowed_v1(((storage.foldername(name))[1])::uuid));

create or replace function public.save_sales_document_template_v1(p_organization_id uuid,p_settings jsonb)
returns jsonb language plpgsql security definer set search_path=public
as $function$
declare v_item record;v_payload jsonb:='{}'::jsonb;v_logo text;v_path text;
begin
 if not public.sales_admin_allowed_v1(p_organization_id) then raise exception 'Access denied' using errcode='42501'; end if;
 if p_settings is null or jsonb_typeof(p_settings)<>'object' then raise exception 'Invalid template payload';end if;
 if not exists(select 1 from public.organizations where id=p_organization_id) then raise exception 'Unknown organization';end if;
 for v_item in select key,value from jsonb_each_text(p_settings) loop
  if v_item.key not in ('sender_name','sender_street','sender_postal','sender_city','sender_phone','sender_email','sender_website','tax_number','managing_director','commercial_register','brand_primary','brand_accent','tax_mode','bank_name','account_holder','bank_iban','bank_bic','intro_text','closing_text','payment_terms','logo_data','logo_path')
  then raise exception 'Unrecognized document field';end if;
  if v_item.key='logo_path' then
    v_path:=nullif(v_item.value,'');
    if v_path is not null then
      if v_path !~ ('^'||p_organization_id::text||'/logo-[a-f0-9-]{36}[.](png|jpg|webp)$') then raise exception 'Ungültiger Logo-Pfad'; end if;
      if not exists(select 1 from storage.objects where bucket_id='tenant-logos' and name=v_path)
      then raise exception 'Logo wurde nicht hochgeladen';end if;
    end if;
    v_payload:=v_payload||jsonb_build_object('logo_path',v_path);
  elsif v_item.key='logo_data' then
    v_logo:=nullif(v_item.value,'');
    if v_logo is not null and (length(v_logo)>280000 or v_logo !~ '^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$')
    then raise exception 'Altes PNG-Logo überschreitet 200 KB';end if;
    v_payload:=v_payload||jsonb_build_object('logo_data',v_logo);
  else
    if length(coalesce(v_item.value,''))>1500 then raise exception 'Dokumentfeld zu lang: %',v_item.key;end if;
    if v_item.key in ('brand_primary','brand_accent') and v_item.value !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'Ungültiger CI-Farbwert';end if;
    if v_item.key='tax_mode' and v_item.value not in ('unspecified','small_business','standard') then raise exception 'Ungültige Steuerregel';end if;
    v_payload:=v_payload||jsonb_build_object(v_item.key,coalesce(v_item.value,''));
  end if;
 end loop;
 if length(trim(coalesce(v_payload->>'sender_name','')))=0 then raise exception 'Absendername erforderlich';end if;
 insert into public.sales_document_templates(organization_id,settings,updated_by)
 values(p_organization_id,v_payload,auth.uid())
 on conflict(organization_id) do update set settings=excluded.settings,updated_by=auth.uid(),updated_at=now();
 return public.get_sales_document_template_v1(p_organization_id);
end;$function$;
revoke execute on function public.save_sales_document_template_v1(uuid,jsonb) from public,anon;
grant execute on function public.save_sales_document_template_v1(uuid,jsonb) to authenticated;
