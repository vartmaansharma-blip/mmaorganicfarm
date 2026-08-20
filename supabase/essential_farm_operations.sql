-- Essential farm operations: paid-only finance, safe corrections, and automatic routing.

alter table public.delivery_routes
add column if not exists match_terms text[] not null default '{}',
add column if not exists postal_codes text[] not null default '{}';

comment on column public.delivery_routes.match_terms is
'Locality or address terms used to assign paid customer schedules automatically.';
comment on column public.delivery_routes.postal_codes is
'Six-digit postal codes used to assign paid customer schedules automatically.';

alter table public.payments
add column if not exists payment_method text;

alter table public.payments
drop constraint if exists payments_provider_check;
alter table public.payments
add constraint payments_provider_check
check (provider in ('razorpay', 'shopify', 'manual'));

alter table public.payments
drop constraint if exists payments_status_check;
alter table public.payments
add constraint payments_status_check
check (status in ('created', 'authorized', 'captured', 'failed', 'voided'));

alter table public.payments
drop constraint if exists payments_payment_method_check;
alter table public.payments
add constraint payments_payment_method_check
check (
  payment_method is null
  or payment_method in ('cash', 'upi', 'bank_transfer', 'other')
);

create table if not exists public.payment_status_changes (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  changed_by uuid not null references auth.users(id) on delete restrict,
  previous_status text not null,
  new_status text not null,
  reason text not null check (char_length(trim(reason)) between 3 and 300),
  created_at timestamptz not null default now()
);

create index if not exists payment_status_changes_order_created_idx
on public.payment_status_changes(order_id, created_at desc);

alter table public.payment_status_changes enable row level security;
revoke all on public.payment_status_changes from anon, authenticated;
grant select on public.payment_status_changes to authenticated;

drop policy if exists "Farm managers can read payment corrections"
on public.payment_status_changes;
create policy "Farm managers can read payment corrections"
on public.payment_status_changes
for select
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

create or replace function public.capture_farm_order_payment(
  p_order_id uuid,
  p_payment_method text,
  p_payment_reference text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_payment_id uuid;
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_payment_method not in ('cash', 'upi', 'bank_transfer', 'other') then
    raise exception 'Choose a valid payment method';
  end if;
  if char_length(trim(coalesce(p_payment_reference, ''))) not between 3 and 120 then
    raise exception 'Add a valid payment reference';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if v_order.id is null
    or v_order.is_test
    or v_order.status <> 'pending_payment'
  then
    raise exception 'This order cannot be marked paid';
  end if;

  insert into public.payments (
    order_id,
    user_id,
    provider,
    provider_order_id,
    provider_payment_id,
    payment_method,
    status,
    amount_paise,
    currency,
    signature_verified,
    is_test,
    paid_at
  ) values (
    v_order.id,
    v_order.user_id,
    'manual',
    'manual:' || v_order.id::text,
    trim(p_payment_reference),
    p_payment_method,
    'captured',
    v_order.total_paise,
    'INR',
    false,
    false,
    now()
  )
  returning id into v_payment_id;

  update public.orders
  set status = 'paid', paid_total_paise = total_paise, updated_at = now()
  where id = v_order.id;

  if v_order.delivery_plan_id is not null then
    update public.delivery_plans
    set status = 'active', updated_at = now()
    where id = v_order.delivery_plan_id
      and status = 'pending_confirmation';
  end if;

  perform public.consume_order_capacity(v_order.id);
  return v_payment_id;
end;
$$;

revoke execute on function public.capture_farm_order_payment(uuid, text, text)
from public, anon, authenticated;
grant execute on function public.capture_farm_order_payment(uuid, text, text)
to service_role;

create schema if not exists private;

create or replace function private.assign_customer_route(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.customer_profiles%rowtype;
  v_route public.delivery_routes%rowtype;
  v_stop_order integer;
  v_location text;
begin
  select *
  into v_profile
  from public.customer_profiles
  where user_id = p_user_id
  for update;

  if v_profile.user_id is null or nullif(trim(coalesce(v_profile.address_line, '')), '') is null then
    return null;
  end if;

  if v_profile.delivery_route_id is not null then
    select * into v_route
    from public.delivery_routes
    where id = v_profile.delivery_route_id and active;

    if v_route.id is not null then
      if v_profile.route_stop_order is null then
        select coalesce(max(route_stop_order), 0) + 1
        into v_stop_order
        from public.customer_profiles
        where delivery_route_id = v_route.id;

        update public.customer_profiles
        set route_stop_order = v_stop_order, updated_at = now()
        where user_id = p_user_id;
      end if;
      return v_route.id;
    end if;
  end if;

  v_location := regexp_replace(
    lower(concat_ws(' ', v_profile.locality, v_profile.landmark, v_profile.address_line)),
    '[^a-z0-9]+',
    ' ',
    'g'
  );

  select route.*
  into v_route
  from public.delivery_routes as route
  join public.delivery_areas as area on area.id = route.area_id and area.active
  where route.active
    and (
      (
        v_profile.postal_code is not null
        and v_profile.postal_code = any(route.postal_codes)
      )
      or exists (
        select 1
        from unnest(route.match_terms) as term
        where trim(term) <> ''
          and (' ' || v_location || ' ') like (
            '% ' || regexp_replace(lower(trim(term)), '[^a-z0-9]+', ' ', 'g') || ' %'
          )
      )
      or (
        v_profile.delivery_area_id = route.area_id
        and 1 = (
          select count(*)
          from public.delivery_routes as area_route
          where area_route.area_id = route.area_id and area_route.active
        )
      )
      or (
        v_profile.delivery_area_id is null
        and (' ' || v_location || ' ') like (
          '% ' || regexp_replace(lower(trim(area.name)), '[^a-z0-9]+', ' ', 'g') || ' %'
        )
        and 1 = (
          select count(*)
          from public.delivery_routes as area_route
          where area_route.area_id = route.area_id and area_route.active
        )
      )
    )
  order by
    case
      when v_profile.postal_code is not null and v_profile.postal_code = any(route.postal_codes) then 1
      when exists (
        select 1 from unnest(route.match_terms) as term
        where trim(term) <> ''
          and (' ' || v_location || ' ') like (
            '% ' || regexp_replace(lower(trim(term)), '[^a-z0-9]+', ' ', 'g') || ' %'
          )
      ) then 2
      when v_profile.delivery_area_id = route.area_id then 3
      else 4
    end,
    route.sort_order,
    route.name
  limit 1;

  if v_route.id is null then
    return null;
  end if;

  select coalesce(max(route_stop_order), 0) + 1
  into v_stop_order
  from public.customer_profiles
  where delivery_route_id = v_route.id;

  update public.customer_profiles
  set
    delivery_area_id = v_route.area_id,
    delivery_route_id = v_route.id,
    route_stop_order = v_stop_order,
    updated_at = now()
  where user_id = p_user_id;

  return v_route.id;
end;
$$;

revoke execute on function private.assign_customer_route(uuid)
from public, anon, authenticated;

create or replace function private.route_active_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'active'
    and (tg_op = 'INSERT' or old.status is distinct from new.status)
  then
    perform private.assign_customer_route(new.user_id);
  end if;
  return new;
end;
$$;

revoke execute on function private.route_active_plan()
from public, anon, authenticated;

drop trigger if exists assign_route_when_plan_activates
on public.delivery_plans;
create trigger assign_route_when_plan_activates
after insert or update of status
on public.delivery_plans
for each row
execute function private.route_active_plan();

create or replace function private.route_paid_one_time_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'paid'
    and new.purchase_mode = 'once'
    and (tg_op = 'INSERT' or old.status is distinct from new.status)
  then
    perform private.assign_customer_route(new.user_id);
  end if;
  return new;
end;
$$;

revoke execute on function private.route_paid_one_time_order()
from public, anon, authenticated;

drop trigger if exists assign_route_when_one_time_order_is_paid
on public.orders;
create trigger assign_route_when_one_time_order_is_paid
after insert or update of status
on public.orders
for each row
execute function private.route_paid_one_time_order();

create or replace function public.assign_unrouted_customers()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role text;
  v_customer record;
  v_assigned integer := 0;
begin
  select role into v_actor_role
  from public.farm_staff
  where user_id = (select auth.uid()) and active;

  if v_actor_role not in ('manager', 'admin') then
    raise exception 'Manager access is required';
  end if;

  for v_customer in
    select profile.user_id
    from public.customer_profiles as profile
    where profile.delivery_route_id is null
      and (
        exists (
          select 1 from public.delivery_plans as plan
          where plan.user_id = profile.user_id
            and plan.status = 'active'
            and not plan.is_test
        )
        or exists (
          select 1 from public.orders as farm_order
          where farm_order.user_id = profile.user_id
            and farm_order.status = 'paid'
            and not farm_order.is_test
        )
      )
  loop
    if private.assign_customer_route(v_customer.user_id) is not null then
      v_assigned := v_assigned + 1;
    end if;
  end loop;

  return v_assigned;
end;
$$;

revoke execute on function public.assign_unrouted_customers()
from public, anon;
grant execute on function public.assign_unrouted_customers()
to authenticated;

create or replace function public.reset_manual_payment(
  p_payment_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_actor_role text;
  v_payment public.payments%rowtype;
  v_order public.orders%rowtype;
begin
  select role into v_actor_role
  from public.farm_staff
  where user_id = v_actor_id and active;

  if v_actor_role <> 'admin' then
    raise exception 'Admin access is required';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) not between 3 and 300 then
    raise exception 'Add a short reason for the reset';
  end if;

  select * into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if v_payment.id is null
    or v_payment.provider <> 'manual'
    or v_payment.status <> 'captured'
  then
    raise exception 'Only a captured manual payment can be reset';
  end if;

  select * into v_order
  from public.orders
  where id = v_payment.order_id
  for update;

  insert into public.payment_status_changes (
    payment_id, order_id, changed_by, previous_status, new_status, reason
  ) values (
    v_payment.id, v_order.id, v_actor_id, v_payment.status, 'voided', trim(p_reason)
  );

  update public.payments
  set status = 'voided'
  where id = v_payment.id;

  update public.orders
  set status = 'payment_failed', paid_total_paise = null, updated_at = now()
  where id = v_order.id;

  if v_order.delivery_plan_id is not null then
    update public.delivery_plans
    set status = 'cancelled', updated_at = now()
    where id = v_order.delivery_plan_id;

    update public.daily_deliveries
    set status = 'cancelled', updated_at = now()
    where plan_id = v_order.delivery_plan_id
      and delivery_date >= (now() at time zone 'Asia/Kolkata')::date
      and status in ('planned', 'ready', 'out_for_delivery');
  else
    update public.daily_deliveries
    set status = 'cancelled', updated_at = now()
    where order_id = v_order.id
      and delivery_date >= (now() at time zone 'Asia/Kolkata')::date
      and status in ('planned', 'ready', 'out_for_delivery');
  end if;

  return v_order.id;
end;
$$;

revoke execute on function public.reset_manual_payment(uuid, text)
from public, anon;
grant execute on function public.reset_manual_payment(uuid, text)
to authenticated;

-- Remove abandoned checkout drafts while preserving paid and corrected history.
delete from public.orders as farm_order
where farm_order.status = 'draft'
  and farm_order.created_at < now() - interval '24 hours'
  and not exists (
    select 1 from public.payments where payments.order_id = farm_order.id
  );

update public.orders
set status = 'cancelled', updated_at = now()
where status = 'pending_payment'
  and created_at < now() - interval '24 hours'
  and not exists (
    select 1 from public.payments where payments.order_id = orders.id
  );

update public.delivery_plans as plan
set status = 'cancelled', updated_at = now()
where plan.status = 'pending_confirmation'
  and not exists (
    select 1 from public.orders as farm_order
    where farm_order.delivery_plan_id = plan.id
      and farm_order.status in ('draft', 'pending_payment', 'paid')
  );

do $$
declare
  v_customer record;
begin
  for v_customer in
    select profile.user_id
    from public.customer_profiles as profile
    where profile.delivery_route_id is null
      and (
        exists (
          select 1 from public.delivery_plans as plan
          where plan.user_id = profile.user_id
            and plan.status = 'active'
            and not plan.is_test
        )
        or exists (
          select 1 from public.orders as farm_order
          where farm_order.user_id = profile.user_id
            and farm_order.status = 'paid'
            and not farm_order.is_test
        )
      )
  loop
    perform private.assign_customer_route(v_customer.user_id);
  end loop;
end;
$$;
