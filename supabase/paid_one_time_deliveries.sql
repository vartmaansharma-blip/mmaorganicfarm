-- Include paid one-time orders in the same location-sorted daily sheet as plans.
alter table public.daily_deliveries
alter column plan_id drop not null;

alter table public.daily_deliveries
add column if not exists order_id uuid references public.orders (id) on delete cascade,
add column if not exists bottle_choice text not null default 'none';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'daily_deliveries_source_check'
      and conrelid = 'public.daily_deliveries'::regclass
  ) then
    alter table public.daily_deliveries
    add constraint daily_deliveries_source_check
    check (num_nonnulls(plan_id, order_id) = 1);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'daily_deliveries_bottle_choice_check'
      and conrelid = 'public.daily_deliveries'::regclass
  ) then
    alter table public.daily_deliveries
    add constraint daily_deliveries_bottle_choice_check
    check (bottle_choice in ('return', 'new', 'none'));
  end if;
end
$$;

create unique index if not exists daily_deliveries_order_date_idx
on public.daily_deliveries (order_id, delivery_date)
where order_id is not null;

create or replace function public.generate_daily_deliveries(p_delivery_date date)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_delivery_id uuid;
  v_generated integer := 0;
  v_plan record;
  v_order record;
begin
  if p_delivery_date is null then
    raise exception 'Delivery date is required';
  end if;

  if p_delivery_date < (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'Past delivery sheets cannot be regenerated';
  end if;

  if not exists (
    select 1
    from public.farm_staff
    where farm_staff.user_id = v_actor_id
      and farm_staff.active
      and farm_staff.role in ('manager', 'admin')
  ) then
    raise exception 'Farm manager access required';
  end if;

  delete from public.daily_deliveries
  where delivery_date = p_delivery_date
    and status = 'planned';

  for v_plan in
    select
      plans.id,
      plans.user_id,
      plans.bottle_choice,
      profiles.delivery_area_id,
      profiles.delivery_route_id,
      profiles.route_stop_order,
      coalesce(nullif(trim(profiles.full_name), ''), 'Customer') as customer_name,
      profiles.phone,
      concat_ws(
        ', ',
        nullif(trim(profiles.address_line), ''),
        nullif(trim(profiles.landmark), ''),
        nullif(trim(profiles.postal_code), '')
      ) as address_snapshot
    from public.delivery_plans as plans
    join public.customer_profiles as profiles
      on profiles.user_id = plans.user_id
    where plans.status = 'active'
      and plans.start_date <= p_delivery_date
      and not exists (
        select 1
        from public.delivery_pauses
        where delivery_pauses.plan_id = plans.id
          and p_delivery_date between delivery_pauses.start_date and delivery_pauses.end_date
      )
  loop
    insert into public.daily_deliveries (
      plan_id,
      order_id,
      user_id,
      delivery_date,
      bottle_choice,
      delivery_area_id,
      delivery_route_id,
      route_stop_order,
      customer_name,
      phone_snapshot,
      address_snapshot,
      generated_by
    )
    values (
      v_plan.id,
      null,
      v_plan.user_id,
      p_delivery_date,
      v_plan.bottle_choice,
      v_plan.delivery_area_id,
      v_plan.delivery_route_id,
      v_plan.route_stop_order,
      v_plan.customer_name,
      v_plan.phone,
      nullif(v_plan.address_snapshot, ''),
      v_actor_id
    )
    returning id into v_delivery_id;

    with base_items as (
      select
        weekly.product_key,
        weekly.quantity,
        weekly.unit,
        1 as priority
      from public.weekly_delivery_items as weekly
      where weekly.plan_id = v_plan.id
        and weekly.day_of_week = extract(isodow from p_delivery_date)::smallint

      union all

      select
        scheduled.product_key,
        scheduled.quantity,
        scheduled.unit,
        2 as priority
      from public.scheduled_delivery_items as scheduled
      where scheduled.plan_id = v_plan.id
        and scheduled.delivery_date = p_delivery_date
    ),
    selected_base as (
      select distinct on (base_items.product_key)
        base_items.product_key,
        base_items.quantity,
        base_items.unit
      from base_items
      order by base_items.product_key, base_items.priority desc
    ),
    effective_items as (
      select
        selected_base.product_key,
        coalesce(exceptions.quantity, selected_base.quantity) as quantity,
        coalesce(exceptions.unit, selected_base.unit) as unit
      from selected_base
      left join public.delivery_exceptions as exceptions
        on exceptions.plan_id = v_plan.id
        and exceptions.delivery_date = p_delivery_date
        and exceptions.product_key = selected_base.product_key
      where exceptions.action is distinct from 'skip'

      union all

      select
        exceptions.product_key,
        exceptions.quantity,
        exceptions.unit
      from public.delivery_exceptions as exceptions
      where exceptions.plan_id = v_plan.id
        and exceptions.delivery_date = p_delivery_date
        and exceptions.action = 'override'
        and not exists (
          select 1
          from selected_base
          where selected_base.product_key = exceptions.product_key
        )
    )
    insert into public.daily_delivery_items (
      delivery_id,
      product_key,
      quantity,
      unit
    )
    select
      v_delivery_id,
      effective_items.product_key,
      effective_items.quantity,
      effective_items.unit
    from effective_items
    where effective_items.quantity is not null
      and effective_items.unit is not null;

    if exists (
      select 1
      from public.daily_delivery_items
      where daily_delivery_items.delivery_id = v_delivery_id
    ) then
      v_generated := v_generated + 1;
    else
      delete from public.daily_deliveries where id = v_delivery_id;
    end if;
  end loop;

  for v_order in
    select
      orders.id,
      orders.user_id,
      orders.bottle_choice,
      orders.phone_snapshot,
      orders.address_snapshot,
      profiles.delivery_area_id,
      profiles.delivery_route_id,
      profiles.route_stop_order,
      coalesce(nullif(trim(profiles.full_name), ''), 'Customer') as customer_name
    from public.orders
    join public.customer_profiles as profiles
      on profiles.user_id = orders.user_id
    where orders.purchase_mode = 'once'
      and orders.status = 'paid'
      and orders.start_date = p_delivery_date
  loop
    insert into public.daily_deliveries (
      plan_id,
      order_id,
      user_id,
      delivery_date,
      bottle_choice,
      delivery_area_id,
      delivery_route_id,
      route_stop_order,
      customer_name,
      phone_snapshot,
      address_snapshot,
      generated_by
    )
    values (
      null,
      v_order.id,
      v_order.user_id,
      p_delivery_date,
      v_order.bottle_choice,
      v_order.delivery_area_id,
      v_order.delivery_route_id,
      v_order.route_stop_order,
      v_order.customer_name,
      v_order.phone_snapshot,
      v_order.address_snapshot,
      v_actor_id
    )
    returning id into v_delivery_id;

    insert into public.daily_delivery_items (
      delivery_id,
      product_key,
      quantity,
      unit
    )
    select
      v_delivery_id,
      items.product_key,
      items.quantity,
      items.unit
    from public.order_items as items
    where items.order_id = v_order.id
      and items.frequency = 'once';

    if exists (
      select 1
      from public.daily_delivery_items
      where daily_delivery_items.delivery_id = v_delivery_id
    ) then
      v_generated := v_generated + 1;
    else
      delete from public.daily_deliveries where id = v_delivery_id;
    end if;
  end loop;

  return v_generated;
end;
$$;

revoke execute on function public.generate_daily_deliveries(date)
from public, anon;

grant execute on function public.generate_daily_deliveries(date)
to authenticated;
