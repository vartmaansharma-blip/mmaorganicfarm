-- Route workbench: move a doorstep visit without changing the page URL,
-- and retire a route only after its customers are safely moved.

create or replace function private.renumber_daily_route_visits_impl(
  p_delivery_date date,
  p_route_id uuid,
  p_pinned_visit_key text default null,
  p_pinned_position integer default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_pinned_visit_key is null then
    with visits as (
      select delivery.visit_key,
             row_number() over (
               order by coalesce(min(delivery.route_stop_order), 2147483647), delivery.visit_key
             )::integer as stop_order
      from public.daily_deliveries as delivery
      where delivery.delivery_date = p_delivery_date
        and delivery.delivery_route_id = p_route_id
        and not delivery.is_test
        and delivery.status <> 'cancelled'
      group by delivery.visit_key
    )
    update public.daily_deliveries as delivery
    set route_stop_order = visits.stop_order,
        updated_at = now()
    from visits
    where delivery.delivery_date = p_delivery_date
      and delivery.delivery_route_id = p_route_id
      and delivery.visit_key = visits.visit_key
      and not delivery.is_test;
  else
    with existing as (
      select delivery.visit_key,
             row_number() over (
               order by coalesce(min(delivery.route_stop_order), 2147483647), delivery.visit_key
             )::integer as existing_position
      from public.daily_deliveries as delivery
      where delivery.delivery_date = p_delivery_date
        and delivery.delivery_route_id = p_route_id
        and not delivery.is_test
        and delivery.status <> 'cancelled'
        and delivery.visit_key <> p_pinned_visit_key
      group by delivery.visit_key
    ), positions as (
      select visit_key,
             case when existing_position >= p_pinned_position then existing_position + 1 else existing_position end as stop_order
      from existing
      union all
      select p_pinned_visit_key, p_pinned_position
    )
    update public.daily_deliveries as delivery
    set route_stop_order = positions.stop_order,
        updated_at = now()
    from positions
    where delivery.delivery_date = p_delivery_date
      and delivery.delivery_route_id = p_route_id
      and delivery.visit_key = positions.visit_key
      and not delivery.is_test;
  end if;
end;
$$;

revoke execute on function private.renumber_daily_route_visits_impl(date, uuid, text, integer)
from public, anon;
grant execute on function private.renumber_daily_route_visits_impl(date, uuid, text, integer)
to authenticated;

create or replace function private.move_delivery_visit_impl(
  p_delivery_date date,
  p_visit_key text,
  p_route_id uuid,
  p_position integer,
  p_apply_to_customer boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_route public.delivery_routes%rowtype;
  v_old_route_id uuid;
  v_user_id uuid;
  v_driver_id uuid;
  v_existing_stops integer;
  v_position integer;
begin
  if not exists (
    select 1 from public.farm_staff
    where user_id = v_actor_id and active and role in ('manager', 'admin')
  ) then
    raise exception 'Manager access is required';
  end if;

  if p_delivery_date is null or nullif(trim(coalesce(p_visit_key, '')), '') is null then
    raise exception 'Choose a delivery date and doorstep visit';
  end if;

  if p_position is null or p_position < 1 or p_position > 999 then
    raise exception 'Stop position must be between 1 and 999';
  end if;

  if exists (
    select 1 from public.delivery_dispatches
    where delivery_date = p_delivery_date and status = 'released'
  ) then
    raise exception 'Reopen this dispatch before changing its route order';
  end if;

  select delivery.delivery_route_id, delivery.user_id
  into v_old_route_id, v_user_id
  from public.daily_deliveries as delivery
  where delivery.delivery_date = p_delivery_date
    and delivery.visit_key = p_visit_key
    and not delivery.is_test
    and delivery.status <> 'cancelled'
  order by delivery.generated_at, delivery.id
  limit 1
  for update;

  if v_user_id is null then
    raise exception 'This doorstep visit is not available to move';
  end if;

  if exists (
    select 1 from public.daily_deliveries as delivery
    where delivery.delivery_date = p_delivery_date
      and delivery.visit_key = p_visit_key
      and not delivery.is_test
      and delivery.status in ('out_for_delivery', 'delivered')
  ) then
    raise exception 'A started or delivered visit cannot be moved';
  end if;

  select * into v_route
  from public.delivery_routes
  where id = p_route_id and active
  for update;

  if v_route.id is null then
    raise exception 'Choose an active delivery route';
  end if;

  select count(distinct delivery.visit_key)::integer into v_existing_stops
  from public.daily_deliveries as delivery
  where delivery.delivery_date = p_delivery_date
    and delivery.delivery_route_id = p_route_id
    and delivery.visit_key <> p_visit_key
    and not delivery.is_test
    and delivery.status <> 'cancelled';

  if v_existing_stops + 1 > v_route.stop_capacity then
    raise exception 'That route is already at its stop limit';
  end if;

  v_position := least(p_position, v_existing_stops + 1);
  select coalesce(
    (
      select assignment.driver_id
      from public.daily_route_assignments as assignment
      where assignment.delivery_date = p_delivery_date and assignment.route_id = p_route_id
    ),
    (
      select assignment.driver_id
      from public.route_driver_assignments as assignment
      where assignment.route_id = p_route_id
    )
  ) into v_driver_id;

  update public.daily_deliveries as delivery
  set delivery_area_id = v_route.area_id,
      delivery_route_id = p_route_id,
      route_stop_order = v_position,
      assigned_driver_id = v_driver_id,
      updated_at = now()
  where delivery.delivery_date = p_delivery_date
    and delivery.visit_key = p_visit_key
    and not delivery.is_test
    and delivery.status not in ('out_for_delivery', 'delivered');

  perform private.renumber_daily_route_visits_impl(
    p_delivery_date,
    p_route_id,
    p_visit_key,
    v_position
  );
  if v_old_route_id is not null and v_old_route_id <> p_route_id then
    perform private.renumber_daily_route_visits_impl(p_delivery_date, v_old_route_id);
  end if;

  if p_apply_to_customer then
    update public.customer_profiles
    set delivery_area_id = v_route.area_id,
        delivery_route_id = p_route_id,
        route_stop_order = v_position,
        updated_at = now()
    where user_id = v_user_id;

    update public.daily_deliveries as delivery
    set delivery_area_id = v_route.area_id,
        delivery_route_id = p_route_id,
        route_stop_order = v_position,
        assigned_driver_id = coalesce(
          (
            select assignment.driver_id
            from public.daily_route_assignments as assignment
            where assignment.delivery_date = delivery.delivery_date
              and assignment.route_id = p_route_id
          ),
          (
            select assignment.driver_id
            from public.route_driver_assignments as assignment
            where assignment.route_id = p_route_id
          )
        ),
        updated_at = now()
    where delivery.user_id = v_user_id
      and delivery.delivery_date >= (now() at time zone 'Asia/Kolkata')::date
      and not delivery.is_test
      and delivery.status in ('planned', 'ready', 'failed')
      and not exists (
        select 1 from public.delivery_dispatches as dispatch
        where dispatch.delivery_date = delivery.delivery_date and dispatch.status = 'released'
      );
  end if;

  return jsonb_build_object(
    'route_id', p_route_id,
    'stop_position', v_position,
    'saved_as_customer_default', p_apply_to_customer,
    'visit_key', p_visit_key
  );
end;
$$;

revoke execute on function private.move_delivery_visit_impl(date, text, uuid, integer, boolean)
from public, anon;
grant execute on function private.move_delivery_visit_impl(date, text, uuid, integer, boolean)
to authenticated;

create or replace function public.move_delivery_visit(
  p_delivery_date date,
  p_visit_key text,
  p_route_id uuid,
  p_position integer,
  p_apply_to_customer boolean default false
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.move_delivery_visit_impl(
    p_delivery_date,
    p_visit_key,
    p_route_id,
    p_position,
    p_apply_to_customer
  );
$$;

revoke execute on function public.move_delivery_visit(date, text, uuid, integer, boolean)
from public, anon;
grant execute on function public.move_delivery_visit(date, text, uuid, integer, boolean)
to authenticated;

create or replace function private.retire_delivery_route_impl(
  p_route_id uuid,
  p_replacement_route_id uuid,
  p_reason text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_route public.delivery_routes%rowtype;
  v_replacement public.delivery_routes%rowtype;
  v_customer_count integer;
  v_updated integer := 0;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if not exists (
    select 1 from public.farm_staff
    where user_id = v_actor_id and active and role in ('manager', 'admin')
  ) then
    raise exception 'Manager access is required';
  end if;

  if v_reason is null or char_length(v_reason) < 3 or char_length(v_reason) > 300 then
    raise exception 'Enter a short reason for closing this route';
  end if;

  if p_route_id is null or p_replacement_route_id is null or p_route_id = p_replacement_route_id then
    raise exception 'Choose a different active replacement route';
  end if;

  select * into v_route from public.delivery_routes where id = p_route_id and active for update;
  select * into v_replacement from public.delivery_routes where id = p_replacement_route_id and active for update;
  if v_route.id is null or v_replacement.id is null then
    raise exception 'Both routes must be active';
  end if;

  if exists (
    select 1
    from public.daily_deliveries as delivery
    join public.delivery_dispatches as dispatch on dispatch.delivery_date = delivery.delivery_date
    where delivery.delivery_route_id = p_route_id
      and delivery.delivery_date >= (now() at time zone 'Asia/Kolkata')::date
      and delivery.status <> 'cancelled'
      and dispatch.status = 'released'
  ) then
    raise exception 'Reopen the released dispatch before closing this route';
  end if;

  select count(*)::integer into v_customer_count
  from public.customer_profiles
  where delivery_route_id = p_route_id;

  with moved as (
    select profile.user_id,
           row_number() over (
             order by coalesce(profile.route_stop_order, 2147483647), profile.full_name, profile.user_id
           )::integer as move_order
    from public.customer_profiles as profile
    where profile.delivery_route_id = p_route_id
  ), base as (
    select coalesce(max(profile.route_stop_order), 0)::integer as stop_order
    from public.customer_profiles as profile
    where profile.delivery_route_id = p_replacement_route_id
  )
  update public.customer_profiles as profile
  set delivery_area_id = v_replacement.area_id,
      delivery_route_id = p_replacement_route_id,
      route_stop_order = base.stop_order + moved.move_order,
      updated_at = now()
  from moved cross join base
  where profile.user_id = moved.user_id;

  update public.daily_deliveries as delivery
  set delivery_area_id = v_replacement.area_id,
      delivery_route_id = p_replacement_route_id,
      route_stop_order = profile.route_stop_order,
      assigned_driver_id = coalesce(
        (
          select assignment.driver_id
          from public.daily_route_assignments as assignment
          where assignment.delivery_date = delivery.delivery_date
            and assignment.route_id = p_replacement_route_id
        ),
        (
          select assignment.driver_id
          from public.route_driver_assignments as assignment
          where assignment.route_id = p_replacement_route_id
        )
      ),
      updated_at = now()
  from public.customer_profiles as profile
  where delivery.user_id = profile.user_id
    and delivery.delivery_route_id = p_route_id
    and delivery.delivery_date >= (now() at time zone 'Asia/Kolkata')::date
    and not delivery.is_test
    and delivery.status in ('planned', 'ready', 'failed')
    and not exists (
      select 1 from public.delivery_dispatches as dispatch
      where dispatch.delivery_date = delivery.delivery_date and dispatch.status = 'released'
    );
  get diagnostics v_updated = row_count;

  update public.delivery_routes
  set active = false,
      updated_at = now()
  where id = p_route_id;

  return greatest(v_customer_count, v_updated);
end;
$$;

revoke execute on function private.retire_delivery_route_impl(uuid, uuid, text)
from public, anon;
grant execute on function private.retire_delivery_route_impl(uuid, uuid, text)
to authenticated;

create or replace function public.retire_delivery_route(
  p_route_id uuid,
  p_replacement_route_id uuid,
  p_reason text
)
returns integer
language sql
security invoker
set search_path = ''
as $$
  select private.retire_delivery_route_impl(p_route_id, p_replacement_route_id, p_reason);
$$;

revoke execute on function public.retire_delivery_route(uuid, uuid, text)
from public, anon;
grant execute on function public.retire_delivery_route(uuid, uuid, text)
to authenticated;
