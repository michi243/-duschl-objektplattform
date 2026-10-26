-- Keep new business inquiry customer categories compatible with objects.customer_type CHECK.
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
   v_name:=coalesce(nullif(q.company,''),q.contact_name)||' – '||q.service_category;
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
;