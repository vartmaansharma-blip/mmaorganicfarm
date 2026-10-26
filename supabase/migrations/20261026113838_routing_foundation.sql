-- Routing foundation. Additive; no backfill or production business-record writes.
-- Existing customer/visit/dispatch records remain the system of record.

-- Shared deterministic candidate ranking. Postal codes are broad: a matching
-- locality refines a postal match. Equal best matches require a manager.
create or replace function private.customer_route_candidates(p_user_id uuid)
returns table(route_id uuid, area_id uuid, priority integer, specificity integer)
language sql stable security definer set search_path = '' as $$
  with profile as (
    select p.*, ' ' || trim(regexp_replace(lower(concat_ws(' ',p.locality,p.landmark,p.address_line)), '[^a-z0-9]+',' ','g')) || ' ' as location
    from public.customer_profiles p where p.user_id=p_user_id
      and nullif(trim(p.address_line),'') is not null
  ), candidates as (
    select r.id, r.area_id,
      (trim(coalesce(p.postal_code,'')) = any(r.postal_codes)) as postal,
      coalesce((select max(length(term.normalized)) from unnest(r.match_terms) t(value)
        cross join lateral (select trim(regexp_replace(lower(t.value),'[^a-z0-9]+',' ','g')) normalized) term
        where term.normalized<>'' and strpos(p.location,' '||term.normalized||' ')>0),0) as term_length,
      p.delivery_area_id=r.area_id as selected_area,
      (select count(*) from public.delivery_routes other where other.area_id=r.area_id and other.active)=1 as single_route,
      (trim(regexp_replace(lower(a.name),'[^a-z0-9]+',' ','g'))<>'' and strpos(p.location,' '||trim(regexp_replace(lower(a.name),'[^a-z0-9]+',' ','g'))||' ')>0) as named_area
    from profile p cross join public.delivery_routes r
    join public.delivery_areas a on a.id=r.area_id and a.active
    where r.active and (p.delivery_area_id is null or p.delivery_area_id=r.area_id)
  )
  select id,area_id,
    case when postal then 1 when term_length>0 then 2 when selected_area then 3 else 4 end,
    term_length
  from candidates where postal or term_length>0 or (single_route and (selected_area or named_area));
$$;
revoke all on function private.customer_route_candidates(uuid) from public,anon,authenticated;

create or replace function private.assign_customer_route(p_user_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_profile public.customer_profiles%rowtype;
  v_route public.delivery_routes%rowtype;
  v_candidates uuid[];
  v_position integer;
begin
  select * into v_profile from public.customer_profiles where user_id=p_user_id for update;
  if v_profile.user_id is null or nullif(trim(v_profile.address_line),'') is null then return null; end if;
  -- Preserve valid explicit assignments, including manual ones.
  select r.* into v_route from public.delivery_routes r join public.delivery_areas a on a.id=r.area_id and a.active
    where r.id=v_profile.delivery_route_id and r.active
      and (v_profile.delivery_area_id is null or v_profile.delivery_area_id=r.area_id);
  if v_route.id is null then
    with ranked as (
      select c.*,dense_rank() over(order by priority,specificity desc) as rank
      from private.customer_route_candidates(p_user_id) c
    ) select array_agg(route_id) into v_candidates from ranked where rank=1;
    if coalesce(cardinality(v_candidates),0)<>1 then
      -- Clear an invalid old route rather than continuing to dispatch it.
      update public.customer_profiles set delivery_route_id=null,route_stop_order=null
        where user_id=p_user_id and delivery_route_id is not null;
      return null;
    end if;
    select * into v_route from public.delivery_routes where id=v_candidates[1];
  end if;
  -- Serialise appending to a route; customer-profile positions are defaults,
  -- while daily visit order remains manager controlled.
  perform 1 from public.delivery_routes where id=v_route.id for update;
  v_position := case when v_profile.delivery_route_id=v_route.id then v_profile.route_stop_order else null end;
  if v_position is null then
    select coalesce(max(route_stop_order),0)+1 into v_position from public.customer_profiles where delivery_route_id=v_route.id;
  end if;
  update public.customer_profiles set delivery_area_id=v_route.area_id,delivery_route_id=v_route.id,
    route_stop_order=v_position,updated_at=now() where user_id=p_user_id;
  return v_route.id;
end;
$$;
revoke all on function private.assign_customer_route(uuid) from public,anon,authenticated;

-- Confirmed destination pins, never live driver tracking. No direct client writes.
create table public.customer_delivery_pins (
  user_id uuid primary key references public.customer_profiles(user_id) on delete cascade,
  latitude double precision not null check(latitude between -90 and 90),
  longitude double precision not null check(longitude between -180 and 180),
  accuracy_metres double precision not null check(accuracy_metres>0 and accuracy_metres<=100),
  address_line text not null,
  confirmed_at timestamptz not null default now()
);
alter table public.customer_delivery_pins enable row level security;
revoke all on public.customer_delivery_pins from public,anon,authenticated;
grant select on public.customer_delivery_pins to authenticated;
create policy "Customers and managers can read delivery pins" on public.customer_delivery_pins for select to authenticated
using(user_id=(select auth.uid()) or exists(select 1 from public.farm_staff s where s.user_id=(select auth.uid()) and s.active and s.role in ('manager','admin')));

alter table public.daily_deliveries
  add column destination_latitude double precision,
  add column destination_longitude double precision,
  add column destination_confirmed_at timestamptz;
alter table public.daily_deliveries add constraint daily_delivery_destination_check check (
  (destination_latitude is null and destination_longitude is null and destination_confirmed_at is null)
  or (destination_latitude is not null and destination_longitude is not null and destination_confirmed_at is not null
    and destination_latitude between -90 and 90 and destination_longitude between -180 and 180)
);

create or replace function private.invalidate_delivery_pin()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if row(new.address_line,new.locality,new.landmark,new.postal_code,new.city)
    is distinct from row(old.address_line,old.locality,old.landmark,old.postal_code,old.city) then
    delete from public.customer_delivery_pins where user_id=new.user_id;
    update public.daily_deliveries d set destination_latitude=null,destination_longitude=null,destination_confirmed_at=null
      where d.user_id=new.user_id and not d.is_test and d.status in ('planned','ready')
      and d.delivery_date >= (now() at time zone 'Asia/Kolkata')::date
      and not exists(select 1 from public.delivery_dispatches x where x.delivery_date=d.delivery_date and x.status='released');
  end if;
  return new;
end;
$$;
revoke all on function private.invalidate_delivery_pin() from public,anon,authenticated;
create trigger invalidate_delivery_pin after update on public.customer_profiles for each row execute function private.invalidate_delivery_pin();

create or replace function private.snapshot_delivery_pin()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_pin public.customer_delivery_pins%rowtype;
begin
  new.destination_latitude:=null; new.destination_longitude:=null; new.destination_confirmed_at:=null;
  if not new.is_test then
    select pin.* into v_pin from public.customer_delivery_pins pin join public.customer_profiles p on p.user_id=pin.user_id
      where pin.user_id=new.user_id and pin.address_line=p.address_line
      and (new.address_snapshot=p.address_line or new.address_snapshot=nullif(concat_ws(', ',nullif(trim(p.address_line),''),nullif(trim(p.landmark),''),nullif(trim(p.postal_code),'')),''));
    if v_pin.user_id is not null then
      new.destination_latitude:=v_pin.latitude; new.destination_longitude:=v_pin.longitude; new.destination_confirmed_at:=v_pin.confirmed_at;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.snapshot_delivery_pin() from public,anon,authenticated;
create trigger snapshot_delivery_pin before insert or update of address_snapshot,user_id on public.daily_deliveries
for each row execute function private.snapshot_delivery_pin();

create or replace function private.save_my_delivery_pin(p_latitude double precision,p_longitude double precision,p_accuracy_metres double precision,p_address_line text)
returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid:=(select auth.uid()); v_address text;
begin
  if v_user is null then raise exception 'Sign in to confirm your delivery pin'; end if;
  if p_latitude is null or p_longitude is null or p_accuracy_metres is null
    or not(p_latitude between -90 and 90) or not(p_longitude between -180 and 180)
    or not(p_accuracy_metres>0 and p_accuracy_metres<=100) then
    raise exception 'A location accurate to 100 metres or better is required';
  end if;
  select address_line into v_address from public.customer_profiles where user_id=v_user for update;
  if nullif(trim(v_address),'') is null or p_address_line is distinct from v_address then
    raise exception 'Your address changed. Refresh and confirm the pin again';
  end if;
  insert into public.customer_delivery_pins(user_id,latitude,longitude,accuracy_metres,address_line)
    values(v_user,p_latitude,p_longitude,p_accuracy_metres,v_address)
    on conflict(user_id) do update set latitude=excluded.latitude,longitude=excluded.longitude,
      accuracy_metres=excluded.accuracy_metres,address_line=excluded.address_line,confirmed_at=now();
  -- Resnapshot matching, unstarted, unreleased visits only. Released manifests
  -- retain their approved destination, even if the customer confirms a new pin.
  update public.daily_deliveries d set address_snapshot=d.address_snapshot where d.user_id=v_user
    and not d.is_test and d.status in ('planned','ready')
    and d.delivery_date >= (now() at time zone 'Asia/Kolkata')::date
    and not exists(select 1 from public.delivery_dispatches x where x.delivery_date=d.delivery_date and x.status='released');
end;
$$;
revoke all on function private.save_my_delivery_pin(double precision,double precision,double precision,text) from public,anon;
grant execute on function private.save_my_delivery_pin(double precision,double precision,double precision,text) to authenticated;
create or replace function public.save_my_delivery_pin(p_latitude double precision,p_longitude double precision,p_accuracy_metres double precision,p_address_line text)
returns void language sql security invoker set search_path='' as $$
  select private.save_my_delivery_pin(p_latitude,p_longitude,p_accuracy_metres,p_address_line);
$$;
revoke all on function public.save_my_delivery_pin(double precision,double precision,double precision,text) from public,anon;
grant execute on function public.save_my_delivery_pin(double precision,double precision,double precision,text) to authenticated;

-- One readiness calculation is used by both the manager screen and release.
create or replace function private.dispatch_route_issues(p_date date)
returns jsonb language sql stable security definer set search_path='' as $$
  with deliveries as (select * from public.daily_deliveries where delivery_date=p_date and not is_test and status<>'cancelled'),
  issues as (
    select d.visit_key,d.delivery_route_id as route_id,'missing_address'::text code,'Add a complete delivery address.'::text message from deliveries d where nullif(trim(d.address_snapshot),'') is null
    union all
    select d.visit_key,d.delivery_route_id,'invalid_route','Choose an active route in the correct active service area.' from deliveries d
      left join public.delivery_routes r on r.id=d.delivery_route_id left join public.delivery_areas a on a.id=r.area_id
      where r.id is null or not r.active or not coalesce(a.active,false) or d.delivery_area_id is distinct from r.area_id
    union all
    select d.visit_key,d.delivery_route_id,'invalid_driver','Assign an active delivery driver.' from deliveries d
      where not exists(select 1 from public.farm_staff s where s.user_id=d.assigned_driver_id and s.active and s.role='driver')
    union all
    select d.visit_key,null::uuid,'split_visit','All order lines at a doorstep must share one route, driver and address.' from deliveries d group by d.visit_key
      having count(distinct coalesce(d.delivery_route_id::text,''))>1 or count(distinct coalesce(d.assigned_driver_id::text,''))>1
        or count(distinct coalesce(d.address_snapshot,''))>1
    union all
    select null,r.id,'route_capacity','Move visits: this route exceeds its daily stop limit.' from deliveries d join public.delivery_routes r on r.id=d.delivery_route_id
      group by r.id,r.stop_capacity having count(distinct d.visit_key)>r.stop_capacity
  ) select coalesce(jsonb_agg(to_jsonb(i) order by code,visit_key,route_id),'[]'::jsonb) from (select distinct * from issues) i;
$$;
revoke all on function private.dispatch_route_issues(date) from public,anon,authenticated;
create or replace function private.get_dispatch_routing_readiness(p_date date)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.farm_staff where user_id=(select auth.uid()) and active and role in ('manager','admin')) then
    raise exception 'Manager access is required';
  end if;
  if p_date is null then raise exception 'Service date is required'; end if;
  return jsonb_build_object('issues',private.dispatch_route_issues(p_date),
    'visits',(select count(distinct visit_key) from public.daily_deliveries where delivery_date=p_date and not is_test and status<>'cancelled'),
    'confirmed_pin_visits',(select count(distinct visit_key) from public.daily_deliveries where delivery_date=p_date and not is_test and status<>'cancelled' and destination_confirmed_at is not null));
end;
$$;
revoke all on function private.get_dispatch_routing_readiness(date) from public,anon;
grant execute on function private.get_dispatch_routing_readiness(date) to authenticated;
create or replace function public.get_dispatch_routing_readiness(p_date date)
returns jsonb language sql security invoker set search_path='' as $$ select private.get_dispatch_routing_readiness(p_date); $$;
revoke all on function public.get_dispatch_routing_readiness(date) from public,anon;
grant execute on function public.get_dispatch_routing_readiness(date) to authenticated;

-- Enforce release readiness even for direct table writes, not just the RPC.
create or replace function private.check_dispatch_route_release()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_issues jsonb;
begin
  if new.status='released' and (tg_op='INSERT' or old.status is distinct from new.status) then
    if not exists(select 1 from public.farm_staff where user_id=(select auth.uid()) and active and role in ('manager','admin')) then
      raise exception 'Manager access is required to release dispatch';
    end if;
    if not exists(select 1 from public.daily_deliveries where delivery_date=new.delivery_date and not is_test and status<>'cancelled') then
      raise exception 'Prepare active visits before releasing dispatch';
    end if;
    -- Prevent a concurrent deactivation from overtaking this release.
    perform 1 from public.delivery_routes where id in(select delivery_route_id from public.daily_deliveries where delivery_date=new.delivery_date and not is_test and status<>'cancelled') order by id for share;
    perform 1 from public.delivery_areas where id in(select delivery_area_id from public.daily_deliveries where delivery_date=new.delivery_date and not is_test and status<>'cancelled') order by id for share;
    perform 1 from public.farm_staff where user_id in(select assigned_driver_id from public.daily_deliveries where delivery_date=new.delivery_date and not is_test and status<>'cancelled') order by user_id for share;
    v_issues:=private.dispatch_route_issues(new.delivery_date);
    if jsonb_array_length(v_issues)>0 then raise exception 'Routing review required: %',v_issues->0->>'message'; end if;
  end if;
  return new;
end;
$$;
revoke all on function private.check_dispatch_route_release() from public,anon,authenticated;
create trigger check_dispatch_route_release before insert or update of status on public.delivery_dispatches
for each row execute function private.check_dispatch_route_release();

-- A released route is a committed manifest. Outcome and cancellation writes
-- remain supported; silent additions or changed destinations/assignments do not.
create or replace function private.protect_released_routing()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_date date; v_released boolean;
begin
  if tg_op='DELETE' then
    select status='released' into v_released from public.delivery_dispatches where delivery_date=old.delivery_date for share;
    if coalesce(v_released,false) and not old.is_test then raise exception 'A released visit cannot be deleted'; end if;
    return old;
  end if;
  if tg_op='UPDATE' and row(new.delivery_date,new.visit_key,new.user_id,new.is_test,new.delivery_area_id,new.delivery_route_id,new.assigned_driver_id,new.route_stop_order,new.address_snapshot,new.destination_latitude,new.destination_longitude,new.destination_confirmed_at)
    is not distinct from row(old.delivery_date,old.visit_key,old.user_id,old.is_test,old.delivery_area_id,old.delivery_route_id,old.assigned_driver_id,old.route_stop_order,old.address_snapshot,old.destination_latitude,old.destination_longitude,old.destination_confirmed_at) then return new; end if;
  if tg_op='UPDATE' then
    for v_date in select distinct d from unnest(array[old.delivery_date,new.delivery_date]) d order by d loop
      select status='released' into v_released from public.delivery_dispatches where delivery_date=v_date for share;
      if coalesce(v_released,false) and (not old.is_test or not new.is_test) then raise exception 'Reopen this dispatch before changing its routing or destination'; end if;
    end loop;
  elsif not new.is_test and new.status<>'cancelled' then
    select status='released' into v_released from public.delivery_dispatches where delivery_date=new.delivery_date for share;
    if coalesce(v_released,false) then
      -- Keep the paid obligation, but never append it silently to released
      -- driver work. A distinct pending visit is visible in assignment review.
      new.delivery_route_id:=null; new.assigned_driver_id:=null; new.route_stop_order:=null;
      new.status:='planned';
      new.visit_key:=new.visit_key||':after-release:'||new.id::text;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.protect_released_routing() from public,anon,authenticated;
-- Alphabetical order places protection after the destination snapshot trigger.
create trigger zz_protect_released_routing before insert or update or delete on public.daily_deliveries for each row execute function private.protect_released_routing();

-- Fail closed for signed-in nonstaff requesting another customer.
create or replace function private.refresh_customer_route_impl(
  p_user_id uuid,
  p_force_reroute boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_actor_role text;
  v_profile public.customer_profiles%rowtype;
  v_route_id uuid;
  v_address text;
begin
  select role into v_actor_role
  from public.farm_staff
  where user_id = v_actor_id and active;

  if v_actor_id is null
    or (v_actor_id <> p_user_id and not coalesce(v_actor_role in ('manager', 'admin'), false))
  then
    raise exception 'You cannot update this customer route';
  end if;

  if p_force_reroute then
    update public.customer_profiles
    set delivery_area_id = null,
        delivery_route_id = null,
        route_stop_order = null,
        updated_at = now()
    where user_id = p_user_id;
  end if;

  v_route_id := private.assign_customer_route(p_user_id);

  select * into v_profile
  from public.customer_profiles
  where user_id = p_user_id;

  if v_profile.user_id is null then
    raise exception 'Customer profile not found';
  end if;

  v_address := nullif(concat_ws(
    ', ',
    nullif(trim(v_profile.address_line), ''),
    nullif(trim(v_profile.landmark), ''),
    nullif(trim(v_profile.postal_code), '')
  ), '');

  update public.daily_deliveries as delivery
  set customer_name = coalesce(nullif(trim(v_profile.full_name), ''), 'Customer'),
      phone_snapshot = v_profile.phone,
      address_snapshot = v_address,
      delivery_area_id = v_profile.delivery_area_id,
      delivery_route_id = v_profile.delivery_route_id,
      route_stop_order = v_profile.route_stop_order,
      assigned_driver_id = coalesce(
        (
          select daily_assignment.driver_id
          from public.daily_route_assignments as daily_assignment
          where daily_assignment.delivery_date = delivery.delivery_date
            and daily_assignment.route_id = v_profile.delivery_route_id
        ),
        (
          select default_assignment.driver_id
          from public.route_driver_assignments as default_assignment
          where default_assignment.route_id = v_profile.delivery_route_id
        )
      ),
      updated_at = now()
  where delivery.user_id = p_user_id
    and delivery.delivery_date >= (now() at time zone 'Asia/Kolkata')::date
    and delivery.status in ('planned', 'ready', 'failed')
    and not exists (
      select 1
      from public.delivery_dispatches as dispatch
      where dispatch.delivery_date = delivery.delivery_date
        and dispatch.status = 'released'
    );

  return v_route_id;
end;
$$;

create or replace function private.assign_unrouted_customers_impl()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role text;
  v_customer record;
  v_assigned integer := 0;
begin
  select role into v_actor_role
  from public.farm_staff
  where user_id = (select auth.uid()) and active;

  if not coalesce(v_actor_role in ('manager', 'admin'), false) then
    raise exception 'Manager access is required';
  end if;

  for v_customer in
    select profile.user_id
    from public.customer_profiles as profile
    where profile.delivery_route_id is null
      and (
        exists (
          select 1 from public.delivery_plans as plan
          where plan.user_id = profile.user_id
            and plan.status = 'active'
            and not plan.is_test
        )
        or exists (
          select 1 from public.orders as farm_order
          where farm_order.user_id = profile.user_id
            and farm_order.status = 'paid'
            and not farm_order.is_test
        )
      )
  loop
    if private.refresh_customer_route_impl(v_customer.user_id, false) is not null then
      v_assigned := v_assigned + 1;
    end if;
  end loop;

  return v_assigned;
end;
$$;

-- Managers may validate driver roles without exposing the full staff table.
create or replace function private.assign_daily_route_driver_impl(
  p_delivery_date date,
  p_route_id uuid,
  p_driver_id uuid,
  p_make_default boolean default false
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_updated integer := 0;
begin
  if p_delivery_date is null or p_route_id is null or p_driver_id is null then
    raise exception 'Delivery date, route, and driver are required';
  end if;

  if not exists (
    select 1 from public.farm_staff
    where farm_staff.user_id = v_actor_id
      and farm_staff.active
      and farm_staff.role in ('manager', 'admin')
  ) then
    raise exception 'Farm manager access required';
  end if;

  perform 1 from public.delivery_dispatches where delivery_date=p_delivery_date for update;
  if exists(select 1 from public.delivery_dispatches where delivery_date=p_delivery_date and status='released') then
    raise exception 'Reopen this dispatch before changing its driver';
  end if;

  if not exists (
    select 1 from public.farm_staff
    where farm_staff.user_id = p_driver_id
      and farm_staff.active
      and farm_staff.role = 'driver'
  ) then
    raise exception 'Choose an active driver';
  end if;

  if not exists (
    select 1 from public.daily_deliveries
    where delivery_date = p_delivery_date
      and delivery_route_id = p_route_id
      and not is_test
      and status <> 'cancelled'
  ) then
    raise exception 'This route has no deliveries on the selected date';
  end if;

  if not exists (
    select 1 from public.delivery_dispatches
    where delivery_date = p_delivery_date
  ) then
    raise exception 'Prepare the dispatch before assigning its drivers';
  end if;

  insert into public.daily_route_assignments (
    delivery_date, route_id, driver_id, source, updated_by, updated_at
  ) values (
    p_delivery_date,
    p_route_id,
    p_driver_id,
    case when p_make_default then 'default' else 'override' end,
    v_actor_id,
    now()
  )
  on conflict (delivery_date, route_id) do update
  set driver_id = excluded.driver_id,
      source = excluded.source,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at;

  if p_make_default then
    insert into public.route_driver_assignments (
      route_id, driver_id, updated_by, updated_at
    ) values (
      p_route_id, p_driver_id, v_actor_id, now()
    )
    on conflict (route_id) do update
    set driver_id = excluded.driver_id,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at;
  end if;

  update public.daily_deliveries
  set assigned_driver_id = p_driver_id,
      updated_at = now()
  where delivery_date = p_delivery_date
    and delivery_route_id = p_route_id
    and not is_test
    and status in ('planned', 'ready', 'out_for_delivery', 'failed')
    and assigned_driver_id is distinct from p_driver_id;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;
revoke all on function private.assign_daily_route_driver_impl(date,uuid,uuid,boolean) from public,anon;
grant execute on function private.assign_daily_route_driver_impl(date,uuid,uuid,boolean) to authenticated;
create or replace function public.assign_daily_route_driver(p_delivery_date date,p_route_id uuid,p_driver_id uuid,p_make_default boolean default false)
returns integer language sql security invoker set search_path='' as $$
  select private.assign_daily_route_driver_impl(p_delivery_date,p_route_id,p_driver_id,p_make_default);
$$;
revoke all on function public.assign_daily_route_driver(date,uuid,uuid,boolean) from public,anon;
grant execute on function public.assign_daily_route_driver(date,uuid,uuid,boolean) to authenticated;
