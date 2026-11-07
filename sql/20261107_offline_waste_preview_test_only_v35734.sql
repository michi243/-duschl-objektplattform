-- Test-only preview migration, intentionally NOT the production rollout SQL.
-- Adds only nullable idempotency column and a test-object-only RPC.
-- v3.57.34: preserving the actual capture day for offline waste readings.
-- Apply only after separate staging Q-Gate; existing REST INSERT privileges remain unchanged.
alter table public.waste_bin_scans
  add column if not exists client_event_id uuid;
create unique index if not exists waste_bin_scans_client_event_unique
  on public.waste_bin_scans(observed_by,client_event_id)
  where client_event_id is not null;

-- RPC is intentionally SECURITY DEFINER because direct REST INSERT must not permit client backdating.
-- A deliberately narrow authorization and validation gate is repeated for EVERY upload.
create or replace function public.ds_record_offline_waste_scan_v1(
  p_organization_id uuid,
  p_bin_id uuid,
  p_fill_percent smallint,
  p_note text,
  p_observed_at timestamptz,
  p_client_event_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_object uuid;
  v_id uuid;
  v_prior_id uuid;
  v_prior_bin uuid;
  v_prior_day date;
  v_day date;
begin
  if v_actor is null or p_organization_id is null or p_bin_id is null
    or p_client_event_id is null or p_observed_at is null then
    raise exception 'OFFLINE_WASTE_DENIED: Anmeldung und Pflichtdaten erforderlich.' using errcode='42501';
  end if;

  select b.object_id into v_object
  from public.waste_bins b
    join public.objects o on o.id = b.object_id and o.organization_id=b.organization_id
  where b.id = p_bin_id
    and b.organization_id = p_organization_id
    and b.active is true
    and o.active is true
    and o.is_test is true; -- Preview-Schutz: niemals produktive Objekte beschreiben

  if v_object is null
    or not private.ds_waste_can_access(p_organization_id,v_object,true)
    or not private.ds_waste_service_commissioned(p_organization_id,v_object)
  then
    raise exception 'OFFLINE_WASTE_DENIED: Mandanten-, Objekt- oder Leistungsfreigabe fehlt.' using errcode='42501';
  end if;

  if p_fill_percent is null or p_fill_percent not in (0,25,50,75,100)
    or length(coalesce(p_note,''))>500 then
    raise exception 'OFFLINE_WASTE_DENIED: Ungültige Messdaten.' using errcode='22023';
  end if;
  if p_observed_at < now() - interval '14 days'
    or p_observed_at > now() + interval '5 minutes' then
    raise exception 'OFFLINE_WASTE_EXPIRED: Erfassungszeit außerhalb des erlaubten Zeitfensters.' using errcode='22023';
  end if;
  v_day := (p_observed_at at time zone 'Europe/Berlin')::date;

  -- First, recognize a retry of an already accepted event without modifying the row.
  select s.id,s.bin_id,s.observed_date into v_prior_id,v_prior_bin,v_prior_day
  from public.waste_bin_scans s
  where s.observed_by=v_actor and s.client_event_id=p_client_event_id;
  if v_prior_id is not null then
    if v_prior_bin<>p_bin_id or v_prior_day<>v_day then
      raise exception 'OFFLINE_WASTE_CONFLICT: Ereignis-ID mit anderen Daten belegt.' using errcode='23505';
    end if;
    return jsonb_build_object('id',v_prior_id,'observed_date',v_day,'already_saved',true);
  end if;

  insert into public.waste_bin_scans
    (bin_id,fill_percent,note,observed_by,observed_at,observed_date,client_event_id)
  values
    (p_bin_id,p_fill_percent,nullif(trim(p_note),''),v_actor,p_observed_at,v_day,p_client_event_id)
  on conflict do nothing
  returning id into v_id;

  if v_id is null then
    -- Lost HTTP response: same client event has reached the server.
    select s.id,s.bin_id,s.observed_date into v_prior_id,v_prior_bin,v_prior_day
      from public.waste_bin_scans s
      where s.observed_by=v_actor and s.client_event_id=p_client_event_id;
    if v_prior_id is not null and v_prior_bin=p_bin_id and v_prior_day=v_day then
      return jsonb_build_object('id',v_prior_id,'observed_date',v_day,'already_saved',true);
    end if;
    raise exception 'OFFLINE_WASTE_CONFLICT: Für diese Tonne existiert bereits eine Tageserfassung.' using errcode='23505';
  end if;

  return jsonb_build_object('id',v_id,'observed_date',v_day,'already_saved',false);
end;
$$;
revoke all on function public.ds_record_offline_waste_scan_v1(uuid,uuid,smallint,text,timestamptz,uuid)
  from public, anon, authenticated;
grant execute on function public.ds_record_offline_waste_scan_v1(uuid,uuid,smallint,text,timestamptz,uuid)
  to authenticated;
comment on function public.ds_record_offline_waste_scan_v1(uuid,uuid,smallint,text,timestamptz,uuid)
  is 'TEST ONLY: offline waste import limited to public.objects.is_test=true; requires tenant/object/service authorization.';

notify pgrst, 'reload schema';
