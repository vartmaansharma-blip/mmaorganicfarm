-- Step 2: one-day changes and delivery balance.
alter table public.delivery_plans
add column if not exists purchased_deliveries integer not null default 30
  check (purchased_deliveries between 1 and 365),
add column if not exists delivered_deliveries integer not null default 0
  check (delivered_deliveries >= 0);

alter table public.delivery_plans
drop constraint if exists delivery_plans_delivery_balance_check;

alter table public.delivery_plans
add constraint delivery_plans_delivery_balance_check
check (delivered_deliveries <= purchased_deliveries);

comment on column public.delivery_plans.purchased_deliveries is
'Number of milk delivery credits purchased. Updated only by trusted payment or farm operations.';

comment on column public.delivery_plans.delivered_deliveries is
'Number of successfully completed milk deliveries. Skips and pauses do not increase this value.';

revoke update on public.delivery_plans from authenticated;

grant update (status, start_date, bottle_choice, updated_at)
on public.delivery_plans
to authenticated;

create table if not exists public.delivery_exceptions (
  plan_id uuid not null,
  user_id uuid not null,
  delivery_date date not null,
  product_key text not null
    check (product_key in ('milk', 'paneer', 'ghee', 'papaya', 'sweets')),
  action text not null check (action in ('skip', 'override')),
  quantity numeric(5, 2),
  unit text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (plan_id, product_key, delivery_date),
  foreign key (plan_id, user_id)
    references public.delivery_plans (id, user_id)
    on delete cascade,
  check (
    (action = 'skip' and quantity is null and unit is null)
    or
    (action = 'override' and quantity > 0 and quantity <= 5 and unit is not null)
  )
);

create table if not exists public.delivery_pauses (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null,
  user_id uuid not null,
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now(),
  foreign key (plan_id, user_id)
    references public.delivery_plans (id, user_id)
    on delete cascade,
  check (end_date > start_date)
);

create index if not exists delivery_exceptions_plan_owner_idx
on public.delivery_exceptions (plan_id, user_id);

create index if not exists delivery_pauses_plan_owner_idx
on public.delivery_pauses (plan_id, user_id);

create index if not exists delivery_pauses_plan_dates_idx
on public.delivery_pauses (plan_id, start_date, end_date);

alter table public.delivery_exceptions enable row level security;
alter table public.delivery_pauses enable row level security;

grant select, insert, update, delete on public.delivery_exceptions
to authenticated;

grant select, insert, update, delete on public.delivery_pauses
to authenticated;

create policy "Customers can read their delivery exceptions"
on public.delivery_exceptions
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Customers can create their delivery exceptions"
on public.delivery_exceptions
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Customers can update their delivery exceptions"
on public.delivery_exceptions
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Customers can delete their delivery exceptions"
on public.delivery_exceptions
for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Customers can read their delivery pauses"
on public.delivery_pauses
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Customers can create their delivery pauses"
on public.delivery_pauses
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Customers can update their delivery pauses"
on public.delivery_pauses
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Customers can delete their delivery pauses"
on public.delivery_pauses
for delete
to authenticated
using ((select auth.uid()) = user_id);
