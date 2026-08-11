create index if not exists production_capacity_updated_by_idx
on public.production_capacity (updated_by);

create index if not exists production_capacity_overrides_updated_by_idx
on public.production_capacity_overrides (updated_by);

drop policy if exists "Capacity reservations are service only"
on public.order_capacity_reservations;

create policy "Capacity reservations are service only"
on public.order_capacity_reservations
for all
to authenticated
using (false)
with check (false);

alter function public.milk_capacity_snapshot(date, integer)
security invoker;

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
