-- Treat multiple paid plan/order rows for one doorstep as one operational visit.

alter table public.daily_deliveries
add column if not exists visit_key text;

create or replace function private.delivery_visit_key(
  p_user_id uuid,
  p_delivery_date date,
  p_address text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select md5(
    coalesce(p_user_id::text, '') || '|' ||
    coalesce(p_delivery_date::text, '') || '|' ||
    regexp_replace(lower(trim(coalesce(p_address, ''))), '[^a-z0-9]+', ' ', 'g')
  );
$$;

revoke execute on function private.delivery_visit_key(uuid, date, text)
from public, anon, authenticated;

create or replace function private.set_delivery_visit_key()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.visit_key := private.delivery_visit_key(
    new.user_id,
    new.delivery_date,
    new.address_snapshot
  );
  return new;
end;
$$;

revoke execute on function private.set_delivery_visit_key()
from public, anon, authenticated;

drop trigger if exists set_delivery_visit_key
on public.daily_deliveries;

create trigger set_delivery_visit_key
before insert or update of user_id, delivery_date, address_snapshot
on public.daily_deliveries
for each row execute function private.set_delivery_visit_key();

update public.daily_deliveries
set visit_key = private.delivery_visit_key(user_id, delivery_date, address_snapshot)
where visit_key is null
   or visit_key is distinct from private.delivery_visit_key(user_id, delivery_date, address_snapshot);

alter table public.daily_deliveries
alter column visit_key set not null;

create index if not exists daily_deliveries_date_visit_idx
on public.daily_deliveries (delivery_date, visit_key);

create index if not exists daily_deliveries_driver_date_visit_idx
on public.daily_deliveries (assigned_driver_id, delivery_date, visit_key);

comment on column public.daily_deliveries.visit_key is
'Stable operational visit identity. Several paid plan/order rows can belong to one doorstep visit.';

create or replace function private.require_paid_order_for_active_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'active'
    and (tg_op = 'INSERT' or old.status is distinct from new.status)
    and not exists (
      select 1
      from public.orders as farm_order
      join public.payments as payment on payment.order_id = farm_order.id
      where farm_order.delivery_plan_id = new.id
        and farm_order.user_id = new.user_id
        and farm_order.status = 'paid'
        and not farm_order.is_test
        and payment.status = 'captured'
        and not payment.is_test
    )
  then
    raise exception 'A delivery plan can become active only after payment is captured';
  end if;
  return new;
end;
$$;

revoke execute on function private.require_paid_order_for_active_plan()
from public, anon, authenticated;

drop trigger if exists require_paid_order_for_active_plan
on public.delivery_plans;

create trigger require_paid_order_for_active_plan
before insert or update of status on public.delivery_plans
for each row execute function private.require_paid_order_for_active_plan();

drop function if exists public.record_delivery_visit(uuid[], boolean, boolean, text);
drop function if exists private.record_delivery_visit_impl(uuid[], boolean, boolean, text);

create or replace function private.record_delivery_visit_impl(
  p_delivery_ids uuid[],
  p_delivery_confirmed boolean,
  p_bottles_returned integer,
  p_driver_note text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_actor_role text;
  v_clean_note text := nullif(trim(p_driver_note), '');
  v_delivery record;
  v_expected integer := coalesce(array_length(p_delivery_ids, 1), 0);
  v_found integer;
  v_visit_count integer;
  v_bottles_expected integer;
  v_changed boolean := false;
  v_first_delivery_id uuid;
  v_first_order_id uuid;
  v_user_id uuid;
  v_new_delivered integer;
  v_new_status text;
begin
  if v_actor_id is null then
    raise exception 'Sign in is required';
  end if;

  if v_expected < 1 or v_expected > 50 or array_position(p_delivery_ids, null) is not null then
    raise exception 'Choose between 1 and 50 delivery rows';
  end if;

  if p_delivery_confirmed is null or p_bottles_returned is null then
    raise exception 'Delivery and bottle counts are required';
  end if;
  v_new_status := case when p_delivery_confirmed then 'delivered' else 'failed' end;

  if char_length(coalesce(v_clean_note, '')) > 250 then
    raise exception 'Driver note is too long';
  end if;

  select role into v_actor_role
  from public.farm_staff
  where user_id = v_actor_id and active;

  if v_actor_role not in ('driver', 'manager', 'admin') then
    raise exception 'Farm staff access required';
  end if;

  -- Lock every child row in a consistent order before validating or updating.
  perform 1
  from public.daily_deliveries
  where id = any(p_delivery_ids)
  order by id
  for update;

  select
    count(*),
    count(distinct visit_key),
    count(*) filter (where bottle_return_required and status <> 'cancelled'),
    (array_agg(id order by id) filter (where status <> 'cancelled'))[1],
    (array_agg(order_id order by id) filter (where order_id is not null and status <> 'cancelled'))[1],
    (array_agg(user_id order by id))[1]
  into
    v_found,
    v_visit_count,
    v_bottles_expected,
    v_first_delivery_id,
    v_first_order_id,
    v_user_id
  from public.daily_deliveries
  where id = any(p_delivery_ids);

  if v_found <> v_expected then
    raise exception 'One or more delivery rows could not be found';
  end if;

  if v_visit_count <> 1 then
    raise exception 'Only rows from one doorstep visit can be completed together';
  end if;

  if p_bottles_returned < 0 or p_bottles_returned > v_bottles_expected then
    raise exception 'Bottle returns must be between 0 and %', v_bottles_expected;
  end if;

  if v_actor_role = 'driver' and exists (
    select 1
    from public.daily_deliveries
    where id = any(p_delivery_ids)
      and assigned_driver_id is distinct from v_actor_id
  ) then
    raise exception 'This visit is not assigned to you';
  end if;

  if not p_delivery_confirmed and exists (
    select 1
    from public.daily_deliveries
    where id = any(p_delivery_ids)
      and (delivery_confirmed or status = 'delivered')
  ) then
    raise exception 'A completed visit cannot be reopened';
  end if;

  if not exists (
    select 1
    from public.daily_deliveries
    where id = any(p_delivery_ids)
      and status <> 'cancelled'
  ) then
    raise exception 'A cancelled visit cannot be completed';
  end if;

  for v_delivery in
    select
      delivery.*,
      exists (
        select 1 from public.daily_delivery_items as item
        where item.delivery_id = delivery.id and item.product_key = 'milk'
      ) as has_milk,
      row_number() over (
        partition by (delivery.bottle_return_required and delivery.status <> 'cancelled')
        order by delivery.id
      ) as bottle_number
    from public.daily_deliveries as delivery
    where delivery.id = any(p_delivery_ids)
    order by delivery.id
  loop
    if v_delivery.status = 'cancelled' then
      continue;
    end if;

    if v_delivery.status is distinct from v_new_status then
      v_changed := true;
    end if;

    update public.daily_deliveries
    set status = v_new_status,
        delivery_confirmed = p_delivery_confirmed,
        bottle_returned = case
          when v_delivery.bottle_return_required
            then v_delivery.bottle_number <= p_bottles_returned
          else false
        end,
        delivered_confirmed_at = case
          when p_delivery_confirmed then coalesce(delivered_confirmed_at, now())
          else null
        end,
        bottle_returned_at = case
          when v_delivery.bottle_return_required
            and v_delivery.bottle_number <= p_bottles_returned
            then coalesce(bottle_returned_at, now())
          else null
        end,
        checked_by = v_actor_id,
        driver_note = v_clean_note,
        completed_at = now(),
        updated_at = now()
    where id = v_delivery.id;

    if p_delivery_confirmed
      and v_delivery.status <> 'delivered'
      and v_delivery.plan_id is not null
      and v_delivery.has_milk
    then
      update public.delivery_plans
      set delivered_deliveries = least(purchased_deliveries, delivered_deliveries + 1),
          updated_at = now()
      where id = v_delivery.plan_id
      returning delivered_deliveries into v_new_delivered;

      update public.delivery_plans
      set status = 'completed', updated_at = now()
      where id = v_delivery.plan_id
        and v_new_delivered >= purchased_deliveries;
    end if;
  end loop;

  if v_changed then
    insert into public.customer_notifications (
      user_id, kind, title, message, order_id, delivery_id
    ) values (
      v_user_id,
      case when p_delivery_confirmed then 'delivery_completed' else 'delivery_failed' end,
      case when p_delivery_confirmed then 'Delivery completed' else 'Delivery needs attention' end,
      case
        when p_delivery_confirmed then 'Your farm delivery was marked delivered.'
        else 'The farm could not complete this visit. No milk credit was used.'
      end,
      v_first_order_id,
      v_first_delivery_id
    );
  end if;

  return 1;
end;
$$;

revoke execute on function private.record_delivery_visit_impl(uuid[], boolean, integer, text)
from public, anon;
grant execute on function private.record_delivery_visit_impl(uuid[], boolean, integer, text)
to authenticated;

create or replace function public.record_delivery_visit(
  p_delivery_ids uuid[],
  p_delivery_confirmed boolean,
  p_bottles_returned integer,
  p_driver_note text default null
)
returns integer
language sql
security invoker
set search_path = ''
as $$
  select private.record_delivery_visit_impl(
    p_delivery_ids,
    p_delivery_confirmed,
    p_bottles_returned,
    p_driver_note
  );
$$;

revoke execute on function public.record_delivery_visit(uuid[], boolean, integer, text)
from public, anon;
grant execute on function public.record_delivery_visit(uuid[], boolean, integer, text)
to authenticated;

create or replace function public.release_daily_dispatch(p_delivery_date date)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_released integer := 0;
begin
  if p_delivery_date is null then
    raise exception 'Delivery date is required';
  end if;

  if not exists (
    select 1 from public.farm_staff
    where farm_staff.user_id = v_actor_id
      and farm_staff.active
      and farm_staff.role in ('manager', 'admin')
  ) then
    raise exception 'Farm manager access required';
  end if;

  if not exists (
    select 1 from public.daily_deliveries
    where delivery_date = p_delivery_date and not is_test and status <> 'cancelled'
  ) then
    raise exception 'Prepare the delivery sheet before releasing routes';
  end if;

  if exists (
    select 1 from public.daily_deliveries
    where delivery_date = p_delivery_date and not is_test and status <> 'cancelled'
      and delivery_route_id is null
  ) then
    raise exception 'Every visit must have a route before release';
  end if;

  if exists (
    select 1 from public.daily_deliveries
    where delivery_date = p_delivery_date and not is_test and status <> 'cancelled'
      and assigned_driver_id is null
  ) then
    raise exception 'Every route must have a driver before release';
  end if;

  if exists (
    select 1 from public.daily_deliveries
    where delivery_date = p_delivery_date and not is_test and status <> 'cancelled'
      and nullif(trim(coalesce(address_snapshot, '')), '') is null
  ) then
    raise exception 'Every visit must have an address before release';
  end if;

  if exists (
    select 1
    from public.daily_deliveries as delivery
    join public.delivery_routes as route on route.id = delivery.delivery_route_id
    where delivery.delivery_date = p_delivery_date
      and not delivery.is_test
      and delivery.status <> 'cancelled'
    group by route.id, route.name, route.stop_capacity
    having count(distinct delivery.visit_key) > route.stop_capacity
  ) then
    raise exception 'A route exceeds its visit capacity. Reassign visits before release';
  end if;

  update public.daily_deliveries
  set status = 'ready', updated_at = now()
  where delivery_date = p_delivery_date and not is_test and status = 'planned';

  select count(distinct visit_key)
  into v_released
  from public.daily_deliveries
  where delivery_date = p_delivery_date and not is_test and status <> 'cancelled';

  update public.delivery_dispatches
  set status = 'released', released_by = v_actor_id, released_at = now(), updated_at = now()
  where delivery_date = p_delivery_date;

  if not found then
    raise exception 'Prepare the dispatch before releasing it';
  end if;

  return v_released;
end;
$$;

revoke execute on function public.release_daily_dispatch(date)
from public, anon;
grant execute on function public.release_daily_dispatch(date)
to authenticated;

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
    or (v_actor_id <> p_user_id and v_actor_role not in ('manager', 'admin'))
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

revoke execute on function private.refresh_customer_route_impl(uuid, boolean)
from public, anon;
grant execute on function private.refresh_customer_route_impl(uuid, boolean)
to authenticated;

create or replace function public.refresh_customer_route(
  p_user_id uuid,
  p_force_reroute boolean default false
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.refresh_customer_route_impl(p_user_id, p_force_reroute);
$$;

revoke execute on function public.refresh_customer_route(uuid, boolean)
from public, anon;
grant execute on function public.refresh_customer_route(uuid, boolean)
to authenticated;

create or replace function public.sync_route_default_driver(p_route_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_driver_id uuid;
  v_updated integer := 0;
begin
  if not exists (
    select 1 from public.farm_staff
    where user_id = v_actor_id and active and role in ('manager', 'admin')
  ) then
    raise exception 'Farm manager access required';
  end if;

  select driver_id into v_driver_id
  from public.route_driver_assignments
  where route_id = p_route_id;

  if v_driver_id is null then
    raise exception 'Assign a default driver first';
  end if;

  update public.daily_route_assignments
  set driver_id = v_driver_id, updated_by = v_actor_id, updated_at = now()
  where route_id = p_route_id
    and delivery_date >= (now() at time zone 'Asia/Kolkata')::date
    and source = 'default';

  update public.daily_deliveries as delivery
  set assigned_driver_id = coalesce(
        (
          select assignment.driver_id
          from public.daily_route_assignments as assignment
          where assignment.delivery_date = delivery.delivery_date
            and assignment.route_id = p_route_id
        ),
        v_driver_id
      ),
      updated_at = now()
  where delivery.delivery_route_id = p_route_id
    and delivery.delivery_date >= (now() at time zone 'Asia/Kolkata')::date
    and delivery.status in ('planned', 'ready', 'failed')
    and not exists (
      select 1 from public.delivery_dispatches as dispatch
      where dispatch.delivery_date = delivery.delivery_date
        and dispatch.status = 'released'
    );

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke execute on function public.sync_route_default_driver(uuid)
from public, anon;
grant execute on function public.sync_route_default_driver(uuid)
to authenticated;
