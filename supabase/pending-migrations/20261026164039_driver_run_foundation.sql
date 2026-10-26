-- Approval pending: driver custody records. No production backfill or GPS/pay claims.
create table public.farm_vehicles (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 2 and 80),
 registration text not null unique check(length(trim(registration)) between 2 and 30),
 ownership text not null check(ownership in ('farm','driver')), active boolean not null default true,
 milk_capacity numeric(8,2) not null check(milk_capacity between 0 and 10000),
 paneer_capacity integer not null check(paneer_capacity between 0 and 10000),
 ghee_capacity integer not null check(ghee_capacity between 0 and 10000),
 stop_capacity integer not null check(stop_capacity between 1 and 200)
);
create table public.driver_operating_profiles (
 driver_id uuid primary key references public.farm_staff(user_id),
 phone text not null check(length(phone)<=20 and length(regexp_replace(phone,'[^0-9]','','g')) between 7 and 15),
 default_vehicle_id uuid references public.farm_vehicles(id),
 notes text not null default '' check(length(notes)<=250)
);
create table public.driver_day_availability (
 driver_id uuid references public.farm_staff(user_id), delivery_date date not null,
 available boolean not null, recorded_by uuid not null references auth.users(id), recorded_at timestamptz not null default now(),
 primary key(driver_id,delivery_date)
);
create table public.delivery_runs (
 id uuid primary key default gen_random_uuid(), delivery_date date not null,
 route_id uuid not null references public.delivery_routes(id), driver_id uuid not null references public.farm_staff(user_id),
 vehicle_id uuid not null references public.farm_vehicles(id),
 status text not null default 'loading' check(status in ('loading','awaiting_ack','acknowledged','released','in_progress','returned','closed','cancelled')),
 version integer not null default 1, manifest jsonb not null, load jsonb not null default '{}',
 acknowledged_by uuid references auth.users(id), acknowledged_at timestamptz,
 released_at timestamptz, started_at timestamptz, returned_at timestamptz, closed_at timestamptz,
 opening_odometer numeric(10,1), closing_odometer numeric(10,1),
 return_note text, closeout jsonb, created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 check(opening_odometer is null or opening_odometer between 0 and 999999999.9),
 check(closing_odometer is null or (closing_odometer between 0 and 999999999.9 and closing_odometer>=opening_odometer))
);
create unique index one_run_per_route_day on public.delivery_runs(delivery_date,route_id) where status<>'cancelled';
create unique index one_active_run_per_driver on public.delivery_runs(driver_id) where status in ('released','in_progress','returned');
create unique index one_active_run_per_vehicle on public.delivery_runs(vehicle_id) where status in ('released','in_progress','returned');
create index driver_runs_by_day on public.delivery_runs(driver_id,delivery_date);
create table public.delivery_run_deliveries (
 run_id uuid references public.delivery_runs(id), delivery_id uuid references public.daily_deliveries(id),
 active boolean not null default true, primary key(run_id,delivery_id)
);
create unique index one_custodian_per_delivery on public.delivery_run_deliveries(delivery_id) where active;
create table public.driver_operations_events (
 id uuid primary key default gen_random_uuid(), request_key uuid not null unique,
 actor_id uuid not null references auth.users(id), action text not null, payload jsonb not null,
 result jsonb not null, before_state jsonb, after_state jsonb, created_at timestamptz not null default now()
);
create trigger immutable_driver_operations_events before update or delete on public.driver_operations_events
 for each row execute function private.immutable_delivery_evidence();
-- All access is through role-checked functions, with no direct table grants.
alter table public.farm_vehicles enable row level security;
alter table public.driver_operating_profiles enable row level security;
alter table public.driver_day_availability enable row level security;
alter table public.delivery_runs enable row level security;
alter table public.delivery_run_deliveries enable row level security;
alter table public.driver_operations_events enable row level security;
revoke all on public.farm_vehicles,public.driver_operating_profiles,public.driver_day_availability,
 public.delivery_runs,public.delivery_run_deliveries,public.driver_operations_events from public,anon,authenticated;

-- Snapshot only routing obligations. Outcome fields and preparation timestamps are excluded.
create function private.run_manifest(p_date date,p_route uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'visit_key',d.visit_key,'user_id',d.user_id,
 'driver_id',d.assigned_driver_id,'customer_name',d.customer_name,'address_snapshot',d.address_snapshot,
 'phone_snapshot',d.phone_snapshot,'order',d.route_stop_order,
 'destination_latitude',to_jsonb(d)->'destination_latitude','destination_longitude',to_jsonb(d)->'destination_longitude',
 'destination_confirmed_at',to_jsonb(d)->'destination_confirmed_at',
 'items',(select jsonb_agg(jsonb_build_object('product_key',i.product_key,'quantity',i.quantity,'unit',i.unit) order by i.product_key)
 from public.daily_delivery_items i where i.delivery_id=d.id)) order by d.route_stop_order,d.visit_key,d.id),'[]')
 from public.daily_deliveries d where d.delivery_date=p_date and d.delivery_route_id=p_route and not d.is_test and d.status<>'cancelled';
$$;
create function private.run_totals(p_manifest jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select coalesce(jsonb_object_agg(product,quantity),'{}') from (
 select i->>'product_key' product,sum((i->>'quantity')::numeric) quantity
 from jsonb_array_elements(p_manifest) d cross join lateral jsonb_array_elements(d->'items') i group by 1) totals;
$$;
create function private.driver_run_workspace(p_date date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_role text:=private.operations_role(); v_actor uuid:=auth.uid();
begin
 if p_date is null then raise exception 'Choose a service date'; end if;
 return jsonb_build_object('date',p_date,'role',v_role,'actor',v_actor,
 'drivers',coalesce((select jsonb_agg(jsonb_build_object('id',s.user_id,'name',coalesce(p.full_name,'Driver'),
 'active',s.active,'phone',op.phone,'notes',op.notes,'default_vehicle_id',op.default_vehicle_id,'available',a.available) order by p.full_name)
 from public.farm_staff s left join public.customer_profiles p on p.user_id=s.user_id
 left join public.driver_operating_profiles op on op.driver_id=s.user_id
 left join public.driver_day_availability a on a.driver_id=s.user_id and a.delivery_date=p_date
 where s.role='driver' and (v_role<>'driver' or s.user_id=v_actor)),'[]'),
 'vehicles',coalesce((select jsonb_agg(to_jsonb(v) order by v.name) from public.farm_vehicles v
 where v_role<>'driver' or v.id in(select r.vehicle_id from public.delivery_runs r where r.driver_id=v_actor and r.delivery_date=p_date)),'[]'),
 'routes',case when v_role='driver' then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'stops',
 (select count(distinct d.visit_key) from public.daily_deliveries d where d.delivery_route_id=r.id and d.delivery_date=p_date and not d.is_test and d.status in ('planned','ready'))))
 from public.delivery_routes r where r.active),'[]') end,
 'runs',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('route_name',rt.name,'vehicle_name',v.name,'registration',v.registration,
 'driver_name',coalesce(p.full_name,'Driver'),'planned',private.run_totals(r.manifest),
 -- Customer contact is withheld from the run view until dispatch is released.
 'manifest',case when v_role<>'driver' or r.status in ('released','in_progress','returned','closed') then r.manifest else '[]'::jsonb end,
 'stop_count',(select count(distinct x->>'visit_key') from jsonb_array_elements(r.manifest) x),
 'recorded_stops',(select count(distinct d.visit_key) from public.delivery_run_deliveries rd join public.daily_deliveries d on d.id=rd.delivery_id
 where rd.run_id=r.id and (d.status='cancelled' or exists(select 1 from public.delivery_visit_outcomes o where o.delivery_date=d.delivery_date and o.visit_key=d.visit_key))),
 'delivered',coalesce((select jsonb_object_agg(product,quantity) from (
 select i.product_key product,coalesce(sum(i.fulfilled_quantity),0) quantity from public.delivery_run_deliveries rd
 join public.daily_delivery_items i on i.delivery_id=rd.delivery_id where rd.run_id=r.id group by 1) totals),'{}')) order by r.created_at)
 from public.delivery_runs r join public.delivery_routes rt on rt.id=r.route_id join public.farm_vehicles v on v.id=r.vehicle_id
 left join public.customer_profiles p on p.user_id=r.driver_id
 where r.delivery_date=p_date and (v_role<>'driver' or r.driver_id=v_actor)),'[]'));
end $$;


create function private.validate_run_obligations(p_date date,p_route uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.daily_deliveries d where d.delivery_date=p_date and d.delivery_route_id=p_route and not d.is_test and d.status<>'cancelled' and (
  not exists(select 1 from public.daily_delivery_items i where i.delivery_id=d.id and i.quantity>0) or
  not exists(select 1 from public.orders o join public.payments pay on pay.order_id=o.id where o.user_id=d.user_id and o.status='paid' and pay.status='captured' and ((d.plan_id is not null and o.delivery_plan_id=d.plan_id) or o.id=d.order_id)) or
  exists(select 1 from public.daily_deliveries other where other.delivery_date=p_date and other.visit_key=d.visit_key and not other.is_test and other.status<>'cancelled' and other.delivery_route_id is distinct from p_route)
 )) then raise exception 'A run needs complete, paid doorstep obligations with scheduled quantities'; end if;
end $$;
revoke all on function private.validate_run_obligations(date,uuid) from public,anon,authenticated;

create function private.driver_operations_command(p_action text,p_payload jsonb,p_request_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 v_role text:=private.operations_role(); v_actor uuid:=auth.uid(); v_old public.driver_operations_events%rowtype;
 v_run public.delivery_runs%rowtype; v_before jsonb; v_id uuid; v_driver uuid; v_date date; v_route uuid;
 v_vehicle public.farm_vehicles%rowtype; v_manifest jsonb; v_total jsonb; v_load jsonb; v_result jsonb;
 v_key text; v_qty numeric; v_return numeric; v_loss numeric; v_delivered numeric; v_note text:=trim(coalesce(p_payload->>'note',''));
begin
 if p_request_key is null or p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'A valid request is required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('driver-request:'||p_request_key::text,0));
 select * into v_old from public.driver_operations_events where request_key=p_request_key;
 if found then
  if v_old.actor_id<>v_actor or v_old.action<>p_action or v_old.payload<>p_payload then raise exception 'Request key belongs to a different action'; end if;
  return v_old.result;
 end if;
 if length(v_note)>250 then raise exception 'Keep notes within 250 characters'; end if;
 -- One configuration/command lock also serialises resources across different days.
 -- All day locks precede delivery-row locks, matching the existing outcome commands.
 perform pg_advisory_xact_lock(hashtextextended('driver-operations',0));
 if v_role='driver' and p_action not in ('availability','acknowledge','reject_load','start','finish') then raise exception 'Manager access required' using errcode='42501'; end if;
 if p_action='vehicle' then
  v_id:=coalesce((p_payload->>'id')::uuid,gen_random_uuid());
  if exists(select 1 from public.delivery_runs where vehicle_id=v_id and status not in ('closed','cancelled')) then raise exception 'Finish or cancel assigned runs before editing this vehicle'; end if;
  select to_jsonb(v) into v_before from public.farm_vehicles v where id=v_id;
  insert into public.farm_vehicles(id,name,registration,ownership,active,milk_capacity,paneer_capacity,ghee_capacity,stop_capacity)
  values(v_id,trim(p_payload->>'name'),upper(trim(p_payload->>'registration')),p_payload->>'ownership',coalesce((p_payload->>'active')::boolean,true),
  (p_payload->>'milk_capacity')::numeric,(p_payload->>'paneer_capacity')::integer,(p_payload->>'ghee_capacity')::integer,(p_payload->>'stop_capacity')::integer)
  on conflict(id) do update set name=excluded.name,registration=excluded.registration,ownership=excluded.ownership,active=excluded.active,
  milk_capacity=excluded.milk_capacity,paneer_capacity=excluded.paneer_capacity,ghee_capacity=excluded.ghee_capacity,stop_capacity=excluded.stop_capacity;
 elsif p_action in ('profile','availability') then
  v_driver:=(p_payload->>'driver_id')::uuid;
  if v_driver is null or not exists(select 1 from public.farm_staff where user_id=v_driver and role='driver' and active) then raise exception 'Choose an active driver'; end if;
  if v_role='driver' and v_driver<>v_actor then raise exception 'You can only update your own availability' using errcode='42501'; end if;
  if p_action='profile' then
   select to_jsonb(p) into v_before from public.driver_operating_profiles p where driver_id=v_driver;
   insert into public.driver_operating_profiles(driver_id,phone,default_vehicle_id,notes)
   values(v_driver,trim(p_payload->>'phone'),nullif(p_payload->>'default_vehicle_id','')::uuid,v_note)
   on conflict(driver_id) do update set phone=excluded.phone,default_vehicle_id=excluded.default_vehicle_id,notes=excluded.notes;
  else
   v_date:=(p_payload->>'date')::date;
   if v_date<private.operational_today() then raise exception 'Past availability cannot be changed'; end if;
   if not (p_payload->>'available')::boolean and exists(select 1 from public.delivery_runs where driver_id=v_driver and delivery_date=v_date and status in ('released','in_progress','returned')) then raise exception 'Close or cancel the active run before changing availability'; end if;
   select to_jsonb(a) into v_before from public.driver_day_availability a where driver_id=v_driver and delivery_date=v_date;
   insert into public.driver_day_availability values(v_driver,v_date,(p_payload->>'available')::boolean,v_actor,now())
   on conflict(driver_id,delivery_date) do update set available=excluded.available,recorded_by=v_actor,recorded_at=now();
  end if;
 elsif p_action='create' then
  v_date:=(p_payload->>'date')::date; v_route:=(p_payload->>'route_id')::uuid; v_driver:=(p_payload->>'driver_id')::uuid;
  perform private.lock_operational_day(v_date);
  if v_date<private.operational_today() then raise exception 'Create runs for today or a future day'; end if;
  if not exists(select 1 from public.farm_staff where user_id=v_driver and active and role='driver') or
   not exists(select 1 from public.driver_operating_profiles where driver_id=v_driver) or
   not exists(select 1 from public.driver_day_availability where driver_id=v_driver and delivery_date=v_date and available) then raise exception 'Save the driver profile and confirm availability first'; end if;
  select * into v_vehicle from public.farm_vehicles where id=(p_payload->>'vehicle_id')::uuid and active;
  if not found then raise exception 'Choose an active vehicle'; end if;
  if not exists(select 1 from public.delivery_dispatches where delivery_date=v_date) then raise exception 'Prepare this day from Routes before creating a run'; end if;
  if exists(select 1 from public.delivery_dispatches where delivery_date=v_date and status='released') then
   if exists(select 1 from public.daily_deliveries where delivery_date=v_date and delivery_route_id=v_route and not is_test and status<>'cancelled' and assigned_driver_id is distinct from v_driver) then raise exception 'The released route belongs to another driver'; end if;
  else perform public.assign_daily_route_driver(v_date,v_route,v_driver,false); end if;
  v_manifest:=private.run_manifest(v_date,v_route);
  if jsonb_array_length(v_manifest)=0 or exists(select 1 from public.daily_deliveries where delivery_date=v_date and delivery_route_id=v_route and not is_test and status not in ('planned','ready','cancelled')) then raise exception 'Choose an unstarted route with prepared deliveries'; end if;
  perform private.validate_run_obligations(v_date,v_route);
  v_id:=gen_random_uuid();
  insert into public.delivery_runs(id,delivery_date,route_id,driver_id,vehicle_id,manifest,created_by) values(v_id,v_date,v_route,v_driver,v_vehicle.id,v_manifest,v_actor);
  insert into public.delivery_run_deliveries(run_id,delivery_id) select v_id,(d->>'id')::uuid from jsonb_array_elements(v_manifest) d;
 else
  select delivery_date into v_date from public.delivery_runs where id=(p_payload->>'id')::uuid;
  if v_date is null then raise exception 'Run not found'; end if;
  perform private.lock_operational_day(v_date);
  select * into v_run from public.delivery_runs where id=(p_payload->>'id')::uuid for update;
  v_id:=v_run.id; v_before:=to_jsonb(v_run);
  if v_role='driver' and v_run.driver_id<>v_actor then raise exception 'This run is not assigned to you' using errcode='42501'; end if;
  if (p_payload->>'version')::integer is distinct from v_run.version then raise exception 'This run changed. Refresh before continuing'; end if;
  if exists(select 1 from public.delivery_day_reviews where delivery_date=v_date and version=(select max(version) from public.delivery_day_reviews where delivery_date=v_date) and action='closed') then raise exception 'This delivery day is closed'; end if;
  select * into v_vehicle from public.farm_vehicles where id=v_run.vehicle_id;
  v_total:=private.run_totals(v_run.manifest);
  if p_action in ('load','refresh','cancel') then
   if v_run.status not in ('loading','awaiting_ack','acknowledged','released') or (p_action<>'cancel' and v_run.status='released') then raise exception 'The run has already left loading'; end if;
   if p_action='cancel' then
    if length(v_note)<3 then raise exception 'Explain why this run is cancelled'; end if;
    update public.delivery_runs set status='cancelled',return_note=v_note where id=v_id;
    update public.delivery_run_deliveries set active=false where run_id=v_id;
   elsif p_action='refresh' then
    v_manifest:=private.run_manifest(v_date,v_run.route_id);
    if jsonb_array_length(v_manifest)=0 or exists(select 1 from public.daily_deliveries where delivery_date=v_date and delivery_route_id=v_run.route_id and not is_test and status not in ('planned','ready','cancelled')) then raise exception 'Only an unstarted route can be refreshed'; end if;
    update public.delivery_run_deliveries set active=false where run_id=v_id;
    insert into public.delivery_run_deliveries(run_id,delivery_id) select v_id,(d->>'id')::uuid from jsonb_array_elements(v_manifest) d on conflict(run_id,delivery_id) do update set active=true;
    update public.delivery_runs set manifest=v_manifest,load='{}',status='loading',acknowledged_at=null,acknowledged_by=null where id=v_id;
   else
    v_load:=p_payload->'load';
    if v_load is null or jsonb_typeof(v_load)<>'object' or (select count(*) from jsonb_object_keys(v_load))<>(select count(*) from jsonb_object_keys(v_total)) then raise exception 'Record the physical load for every scheduled product'; end if;
    for v_key in select jsonb_object_keys(v_total) loop
     v_qty:=(v_load->>v_key)::numeric;
     if v_qty is null or v_qty<(v_total->>v_key)::numeric or v_qty<>round(v_qty,2) then raise exception 'Load must cover every scheduled quantity'; end if;
     if v_key not in ('milk','paneer','ghee') or (v_key<>'milk' and v_qty<>trunc(v_qty)) or
       v_qty>(case v_key when 'milk' then v_vehicle.milk_capacity when 'paneer' then v_vehicle.paneer_capacity else v_vehicle.ghee_capacity end) then raise exception 'Load exceeds vehicle capacity or uses an unsupported quantity'; end if;
    end loop;
    if (select count(distinct d->>'visit_key') from jsonb_array_elements(v_run.manifest) d)>v_vehicle.stop_capacity then raise exception 'Too many stops for this vehicle'; end if;
    if exists(select 1 from jsonb_array_elements(v_run.manifest) d cross join lateral jsonb_array_elements(d->'items') i where i->>'product_key' not in ('milk','paneer','ghee') or (i->>'product_key'='milk' and lower(i->>'unit') not in ('l','litre','litres')) or (i->>'product_key'<>'milk' and i->>'unit'<>'500 g')) then raise exception 'Review unsupported product units before loading'; end if;
    update public.delivery_runs set load=v_load,status='awaiting_ack',acknowledged_at=null,acknowledged_by=null where id=v_id;
   end if;
  elsif p_action in ('acknowledge','reject_load') then
   if v_role<>'driver' or v_run.status<>'awaiting_ack' then raise exception 'The assigned driver must check the recorded load'; end if;
   if p_action='reject_load' and length(v_note)<3 then raise exception 'Tell the manager what needs correcting'; end if;
   update public.delivery_runs set status=case when p_action='acknowledge' then 'acknowledged' else 'loading' end,
    acknowledged_by=case when p_action='acknowledge' then v_actor end,acknowledged_at=case when p_action='acknowledge' then now() end,return_note=case when p_action='reject_load' then v_note end where id=v_id;
  elsif p_action='release' then
   perform private.validate_run_obligations(v_date,v_run.route_id);
   perform 1 from public.farm_staff where user_id=v_run.driver_id for update;
   if v_run.status<>'acknowledged' or v_run.acknowledged_by is distinct from v_run.driver_id then raise exception 'The driver must acknowledge this load first'; end if;
   if not v_vehicle.active or not exists(select 1 from public.farm_staff where user_id=v_run.driver_id and active and role='driver') or not exists(select 1 from public.driver_day_availability where driver_id=v_run.driver_id and delivery_date=v_date and available) then raise exception 'Driver or vehicle is no longer available'; end if;
   if private.run_manifest(v_date,v_run.route_id)<>v_run.manifest then raise exception 'The route changed. Refresh the manifest and check the load again'; end if;
   if not exists(select 1 from public.delivery_dispatches where delivery_date=v_date and status='released') then perform public.release_daily_dispatch(v_date); end if;
   update public.delivery_runs set status='released',released_at=now() where id=v_id;
  elsif p_action='start' then
   if v_role<>'driver' or v_run.status<>'released' or v_date<>private.operational_today() then raise exception 'The driver can start a released run on its service day'; end if;
   if (p_payload->>'odometer')::numeric is null or (p_payload->>'odometer')::numeric not between 0 and 999999999.9 or (p_payload->>'odometer')::numeric<>round((p_payload->>'odometer')::numeric,1) then raise exception 'Enter the opening odometer reading to one decimal place'; end if;
   if not exists(select 1 from public.farm_staff where user_id=v_run.driver_id and active and role='driver') then raise exception 'Driver is inactive'; end if;
   if (p_payload->>'odometer')::numeric<(select max(closing_odometer) from public.delivery_runs where vehicle_id=v_run.vehicle_id and status='closed') then raise exception 'Opening odometer is below this vehicle’s last closing reading'; end if;
   update public.delivery_runs set status='in_progress',started_at=now(),opening_odometer=(p_payload->>'odometer')::numeric where id=v_id;
  elsif p_action='finish' then
   if v_role<>'driver' or v_run.status<>'in_progress' then raise exception 'Only the driver can return an active run'; end if;
   if (p_payload->>'odometer')::numeric is null or (p_payload->>'odometer')::numeric not between v_run.opening_odometer and 999999999.9 or (p_payload->>'odometer')::numeric<>round((p_payload->>'odometer')::numeric,1) then raise exception 'Closing odometer must be at least the opening reading'; end if;
   if exists(select 1 from public.delivery_run_deliveries rd join public.daily_deliveries d on d.id=rd.delivery_id where rd.run_id=v_id and d.status<>'cancelled' and not exists(select 1 from public.delivery_visit_outcomes o where o.delivery_date=d.delivery_date and o.visit_key=d.visit_key)) and length(v_note)<3 then raise exception 'Explain the unrecorded stops before returning'; end if;
   update public.delivery_runs set status='returned',returned_at=now(),closing_odometer=(p_payload->>'odometer')::numeric,return_note=v_note where id=v_id;
  elsif p_action='close' then
   if v_run.status<>'returned' then raise exception 'The driver must return the run first'; end if;
   if exists(select 1 from public.delivery_run_deliveries rd join public.daily_deliveries d on d.id=rd.delivery_id where rd.run_id=v_id and d.status<>'cancelled' and not exists(select 1 from public.delivery_visit_outcomes o where o.delivery_date=d.delivery_date and o.visit_key=d.visit_key)) then raise exception 'Record the remaining visit outcomes before closeout'; end if;
   if p_payload->'returns' is null or p_payload->'losses' is null or jsonb_typeof(p_payload->'returns')<>'object' or jsonb_typeof(p_payload->'losses')<>'object' then raise exception 'Enter the actual returned and lost quantities'; end if;
   if (select count(*) from jsonb_object_keys(p_payload->'returns'))<>(select count(*) from jsonb_object_keys(v_run.load)) or (select count(*) from jsonb_object_keys(p_payload->'losses'))<>(select count(*) from jsonb_object_keys(v_run.load)) then raise exception 'Record every loaded product exactly once'; end if;
   for v_key in select jsonb_object_keys(v_run.load) loop
    v_return:=(p_payload->'returns'->>v_key)::numeric; v_loss:=(p_payload->'losses'->>v_key)::numeric;
    select coalesce(sum(i.fulfilled_quantity),0) into v_delivered from public.delivery_run_deliveries rd join public.daily_delivery_items i on i.delivery_id=rd.delivery_id where rd.run_id=v_id and i.product_key=v_key;
    if v_return is null or v_loss is null or v_return<0 or v_loss<0 or v_return<>round(v_return,2) or v_loss<>round(v_loss,2) or v_delivered+v_return+v_loss<>(v_run.load->>v_key)::numeric then raise exception 'Loaded stock must equal delivered, returned and lost stock'; end if;
    if v_loss>0 and length(v_note)<3 then raise exception 'Explain any lost or spoiled stock'; end if;
   end loop;
   update public.delivery_runs set status='closed',closed_at=now(),closeout=jsonb_build_object('returns',p_payload->'returns','losses',p_payload->'losses','note',v_note,'reviewed_by',v_actor) where id=v_id;
  else raise exception 'Unknown driver operation'; end if;
  update public.delivery_runs set version=version+1 where id=v_id;
 end if;
 v_result:=jsonb_build_object('saved',true,'id',v_id);
 insert into public.driver_operations_events(request_key,actor_id,action,payload,result,before_state,after_state)
 values(p_request_key,v_actor,p_action,p_payload,v_result,v_before,
 case when p_action='vehicle' then (select to_jsonb(v) from public.farm_vehicles v where id=v_id)
 when p_action='profile' then (select to_jsonb(p) from public.driver_operating_profiles p where driver_id=v_driver)
 when p_action='availability' then (select to_jsonb(a) from public.driver_day_availability a where driver_id=v_driver and delivery_date=v_date)
 else (select to_jsonb(r) from public.delivery_runs r where id=v_id) end);
 return v_result;
end $$;

-- Custody cannot be changed beneath a released run. Existing outcome commands
-- remain the only authority for fulfilment and prepaid-entitlement accounting.
create function private.protect_run_custody() returns trigger language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_run public.delivery_runs%rowtype; v_role text;
begin
 if tg_table_name='daily_deliveries' then v_id:=old.id; else v_id:=case when tg_op='INSERT' then new.delivery_id else old.delivery_id end; end if;
 select r.* into v_run from public.delivery_run_deliveries rd join public.delivery_runs r on r.id=rd.run_id
 where rd.delivery_id=v_id and rd.active and r.status in ('released','in_progress','returned','closed');
 if not found then return case when tg_op='DELETE' then old else new end; end if;
 perform private.lock_operational_day(v_run.delivery_date);
 if tg_op='INSERT' then raise exception 'Released run quantities are frozen'; end if;
 if tg_op='DELETE' then raise exception 'A run custody record cannot be deleted'; end if;
 if tg_table_name='daily_deliveries' then
  if row(new.delivery_route_id,new.assigned_driver_id,new.address_snapshot,new.phone_snapshot,new.user_id,new.order_id,new.plan_id,new.visit_key,new.route_stop_order,new.customer_name)
   is distinct from row(old.delivery_route_id,old.assigned_driver_id,old.address_snapshot,old.phone_snapshot,old.user_id,old.order_id,old.plan_id,old.visit_key,old.route_stop_order,old.customer_name) then raise exception 'Cancel the unstarted run before changing its manifest'; end if;
 else
  if row(new.delivery_id,new.product_key,new.quantity,new.unit) is distinct from row(old.delivery_id,old.product_key,old.quantity,old.unit) then raise exception 'Released run quantities are frozen'; end if;
  if new.fulfilled_quantity is distinct from old.fulfilled_quantity then
   if v_run.status='closed' then raise exception 'Run is closed; stock reconciliation cannot be rewritten'; end if;
   select role into v_role from public.farm_staff where user_id=auth.uid() and active;
   if v_role='driver' and v_run.status<>'in_progress' then raise exception 'Start your run before recording deliveries'; end if;
  end if;
 end if;
 return new;
end $$;
create trigger protect_run_delivery before update or delete on public.daily_deliveries for each row execute function private.protect_run_custody();
create trigger protect_run_item before insert or update or delete on public.daily_delivery_items for each row execute function private.protect_run_custody();

create function public.get_driver_run_workspace(p_date date) returns jsonb language sql security invoker set search_path='' as $$ select private.driver_run_workspace(p_date); $$;
create function public.driver_operations_command(p_action text,p_payload jsonb,p_request_key uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.driver_operations_command(p_action,p_payload,p_request_key); $$;
revoke all on function private.run_manifest(date,uuid),private.run_totals(jsonb),private.protect_run_custody() from public,anon,authenticated;
revoke all on function private.driver_run_workspace(date),private.driver_operations_command(text,jsonb,uuid),public.get_driver_run_workspace(date),public.driver_operations_command(text,jsonb,uuid) from public,anon,authenticated;
grant execute on function private.driver_run_workspace(date),private.driver_operations_command(text,jsonb,uuid),public.get_driver_run_workspace(date),public.driver_operations_command(text,jsonb,uuid) to authenticated;
