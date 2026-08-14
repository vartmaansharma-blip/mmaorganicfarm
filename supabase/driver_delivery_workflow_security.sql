-- Keep the privileged delivery mutation outside the exposed API schema.
create schema if not exists private;

revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create index if not exists daily_deliveries_checked_by_idx
on public.daily_deliveries (checked_by);

create index if not exists route_driver_assignments_updated_by_idx
on public.route_driver_assignments (updated_by);

create or replace function private.record_delivery_stop_impl(
  p_delivery_id uuid,
  p_delivery_confirmed boolean,
  p_bottle_returned boolean,
  p_driver_note text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_actor_role text;
  v_delivery public.daily_deliveries%rowtype;
  v_has_milk boolean := false;
  v_new_delivered integer;
  v_new_status text;
  v_clean_note text := nullif(trim(p_driver_note), '');
begin
  if v_actor_id is null then
    raise exception 'Sign in is required';
  end if;

  if p_delivery_confirmed is null or p_bottle_returned is null then
    raise exception 'Both doorstep checks are required';
  end if;

  if char_length(coalesce(v_clean_note, '')) > 250 then
    raise exception 'Driver note is too long';
  end if;

  select farm_staff.role
  into v_actor_role
  from public.farm_staff
  where farm_staff.user_id = v_actor_id
    and farm_staff.active;

  if v_actor_role is null then
    raise exception 'Farm staff access required';
  end if;

  select *
  into v_delivery
  from public.daily_deliveries
  where id = p_delivery_id
  for update;

  if v_delivery.id is null then
    raise exception 'Delivery not found';
  end if;

  if v_actor_role = 'driver' and v_delivery.assigned_driver_id is distinct from v_actor_id then
    raise exception 'This stop is not assigned to you';
  end if;

  if v_actor_role not in ('driver', 'manager', 'admin') then
    raise exception 'Farm staff access required';
  end if;

  if v_delivery.status = 'cancelled' then
    raise exception 'A cancelled stop cannot be completed';
  end if;

  if v_delivery.status = 'delivered' and not p_delivery_confirmed then
    raise exception 'A completed delivery cannot be reopened';
  end if;

  v_new_status := case when p_delivery_confirmed then 'delivered' else 'failed' end;

  select exists (
    select 1
    from public.daily_delivery_items
    where delivery_id = v_delivery.id
      and product_key = 'milk'
  ) into v_has_milk;

  update public.daily_deliveries
  set status = v_new_status,
      delivery_confirmed = p_delivery_confirmed,
      bottle_returned = case
        when bottle_return_required then p_bottle_returned
        else false
      end,
      delivered_confirmed_at = case
        when p_delivery_confirmed then coalesce(delivered_confirmed_at, now())
        else null
      end,
      bottle_returned_at = case
        when bottle_return_required and p_bottle_returned then coalesce(bottle_returned_at, now())
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
    and v_has_milk
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

  if v_delivery.status is distinct from v_new_status then
    insert into public.customer_notifications (
      user_id, kind, title, message, order_id, delivery_id
    ) values (
      v_delivery.user_id,
      case when p_delivery_confirmed then 'delivery_completed' else 'delivery_failed' end,
      case when p_delivery_confirmed then 'Delivery completed' else 'Delivery needs attention' end,
      case
        when p_delivery_confirmed then 'Your scheduled farm delivery was marked delivered.'
        else 'The farm could not complete this delivery. No milk credit was used.'
      end,
      v_delivery.order_id,
      v_delivery.id
    );
  end if;

  return v_new_status;
end;
$$;

revoke execute on function private.record_delivery_stop_impl(uuid, boolean, boolean, text)
from public, anon;
grant execute on function private.record_delivery_stop_impl(uuid, boolean, boolean, text)
to authenticated;

create or replace function public.record_delivery_stop(
  p_delivery_id uuid,
  p_delivery_confirmed boolean,
  p_bottle_returned boolean,
  p_driver_note text default null
)
returns text
language sql
security invoker
set search_path = ''
as $$
  select private.record_delivery_stop_impl(
    p_delivery_id,
    p_delivery_confirmed,
    p_bottle_returned,
    p_driver_note
  );
$$;

revoke execute on function public.record_delivery_stop(uuid, boolean, boolean, text)
from public, anon;
grant execute on function public.record_delivery_stop(uuid, boolean, boolean, text)
to authenticated;
