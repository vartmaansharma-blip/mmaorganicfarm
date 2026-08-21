-- End-to-end reliability fixes for routing and cancellation operations.

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

  if v_actor_role not in ('manager', 'admin') then
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

-- Repair future, unreleased rows whose customer profile has already been routed.
update public.daily_deliveries as delivery
set delivery_area_id = profile.delivery_area_id,
    delivery_route_id = profile.delivery_route_id,
    route_stop_order = profile.route_stop_order,
    assigned_driver_id = coalesce(
      (
        select daily_assignment.driver_id
        from public.daily_route_assignments as daily_assignment
        where daily_assignment.delivery_date = delivery.delivery_date
          and daily_assignment.route_id = profile.delivery_route_id
      ),
      (
        select default_assignment.driver_id
        from public.route_driver_assignments as default_assignment
        where default_assignment.route_id = profile.delivery_route_id
      )
    ),
    updated_at = now()
from public.customer_profiles as profile
where profile.user_id = delivery.user_id
  and profile.delivery_route_id is not null
  and delivery.delivery_date >= (now() at time zone 'Asia/Kolkata')::date
  and delivery.status in ('planned', 'ready', 'failed')
  and (
    delivery.delivery_area_id is distinct from profile.delivery_area_id
    or delivery.delivery_route_id is distinct from profile.delivery_route_id
    or delivery.route_stop_order is distinct from profile.route_stop_order
    or delivery.assigned_driver_id is null
  )
  and not exists (
    select 1
    from public.delivery_dispatches as dispatch
    where dispatch.delivery_date = delivery.delivery_date
      and dispatch.status = 'released'
  );

create or replace function private.resolve_cancellation_request_impl(
  p_request_id uuid,
  p_status text,
  p_note text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_clean_note text := nullif(trim(coalesce(p_note, '')), '');
  v_request public.cancellation_requests%rowtype;
begin
  if not exists (
    select 1
    from public.farm_staff
    where user_id = v_actor_id
      and active
      and role in ('manager', 'admin')
  ) then
    raise exception 'Manager access is required';
  end if;

  if p_status not in ('approved', 'declined', 'completed') then
    raise exception 'Choose a valid resolution';
  end if;

  if char_length(coalesce(v_clean_note, '')) > 500 then
    raise exception 'Keep the resolution note under 500 characters';
  end if;

  select * into v_request
  from public.cancellation_requests
  where id = p_request_id
  for update;

  if v_request.id is null then
    raise exception 'Cancellation request not found';
  end if;

  if v_request.status <> 'requested' then
    raise exception 'This request was already resolved';
  end if;

  update public.cancellation_requests
  set resolution_note = v_clean_note,
      resolved_at = now(),
      resolved_by = v_actor_id,
      status = p_status
  where id = v_request.id;

  if p_status = 'approved' then
    if v_request.plan_id is not null then
      update public.delivery_plans
      set status = 'cancelled', updated_at = now()
      where id = v_request.plan_id;

      update public.daily_deliveries as delivery
      set status = 'cancelled', updated_at = now()
      where delivery.plan_id = v_request.plan_id
        and delivery.delivery_date >= (now() at time zone 'Asia/Kolkata')::date
        and delivery.status in ('planned', 'ready', 'failed')
        and not exists (
          select 1
          from public.delivery_dispatches as dispatch
          where dispatch.delivery_date = delivery.delivery_date
            and dispatch.status = 'released'
        );
    end if;

    if v_request.order_id is not null then
      update public.orders
      set status = 'cancelled', updated_at = now()
      where id = v_request.order_id
        and status in ('draft', 'pending_payment');
    end if;
  end if;

  insert into public.customer_notifications (
    kind,
    message,
    order_id,
    title,
    user_id
  ) values (
    'cancellation_update',
    coalesce(v_clean_note, 'Your cancellation request was ' || p_status || '.'),
    v_request.order_id,
    'Cancellation ' || p_status,
    v_request.user_id
  );

  return p_status;
end;
$$;

revoke execute on function private.resolve_cancellation_request_impl(uuid, text, text)
from public, anon;
grant execute on function private.resolve_cancellation_request_impl(uuid, text, text)
to authenticated;

create or replace function public.resolve_cancellation_request(
  p_request_id uuid,
  p_status text,
  p_note text default null
)
returns text
language sql
set search_path = ''
as $$
  select private.resolve_cancellation_request_impl(p_request_id, p_status, p_note);
$$;

revoke execute on function public.resolve_cancellation_request(uuid, text, text)
from public, anon;
grant execute on function public.resolve_cancellation_request(uuid, text, text)
to authenticated;
