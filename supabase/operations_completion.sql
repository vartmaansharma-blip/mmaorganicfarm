-- Complete the non-payment operations flow: customer notices, cancellation
-- requests, and delivery status updates that consume a milk credit once.

create table if not exists public.customer_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in (
    'payment_confirmed',
    'delivery_ready',
    'out_for_delivery',
    'delivery_completed',
    'delivery_failed',
    'delivery_cancelled',
    'cancellation_update'
  )),
  title text not null,
  message text not null,
  order_id uuid references public.orders (id) on delete cascade,
  delivery_id uuid references public.daily_deliveries (id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.cancellation_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  order_id uuid references public.orders (id) on delete cascade,
  plan_id uuid references public.delivery_plans (id) on delete cascade,
  reason text not null check (char_length(reason) between 3 and 500),
  status text not null default 'requested'
    check (status in ('requested', 'approved', 'declined', 'completed')),
  resolution_note text,
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  check (num_nonnulls(order_id, plan_id) = 1)
);

create index if not exists customer_notifications_user_created_idx
on public.customer_notifications (user_id, created_at desc);

create index if not exists cancellation_requests_status_created_idx
on public.cancellation_requests (status, created_at);

alter table public.customer_notifications enable row level security;
alter table public.cancellation_requests enable row level security;

grant select, update on public.customer_notifications to authenticated;
grant select, insert, update on public.cancellation_requests to authenticated;

drop policy if exists "Customers can read their notifications" on public.customer_notifications;
create policy "Customers can read their notifications"
on public.customer_notifications for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Customers can mark their notifications read" on public.customer_notifications;
create policy "Customers can mark their notifications read"
on public.customer_notifications for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Customers and staff can read cancellation requests" on public.cancellation_requests;
create policy "Customers and staff can read cancellation requests"
on public.cancellation_requests for select to authenticated
using (
  (select auth.uid()) = user_id
  or exists (
    select 1 from public.farm_staff
    where farm_staff.user_id = (select auth.uid()) and farm_staff.active
  )
);

drop policy if exists "Customers can request cancellation" on public.cancellation_requests;
create policy "Customers can request cancellation"
on public.cancellation_requests for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and status = 'requested'
  and resolved_by is null
  and resolved_at is null
  and (
    (order_id is not null and exists (
      select 1 from public.orders
      where orders.id = cancellation_requests.order_id
        and orders.user_id = (select auth.uid())
    ))
    or
    (plan_id is not null and exists (
      select 1 from public.delivery_plans
      where delivery_plans.id = cancellation_requests.plan_id
        and delivery_plans.user_id = (select auth.uid())
    ))
  )
);

drop policy if exists "Managers can resolve cancellation requests" on public.cancellation_requests;
create policy "Managers can resolve cancellation requests"
on public.cancellation_requests for update to authenticated
using (
  exists (
    select 1 from public.farm_staff
    where farm_staff.user_id = (select auth.uid())
      and farm_staff.active
      and farm_staff.role in ('manager', 'admin')
  )
)
with check (
  exists (
    select 1 from public.farm_staff
    where farm_staff.user_id = (select auth.uid())
      and farm_staff.active
      and farm_staff.role in ('manager', 'admin')
  )
);

create or replace function public.update_daily_delivery_status(
  p_delivery_id uuid,
  p_status text
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_delivery public.daily_deliveries%rowtype;
  v_has_milk boolean := false;
  v_new_delivered integer;
begin
  if p_status not in ('ready', 'out_for_delivery', 'delivered', 'failed', 'cancelled') then
    raise exception 'Unsupported delivery status';
  end if;

  if not exists (
    select 1 from public.farm_staff
    where farm_staff.user_id = v_actor_id
      and farm_staff.active
      and farm_staff.role in ('manager', 'admin')
  ) then
    raise exception 'Farm manager access required';
  end if;

  select * into v_delivery
  from public.daily_deliveries
  where id = p_delivery_id
  for update;

  if v_delivery.id is null then raise exception 'Delivery not found'; end if;
  if v_delivery.status = 'delivered' then return v_delivery.status; end if;

  if not (
    (v_delivery.status = 'planned' and p_status in ('ready', 'cancelled'))
    or (v_delivery.status = 'ready' and p_status in ('out_for_delivery', 'delivered', 'failed', 'cancelled'))
    or (v_delivery.status = 'out_for_delivery' and p_status in ('delivered', 'failed'))
    or (v_delivery.status = 'failed' and p_status in ('ready', 'cancelled'))
  ) then
    raise exception 'Invalid delivery status change';
  end if;

  select exists (
    select 1 from public.daily_delivery_items
    where delivery_id = v_delivery.id and product_key = 'milk'
  ) into v_has_milk;

  update public.daily_deliveries
  set status = p_status,
      completed_at = case when p_status in ('delivered', 'failed', 'cancelled') then now() else null end,
      updated_at = now()
  where id = v_delivery.id;

  if p_status = 'delivered' and v_delivery.plan_id is not null and v_has_milk then
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

  insert into public.customer_notifications (
    user_id, kind, title, message, order_id, delivery_id
  ) values (
    v_delivery.user_id,
    case p_status
      when 'ready' then 'delivery_ready'
      when 'out_for_delivery' then 'out_for_delivery'
      when 'delivered' then 'delivery_completed'
      when 'failed' then 'delivery_failed'
      else 'delivery_cancelled'
    end,
    case p_status
      when 'ready' then 'Your delivery is prepared'
      when 'out_for_delivery' then 'Your delivery is on the way'
      when 'delivered' then 'Delivery completed'
      when 'failed' then 'Delivery needs attention'
      else 'Delivery cancelled'
    end,
    case p_status
      when 'ready' then 'The farm has prepared your scheduled delivery.'
      when 'out_for_delivery' then 'Your farm order is out for delivery.'
      when 'delivered' then 'Your scheduled farm delivery was marked delivered.'
      when 'failed' then 'The farm could not complete this delivery. No milk credit was used.'
      else 'This delivery was cancelled. No milk credit was used.'
    end,
    v_delivery.order_id,
    v_delivery.id
  );

  return p_status;
end;
$$;

revoke execute on function public.update_daily_delivery_status(uuid, text)
from public, anon;
grant execute on function public.update_daily_delivery_status(uuid, text)
to authenticated;
