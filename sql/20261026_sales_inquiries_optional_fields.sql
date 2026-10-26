-- v3.57.20 | Telefonische Anfrage: keine fachlichen Pflichtfelder.
-- Mandant, Status, interne Referenz und Berechtigungsprüfung bleiben technisch verpflichtend.
alter table public.sales_inquiries
  alter column contact_name drop not null,
  alter column service_category drop not null,
  alter column description drop not null;

CREATE OR REPLACE FUNCTION public.save_sales_inquiry_v1(p_organization_id uuid, p_inquiry_id uuid, p_details jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_object_id uuid; v_name text; v_category text; v_description text; v_channel text; v_type text; v_email text; v_phone text; v_status text;
begin
 if not public.sales_admin_allowed_v1(p_organization_id) then raise exception 'Access denied' using errcode='42501'; end if;
 if p_details is null or jsonb_typeof(p_details)<>'object' then raise exception 'Invalid input'; end if;
 v_name:=nullif(trim(coalesce(p_details->>'contact_name','')),'');
 v_category:=nullif(trim(coalesce(p_details->>'service_category','')),'');
 v_description:=nullif(trim(coalesce(p_details->>'description','')),'');
 v_phone:=nullif(trim(coalesce(p_details->>'phone','')),'');
 v_email:=nullif(lower(trim(coalesce(p_details->>'email',''))),'');
 v_channel:=coalesce(nullif(p_details->>'channel',''),'phone');
 v_type:=coalesce(nullif(p_details->>'customer_type',''),'private');
 v_object_id:=nullif(p_details->>'object_id','')::uuid;
 -- Keine fachlichen Pflichtfelder für die schnelle Telefonannahme; auch eine leere Anfrage ist als Entwurf zulässig.
 if length(coalesce(v_name,''))>120 or length(coalesce(v_category,''))>120 or length(coalesce(v_description,''))>3000 then
   raise exception 'Eingabe überschreitet die maximale Feldlänge';
 end if;
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
end; $function$


CREATE OR REPLACE FUNCTION public.convert_sales_offer_v1(p_offer_id uuid, p_mode text, p_object_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
   v_name:=coalesce(nullif(q.company,''),nullif(q.contact_name,''),'Interessent nicht erfasst')||' – '||coalesce(nullif(q.service_category,''),'Anfrage');
   insert into public.objects(organization_id,name,street,postal_code,city,customer_type)
   values(q.organization_id,left(v_name,180),q.street,q.postal_code,q.city,case q.customer_type when 'private' then 'private_owner' when 'business' then 'company' when 'weg' then 'weg' else 'other' end)
   returning id into v_object;
 else
   v_object:=null;
 end if;
 insert into public.sales_orders(organization_id,inquiry_id,accepted_offer_id,object_id,order_type,title,agreed_gross_amount)
 values(q.organization_id,q.id,o.id,v_object,case when v_object is null then 'standalone' else 'object' end,o.title,o.gross_amount)
 returning id into v_order;
 update public.sales_inquiries set status='converted',converted_object_id=v_object,updated_at=now() where id=q.id;
 return jsonb_build_object('order_id',v_order,'object_id',v_object,'order_type',case when v_object is null then 'standalone' else 'object' end);
end; $function$


-- Berechtigungen bleiben auf authenticated begrenzt; keinerlei Zugriffsänderung an Tabellen.
revoke execute on function public.save_sales_inquiry_v1(uuid,uuid,jsonb) from public,anon;
revoke execute on function public.convert_sales_offer_v1(uuid,text,uuid) from public,anon;
grant execute on function public.save_sales_inquiry_v1(uuid,uuid,jsonb) to authenticated;
grant execute on function public.convert_sales_offer_v1(uuid,text,uuid) to authenticated;
