-- Daily production capacity and atomic pre-payment reservations.
create table if not exists public.production_capacity (
  product_key text primary key check (product_key in ('milk')),
  daily_limit numeric(8, 2) not null check (daily_limit >= 0),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.production_capacity_overrides (
  product_key text not null references public.production_capacity (product_key) on delete cascade,
  delivery_date date not null,
  daily_limit numeric(8, 2) not null check (daily_limit >= 0),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (product_key, delivery_date)
);

create table if not exists public.order_capacity_reservations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_key text not null references public.production_capacity (product_key) on delete cascade,
  delivery_date date not null,
  quantity numeric(8, 2) not null check (quantity > 0),
  status text not null default 'pending'
    check (status in ('pending', 'consumed', 'released')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, product_key, delivery_date),
  check (
    (status = 'pending' and expires_at is not null)
    or (status in ('consumed', 'released'))
  )
);

create index if not exists order_capacity_reservations_date_status_idx
on public.order_capacity_reservations (product_key, delivery_date, status, expires_at);

create index if not exists production_capacity_updated_by_idx
on public.production_capacity (updated_by);

create index if not exists production_capacity_overrides_updated_by_idx
on public.production_capacity_overrides (updated_by);

insert into public.production_capacity (product_key, daily_limit)
values ('milk', 1000)
on conflict (product_key) do nothing;

comment on table public.production_capacity is
'The quantity the farm can accept online each day. The initial milk limit is based on the current 1,000 L daily production claim and can be changed by farm managers.';

comment on table public.order_capacity_reservations is
'Temporary checkout holds. Paid orders and active plans become the source of truth after a hold is consumed.';

alter table public.production_capacity enable row level security;
alter table public.production_capacity_overrides enable row level security;
alter table public.order_capacity_reservations enable row level security;

revoke all on public.production_capacity from anon, authenticated;
revoke all on public.production_capacity_overrides from anon, authenticated;
revoke all on public.order_capacity_reservations from anon, authenticated;

grant select, update on public.production_capacity to authenticated;
grant select, insert, update, delete on public.production_capacity_overrides to authenticated;

create policy "Capacity reservations are service only"
on public.order_capacity_reservations
for all
to authenticated
using (false)
with check (false);

create policy "Farm staff can read production capacity"
on public.production_capacity
for select
to authenticated
using (
  exists (
    select 1
    from public.farm_staff
    where farm_staff.user_id = (select auth.uid())
      and farm_staff.active
  )
);

create policy "Managers can update production capacity"
on public.production_capacity
for update
to authenticated
using (
  exists (
    select 1
    from public.farm_staff
    where farm_staff.user_id = (select auth.uid())
      and farm_staff.active
      and farm_staff.role in ('manager', 'admin')
  )
)
with check (
  exists (
    select 1
    from public.farm_staff
    where farm_staff.user_id = (select auth.uid())
      and farm_staff.active
      and farm_staff.role in ('manager', 'admin')
  )
);

create policy "Farm staff can read production overrides"
on public.production_capacity_overrides
for select
to authenticated
using (
  exists (
    select 1
    from public.farm_staff
    where farm_staff.user_id = (select auth.uid())
      and farm_staff.active
  )
);

create policy "Managers can create production overrides"
on public.production_capacity_overrides
for insert
to authenticated
with check (
  exists (
    select 1
    from public.farm_staff
    where farm_staff.user_id = (select auth.uid())
      and farm_staff.active
      and farm_staff.role in ('manager', 'admin')
  )
);

create policy "Managers can update production overrides"
on public.production_capacity_overrides
for update
to authenticated
using (
  exists (
    select 1
    from public.farm_staff
    where farm_staff.user_id = (select auth.uid())
      and farm_staff.active
      and farm_staff.role in ('manager', 'admin')
  )
)
with check (
  exists (
    select 1
    from public.farm_staff
    where farm_staff.user_id = (select auth.uid())
      and farm_staff.active
      and farm_staff.role in ('manager', 'admin')
  )
);

create policy "Managers can delete production overrides"
on public.production_capacity_overrides
for delete
to authenticated
using (
  exists (
    select 1
    from public.farm_staff
    where farm_staff.user_id = (select auth.uid())
      and farm_staff.active
      and farm_staff.role in ('manager', 'admin')
  )
);

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

  -- A single row lock serializes capacity decisions and prevents overselling.
  perform 1
  from public.production_capacity
  where product_key = 'milk'
  for update;

  update public.order_capacity_reservations
  set status = 'released', expires_at = null, updated_at = now()
  where status = 'pending'
    and expires_at <= now();

  update public.order_capacity_reservations
  set status = 'released', expires_at = null, updated_at = now()
  where order_id = p_order_id
    and product_key = 'milk'
    and status = 'pending';

  for v_offset in 0..(case when v_order.purchase_mode = 'plan' then 6 else 0 end)
  loop
    v_delivery_date := v_order.start_date + v_offset;

    if v_order.purchase_mode = 'plan' then
      select coalesce(sum(item.quantity), 0)
      into v_quantity
      from public.weekly_delivery_items item
      where item.plan_id = v_order.delivery_plan_id
        and item.product_key = 'milk'
        and item.day_of_week = extract(isodow from v_delivery_date)::smallint;
    else
      select coalesce(sum(item.quantity), 0)
      into v_quantity
      from public.order_items item
      where item.order_id = p_order_id
        and item.product_key = 'milk'
        and item.frequency = 'once'
        and coalesce(item.delivery_date, v_order.start_date) = v_delivery_date;
    end if;

    if v_quantity <= 0 then
      continue;
    end if;

    select coalesce(override.daily_limit, capacity.daily_limit)
    into v_daily_limit
    from public.production_capacity capacity
    left join public.production_capacity_overrides override
      on override.product_key = capacity.product_key
      and override.delivery_date = v_delivery_date
    where capacity.product_key = 'milk';

    select coalesce(sum(
      case
        when exception.action = 'skip' then 0
        when exception.action = 'override' then exception.quantity
        else item.quantity
      end
    ), 0)
    into v_active_plans
    from public.delivery_plans plan
    join public.weekly_delivery_items item
      on item.plan_id = plan.id
      and item.product_key = 'milk'
      and item.day_of_week = extract(isodow from v_delivery_date)::smallint
    left join public.delivery_exceptions exception
      on exception.plan_id = plan.id
      and exception.product_key = 'milk'
      and exception.delivery_date = v_delivery_date
    where plan.status = 'active'
      and plan.start_date <= v_delivery_date
      and plan.delivered_deliveries < plan.purchased_deliveries
      and plan.id is distinct from v_order.delivery_plan_id
      and not exists (
        select 1
        from public.delivery_pauses pause
        where pause.plan_id = plan.id
          and v_delivery_date between pause.start_date and pause.end_date
      );

    select coalesce(sum(item.quantity), 0)
    into v_paid_once
    from public.orders paid_order
    join public.order_items item on item.order_id = paid_order.id
    where paid_order.status = 'paid'
      and paid_order.purchase_mode = 'once'
      and paid_order.id <> p_order_id
      and item.product_key = 'milk'
      and item.frequency = 'once'
      and coalesce(item.delivery_date, paid_order.start_date) = v_delivery_date;

    select coalesce(sum(reservation.quantity), 0)
    into v_pending_holds
    from public.order_capacity_reservations reservation
    where reservation.product_key = 'milk'
      and reservation.delivery_date = v_delivery_date
      and reservation.order_id <> p_order_id
      and reservation.status = 'pending'
      and reservation.expires_at > now();

    if v_active_plans + v_paid_once + v_pending_holds + v_quantity > v_daily_limit then
      raise exception 'Milk capacity is full for %. Choose another delivery date.',
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
      'milk',
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

  return jsonb_build_object(
    'reserved', true,
    'reserved_dates', v_reserved_dates,
    'expires_at', now() + make_interval(hours => p_hold_hours)
  );
end;
$$;

create or replace function public.consume_order_capacity(p_order_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  update public.order_capacity_reservations
  set status = 'consumed', expires_at = null, updated_at = now()
  where order_id = p_order_id
    and status = 'pending';
end;
$$;

create or replace function public.release_order_capacity(p_order_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  update public.order_capacity_reservations
  set status = 'released', expires_at = null, updated_at = now()
  where order_id = p_order_id
    and status = 'pending';
end;
$$;

revoke execute on function public.reserve_order_capacity(uuid, integer)
from public, anon, authenticated;
revoke execute on function public.consume_order_capacity(uuid)
from public, anon, authenticated;
revoke execute on function public.release_order_capacity(uuid)
from public, anon, authenticated;

grant execute on function public.reserve_order_capacity(uuid, integer)
to service_role;
grant execute on function public.consume_order_capacity(uuid)
to service_role;
grant execute on function public.release_order_capacity(uuid)
to service_role;

create or replace function public.milk_capacity_snapshot(
  p_start_date date,
  p_days integer default 7
)
returns table (
  delivery_date date,
  capacity_limit numeric,
  active_plan_litres numeric,
  paid_once_litres numeric,
  checkout_holds_litres numeric,
  available_litres numeric
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception 'Service role required' using errcode = '42501';
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
  )
  select
    dates.day,
    coalesce(override.daily_limit, capacity.daily_limit) as capacity_limit,
    (
      select coalesce(sum(
        case
          when exception.action = 'skip' then 0
          when exception.action = 'override' then exception.quantity
          else item.quantity
        end
      ), 0)
      from public.delivery_plans plan
      join public.weekly_delivery_items item
        on item.plan_id = plan.id
        and item.product_key = 'milk'
        and item.day_of_week = extract(isodow from dates.day)::smallint
      left join public.delivery_exceptions exception
        on exception.plan_id = plan.id
        and exception.product_key = 'milk'
        and exception.delivery_date = dates.day
      where plan.status = 'active'
        and plan.start_date <= dates.day
        and plan.delivered_deliveries < plan.purchased_deliveries
        and not exists (
          select 1
          from public.delivery_pauses pause
          where pause.plan_id = plan.id
            and dates.day between pause.start_date and pause.end_date
        )
    ) as active_plan_litres,
    (
      select coalesce(sum(item.quantity), 0)
      from public.orders paid_order
      join public.order_items item on item.order_id = paid_order.id
      where paid_order.status = 'paid'
        and paid_order.purchase_mode = 'once'
        and item.product_key = 'milk'
        and item.frequency = 'once'
        and coalesce(item.delivery_date, paid_order.start_date) = dates.day
    ) as paid_once_litres,
    (
      select coalesce(sum(reservation.quantity), 0)
      from public.order_capacity_reservations reservation
      where reservation.product_key = 'milk'
        and reservation.delivery_date = dates.day
        and reservation.status = 'pending'
        and reservation.expires_at > now()
    ) as checkout_holds_litres,
    greatest(
      coalesce(override.daily_limit, capacity.daily_limit)
      - (
        select coalesce(sum(
          case
            when exception.action = 'skip' then 0
            when exception.action = 'override' then exception.quantity
            else item.quantity
          end
        ), 0)
        from public.delivery_plans plan
        join public.weekly_delivery_items item
          on item.plan_id = plan.id
          and item.product_key = 'milk'
          and item.day_of_week = extract(isodow from dates.day)::smallint
        left join public.delivery_exceptions exception
          on exception.plan_id = plan.id
          and exception.product_key = 'milk'
          and exception.delivery_date = dates.day
        where plan.status = 'active'
          and plan.start_date <= dates.day
          and plan.delivered_deliveries < plan.purchased_deliveries
          and not exists (
            select 1
            from public.delivery_pauses pause
            where pause.plan_id = plan.id
              and dates.day between pause.start_date and pause.end_date
          )
      )
      - (
        select coalesce(sum(item.quantity), 0)
        from public.orders paid_order
        join public.order_items item on item.order_id = paid_order.id
        where paid_order.status = 'paid'
          and paid_order.purchase_mode = 'once'
          and item.product_key = 'milk'
          and item.frequency = 'once'
          and coalesce(item.delivery_date, paid_order.start_date) = dates.day
      )
      - (
        select coalesce(sum(reservation.quantity), 0)
        from public.order_capacity_reservations reservation
        where reservation.product_key = 'milk'
          and reservation.delivery_date = dates.day
          and reservation.status = 'pending'
          and reservation.expires_at > now()
      ),
      0
    ) as available_litres
  from dates
  cross join public.production_capacity capacity
  left join public.production_capacity_overrides override
    on override.product_key = capacity.product_key
    and override.delivery_date = dates.day
  where capacity.product_key = 'milk'
  order by dates.day;
end;
$$;

revoke execute on function public.milk_capacity_snapshot(date, integer)
from public, anon, authenticated;
grant execute on function public.milk_capacity_snapshot(date, integer)
to service_role;
