-- Extend production controls from milk to every capacity-limited farm product.
alter table public.production_capacity
drop constraint if exists production_capacity_product_key_check;

alter table public.production_capacity
add constraint production_capacity_product_key_check
check (product_key in ('milk', 'paneer', 'ghee'));

insert into public.production_capacity (product_key, daily_limit)
values
  ('paneer', 0),
  ('ghee', 0)
on conflict (product_key) do nothing;

comment on table public.production_capacity is
'Daily online order limits. Milk is measured in litres; paneer and ghee are measured in 500 g packs.';

update public.weekly_delivery_items
set unit = '500 g'
where product_key in ('paneer', 'ghee')
  and unit <> '500 g';

update public.scheduled_delivery_items
set unit = '500 g'
where product_key in ('paneer', 'ghee')
  and unit <> '500 g';

create or replace function public.normalize_capacity_product_unit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.product_key in ('paneer', 'ghee') then
    new.unit := '500 g';
  end if;
  return new;
end;
$$;

drop trigger if exists normalize_weekly_capacity_product_unit
on public.weekly_delivery_items;
create trigger normalize_weekly_capacity_product_unit
before insert or update of product_key, unit
on public.weekly_delivery_items
for each row execute function public.normalize_capacity_product_unit();

drop trigger if exists normalize_scheduled_capacity_product_unit
on public.scheduled_delivery_items;
create trigger normalize_scheduled_capacity_product_unit
before insert or update of product_key, unit
on public.scheduled_delivery_items
for each row execute function public.normalize_capacity_product_unit();

revoke execute on function public.normalize_capacity_product_unit()
from public, anon, authenticated;

create or replace function public.plan_product_quantity(
  p_plan_id uuid,
  p_product_key text,
  p_delivery_date date
)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    case
      when exception.action = 'skip' then 0
      when exception.action = 'override' then exception.quantity
      when scheduled.quantity is not null then scheduled.quantity
      else weekly.quantity
    end,
    0
  )
  from (select 1) as anchor
  left join public.weekly_delivery_items as weekly
    on weekly.plan_id = p_plan_id
    and weekly.product_key = p_product_key
    and weekly.day_of_week = extract(isodow from p_delivery_date)::smallint
  left join public.scheduled_delivery_items as scheduled
    on scheduled.plan_id = p_plan_id
    and scheduled.product_key = p_product_key
    and scheduled.delivery_date = p_delivery_date
  left join public.delivery_exceptions as exception
    on exception.plan_id = p_plan_id
    and exception.product_key = p_product_key
    and exception.delivery_date = p_delivery_date;
$$;

revoke execute on function public.plan_product_quantity(uuid, text, date)
from public, anon, authenticated;
grant execute on function public.plan_product_quantity(uuid, text, date)
to service_role;

create or replace function public.reserve_order_capacity(
  p_order_id uuid,
  p_hold_hours integer default 24
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order record;
  v_product_key text;
  v_delivery_date date;
  v_quantity numeric(8, 2);
  v_daily_limit numeric(8, 2);
  v_active_plans numeric(8, 2);
  v_paid_once numeric(8, 2);
  v_pending_holds numeric(8, 2);
  v_reserved_dates integer := 0;
  v_offset integer;
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_hold_hours < 1 or p_hold_hours > 48 then
    raise exception 'Capacity hold must be between 1 and 48 hours';
  end if;

  select id, delivery_plan_id, purchase_mode, start_date, status
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if v_order.id is null then
    raise exception 'Order not found';
  end if;

  if v_order.status not in ('draft', 'pending_payment') then
    raise exception 'This order cannot reserve production capacity';
  end if;

  if v_order.start_date is null then
    raise exception 'A delivery start date is required';
  end if;

  if v_order.purchase_mode = 'plan' and v_order.delivery_plan_id is null then
    raise exception 'A delivery plan is required';
  end if;

  -- Lock every tracked product in a fixed order so two checkouts cannot oversell.
  for v_product_key in
    select capacity.product_key
    from public.production_capacity as capacity
    where capacity.product_key in ('milk', 'paneer', 'ghee')
    order by capacity.product_key
  loop
    perform 1
    from public.production_capacity
    where product_key = v_product_key
    for update;
  end loop;

  update public.order_capacity_reservations
  set status = 'released', expires_at = null, updated_at = now()
  where status = 'pending'
    and expires_at <= now();

  update public.order_capacity_reservations
  set status = 'released', expires_at = null, updated_at = now()
  where order_id = p_order_id
    and status = 'pending';

  for v_product_key in
    select capacity.product_key
    from public.production_capacity as capacity
    where capacity.product_key in ('milk', 'paneer', 'ghee')
    order by capacity.product_key
  loop
    for v_offset in 0..(case when v_order.purchase_mode = 'plan' then 6 else 0 end)
    loop
      v_delivery_date := v_order.start_date + v_offset;

      if v_order.purchase_mode = 'plan' then
        v_quantity := public.plan_product_quantity(
          v_order.delivery_plan_id,
          v_product_key,
          v_delivery_date
        );
      else
        select coalesce(sum(item.quantity), 0)
        into v_quantity
        from public.order_items as item
        where item.order_id = p_order_id
          and item.product_key = v_product_key
          and item.frequency = 'once'
          and coalesce(item.delivery_date, v_order.start_date) = v_delivery_date;
      end if;

      if v_quantity <= 0 then
        continue;
      end if;

      select coalesce(override.daily_limit, capacity.daily_limit)
      into v_daily_limit
      from public.production_capacity as capacity
      left join public.production_capacity_overrides as override
        on override.product_key = capacity.product_key
        and override.delivery_date = v_delivery_date
      where capacity.product_key = v_product_key;

      select coalesce(sum(public.plan_product_quantity(
        plan.id,
        v_product_key,
        v_delivery_date
      )), 0)
      into v_active_plans
      from public.delivery_plans as plan
      where plan.status = 'active'
        and plan.start_date <= v_delivery_date
        and plan.delivered_deliveries < plan.purchased_deliveries
        and plan.id is distinct from v_order.delivery_plan_id
        and not exists (
          select 1
          from public.delivery_pauses as pause
          where pause.plan_id = plan.id
            and v_delivery_date between pause.start_date and pause.end_date
        );

      select coalesce(sum(item.quantity), 0)
      into v_paid_once
      from public.orders as paid_order
      join public.order_items as item on item.order_id = paid_order.id
      where paid_order.status = 'paid'
        and paid_order.purchase_mode = 'once'
        and paid_order.id <> p_order_id
        and item.product_key = v_product_key
        and item.frequency = 'once'
        and coalesce(item.delivery_date, paid_order.start_date) = v_delivery_date;

      select coalesce(sum(reservation.quantity), 0)
      into v_pending_holds
      from public.order_capacity_reservations as reservation
      where reservation.product_key = v_product_key
        and reservation.delivery_date = v_delivery_date
        and reservation.order_id <> p_order_id
        and reservation.status = 'pending'
        and reservation.expires_at > now();

      if v_active_plans + v_paid_once + v_pending_holds + v_quantity > v_daily_limit then
        raise exception '% capacity is full for %. Choose another delivery date.',
          initcap(v_product_key),
          to_char(v_delivery_date, 'FMDay, FMDD FMMonth');
      end if;

      insert into public.order_capacity_reservations (
        order_id,
        product_key,
        delivery_date,
        quantity,
        status,
        expires_at
      )
      values (
        p_order_id,
        v_product_key,
        v_delivery_date,
        v_quantity,
        'pending',
        now() + make_interval(hours => p_hold_hours)
      )
      on conflict (order_id, product_key, delivery_date)
      do update set
        quantity = excluded.quantity,
        status = 'pending',
        expires_at = excluded.expires_at,
        updated_at = now();

      v_reserved_dates := v_reserved_dates + 1;
    end loop;
  end loop;

  return jsonb_build_object(
    'reserved', true,
    'reserved_product_dates', v_reserved_dates,
    'expires_at', now() + make_interval(hours => p_hold_hours)
  );
end;
$$;

revoke execute on function public.reserve_order_capacity(uuid, integer)
from public, anon, authenticated;
grant execute on function public.reserve_order_capacity(uuid, integer)
to service_role;

create or replace function public.product_capacity_snapshot(
  p_product_key text,
  p_start_date date,
  p_days integer default 7
)
returns table (
  delivery_date date,
  capacity_limit numeric,
  active_plan_quantity numeric,
  paid_once_quantity numeric,
  checkout_holds_quantity numeric,
  available_quantity numeric
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_product_key not in ('milk', 'paneer', 'ghee') then
    raise exception 'Unsupported capacity product';
  end if;

  if p_days < 1 or p_days > 31 then
    raise exception 'Capacity view must cover between 1 and 31 days';
  end if;

  return query
  with dates as (
    select generate_series(
      p_start_date,
      p_start_date + (p_days - 1),
      interval '1 day'
    )::date as day
  ),
  usage as (
    select
      dates.day,
      (
        select coalesce(sum(public.plan_product_quantity(
          plan.id,
          p_product_key,
          dates.day
        )), 0)
        from public.delivery_plans as plan
        where plan.status = 'active'
          and plan.start_date <= dates.day
          and plan.delivered_deliveries < plan.purchased_deliveries
          and not exists (
            select 1
            from public.delivery_pauses as pause
            where pause.plan_id = plan.id
              and dates.day between pause.start_date and pause.end_date
          )
      ) as active_plans,
      (
        select coalesce(sum(item.quantity), 0)
        from public.orders as paid_order
        join public.order_items as item on item.order_id = paid_order.id
        where paid_order.status = 'paid'
          and paid_order.purchase_mode = 'once'
          and item.product_key = p_product_key
          and item.frequency = 'once'
          and coalesce(item.delivery_date, paid_order.start_date) = dates.day
      ) as paid_once,
      (
        select coalesce(sum(reservation.quantity), 0)
        from public.order_capacity_reservations as reservation
        where reservation.product_key = p_product_key
          and reservation.delivery_date = dates.day
          and reservation.status = 'pending'
          and reservation.expires_at > now()
      ) as checkout_holds
    from dates
  )
  select
    usage.day,
    coalesce(override.daily_limit, capacity.daily_limit),
    usage.active_plans,
    usage.paid_once,
    usage.checkout_holds,
    greatest(
      coalesce(override.daily_limit, capacity.daily_limit)
        - usage.active_plans
        - usage.paid_once
        - usage.checkout_holds,
      0
    )
  from usage
  cross join public.production_capacity as capacity
  left join public.production_capacity_overrides as override
    on override.product_key = capacity.product_key
    and override.delivery_date = usage.day
  where capacity.product_key = p_product_key
  order by usage.day;
end;
$$;

revoke execute on function public.product_capacity_snapshot(text, date, integer)
from public, anon, authenticated;
grant execute on function public.product_capacity_snapshot(text, date, integer)
to service_role;
