-- Generated with `supabase migration new gps_route_execution`, then kept pending.
-- LOCAL REVIEW ONLY: do not move to migrations/ or apply to a hosted database without approval.
-- Requires routing and driver-run foundations. Does not modify commercial obligations.
create table private.gps_run_config (
 run_id uuid primary key references public.delivery_runs(id), version integer not null default 1,
 start_mode text not null check(start_mode in ('farm_pickup','already_loaded')),
 travel_mode text not null check(travel_mode in ('DRIVE','TWO_WHEELER')),
 sequencing text not null check(sequencing in ('manual','road','review')), reuse_policy boolean not null default false,
 hub_latitude numeric not null check(hub_latitude between -90 and 90),
 hub_longitude numeric not null check(hub_longitude between -180 and 180),
 hub_label text not null check(length(trim(hub_label)) between 2 and 80),
 pickup_confirmed_at timestamptz, active_visit text, last_requested_at timestamptz,
 updated_by uuid not null references auth.users(id), updated_at timestamptz not null default now()
);
create table private.gps_run_tracking (
 run_id uuid primary key references public.delivery_runs(id), session_id uuid not null, driver_id uuid not null references auth.users(id),
 active boolean not null default true, started_at timestamptz not null default now(), stopped_at timestamptz
);
create table private.gps_run_position (
 run_id uuid primary key references public.delivery_runs(id), driver_id uuid not null references auth.users(id),
 latitude numeric not null check(latitude between -90 and 90), longitude numeric not null check(longitude between -180 and 180),
 accuracy numeric not null check(accuracy between 0 and 100), captured_at timestamptz not null,
 received_at timestamptz not null default now(), tracking boolean not null default true
);
create table private.gps_route_proposals (
 id uuid primary key, run_id uuid not null references public.delivery_runs(id),
 actor_id uuid not null references auth.users(id), run_version integer not null, config_version integer not null,
 signature text not null, ordered_keys text[] not null, origin jsonb not null,
 travel_mode text not null check(travel_mode in ('DRIVE','TWO_WHEELER')),
 duration_seconds numeric not null check(duration_seconds between 0 and 172800),
 distance_metres numeric not null check(distance_metres between 0 and 5000000),
 baseline_seconds numeric not null check(baseline_seconds between 0 and 172800),
 baseline_metres numeric not null check(baseline_metres between 0 and 5000000),
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '10 minutes',
 approved_at timestamptz, approved_by uuid references auth.users(id), accepted_at timestamptz,
 check(duration_seconds<=baseline_seconds), check(jsonb_typeof(origin)='object')
);
create index gps_proposals_run_created on private.gps_route_proposals(run_id,created_at desc);
create table private.gps_run_events (
 request_key uuid primary key, run_id uuid not null references public.delivery_runs(id),
 actor_id uuid not null references auth.users(id), action text not null, payload jsonb not null,
 result jsonb not null, created_at timestamptz not null default now()
);
create trigger immutable_gps_run_events before update or delete on private.gps_run_events
 for each row execute function private.immutable_delivery_evidence();
alter table private.gps_run_config enable row level security;
alter table private.gps_run_position enable row level security;
alter table private.gps_run_tracking enable row level security;
alter table private.gps_route_proposals enable row level security;
alter table private.gps_run_events enable row level security;
revoke all on private.gps_run_config,private.gps_run_tracking,private.gps_run_position,private.gps_route_proposals,private.gps_run_events from public,anon,authenticated;


-- Reuse is an explicit manager policy for this exact route and vehicle, never a load acknowledgement.
create function private.inherit_gps_run_config() returns trigger
language plpgsql security definer set search_path='' as $$
declare source private.gps_run_config%rowtype;
begin
 select c.* into source from private.gps_run_config c
 join public.delivery_runs r on r.id=c.run_id
 where r.id<>new.id and r.route_id=new.route_id and r.vehicle_id=new.vehicle_id
 order by c.updated_at desc,r.created_at desc limit 1;
 if found and source.reuse_policy and exists(select 1 from public.farm_staff s where s.user_id=source.updated_by and s.active and s.role in ('admin','manager')) then
  insert into private.gps_run_config(run_id,start_mode,travel_mode,sequencing,hub_latitude,hub_longitude,hub_label,reuse_policy,updated_by)
  values(new.id,source.start_mode,source.travel_mode,source.sequencing,source.hub_latitude,source.hub_longitude,source.hub_label,true,source.updated_by);
  insert into private.gps_run_events(request_key,run_id,actor_id,action,payload,result)
   values(gen_random_uuid(),new.id,new.created_by,'inherited_config',jsonb_build_object('source_run',source.run_id,'authorized_by',source.updated_by),'{"ok":true}');
 end if;
 return new;
end $$;
create trigger inherit_gps_run_config after insert on public.delivery_runs for each row execute function private.inherit_gps_run_config();
revoke all on function private.inherit_gps_run_config() from public,anon,authenticated;

-- Internal snapshot. Public entrypoints check active staff and run ownership first.
create function private.gps_run_snapshot(p_run uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r public.delivery_runs%rowtype; c private.gps_run_config%rowtype; stops jsonb; pending jsonb; proposal jsonb; accepted jsonb;
begin
 select * into r from public.delivery_runs where id=p_run;
 if not found then raise exception 'Run not found'; end if;
 select * into c from private.gps_run_config where run_id=p_run;
 select coalesce(jsonb_agg(x.stop order by x.ord,x.key),'[]') into stops from (
  select m->>'visit_key' key,(m->>'order')::integer ord,
   jsonb_build_object('visit_key',m->>'visit_key','id',m->>'id','customer_name',m->>'customer_name',
    'address_snapshot',m->>'address_snapshot','destination_latitude',(m->>'destination_latitude')::numeric,
    'destination_longitude',(m->>'destination_longitude')::numeric,'destination_confirmed_at',m->>'destination_confirmed_at',
    'recorded',exists(select 1 from public.delivery_visit_outcomes o where o.delivery_date=r.delivery_date and o.visit_key=m->>'visit_key'),
    'cancelled',not exists(select 1 from public.daily_deliveries d join public.delivery_run_deliveries rd on rd.delivery_id=d.id where rd.run_id=p_run and rd.active and d.visit_key=m->>'visit_key' and d.status<>'cancelled'),
    'items',(select coalesce(jsonb_agg(jsonb_build_object('product_key',i.product_key,'quantity',i.quantity,'unit',i.unit) order by i.product_key),'[]') from (
      select d2i.product_key,sum(d2i.quantity) quantity,d2i.unit from public.daily_delivery_items d2i
      join public.daily_deliveries d2 on d2.id=d2i.delivery_id join public.delivery_run_deliveries rd2 on rd2.delivery_id=d2.id
      where rd2.run_id=p_run and rd2.active and d2.visit_key=m->>'visit_key' and d2.status<>'cancelled' group by d2i.product_key,d2i.unit) i)) stop
  from (select distinct on (value->>'visit_key') value from jsonb_array_elements(r.manifest) order by value->>'visit_key',value->>'id') grouped(m)
 ) x;
 select coalesce(jsonb_agg(s->>'visit_key' order by n),'[]') into pending from jsonb_array_elements(stops) with ordinality t(s,n)
  where not (s->>'recorded')::boolean and not (s->>'cancelled')::boolean;
 select to_jsonb(p) into proposal from private.gps_route_proposals p where run_id=p_run order by created_at desc,id limit 1;
 select to_jsonb(p) into accepted from private.gps_route_proposals p where run_id=p_run and accepted_at is not null order by accepted_at desc,id limit 1;
 return jsonb_build_object('id',r.id,'route_id',r.route_id,'route_name',(select name from public.delivery_routes where id=r.route_id),
  'driver_id',r.driver_id,'driver_name',coalesce((select full_name from public.customer_profiles where user_id=r.driver_id),'Driver'),
  'delivery_date',r.delivery_date,'status',r.status,'version',r.version,'stops',stops,'pending_keys',pending,
  'signature',md5(r.manifest::text||r.version::text||coalesce(c.version,0)::text||pending::text),
  'config',case when c.run_id is null then null else to_jsonb(c)||jsonb_build_object('active_visit',case when pending ? c.active_visit then c.active_visit else null end) end,
  'position',case when r.status in ('released','in_progress') then (select to_jsonb(p) from private.gps_run_position p where p.run_id=p_run and received_at>now()-interval '10 minutes') else null end,
  'proposal',proposal,'accepted',accepted);
end $$;
create function private.gps_workspace(p_date date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare role text:=private.operations_role(); result jsonb;
begin
 if p_date is null then raise exception 'Choose a service date'; end if;
 select coalesce(jsonb_agg(private.gps_run_snapshot(r.id) order by case when r.status in ('released','in_progress') then 0 when r.status in ('loading','awaiting_ack','acknowledged') then 1 else 2 end,r.created_at desc),'[]') into result
 from public.delivery_runs r where r.delivery_date=p_date and r.status<>'cancelled'
 and (role in ('admin','manager') or (r.driver_id=auth.uid() and r.status in ('released','in_progress','returned','closed')));
 return jsonb_build_object('date',p_date,'role',role,'server_time',now(),'runs',result);
end $$;

create function private.gps_run_command(p_run uuid,p_action text,p_payload jsonb,p_request_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare role text:=private.operations_role(); actor uuid:=auth.uid(); r public.delivery_runs%rowtype; c private.gps_run_config%rowtype;
 old private.gps_run_events%rowtype; prop private.gps_route_proposals%rowtype; pos private.gps_run_position%rowtype;
 ctx jsonb; result jsonb:='{"ok":true}'; stamp timestamptz; lat numeric; lon numeric; acc numeric; next_key text;
begin
 if p_request_key is null or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'A valid request is required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('gps-request:'||p_request_key::text,0));
 -- Match the existing run-command lock order; all outcomes share the operational day lock.
 perform pg_advisory_xact_lock(hashtextextended('driver-operations',0));
 select * into r from public.delivery_runs where id=p_run;
 if not found then raise exception 'Run not found'; end if;
 perform private.lock_operational_day(r.delivery_date);
 select * into r from public.delivery_runs where id=p_run for update;
 if role='driver' and (r.driver_id<>actor or r.status not in ('released','in_progress')) then raise exception 'This active run is not assigned to you' using errcode='42501'; end if;
 if r.status in ('returned','closed','cancelled') then raise exception 'This run is no longer active'; end if;
 if r.delivery_date<>(now() at time zone 'Asia/Kolkata')::date and role='driver' then raise exception 'GPS actions are for today’s run'; end if;
 select * into old from private.gps_run_events where request_key=p_request_key;
 if found then
  if old.actor_id<>actor or old.run_id<>p_run or old.action<>p_action or old.payload<>p_payload then raise exception 'Request key belongs to another action'; end if;
  if p_action='prepare' then
   if exists(select 1 from private.gps_route_proposals where id=p_request_key and actor_id=actor) then return private.gps_run_snapshot(p_run); end if;
   raise exception 'That planning request was already started. Refresh, then try again after 30 seconds';
  end if;
  return old.result;
 end if;
 select * into c from private.gps_run_config where run_id=p_run for update;
 ctx:=private.gps_run_snapshot(p_run);
 if p_action='configure' then
  if role not in ('admin','manager') then raise exception 'Manager access required' using errcode='42501'; end if;
  if r.status='in_progress' then raise exception 'GPS settings cannot change after departure'; end if;
  if coalesce(c.version,0) is distinct from (p_payload->>'version')::integer then raise exception 'Settings changed. Refresh before saving'; end if;
  insert into private.gps_run_config(run_id,version,start_mode,travel_mode,sequencing,hub_latitude,hub_longitude,hub_label,reuse_policy,updated_by)
  values(p_run,coalesce(c.version,0)+1,p_payload->>'start_mode',p_payload->>'travel_mode',p_payload->>'sequencing',
   (p_payload->>'hub_latitude')::numeric,(p_payload->>'hub_longitude')::numeric,trim(p_payload->>'hub_label'),coalesce((p_payload->>'reuse_policy')::boolean,false),actor)
  on conflict(run_id) do update set version=excluded.version,start_mode=excluded.start_mode,travel_mode=excluded.travel_mode,
   sequencing=excluded.sequencing,hub_latitude=excluded.hub_latitude,hub_longitude=excluded.hub_longitude,hub_label=excluded.hub_label,reuse_policy=excluded.reuse_policy,
   pickup_confirmed_at=null,active_visit=null,updated_by=actor,updated_at=now();
 elsif p_action='start_tracking' then
  if role<>'driver' or r.driver_id<>actor then raise exception 'Only the assigned driver can share a position' using errcode='42501'; end if;
  insert into private.gps_run_tracking(run_id,session_id,driver_id) values(p_run,p_request_key,actor)
   on conflict(run_id) do update set session_id=excluded.session_id,driver_id=actor,active=true,started_at=now(),stopped_at=null;
  delete from private.gps_run_position where run_id=p_run;
  result:=jsonb_build_object('ok',true,'session_id',p_request_key);
 elsif p_action in ('position','stop_tracking') then
  if role<>'driver' or r.driver_id<>actor then raise exception 'Only the assigned driver can share a position' using errcode='42501'; end if;
  if p_action='stop_tracking' then
   update private.gps_run_tracking set active=false,stopped_at=now() where run_id=p_run and session_id=(p_payload->>'session_id')::uuid;
   if found then delete from private.gps_run_position where run_id=p_run; end if;
   return result;
  end if;
  if not exists(select 1 from private.gps_run_tracking where run_id=p_run and active and driver_id=actor and session_id=(p_payload->>'session_id')::uuid) then raise exception 'Location session ended. Start sharing again'; end if;
  lat:=(p_payload->>'latitude')::numeric; lon:=(p_payload->>'longitude')::numeric; acc:=(p_payload->>'accuracy')::numeric; stamp:=(p_payload->>'captured_at')::timestamptz;
  if lat is null or lon is null or acc is null or stamp is null or lat not between -90 and 90 or lon not between -180 and 180 or acc not between 0 and 100
   or stamp<now()-interval '2 minutes' or stamp>now()+interval '15 seconds' then raise exception 'A fresh position accurate to 100 metres or better is required'; end if;
  select * into pos from private.gps_run_position where run_id=p_run;
  if pos.captured_at=stamp and pos.latitude=lat and pos.longitude=lon and pos.accuracy=acc then return result; end if;
  if stamp<=pos.captured_at then raise exception 'An older location cannot replace a newer one'; end if;
  if pos.received_at>clock_timestamp()-interval '5 seconds' then raise exception 'Location updates are limited to one every five seconds'; end if;
  insert into private.gps_run_position(run_id,driver_id,latitude,longitude,accuracy,captured_at) values(p_run,actor,lat,lon,acc,stamp)
   on conflict(run_id) do update set latitude=lat,longitude=lon,accuracy=acc,captured_at=stamp,received_at=now(),driver_id=actor,tracking=true;
  -- Latest position only. Do not copy precise coordinates into the permanent audit log.
  return result;
 elsif p_action='pickup' then
  if role<>'driver' or r.status<>'released' or c.start_mode is distinct from 'farm_pickup' then raise exception 'Pickup needs your assigned, released farm-pickup run'; end if;
  if r.acknowledged_by is distinct from actor or r.acknowledged_at is null then raise exception 'Check the physical load first'; end if;
  update private.gps_run_config set pickup_confirmed_at=coalesce(pickup_confirmed_at,now()) where run_id=p_run;
 elsif p_action='prepare' then
  if c.run_id is null then raise exception 'Ask the manager to configure GPS for this run'; end if;
  if r.status not in ('released','in_progress') then raise exception 'Release the run before planning'; end if;
  if role='driver' and r.status<>'in_progress' then raise exception 'Start your acknowledged run before planning deliveries'; end if;
  if role='driver' and c.start_mode='farm_pickup' and c.pickup_confirmed_at is null then raise exception 'Confirm farm pickup before planning deliveries'; end if;
  if ctx->'config'->>'active_visit' is not null then raise exception 'Finish the active navigation leg, or stop it with a reason, before replanning'; end if;
  if c.last_requested_at>now()-interval '30 seconds' then raise exception 'Wait 30 seconds before requesting another road plan'; end if;
  if jsonb_array_length(ctx->'pending_keys') not between 1 and 25 then raise exception 'Road planning supports 1–25 pending stops per run'; end if;
  if exists(select 1 from jsonb_array_elements(ctx->'stops') s where not (s->>'recorded')::boolean and not (s->>'cancelled')::boolean and
    (s->>'destination_latitude' is null or s->>'destination_longitude' is null or s->>'destination_confirmed_at' is null)) then raise exception 'Confirm every pending delivery entrance before road planning'; end if;
  if role='driver' and (ctx->'position'->>'captured_at' is null or (ctx->'position'->>'captured_at')::timestamptz<now()-interval '90 seconds') then raise exception 'Share a fresh driver position before planning'; end if;
  update private.gps_run_config set last_requested_at=now() where run_id=p_run;
  result:=ctx;
 elsif p_action in ('approve','accept') then
  select * into prop from private.gps_route_proposals where id=(p_payload->>'proposal_id')::uuid and run_id=p_run for update;
  if not found or prop.signature is distinct from ctx->>'signature' or prop.expires_at<now() then raise exception 'The proposal is stale. Request a fresh road plan'; end if;
  if ctx->'config'->>'active_visit' is not null then raise exception 'Finish the active navigation leg before replacing its plan'; end if;
  if p_action='approve' then
   if role not in ('admin','manager') then raise exception 'Manager approval required' using errcode='42501'; end if;
   update private.gps_route_proposals set approved_at=coalesce(approved_at,now()),approved_by=coalesce(approved_by,actor) where id=prop.id;
  else
   if role<>'driver' or r.status<>'in_progress' or prop.approved_at is null then raise exception 'The assigned driver can accept a manager-approved plan after starting'; end if;
   select * into pos from private.gps_run_position where run_id=p_run;
   if pos.captured_at is null or pos.captured_at<now()-interval '90 seconds' or
      abs(pos.latitude-(prop.origin->>'latitude')::numeric)>.001 or abs(pos.longitude-(prop.origin->>'longitude')::numeric)>.001 then raise exception 'Your starting position changed. Request a fresh road plan'; end if;
   update private.gps_route_proposals set accepted_at=coalesce(accepted_at,now()) where id=prop.id;
  end if;
 elsif p_action='navigate' then
  if role<>'driver' or r.status<>'in_progress' then raise exception 'Only the assigned driver can navigate an active run'; end if;
  select * into prop from private.gps_route_proposals where run_id=p_run and accepted_at is not null order by accepted_at desc,id limit 1;
  if prop.run_version is distinct from r.version or prop.config_version is distinct from c.version then raise exception 'Accept the current road plan first'; end if;
  select key into next_key from unnest(prop.ordered_keys) with ordinality x(key,n) where (ctx->'pending_keys') ? key order by n limit 1;
  if next_key is null or next_key is distinct from p_payload->>'visit_key' then raise exception 'Navigate to the next pending stop in the accepted plan'; end if;
  update private.gps_run_config set active_visit=next_key where run_id=p_run;
 elsif p_action='stop_navigation' then
  if role<>'driver' or length(trim(coalesce(p_payload->>'reason','')))<3 or length(p_payload->>'reason')>250 then raise exception 'Explain why this navigation leg needs to stop'; end if;
  update private.gps_run_config set active_visit=null where run_id=p_run;
 else raise exception 'Unknown GPS action';
 end if;
 insert into private.gps_run_events(request_key,run_id,actor_id,action,payload,result) values(p_request_key,p_run,actor,p_action,p_payload,case when p_action='prepare' then '{"ok":true}'::jsonb else result end);
 return result;
end $$;

-- Server-only provider results. Authenticated clients cannot fabricate road metrics or a proposal.
create function private.store_gps_route_proposal(p_actor uuid,p_run uuid,p_request_key uuid,p_payload jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.delivery_runs%rowtype; role text; ctx jsonb; keys text[]; expected text[]; old private.gps_route_proposals%rowtype; c private.gps_run_config%rowtype; automatic boolean;
begin
 select s.role into role from public.farm_staff s where user_id=p_actor and active;
 if role is null then raise exception 'Active staff required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('driver-operations',0));
 select * into r from public.delivery_runs where id=p_run;
 if not found then raise exception 'Run not found'; end if;
 perform private.lock_operational_day(r.delivery_date);
 select * into r from public.delivery_runs where id=p_run for update;
 if role='driver' and r.driver_id<>p_actor then raise exception 'Assigned driver required'; end if;
 if r.status not in ('released','in_progress') then raise exception 'The run is not active'; end if;
 if not exists(select 1 from private.gps_run_events where request_key=p_request_key and run_id=p_run and actor_id=p_actor and action='prepare') then raise exception 'Planning request not reserved'; end if;
 ctx:=private.gps_run_snapshot(p_run);
 select * into c from private.gps_run_config where run_id=p_run;
 automatic:=c.sequencing in ('road','manual');
 if automatic and not exists(select 1 from public.farm_staff s where s.user_id=c.updated_by and s.active and s.role in ('admin','manager')) then raise exception 'The manager’s routing authorization needs renewal'; end if;
 if p_payload->>'signature' is distinct from ctx->>'signature' or ctx->'config'->>'active_visit' is not null then raise exception 'Run changed while planning. Refresh before retrying'; end if;
 select array_agg(v order by v) into expected from jsonb_array_elements_text(ctx->'pending_keys') x(v);
 select array_agg(v order by v) into keys from jsonb_array_elements_text(p_payload->'ordered_keys') x(v);
 if keys is distinct from expected or cardinality(keys)=0 then raise exception 'A proposal must contain every pending visit exactly once'; end if;
 if p_payload->>'travel_mode' is distinct from ctx->'config'->>'travel_mode' then raise exception 'Vehicle profile changed'; end if;
 if jsonb_typeof(p_payload->'origin') is distinct from 'object' then raise exception 'Missing route origin'; end if;
 if role='driver' then
  if (ctx->'position'->>'captured_at') is null or (ctx->'position'->>'captured_at')::timestamptz<now()-interval '90 seconds' or
   p_payload->'origin' is distinct from jsonb_build_object('latitude',(ctx->'position'->>'latitude')::numeric,'longitude',(ctx->'position'->>'longitude')::numeric) then raise exception 'Driver position changed while planning'; end if;
 else
  if p_payload->'origin' is distinct from jsonb_build_object('latitude',(ctx->'config'->>'hub_latitude')::numeric,'longitude',(ctx->'config'->>'hub_longitude')::numeric) then raise exception 'Manager preview starts from the configured hub'; end if;
 end if;
 select * into old from private.gps_route_proposals where id=p_request_key;
 if found then
  if old.actor_id<>p_actor or old.run_id<>p_run or old.signature<>p_payload->>'signature' then raise exception 'Proposal request key already used'; end if;
  return old.id;
 end if;
 insert into private.gps_route_proposals(id,run_id,actor_id,run_version,config_version,signature,ordered_keys,origin,travel_mode,duration_seconds,distance_metres,baseline_seconds,baseline_metres,approved_at,approved_by,accepted_at)
 values(p_request_key,p_run,p_actor,r.version,(ctx->'config'->>'version')::integer,ctx->>'signature',array(select jsonb_array_elements_text(p_payload->'ordered_keys')),
  p_payload->'origin',p_payload->>'travel_mode',(p_payload->>'duration_seconds')::numeric,(p_payload->>'distance_metres')::numeric,
  (p_payload->>'baseline_seconds')::numeric,(p_payload->>'baseline_metres')::numeric,
  case when automatic then now() end,case when automatic then c.updated_by end,case when automatic and role='driver' then now() end);
 if automatic then
  insert into private.gps_run_events(request_key,run_id,actor_id,action,payload,result) values(gen_random_uuid(),p_run,p_actor,'automatic_plan',jsonb_build_object('proposal_id',p_request_key,'config_version',c.version,'authorized_by',c.updated_by),jsonb_build_object('adopted',role='driver'));
 end if;
 return p_request_key;
end $$;
create function public.get_gps_workspace(p_date date) returns jsonb language sql security invoker set search_path='' as $$ select private.gps_workspace(p_date); $$;
create function public.gps_run_command(p_run uuid,p_action text,p_payload jsonb,p_request_key uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.gps_run_command(p_run,p_action,p_payload,p_request_key); $$;
create function public.store_gps_route_proposal(p_actor uuid,p_run uuid,p_request_key uuid,p_payload jsonb) returns uuid language sql security invoker set search_path='' as $$ select private.store_gps_route_proposal(p_actor,p_run,p_request_key,p_payload); $$;
-- Deployment must schedule this bounded latest-position cleanup; no GPS history is retained.
create function public.purge_old_gps_positions() returns void language plpgsql security definer set search_path='' as $$ begin
 delete from private.gps_run_position where received_at<now()-interval '1 day';
 update private.gps_route_proposals set origin='{}' where created_at<now()-interval '1 day' and origin<>'{}';
 end $$;
revoke all on function private.gps_run_snapshot(uuid),private.gps_workspace(date),private.gps_run_command(uuid,text,jsonb,uuid),private.store_gps_route_proposal(uuid,uuid,uuid,jsonb),
 public.get_gps_workspace(date),public.gps_run_command(uuid,text,jsonb,uuid),public.store_gps_route_proposal(uuid,uuid,uuid,jsonb),public.purge_old_gps_positions() from public,anon,authenticated;
grant execute on function private.gps_workspace(date),private.gps_run_command(uuid,text,jsonb,uuid),public.get_gps_workspace(date),public.gps_run_command(uuid,text,jsonb,uuid) to authenticated;
grant execute on function private.store_gps_route_proposal(uuid,uuid,uuid,jsonb),public.store_gps_route_proposal(uuid,uuid,uuid,jsonb),public.purge_old_gps_positions() to service_role;
