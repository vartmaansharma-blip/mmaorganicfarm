-- Persistent daily delivery sheets generated from active plans.
create table if not exists public.daily_deliveries (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.delivery_plans (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  delivery_date date not null,
  status text not null default 'planned'
    check (status in ('planned', 'ready', 'out_for_delivery', 'delivered', 'failed', 'cancelled')),
  delivery_area_id uuid references public.delivery_areas (id) on delete set null,
  delivery_route_id uuid references public.delivery_routes (id) on delete set null,
  assigned_driver_id uuid references auth.users (id) on delete set null,
  route_stop_order integer,
  customer_name text not null,
  phone_snapshot text,
  address_snapshot text,
  generated_by uuid not null references auth.users (id),
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (plan_id, delivery_date)
);

create table if not exists public.daily_delivery_items (
  delivery_id uuid not null references public.daily_deliveries (id) on delete cascade,
  product_key text not null
    check (product_key in ('milk', 'paneer', 'ghee', 'papaya', 'sweets')),
  quantity numeric(5, 2) not null check (quantity > 0 and quantity <= 5),
  unit text not null,
  primary key (delivery_id, product_key)
);

create index if not exists daily_deliveries_date_route_stop_idx
on public.daily_deliveries (delivery_date, delivery_route_id, route_stop_order);

create index if not exists daily_deliveries_driver_date_idx
on public.daily_deliveries (assigned_driver_id, delivery_date);

create index if not exists daily_deliveries_user_date_idx
on public.daily_deliveries (user_id, delivery_date desc);

create index if not exists daily_deliveries_area_idx
on public.daily_deliveries (delivery_area_id);

create index if not exists daily_deliveries_route_idx
on public.daily_deliveries (delivery_route_id);

create index if not exists daily_deliveries_generated_by_idx
on public.daily_deliveries (generated_by);

alter table public.daily_deliveries enable row level security;
alter table public.daily_delivery_items enable row level security;

grant select, insert, update, delete on public.daily_deliveries to authenticated;
grant select, insert, update, delete on public.daily_delivery_items to authenticated;

create policy "Customers and active staff can read daily deliveries"
on public.daily_deliveries
for select
to authenticated
using (
  (select auth.uid()) = user_id
  or exists (
    select 1
    from public.farm_staff
    where farm_staff.user_id = (select auth.uid())
      and farm_staff.active
  )
);

create policy "Managers can create daily deliveries"
on public.daily_deliveries
for insert
to authenticated
with check (
  generated_by = (select auth.uid())
  and exists (
    select 1
    from public.farm_staff
    where farm_staff.user_id = (select auth.uid())
      and farm_staff.active
      and farm_staff.role in ('manager', 'admin')
  )
);

create policy "Managers can update daily deliveries"
on public.daily_deliveries
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

create policy "Managers can delete planned daily deliveries"
on public.daily_deliveries
for delete
to authenticated
using (
  status = 'planned'
  and exists (
    select 1
    from public.farm_staff
    where farm_staff.user_id = (select auth.uid())
      and farm_staff.active
      and farm_staff.role in ('manager', 'admin')
  )
);

create policy "Customers and active staff can read daily items"
on public.daily_delivery_items
for select
to authenticated
using (
  exists (
    select 1
    from public.daily_deliveries
    where daily_deliveries.id = daily_delivery_items.delivery_id
  )
);

create policy "Managers can create daily items"
on public.daily_delivery_items
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

create policy "Managers can update daily items"
on public.daily_delivery_items
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

create policy "Managers can delete daily items"
on public.daily_delivery_items
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
      user_id,
      delivery_date,
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
      v_plan.user_id,
      p_delivery_date,
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
      delete from public.daily_deliveries
      where id = v_delivery_id;
    end if;
  end loop;

  return v_generated;
end;
$$;

revoke execute on function public.generate_daily_deliveries(date)
from public, anon;

grant execute on function public.generate_daily_deliveries(date)
to authenticated;
