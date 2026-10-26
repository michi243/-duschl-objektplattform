-- Duschl Service: tenant master data and branded offer letters (re-runnable RPC migration).
-- Does not change the existing sales offers or the resident inquiry process.
create table if not exists public.sales_document_templates (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid not null
);
alter table public.sales_document_templates enable row level security;
revoke all on public.sales_document_templates from public, anon, authenticated;
-- Business RPCs exclusively; no direct Data API access.

create or replace function public.get_sales_document_template_v1(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public
as $function$
declare v_name text; v_settings jsonb;
begin
  if not public.sales_admin_allowed_v1(p_organization_id) then
    raise exception 'Access denied' using errcode='42501';
  end if;
  select name into v_name from public.organizations where id=p_organization_id;
  if not found then raise exception 'Unknown organization'; end if;
  select settings into v_settings from public.sales_document_templates
    where organization_id=p_organization_id;
  return jsonb_build_object(
    'sender_name',v_name,
    'sender_street','', 'sender_postal','', 'sender_city','',
    'sender_phone','', 'sender_email','', 'sender_website','',
    'managing_director','', 'commercial_register','',
    'brand_primary','#102d41', 'brand_accent','#ccab55',
    'tax_number','', 'tax_mode','unspecified',
    'bank_name','', 'account_holder','', 'bank_iban','', 'bank_bic','',
    'intro_text','Vielen Dank für Ihre Anfrage. Gerne bieten wir Ihnen folgende Leistungen an:',
    'closing_text','Wir freuen uns auf Ihre Rückmeldung.',
    'payment_terms','', 'logo_data',null
  ) || coalesce(v_settings,'{}'::jsonb);
end; $function$;

create or replace function public.save_sales_document_template_v1(
    p_organization_id uuid, p_settings jsonb)
returns jsonb language plpgsql security definer set search_path=public
as $function$
declare v_item record; v_payload jsonb := '{}'::jsonb; v_logo text;
begin
  if not public.sales_admin_allowed_v1(p_organization_id) then
    raise exception 'Access denied' using errcode='42501';
  end if;
  if p_settings is null or jsonb_typeof(p_settings)<>'object' then
    raise exception 'Invalid template payload';
  end if;
  if not exists(select 1 from public.organizations where id=p_organization_id)
  then raise exception 'Unknown organization'; end if;
  for v_item in select key, value from jsonb_each_text(p_settings) loop
    if v_item.key not in (
      'sender_name','sender_street','sender_postal','sender_city',
      'sender_phone','sender_email','sender_website','tax_number',
      'managing_director','commercial_register','brand_primary','brand_accent',
      'tax_mode','bank_name','account_holder','bank_iban','bank_bic',
      'intro_text','closing_text','payment_terms','logo_data')
    then raise exception 'Unrecognized document field'; end if;
    if v_item.key='logo_data' then
      v_logo := nullif(v_item.value,'');
      if v_logo is not null then
        if length(v_logo)>280000 or
          v_logo !~ '^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$'
        then raise exception 'Nur PNG-Logos bis ca. 200 KB zulässig';end if;
      end if;
      v_payload:=v_payload||jsonb_build_object('logo_data',v_logo);
    else
      if length(coalesce(v_item.value,''))>1500 then
        raise exception 'Dokumentfeld zu lang: %',v_item.key;
      end if;
      if v_item.key in ('brand_primary','brand_accent') and v_item.value !~ '^#[0-9A-Fa-f]{6}$' then
        raise exception 'Ungültiger CI-Farbwert';
      end if;
      if v_item.key='tax_mode' and v_item.value not in ('unspecified','small_business','standard')
      then raise exception 'Ungültige Steuerregel';end if;
      v_payload:=v_payload||jsonb_build_object(v_item.key,coalesce(v_item.value,''));
    end if;
  end loop;
  if length(trim(coalesce(v_payload->>'sender_name','')))=0
  then raise exception 'Absendername für Angebotsvorlage erforderlich';end if;
  insert into public.sales_document_templates(organization_id,settings,updated_by)
  values(p_organization_id,v_payload,auth.uid())
  on conflict(organization_id) do update
  set settings=excluded.settings,updated_by=auth.uid(),updated_at=now();
  return public.get_sales_document_template_v1(p_organization_id);
end; $function$;

revoke execute on function public.get_sales_document_template_v1(uuid) from public, anon;
revoke execute on function public.save_sales_document_template_v1(uuid,jsonb) from public, anon;
grant execute on function public.get_sales_document_template_v1(uuid),
                  public.save_sales_document_template_v1(uuid,jsonb) to authenticated;
