
-- Duschl Service: confidential sales intake, quotations and conversion.
-- Existing public resident inquiry/offer workflow is NOT altered.
create table if not exists public.sales_inquiries (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 object_id uuid references public.objects(id),
 source_resident_inquiry_id uuid unique references public.resident_private_inquiries(id),
 channel text not null default 'phone' check(channel in ('phone','email','website','personal','other','resident')),
 contact_name text not null,
 company text,
 email text,
 phone text,
 customer_type text not null default 'private' check(customer_type in ('private','business','weg','other')),
 service_category text not null,
 description text not null,
 street text,
 postal_code text,
 city text,
 desired_date date,
 follow_up_date date,
 priority text not null default 'normal' check(priority in ('normal','high')),
 status text not null default 'new' check(status in ('new','in_progress','offer','won','lost','converted')),
 responsible_user_id uuid,
 created_by uuid not null default auth.uid(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 converted_object_id uuid references public.objects(id)
);
create index if not exists sales_inquiries_org_created_idx on public.sales_inquiries(organization_id,created_at desc);
create index if not exists sales_inquiries_followup_idx on public.sales_inquiries(organization_id,follow_up_date) where status not in ('lost','converted');

create table if not exists public.sales_offers (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 inquiry_id uuid not null references public.sales_inquiries(id),
 source_resident_offer_id uuid unique references public.resident_private_offers(id),
 offer_number text not null unique default ('DS-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
 title text not null,
 items jsonb not null,
 vat_rate numeric(5,2) not null default 0,
 net_amount numeric(12,2) not null,
 gross_amount numeric(12,2) generated always as (round(net_amount*(1+vat_rate/100),2)) stored,
 status text not null default 'draft' check(status in ('draft','ready','sent','accepted','rejected','cancelled')),
 valid_until date,
 terms text,
 created_by uuid not null default auth.uid(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 accepted_at timestamptz,
 constraint sales_offers_items_array check(jsonb_typeof(items)='array'),
 constraint sales_offers_positive_amount check(net_amount>=0 and vat_rate in (0,7,19))
);
create index if not exists sales_offers_inquiry_idx on public.sales_offers(inquiry_id,created_at desc);

create table if not exists public.sales_orders (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 inquiry_id uuid not null references public.sales_inquiries(id),
 accepted_offer_id uuid not null unique references public.sales_offers(id),
 object_id uuid references public.objects(id),
 order_type text not null check(order_type in ('object','standalone')),
 title text not null,
 agreed_gross_amount numeric(12,2) not null,
 status text not null default 'open' check(status in ('open','in_progress','completed','cancelled')),
 created_by uuid not null default auth.uid(),
 created_at timestamptz not null default now()
);
create index if not exists sales_orders_org_idx on public.sales_orders(organization_id,created_at desc);

alter table public.sales_inquiries enable row level security;
alter table public.sales_offers enable row level security;
alter table public.sales_orders enable row level security;
revoke all on public.sales_inquiries,public.sales_offers,public.sales_orders from public,anon,authenticated;
-- Controlled business RPCs only; no direct API table access.
create or replace function public.sales_admin_allowed_v1(p_org uuid)
returns boolean language sql stable security definer set search_path=public
as $$
 select auth.uid() is not null and p_org is not null
 and (public.is_platform_admin() or exists(
  select 1 from public.organization_memberships m
  where m.organization_id=p_org and m.user_id=auth.uid()
    and m.role in ('tenant_admin','admin_delegate')
 ));
$$;

create or replace function public.list_sales_inquiries_v1(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public
as $$
begin
 if not public.sales_admin_allowed_v1(p_organization_id) then raise exception 'Access denied' using errcode='42501'; end if;
 return coalesce((
  select jsonb_agg(to_jsonb(q) || jsonb_build_object('object_name',o.name) order by q.created_at desc)
  from (select * from public.sales_inquiries where organization_id=p_organization_id order by created_at desc limit 500) q
  left join public.objects o on o.id=q.object_id and o.organization_id=q.organization_id
 ),'[]'::jsonb);
end; $$;

create or replace function public.list_sales_objects_v1(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public
as $$
begin
 if not public.sales_admin_allowed_v1(p_organization_id) then raise exception 'Access denied' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'street',street,'postal_code',postal_code,'city',city) order by name)
 from public.objects where organization_id=p_organization_id and active=true),'[]'::jsonb);
end; $$;

create or replace function public.save_sales_inquiry_v1(p_organization_id uuid,p_inquiry_id uuid,p_details jsonb)
returns uuid language plpgsql security definer set search_path=public
as $$
declare v_id uuid; v_object_id uuid; v_name text; v_category text; v_description text; v_channel text; v_type text; v_email text; v_phone text; v_status text;
begin
 if not public.sales_admin_allowed_v1(p_organization_id) then raise exception 'Access denied' using errcode='42501'; end if;
 if p_details is null or jsonb_typeof(p_details)<>'object' then raise exception 'Invalid input'; end if;
 v_name:=trim(coalesce(p_details->>'contact_name',''));
 v_category:=trim(coalesce(p_details->>'service_category',''));
 v_description:=trim(coalesce(p_details->>'description',''));
 v_phone:=nullif(trim(coalesce(p_details->>'phone','')),'');
 v_email:=nullif(lower(trim(coalesce(p_details->>'email',''))),'');
 v_channel:=coalesce(nullif(p_details->>'channel',''),'phone');
 v_type:=coalesce(nullif(p_details->>'customer_type',''),'private');
 v_object_id:=nullif(p_details->>'object_id','')::uuid;
 if length(v_name) not between 2 and 120 or length(v_category) not between 2 and 120 or length(v_description) not between 3 and 3000 then raise exception 'Name, Leistung oder Beschreibung ungültig'; end if;
 if v_phone is null and v_email is null then raise exception 'Telefon oder E-Mail erforderlich'; end if;
 if length(coalesce(v_phone,''))>80 or length(coalesce(v_email,''))>240 or length(coalesce(p_details->>'company',''))>200 then raise exception 'Kontaktdaten zu lang'; end if;
 if v_email is not null and v_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+[.][A-Z]{2,}$' then raise exception 'E-Mail ungültig'; end if;
 if v_channel not in ('phone','email','website','personal','other','resident') or v_type not in ('private','business','weg','other') then raise exception 'Ungültige Auswahl'; end if;
 if v_object_id is not null and not exists(select 1 from public.objects where id=v_object_id and organization_id=p_organization_id) then raise exception 'Objekt gehört nicht zum Mandanten' using errcode='42501'; end if;
 if p_inquiry_id is null then
   insert into public.sales_inquiries(organization_id,object_id,channel,contact_name,company,email,phone,customer_type,service_category,description,street,postal_code,city,desired_date,follow_up_date,priority)
   values(p_organization_id,v_object_id,v_channel,v_name,nullif(trim(p_details->>'company'),''),v_email,v_phone,v_type,v_category,v_description,
    nullif(trim(p_details->>'street'),''),nullif(trim(p_details->>'postal_code'),''),nullif(trim(p_details->>'city'),''),
    nullif(p_details->>'desired_date','')::date,nullif(p_details->>'follow_up_date','')::date,
    case when p_details->>'priority'='high' then 'high' else 'normal' end)
   returning id into v_id;
 else
   select status into v_status from public.sales_inquiries where id=p_inquiry_id and organization_id=p_organization_id for update;
   if not found then raise exception 'Anfrage nicht gefunden' using errcode='42501'; end if;
   if v_status='converted' then raise exception 'Übernommene Anfrage ist gesperrt'; end if;
   update public.sales_inquiries set object_id=v_object_id,channel=v_channel,contact_name=v_name,company=nullif(trim(p_details->>'company'),''),email=v_email,phone=v_phone,
   customer_type=v_type,service_category=v_category,description=v_description,street=nullif(trim(p_details->>'street'),''),
   postal_code=nullif(trim(p_details->>'postal_code'),''),city=nullif(trim(p_details->>'city'),''),
   desired_date=nullif(p_details->>'desired_date','')::date,follow_up_date=nullif(p_details->>'follow_up_date','')::date,
   priority=case when p_details->>'priority'='high' then 'high' else 'normal' end,updated_at=now() where id=p_inquiry_id;
   v_id:=p_inquiry_id;
 end if;
 return v_id;
end; $$;

create or replace function public.set_sales_inquiry_status_v1(p_inquiry_id uuid,p_status text)
returns void language plpgsql security definer set search_path=public
as $$
declare q public.sales_inquiries%rowtype;
begin
 select * into q from public.sales_inquiries where id=p_inquiry_id for update;
 if not found or not public.sales_admin_allowed_v1(q.organization_id) then raise exception 'Access denied' using errcode='42501'; end if;
 if p_status not in ('new','in_progress','offer','lost') or q.status in ('converted','won') then raise exception 'Statuswechsel nicht zulässig'; end if;
 update public.sales_inquiries set status=p_status,updated_at=now() where id=p_inquiry_id;
end; $$;

create or replace function public.list_sales_offers_v1(p_inquiry_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public
as $$
declare v_org uuid;
begin
 select organization_id into v_org from public.sales_inquiries where id=p_inquiry_id;
 if not public.sales_admin_allowed_v1(v_org) then raise exception 'Access denied' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(to_jsonb(o) order by created_at desc) from public.sales_offers o where inquiry_id=p_inquiry_id),'[]'::jsonb);
end; $$;

create or replace function public.save_sales_offer_v1(p_inquiry_id uuid,p_offer_id uuid,p_title text,p_items jsonb,p_vat_rate numeric,p_valid_until date,p_terms text)
returns uuid language plpgsql security definer set search_path=public
as $$
declare v_org uuid; v_id uuid; v_net numeric(12,2):=0; item jsonb; v_status text;
begin
 select organization_id into v_org from public.sales_inquiries where id=p_inquiry_id;
 if not public.sales_admin_allowed_v1(v_org) then raise exception 'Access denied' using errcode='42501'; end if;
 if length(trim(coalesce(p_title,''))) not between 3 and 200 or p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 100 or p_vat_rate not in (0,7,19) then raise exception 'Angebot ungültig'; end if;
 for item in select value from jsonb_array_elements(p_items) loop
   if jsonb_typeof(item)<>'object' or length(trim(coalesce(item->>'description',''))) not between 1 and 300
    or coalesce(item->>'quantity','') !~ '^[0-9]+([.][0-9]{1,3})?$'
    or coalesce(item->>'unit_price','') !~ '^[0-9]+([.][0-9]{1,2})?$' then raise exception 'Position ungültig'; end if;
   if (item->>'quantity')::numeric<=0 or (item->>'unit_price')::numeric>10000000 then raise exception 'Betrag ungültig'; end if;
   v_net:=v_net+round((item->>'quantity')::numeric*(item->>'unit_price')::numeric,2);
 end loop;
 if v_net>999999999 then raise exception 'Angebotsvolumen überschritten'; end if;
 if p_offer_id is null then
   insert into public.sales_offers(organization_id,inquiry_id,title,items,vat_rate,net_amount,valid_until,terms)
   values(v_org,p_inquiry_id,trim(p_title),p_items,p_vat_rate,v_net,p_valid_until,p_terms) returning id into v_id;
 else
   select status into v_status from public.sales_offers where id=p_offer_id and inquiry_id=p_inquiry_id and organization_id=v_org for update;
   if not found or v_status not in ('draft','ready') then raise exception 'Angebot kann nicht bearbeitet werden'; end if;
   update public.sales_offers set title=trim(p_title),items=p_items,vat_rate=p_vat_rate,net_amount=v_net,valid_until=p_valid_until,terms=p_terms,updated_at=now() where id=p_offer_id;
   v_id:=p_offer_id;
 end if;
 return v_id;
end; $$;

create or replace function public.set_sales_offer_status_v1(p_offer_id uuid,p_status text)
returns void language plpgsql security definer set search_path=public
as $$
declare o public.sales_offers%rowtype;
begin
 select * into o from public.sales_offers where id=p_offer_id for update;
 if not found or not public.sales_admin_allowed_v1(o.organization_id) then raise exception 'Access denied' using errcode='42501'; end if;
 if not ((o.status='draft' and p_status in ('ready','cancelled')) or
   (o.status='ready' and p_status in ('draft','sent','accepted','rejected','cancelled')) or
   (o.status='sent' and p_status in ('accepted','rejected'))) then raise exception 'Statuswechsel nicht zulässig'; end if;
 update public.sales_offers set status=p_status,accepted_at=case when p_status='accepted' then now() else null end,updated_at=now() where id=p_offer_id;
 if p_status='accepted' then
   update public.sales_inquiries set status='won',updated_at=now() where id=o.inquiry_id;
 elsif p_status in ('ready','sent') then
   update public.sales_inquiries set status='offer',updated_at=now() where id=o.inquiry_id and status in ('new','in_progress','offer');
 end if;
end; $$;

create or replace function public.convert_sales_offer_v1(p_offer_id uuid,p_mode text,p_object_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare o public.sales_offers%rowtype; q public.sales_inquiries%rowtype; v_object uuid; v_order uuid; v_name text;
begin
 select * into o from public.sales_offers where id=p_offer_id for update;
 if not found or not public.sales_admin_allowed_v1(o.organization_id) then raise exception 'Access denied' using errcode='42501'; end if;
 select * into q from public.sales_inquiries where id=o.inquiry_id for update;
 if q.organization_id<>o.organization_id or o.status<>'accepted' then raise exception 'Nur angenommene Angebote übernehmbar'; end if;
 if exists(select 1 from public.sales_orders where inquiry_id=q.id) then raise exception 'Anfrage bereits übernommen'; end if;
 if p_mode not in ('new_object','existing_object','standalone') then raise exception 'Ungültige Übernahmeart'; end if;
 if p_mode='existing_object' then
   v_object:=coalesce(p_object_id,q.object_id);
   if v_object is null or not exists(select 1 from public.objects where id=v_object and organization_id=q.organization_id and active) then
     raise exception 'Bestehendes Objekt ungültig' using errcode='42501';
   end if;
 elsif p_mode='new_object' then
   if length(trim(coalesce(q.street,'')))<3 or length(trim(coalesce(q.city,'')))<2 then raise exception 'Für ein neues Objekt Straße und Ort in der Anfrage ergänzen'; end if;
   if exists(select 1 from public.objects where organization_id=q.organization_id and lower(trim(street))=lower(trim(q.street)) and lower(trim(city))=lower(trim(q.city)) and active) then
     raise exception 'Objektadresse bereits vorhanden: bestehendes Objekt auswählen (Dublettenprüfung)';
   end if;
   v_name:=coalesce(nullif(q.company,''),q.contact_name)||' – '||q.service_category;
   insert into public.objects(organization_id,name,street,postal_code,city,customer_type)
   values(q.organization_id,left(v_name,180),q.street,q.postal_code,q.city,q.customer_type)
   returning id into v_object;
 else
   v_object:=null;
 end if;
 insert into public.sales_orders(organization_id,inquiry_id,accepted_offer_id,object_id,order_type,title,agreed_gross_amount)
 values(q.organization_id,q.id,o.id,v_object,case when v_object is null then 'standalone' else 'object' end,o.title,o.gross_amount)
 returning id into v_order;
 update public.sales_inquiries set status='converted',converted_object_id=v_object,updated_at=now() where id=q.id;
 return jsonb_build_object('order_id',v_order,'object_id',v_object,'order_type',case when v_object is null then 'standalone' else 'object' end);
end; $$;

create or replace function public.import_resident_private_inquiry_v1(p_resident_inquiry_id uuid)
returns uuid language plpgsql security definer set search_path=public
as $$
declare q public.resident_private_inquiries%rowtype; v_org uuid; v_id uuid;
begin
 select * into q from public.resident_private_inquiries where id=p_resident_inquiry_id;
 select organization_id into v_org from public.objects where id=q.object_id;
 if not public.sales_admin_allowed_v1(v_org) or not public.private_offer_admin_allowed_v1(p_resident_inquiry_id) then raise exception 'Access denied' using errcode='42501'; end if;
 insert into public.sales_inquiries(organization_id,object_id,source_resident_inquiry_id,channel,contact_name,email,phone,service_category,description,customer_type,status)
 values(v_org,q.object_id,q.id,'resident',q.resident_name,q.resident_email,q.resident_phone,q.service_category,q.description,'private','new')
 on conflict(source_resident_inquiry_id) do nothing;
 select id into v_id from public.sales_inquiries where source_resident_inquiry_id=q.id and organization_id=v_org;
 insert into public.sales_offers(organization_id,inquiry_id,source_resident_offer_id,title,items,vat_rate,net_amount,valid_until,terms,status)
 select v_org,v_id,o.id,o.title,o.items,o.vat_rate,o.net_amount,o.valid_until,o.terms,case when o.status='ready' then 'ready' else 'draft' end
 from public.resident_private_offers o where o.inquiry_id=q.id and o.status in ('draft','ready')
 on conflict(source_resident_offer_id) do nothing;
 return v_id;
end; $$;

create or replace function public.count_open_all_inquiries_v1(p_organization_id uuid)
returns integer language plpgsql stable security definer set search_path=public
as $$
declare v_resident integer; v_sales integer;
begin
 if not public.sales_admin_allowed_v1(p_organization_id) then raise exception 'Access denied' using errcode='42501'; end if;
 select count(*)::integer into v_resident from public.resident_private_inquiries q join public.objects o on o.id=q.object_id
 where o.organization_id=p_organization_id and lower(coalesce(q.status,'new')) not in ('closed','completed','rejected','cancelled')
 and not exists(select 1 from public.sales_inquiries s where s.source_resident_inquiry_id=q.id);
 select count(*)::integer into v_sales from public.sales_inquiries where organization_id=p_organization_id and status not in ('lost','converted');
 return v_resident+v_sales;
end; $$;

revoke execute on function public.sales_admin_allowed_v1(uuid) from public,anon;
revoke execute on function public.list_sales_inquiries_v1(uuid) from public,anon;
revoke execute on function public.list_sales_objects_v1(uuid) from public,anon;
revoke execute on function public.save_sales_inquiry_v1(uuid,uuid,jsonb) from public,anon;
revoke execute on function public.set_sales_inquiry_status_v1(uuid,text) from public,anon;
revoke execute on function public.list_sales_offers_v1(uuid) from public,anon;
revoke execute on function public.save_sales_offer_v1(uuid,uuid,text,jsonb,numeric,date,text) from public,anon;
revoke execute on function public.set_sales_offer_status_v1(uuid,text) from public,anon;
revoke execute on function public.convert_sales_offer_v1(uuid,text,uuid) from public,anon;
revoke execute on function public.import_resident_private_inquiry_v1(uuid) from public,anon;
revoke execute on function public.count_open_all_inquiries_v1(uuid) from public,anon;
grant execute on function public.sales_admin_allowed_v1(uuid),public.list_sales_inquiries_v1(uuid),public.list_sales_objects_v1(uuid),
 public.save_sales_inquiry_v1(uuid,uuid,jsonb),public.set_sales_inquiry_status_v1(uuid,text),public.list_sales_offers_v1(uuid),
 public.save_sales_offer_v1(uuid,uuid,text,jsonb,numeric,date,text),public.set_sales_offer_status_v1(uuid,text),
 public.convert_sales_offer_v1(uuid,text,uuid),public.import_resident_private_inquiry_v1(uuid),
 public.count_open_all_inquiries_v1(uuid) to authenticated;
