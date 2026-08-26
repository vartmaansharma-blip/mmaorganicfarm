alter table public.delivery_routes
  add column if not exists retired_at timestamptz,
  add column if not exists retired_by uuid references auth.users (id) on delete set null,
  add column if not exists retirement_reason text,
  add column if not exists replacement_route_id uuid references public.delivery_routes (id) on delete set null;

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
      replacement_route_id = p_replacement_route_id,
      retired_at = now(),
      retired_by = v_actor_id,
      retirement_reason = v_reason,
      updated_at = now()
  where id = p_route_id;

  return greatest(v_customer_count, v_updated);
end;
$$;
