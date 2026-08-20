-- Keep privileged routing and payment corrections outside the exposed API schema.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create index if not exists payment_status_changes_payment_idx
on public.payment_status_changes(payment_id);

create index if not exists payment_status_changes_changed_by_idx
on public.payment_status_changes(changed_by);

create or replace function private.assign_unrouted_customers_impl()
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

revoke execute on function private.assign_unrouted_customers_impl()
from public, anon;
grant execute on function private.assign_unrouted_customers_impl()
to authenticated;

create or replace function public.assign_unrouted_customers()
returns integer
language sql
security invoker
set search_path = ''
as $$
  select private.assign_unrouted_customers_impl();
$$;

revoke execute on function public.assign_unrouted_customers()
from public, anon;
grant execute on function public.assign_unrouted_customers()
to authenticated;

create or replace function private.reset_manual_payment_impl(
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

revoke execute on function private.reset_manual_payment_impl(uuid, text)
from public, anon;
grant execute on function private.reset_manual_payment_impl(uuid, text)
to authenticated;

create or replace function public.reset_manual_payment(
  p_payment_id uuid,
  p_reason text
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.reset_manual_payment_impl(p_payment_id, p_reason);
$$;

revoke execute on function public.reset_manual_payment(uuid, text)
from public, anon;
grant execute on function public.reset_manual_payment(uuid, text)
to authenticated;
