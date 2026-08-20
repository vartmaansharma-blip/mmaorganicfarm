-- Date-specific route dispatching keeps temporary driver replacements separate
-- from the permanent driver assigned to a delivery route.
alter table public.delivery_routes
add column if not exists stop_capacity integer not null default 25;

alter table public.delivery_routes
drop constraint if exists delivery_routes_stop_capacity_check;

alter table public.delivery_routes
add constraint delivery_routes_stop_capacity_check
check (stop_capacity between 1 and 200);

create table if not exists public.delivery_dispatches (
  delivery_date date primary key,
  status text not null default 'draft' check (status in ('draft', 'released')),
  prepared_by uuid not null references auth.users (id),
  prepared_at timestamptz not null default now(),
  released_by uuid references auth.users (id),
  released_at timestamptz,
  updated_at timestamptz not null default now(),
  check (
    (status = 'draft' and released_by is null and released_at is null)
    or (status = 'released' and released_by is not null and released_at is not null)
  )
);

create table if not exists public.daily_route_assignments (
  delivery_date date not null references public.delivery_dispatches (delivery_date) on delete cascade,
  route_id uuid not null references public.delivery_routes (id) on delete cascade,
  driver_id uuid not null references auth.users (id) on delete restrict,
  source text not null default 'default' check (source in ('default', 'override')),
  updated_by uuid not null references auth.users (id),
  updated_at timestamptz not null default now(),
  primary key (delivery_date, route_id)
);

create index if not exists delivery_dispatches_prepared_by_idx
on public.delivery_dispatches (prepared_by);

create index if not exists delivery_dispatches_released_by_idx
on public.delivery_dispatches (released_by);

create index if not exists daily_route_assignments_driver_date_idx
on public.daily_route_assignments (driver_id, delivery_date);

create index if not exists daily_route_assignments_route_idx
on public.daily_route_assignments (route_id);

create index if not exists daily_route_assignments_updated_by_idx
on public.daily_route_assignments (updated_by);

alter table public.delivery_dispatches enable row level security;
alter table public.daily_route_assignments enable row level security;

revoke all on public.delivery_dispatches from public, anon;
revoke all on public.daily_route_assignments from public, anon;
grant select, insert, update on public.delivery_dispatches to authenticated;
grant select, insert, update on public.daily_route_assignments to authenticated;

drop policy if exists "Farm staff can read relevant dispatches"
on public.delivery_dispatches;
create policy "Farm staff can read relevant dispatches"
on public.delivery_dispatches
for select
to authenticated
using (
  exists (
    select 1
    from public.farm_staff
    where farm_staff.user_id = (select auth.uid())
      and farm_staff.active
      and (
        farm_staff.role in ('manager', 'admin')
        or delivery_dispatches.status = 'released'
      )
  )
);

drop policy if exists "Managers can create dispatches"
on public.delivery_dispatches;
create policy "Managers can create dispatches"
on public.delivery_dispatches
for insert
to authenticated
with check (
  prepared_by = (select auth.uid())
  and exists (
    select 1
    from public.farm_staff
    where farm_staff.user_id = (select auth.uid())
      and farm_staff.active
      and farm_staff.role in ('manager', 'admin')
  )
);

drop policy if exists "Managers can update dispatches"
on public.delivery_dispatches;
create policy "Managers can update dispatches"
on public.delivery_dispatches
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

drop policy if exists "Staff can read relevant daily route assignments"
on public.daily_route_assignments;
create policy "Staff can read relevant daily route assignments"
on public.daily_route_assignments
for select
to authenticated
using (
  exists (
    select 1
    from public.farm_staff
    where farm_staff.user_id = (select auth.uid())
      and farm_staff.active
      and (
        farm_staff.role in ('manager', 'admin')
        or (
          daily_route_assignments.driver_id = (select auth.uid())
          and exists (
            select 1
            from public.delivery_dispatches
            where delivery_dispatches.delivery_date = daily_route_assignments.delivery_date
              and delivery_dispatches.status = 'released'
          )
        )
      )
  )
);

drop policy if exists "Managers can create daily route assignments"
on public.daily_route_assignments;
create policy "Managers can create daily route assignments"
on public.daily_route_assignments
for insert
to authenticated
with check (
  updated_by = (select auth.uid())
  and exists (
    select 1
    from public.farm_staff
    where farm_staff.user_id = (select auth.uid())
      and farm_staff.active
      and farm_staff.role in ('manager', 'admin')
  )
);

drop policy if exists "Managers can update daily route assignments"
on public.daily_route_assignments;
create policy "Managers can update daily route assignments"
on public.daily_route_assignments
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
  updated_by = (select auth.uid())
  and exists (
    select 1
    from public.farm_staff
    where farm_staff.user_id = (select auth.uid())
      and farm_staff.active
      and farm_staff.role in ('manager', 'admin')
  )
);

create or replace function public.prepare_daily_dispatch(p_delivery_date date)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_updated integer := 0;
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

  if exists (
    select 1 from public.delivery_dispatches
    where delivery_date = p_delivery_date and status = 'released'
  ) then
    raise exception 'Reopen this dispatch before refreshing it';
  end if;

  insert into public.delivery_dispatches (
    delivery_date, status, prepared_by, prepared_at, updated_at
  ) values (
    p_delivery_date, 'draft', v_actor_id, now(), now()
  )
  on conflict (delivery_date) do update
  set prepared_by = excluded.prepared_by,
      prepared_at = excluded.prepared_at,
      updated_at = excluded.updated_at;

  insert into public.daily_route_assignments (
    delivery_date, route_id, driver_id, source, updated_by, updated_at
  )
  select distinct
    p_delivery_date,
    deliveries.delivery_route_id,
    defaults.driver_id,
    'default',
    v_actor_id,
    now()
  from public.daily_deliveries as deliveries
  join public.route_driver_assignments as defaults
    on defaults.route_id = deliveries.delivery_route_id
  where deliveries.delivery_date = p_delivery_date
    and not deliveries.is_test
    and deliveries.status <> 'cancelled'
    and deliveries.delivery_route_id is not null
  on conflict (delivery_date, route_id) do update
  set driver_id = excluded.driver_id,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  where daily_route_assignments.source = 'default';

  update public.daily_deliveries as deliveries
  set assigned_driver_id = assignments.driver_id,
      updated_at = now()
  from public.daily_route_assignments as assignments
  where deliveries.delivery_date = p_delivery_date
    and assignments.delivery_date = p_delivery_date
    and deliveries.delivery_route_id = assignments.route_id
    and not deliveries.is_test
    and deliveries.status in ('planned', 'ready', 'out_for_delivery', 'failed')
    and deliveries.assigned_driver_id is distinct from assignments.driver_id;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke execute on function public.prepare_daily_dispatch(date)
from public, anon;
grant execute on function public.prepare_daily_dispatch(date)
to authenticated;

create or replace function public.assign_daily_route_driver(
  p_delivery_date date,
  p_route_id uuid,
  p_driver_id uuid,
  p_make_default boolean default false
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_updated integer := 0;
begin
  if p_delivery_date is null or p_route_id is null or p_driver_id is null then
    raise exception 'Delivery date, route, and driver are required';
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
    select 1 from public.farm_staff
    where farm_staff.user_id = p_driver_id
      and farm_staff.active
      and farm_staff.role = 'driver'
  ) then
    raise exception 'Choose an active driver';
  end if;

  if not exists (
    select 1 from public.daily_deliveries
    where delivery_date = p_delivery_date
      and delivery_route_id = p_route_id
      and not is_test
      and status <> 'cancelled'
  ) then
    raise exception 'This route has no deliveries on the selected date';
  end if;

  if not exists (
    select 1 from public.delivery_dispatches
    where delivery_date = p_delivery_date
  ) then
    raise exception 'Prepare the dispatch before assigning its drivers';
  end if;

  insert into public.daily_route_assignments (
    delivery_date, route_id, driver_id, source, updated_by, updated_at
  ) values (
    p_delivery_date,
    p_route_id,
    p_driver_id,
    case when p_make_default then 'default' else 'override' end,
    v_actor_id,
    now()
  )
  on conflict (delivery_date, route_id) do update
  set driver_id = excluded.driver_id,
      source = excluded.source,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at;

  if p_make_default then
    insert into public.route_driver_assignments (
      route_id, driver_id, updated_by, updated_at
    ) values (
      p_route_id, p_driver_id, v_actor_id, now()
    )
    on conflict (route_id) do update
    set driver_id = excluded.driver_id,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at;
  end if;

  update public.daily_deliveries
  set assigned_driver_id = p_driver_id,
      updated_at = now()
  where delivery_date = p_delivery_date
    and delivery_route_id = p_route_id
    and not is_test
    and status in ('planned', 'ready', 'out_for_delivery', 'failed')
    and assigned_driver_id is distinct from p_driver_id;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke execute on function public.assign_daily_route_driver(date, uuid, uuid, boolean)
from public, anon;
grant execute on function public.assign_daily_route_driver(date, uuid, uuid, boolean)
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
    where delivery_date = p_delivery_date
      and not is_test
      and status <> 'cancelled'
  ) then
    raise exception 'Prepare the delivery sheet before releasing routes';
  end if;

  if exists (
    select 1 from public.daily_deliveries
    where delivery_date = p_delivery_date
      and not is_test
      and status <> 'cancelled'
      and delivery_route_id is null
  ) then
    raise exception 'Every delivery must have a route before release';
  end if;

  if exists (
    select 1 from public.daily_deliveries
    where delivery_date = p_delivery_date
      and not is_test
      and status <> 'cancelled'
      and assigned_driver_id is null
  ) then
    raise exception 'Every route must have a driver before release';
  end if;

  if exists (
    select 1 from public.daily_deliveries
    where delivery_date = p_delivery_date
      and not is_test
      and status <> 'cancelled'
      and nullif(trim(coalesce(address_snapshot, '')), '') is null
  ) then
    raise exception 'Every delivery must have an address before release';
  end if;

  update public.daily_deliveries
  set status = 'ready', updated_at = now()
  where delivery_date = p_delivery_date
    and not is_test
    and status = 'planned';

  get diagnostics v_released = row_count;

  update public.delivery_dispatches
  set status = 'released',
      released_by = v_actor_id,
      released_at = now(),
      updated_at = now()
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

create or replace function public.reopen_daily_dispatch(p_delivery_date date)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_reopened integer := 0;
begin
  if not exists (
    select 1 from public.farm_staff
    where farm_staff.user_id = v_actor_id
      and farm_staff.active
      and farm_staff.role in ('manager', 'admin')
  ) then
    raise exception 'Farm manager access required';
  end if;

  if exists (
    select 1 from public.daily_deliveries
    where delivery_date = p_delivery_date
      and not is_test
      and status in ('out_for_delivery', 'delivered', 'failed')
  ) then
    raise exception 'A dispatch cannot be reopened after delivery work has started';
  end if;

  update public.daily_deliveries
  set status = 'planned', updated_at = now()
  where delivery_date = p_delivery_date
    and not is_test
    and status = 'ready';

  get diagnostics v_reopened = row_count;

  update public.delivery_dispatches
  set status = 'draft',
      released_by = null,
      released_at = null,
      updated_at = now()
  where delivery_date = p_delivery_date
    and status = 'released';

  if not found then
    raise exception 'This dispatch is not released';
  end if;

  return v_reopened;
end;
$$;

revoke execute on function public.reopen_daily_dispatch(date)
from public, anon;
grant execute on function public.reopen_daily_dispatch(date)
to authenticated;

-- Drivers can only see their own stops after the manager releases that date.
drop policy if exists "Customers and assigned staff can read daily deliveries"
on public.daily_deliveries;
create policy "Customers and assigned staff can read daily deliveries"
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
      and farm_staff.role in ('manager', 'admin')
  )
  or (
    assigned_driver_id = (select auth.uid())
    and exists (
      select 1
      from public.delivery_dispatches
      where delivery_dispatches.delivery_date = daily_deliveries.delivery_date
        and delivery_dispatches.status = 'released'
    )
  )
);
