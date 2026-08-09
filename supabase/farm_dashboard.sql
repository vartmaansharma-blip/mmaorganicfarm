-- Farm operations foundation: staff access, editable delivery areas, and routes.
create table if not exists public.farm_staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('driver', 'manager', 'admin')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.delivery_areas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  city text not null default 'Jamshedpur',
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(name)) between 2 and 80),
  check (length(trim(slug)) between 2 and 80)
);

create table if not exists public.delivery_routes (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references public.delivery_areas (id) on delete cascade,
  name text not null,
  code text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (area_id, name),
  check (length(trim(name)) between 2 and 80),
  check (code is null or length(trim(code)) between 1 and 24)
);

alter table public.customer_profiles
add column if not exists delivery_area_id uuid,
add column if not exists delivery_route_id uuid,
add column if not exists locality text,
add column if not exists landmark text,
add column if not exists route_stop_order integer,
add column if not exists delivery_instructions text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'customer_profiles_delivery_area_id_fkey'
  ) then
    alter table public.customer_profiles
    add constraint customer_profiles_delivery_area_id_fkey
    foreign key (delivery_area_id)
    references public.delivery_areas (id)
    on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'customer_profiles_delivery_route_id_fkey'
  ) then
    alter table public.customer_profiles
    add constraint customer_profiles_delivery_route_id_fkey
    foreign key (delivery_route_id)
    references public.delivery_routes (id)
    on delete set null;
  end if;
end
$$;

create index if not exists customer_profiles_delivery_area_idx
on public.customer_profiles (delivery_area_id);

create index if not exists customer_profiles_delivery_route_stop_idx
on public.customer_profiles (delivery_route_id, route_stop_order);

create index if not exists delivery_routes_area_sort_idx
on public.delivery_routes (area_id, sort_order, name);

alter table public.farm_staff enable row level security;
alter table public.delivery_areas enable row level security;
alter table public.delivery_routes enable row level security;

grant select on public.farm_staff to authenticated;
grant select, insert, update, delete on public.delivery_areas to authenticated;
grant select, insert, update, delete on public.delivery_routes to authenticated;

drop policy if exists "Staff can read their farm role" on public.farm_staff;
create policy "Staff can read their farm role"
on public.farm_staff
for select
to authenticated
using ((select auth.uid()) = user_id and active);

drop policy if exists "Signed-in customers can read active areas" on public.delivery_areas;
create policy "Signed-in customers can read active areas"
on public.delivery_areas
for select
to authenticated
using (
  active
  or exists (
    select 1
    from public.farm_staff
    where farm_staff.user_id = (select auth.uid())
      and farm_staff.active
  )
);

drop policy if exists "Managers can create areas" on public.delivery_areas;
create policy "Managers can create areas"
on public.delivery_areas
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

drop policy if exists "Managers can update areas" on public.delivery_areas;
create policy "Managers can update areas"
on public.delivery_areas
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

drop policy if exists "Admins can delete areas" on public.delivery_areas;
create policy "Admins can delete areas"
on public.delivery_areas
for delete
to authenticated
using (
  exists (
    select 1
    from public.farm_staff
    where farm_staff.user_id = (select auth.uid())
      and farm_staff.active
      and farm_staff.role = 'admin'
  )
);

drop policy if exists "Signed-in customers can read active routes" on public.delivery_routes;
create policy "Signed-in customers can read active routes"
on public.delivery_routes
for select
to authenticated
using (
  active
  or exists (
    select 1
    from public.farm_staff
    where farm_staff.user_id = (select auth.uid())
      and farm_staff.active
  )
);

drop policy if exists "Managers can create routes" on public.delivery_routes;
create policy "Managers can create routes"
on public.delivery_routes
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

drop policy if exists "Managers can update routes" on public.delivery_routes;
create policy "Managers can update routes"
on public.delivery_routes
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

drop policy if exists "Admins can delete routes" on public.delivery_routes;
create policy "Admins can delete routes"
on public.delivery_routes
for delete
to authenticated
using (
  exists (
    select 1
    from public.farm_staff
    where farm_staff.user_id = (select auth.uid())
      and farm_staff.active
      and farm_staff.role = 'admin'
  )
);

drop policy if exists "Customers can read their profile" on public.customer_profiles;
drop policy if exists "Farm staff can read customer profiles" on public.customer_profiles;
drop policy if exists "Customers and staff can read profiles" on public.customer_profiles;
create policy "Customers and staff can read profiles"
on public.customer_profiles
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

drop policy if exists "Customers can update their profile" on public.customer_profiles;
drop policy if exists "Managers can assign customer routes" on public.customer_profiles;
drop policy if exists "Customers and managers can update profiles" on public.customer_profiles;
create policy "Customers and managers can update profiles"
on public.customer_profiles
for update
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
)
with check (
  (select auth.uid()) = user_id
  or exists (
    select 1
    from public.farm_staff
    where farm_staff.user_id = (select auth.uid())
      and farm_staff.active
      and farm_staff.role in ('manager', 'admin')
  )
);

drop policy if exists "Customers can read their delivery plans" on public.delivery_plans;
drop policy if exists "Farm staff can read delivery plans" on public.delivery_plans;
drop policy if exists "Customers and staff can read delivery plans" on public.delivery_plans;
create policy "Customers and staff can read delivery plans"
on public.delivery_plans
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

drop policy if exists "Customers can read their weekly delivery items" on public.weekly_delivery_items;
drop policy if exists "Farm staff can read weekly delivery items" on public.weekly_delivery_items;
drop policy if exists "Customers and staff can read weekly delivery items" on public.weekly_delivery_items;
create policy "Customers and staff can read weekly delivery items"
on public.weekly_delivery_items
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

drop policy if exists "Customers can read their scheduled delivery items" on public.scheduled_delivery_items;
drop policy if exists "Farm staff can read scheduled delivery items" on public.scheduled_delivery_items;
drop policy if exists "Customers and staff can read scheduled delivery items" on public.scheduled_delivery_items;
create policy "Customers and staff can read scheduled delivery items"
on public.scheduled_delivery_items
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

drop policy if exists "Customers can read their delivery exceptions" on public.delivery_exceptions;
drop policy if exists "Farm staff can read delivery exceptions" on public.delivery_exceptions;
drop policy if exists "Customers and staff can read delivery exceptions" on public.delivery_exceptions;
create policy "Customers and staff can read delivery exceptions"
on public.delivery_exceptions
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

drop policy if exists "Customers can read their delivery pauses" on public.delivery_pauses;
drop policy if exists "Farm staff can read delivery pauses" on public.delivery_pauses;
drop policy if exists "Customers and staff can read delivery pauses" on public.delivery_pauses;
create policy "Customers and staff can read delivery pauses"
on public.delivery_pauses
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
