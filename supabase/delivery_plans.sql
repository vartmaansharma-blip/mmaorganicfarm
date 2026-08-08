-- Store one pending weekly milk plan per signed-in customer.
create table if not exists public.delivery_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending_confirmation'
    check (status in ('pending_confirmation', 'active', 'paused', 'completed', 'cancelled')),
  start_date date not null,
  bottle_choice text not null
    check (bottle_choice in ('return', 'new')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create unique index if not exists one_pending_delivery_plan_per_customer
on public.delivery_plans (user_id)
where status = 'pending_confirmation';

create table if not exists public.weekly_delivery_items (
  plan_id uuid not null,
  user_id uuid not null,
  product_key text not null,
  day_of_week smallint not null check (day_of_week between 1 and 7),
  quantity numeric(5, 2) not null check (quantity > 0),
  unit text not null,
  created_at timestamptz not null default now(),
  primary key (plan_id, product_key, day_of_week),
  foreign key (plan_id, user_id)
    references public.delivery_plans (id, user_id)
    on delete cascade
);

alter table public.delivery_plans enable row level security;
alter table public.weekly_delivery_items enable row level security;

grant select, insert, update, delete on public.delivery_plans to authenticated;
grant select, insert, update, delete on public.weekly_delivery_items to authenticated;

create policy "Customers can read their delivery plans"
on public.delivery_plans
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Customers can create their delivery plans"
on public.delivery_plans
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Customers can update their delivery plans"
on public.delivery_plans
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Customers can delete their delivery plans"
on public.delivery_plans
for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Customers can read their weekly delivery items"
on public.weekly_delivery_items
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Customers can create their weekly delivery items"
on public.weekly_delivery_items
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Customers can update their weekly delivery items"
on public.weekly_delivery_items
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Customers can delete their weekly delivery items"
on public.weekly_delivery_items
for delete
to authenticated
using ((select auth.uid()) = user_id);

create or replace function public.save_pending_weekly_milk_plan(
  p_start_date date,
  p_bottle_choice text,
  p_schedule integer[]
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_plan_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_start_date is null then
    raise exception 'Start date is required';
  end if;

  if p_bottle_choice not in ('return', 'new') then
    raise exception 'Invalid bottle choice';
  end if;

  if coalesce(array_length(p_schedule, 1), 0) <> 7
    or exists (
      select 1
      from unnest(p_schedule) as value
      where value < 0 or value > 5
    )
    or (select coalesce(sum(value), 0) from unnest(p_schedule) as value) = 0
  then
    raise exception 'A valid seven-day milk schedule is required';
  end if;

  select id
  into v_plan_id
  from public.delivery_plans
  where user_id = v_user_id
    and status = 'pending_confirmation'
  for update;

  if v_plan_id is null then
    insert into public.delivery_plans (
      user_id,
      status,
      start_date,
      bottle_choice
    )
    values (
      v_user_id,
      'pending_confirmation',
      p_start_date,
      p_bottle_choice
    )
    returning id into v_plan_id;
  else
    update public.delivery_plans
    set
      start_date = p_start_date,
      bottle_choice = p_bottle_choice,
      updated_at = now()
    where id = v_plan_id
      and user_id = v_user_id;
  end if;

  delete from public.weekly_delivery_items
  where plan_id = v_plan_id
    and user_id = v_user_id
    and product_key = 'milk';

  insert into public.weekly_delivery_items (
    plan_id,
    user_id,
    product_key,
    day_of_week,
    quantity,
    unit
  )
  select
    v_plan_id,
    v_user_id,
    'milk',
    day_number::smallint,
    litres,
    'litre'
  from unnest(p_schedule) with ordinality as schedule(litres, day_number)
  where litres > 0;

  return v_plan_id;
end;
$$;

grant execute on function public.save_pending_weekly_milk_plan(date, text, integer[])
to authenticated;
