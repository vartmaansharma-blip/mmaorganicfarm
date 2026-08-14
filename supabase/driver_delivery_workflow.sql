-- Route-based driver assignments and on-the-spot delivery completion.
create table if not exists public.route_driver_assignments (
  route_id uuid primary key references public.delivery_routes (id) on delete cascade,
  driver_id uuid not null references auth.users (id) on delete cascade,
  updated_by uuid not null references auth.users (id),
  updated_at timestamptz not null default now()
);

create index if not exists route_driver_assignments_driver_idx
on public.route_driver_assignments (driver_id);

alter table public.daily_deliveries
add column if not exists delivery_confirmed boolean not null default false,
add column if not exists bottle_return_required boolean not null default false,
add column if not exists bottle_returned boolean not null default false,
add column if not exists delivered_confirmed_at timestamptz,
add column if not exists bottle_returned_at timestamptz,
add column if not exists checked_by uuid references auth.users (id) on delete set null,
add column if not exists driver_note text;

alter table public.daily_deliveries
drop constraint if exists daily_deliveries_driver_note_length_check;

alter table public.daily_deliveries
add constraint daily_deliveries_driver_note_length_check
check (driver_note is null or char_length(driver_note) <= 250);

update public.daily_deliveries
set bottle_return_required = bottle_choice = 'return'
where bottle_return_required is distinct from (bottle_choice = 'return');

alter table public.route_driver_assignments enable row level security;

grant select, insert, update, delete on public.route_driver_assignments
to authenticated;

drop policy if exists "Assigned drivers and managers can read route assignments"
on public.route_driver_assignments;
create policy "Assigned drivers and managers can read route assignments"
on public.route_driver_assignments
for select
to authenticated
using (
  driver_id = (select auth.uid())
  or exists (
    select 1
    from public.farm_staff
    where farm_staff.user_id = (select auth.uid())
      and farm_staff.active
      and farm_staff.role in ('manager', 'admin')
  )
);

drop policy if exists "Managers can create route assignments"
on public.route_driver_assignments;
create policy "Managers can create route assignments"
on public.route_driver_assignments
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

drop policy if exists "Managers can update route assignments"
on public.route_driver_assignments;
create policy "Managers can update route assignments"
on public.route_driver_assignments
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

drop policy if exists "Managers can delete route assignments"
on public.route_driver_assignments;
create policy "Managers can delete route assignments"
on public.route_driver_assignments
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

drop policy if exists "Customers and active staff can read daily deliveries"
on public.daily_deliveries;
create policy "Customers and assigned staff can read daily deliveries"
on public.daily_deliveries
for select
to authenticated
using (
  (select auth.uid()) = user_id
  or assigned_driver_id = (select auth.uid())
  or exists (
    select 1
    from public.farm_staff
    where farm_staff.user_id = (select auth.uid())
      and farm_staff.active
      and farm_staff.role in ('manager', 'admin')
  )
);

create or replace function public.set_daily_delivery_defaults()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.bottle_return_required := new.bottle_choice = 'return';

  if new.delivery_route_id is not null and new.assigned_driver_id is null then
    select assignment.driver_id
    into new.assigned_driver_id
    from public.route_driver_assignments as assignment
    where assignment.route_id = new.delivery_route_id;
  end if;

  return new;
end;
$$;

drop trigger if exists set_daily_delivery_defaults_trigger
on public.daily_deliveries;
create trigger set_daily_delivery_defaults_trigger
before insert or update of delivery_route_id, bottle_choice
on public.daily_deliveries
for each row
execute function public.set_daily_delivery_defaults();

create or replace function public.record_delivery_stop(
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

revoke execute on function public.record_delivery_stop(uuid, boolean, boolean, text)
from public, anon;
grant execute on function public.record_delivery_stop(uuid, boolean, boolean, text)
to authenticated;

comment on function public.record_delivery_stop(uuid, boolean, boolean, text) is
'Records the two doorstep checks. Assigned drivers may update only their own stops; managers and admins may update any stop.';
