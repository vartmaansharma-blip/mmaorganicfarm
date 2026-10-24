-- Add finite, prepaid calendar-month baskets alongside existing milk-credit plans.
-- No existing paid plan or fulfilment row is rewritten.
alter table public.delivery_plans
 add column if not exists billing_model text not null default 'milk_credits',
 add column if not exists period_end_exclusive date,
 add column if not exists schedule_rules jsonb;
alter table public.delivery_plans drop constraint if exists delivery_plans_purchased_deliveries_check;
alter table public.delivery_plans add constraint delivery_plans_billing_model_check check (
 (billing_model='milk_credits' and purchased_deliveries between 1 and 365 and period_end_exclusive is null and schedule_rules is null)
 or (billing_model='calendar_month' and purchased_deliveries=0 and delivered_deliveries=0
 and period_end_exclusive is not null and schedule_rules is not null
 and period_end_exclusive=(start_date+interval '1 month')::date
 and jsonb_typeof(schedule_rules)='array' and jsonb_array_length(schedule_rules) between 1 and 3)
);
alter table public.scheduled_delivery_items drop constraint if exists scheduled_delivery_items_product_key_check;
alter table public.scheduled_delivery_items add constraint scheduled_delivery_items_product_key_check
 check(product_key in ('milk','paneer','ghee','papaya','sweets'));

-- Customers can read their monthly plan. Trusted RPCs own its immutable paid schedule.
create policy "Monthly plans use trusted updates" on public.delivery_plans as restrictive for update to authenticated
 using(billing_model<>'calendar_month') with check(billing_model<>'calendar_month');
create policy "Monthly plans use trusted deletion" on public.delivery_plans as restrictive for delete to authenticated using(billing_model<>'calendar_month');
create policy "Monthly dates use trusted insert" on public.scheduled_delivery_items as restrictive for insert to authenticated
 with check(not exists(select 1 from public.delivery_plans p where p.id=plan_id and p.billing_model='calendar_month'));
create policy "Monthly dates use trusted update" on public.scheduled_delivery_items as restrictive for update to authenticated
 using(not exists(select 1 from public.delivery_plans p where p.id=plan_id and p.billing_model='calendar_month'))
 with check(not exists(select 1 from public.delivery_plans p where p.id=plan_id and p.billing_model='calendar_month'));
create policy "Monthly dates use trusted deletion" on public.scheduled_delivery_items as restrictive for delete to authenticated
 using(not exists(select 1 from public.delivery_plans p where p.id=plan_id and p.billing_model='calendar_month'));

create policy "Monthly plans use trusted insert" on public.delivery_plans as restrictive for insert to authenticated with check(billing_model<>'calendar_month');
create policy "Monthly weekly_delivery_items trusted insert" on public.weekly_delivery_items as restrictive for insert to authenticated with check(not exists(select 1 from public.delivery_plans p where p.id=weekly_delivery_items.plan_id and p.billing_model='calendar_month'));
create policy "Monthly weekly_delivery_items trusted update" on public.weekly_delivery_items as restrictive for update to authenticated using(not exists(select 1 from public.delivery_plans p where p.id=weekly_delivery_items.plan_id and p.billing_model='calendar_month')) with check(not exists(select 1 from public.delivery_plans p where p.id=weekly_delivery_items.plan_id and p.billing_model='calendar_month'));
create policy "Monthly weekly_delivery_items trusted delete" on public.weekly_delivery_items as restrictive for delete to authenticated using(not exists(select 1 from public.delivery_plans p where p.id=weekly_delivery_items.plan_id and p.billing_model='calendar_month')) ;
create policy "Monthly delivery_exceptions trusted insert" on public.delivery_exceptions as restrictive for insert to authenticated with check(not exists(select 1 from public.delivery_plans p where p.id=delivery_exceptions.plan_id and p.billing_model='calendar_month'));
create policy "Monthly delivery_exceptions trusted update" on public.delivery_exceptions as restrictive for update to authenticated using(not exists(select 1 from public.delivery_plans p where p.id=delivery_exceptions.plan_id and p.billing_model='calendar_month')) with check(not exists(select 1 from public.delivery_plans p where p.id=delivery_exceptions.plan_id and p.billing_model='calendar_month'));
create policy "Monthly delivery_exceptions trusted delete" on public.delivery_exceptions as restrictive for delete to authenticated using(not exists(select 1 from public.delivery_plans p where p.id=delivery_exceptions.plan_id and p.billing_model='calendar_month')) ;
create policy "Monthly delivery_pauses trusted insert" on public.delivery_pauses as restrictive for insert to authenticated with check(not exists(select 1 from public.delivery_plans p where p.id=delivery_pauses.plan_id and p.billing_model='calendar_month'));
create policy "Monthly delivery_pauses trusted update" on public.delivery_pauses as restrictive for update to authenticated using(not exists(select 1 from public.delivery_plans p where p.id=delivery_pauses.plan_id and p.billing_model='calendar_month')) with check(not exists(select 1 from public.delivery_plans p where p.id=delivery_pauses.plan_id and p.billing_model='calendar_month'));
create policy "Monthly delivery_pauses trusted delete" on public.delivery_pauses as restrictive for delete to authenticated using(not exists(select 1 from public.delivery_plans p where p.id=delivery_pauses.plan_id and p.billing_model='calendar_month')) ;

create or replace function private.monthly_routine_quantity(p_rule jsonb,p_date date)
returns integer language sql immutable set search_path='' as $$
 select case when p_date<(p_rule->>'firstDate')::date then 0
 when p_rule->>'repeat'='custom' and p_rule->'dates' ? to_char(p_date,'YYYY-MM-DD') then (p_rule->>'quantity')::integer
 when p_rule->>'repeat'='daily' then (p_rule->>'quantity')::integer
 when p_rule->>'repeat'='once' and p_date=(p_rule->>'firstDate')::date then (p_rule->>'quantity')::integer
 when p_rule->>'repeat'='weekly' and mod(p_date-(p_rule->>'firstDate')::date,7)=0 then (p_rule->>'quantity')::integer
 when p_rule->>'repeat'='fortnightly' and mod(p_date-(p_rule->>'firstDate')::date,14)=0 then (p_rule->>'quantity')::integer
 when p_rule->>'repeat'='monthly' and extract(day from p_date)=least(extract(day from (p_rule->>'firstDate')::date),extract(day from date_trunc('month',p_date)+interval '1 month - 1 day')) then (p_rule->>'quantity')::integer
 when p_rule->>'repeat'='days' then coalesce((p_rule->'week'->>(extract(isodow from p_date)::integer-1))::integer,0)
 else 0 end;
$$;
revoke all on function private.monthly_routine_quantity(jsonb,date) from public,anon,authenticated;

create or replace function public.save_pending_monthly_plan(p_start_date date,p_bottle_choice text,p_rules jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare
 v_user uuid:=(select auth.uid());v_plan uuid;v_rule jsonb;v_day date;v_end date;v_quantity integer;v_milk boolean:=false;
begin
 if v_user is null then raise exception 'Authentication required' using errcode='42501';end if;
 if p_start_date is null or p_start_date<((now() at time zone 'Asia/Kolkata')::date+1) then raise exception 'Choose a start date from tomorrow';end if;
 v_end:=(p_start_date+interval '1 month')::date;
 if p_rules is null or jsonb_typeof(p_rules)<>'array' or jsonb_array_length(p_rules) not between 1 and 3 then raise exception 'Choose valid product routines';end if;
 if exists(select 1 from jsonb_array_elements(p_rules) x group by x->>'id' having count(*)>1) then raise exception 'Choose one routine per product';end if;
 for v_rule in select value from jsonb_array_elements(p_rules) loop
  if coalesce(v_rule->>'id','') not in ('milk','paneer','ghee') or coalesce(v_rule->>'repeat','') not in ('once','daily','weekly','fortnightly','monthly','days','custom')
   or coalesce(v_rule->>'quantity','')!~'^[1-5]$' or coalesce(v_rule->>'firstDate','')!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid product routine';end if;
  if (v_rule->>'firstDate')::date<p_start_date or (v_rule->>'firstDate')::date>=v_end then raise exception 'Choose first deliveries within this prepaid month';end if;
  if v_rule->>'repeat'='days' then
   if jsonb_typeof(v_rule->'week') is distinct from 'array' then raise exception 'Choose a valid week';end if;
   if jsonb_array_length(v_rule->'week')<>7 or exists(select 1 from jsonb_array_elements_text(v_rule->'week') q where q is null or q!~'^[0-5]$') then raise exception 'Choose valid daily quantities';end if;
  end if;
  if v_rule->>'repeat'='custom' then
   if jsonb_typeof(v_rule->'dates') is distinct from 'array' then raise exception 'Choose valid custom dates';end if;
   if jsonb_array_length(v_rule->'dates') not between 1 and 31 then raise exception 'Choose at least one custom date';end if;
   if exists(select 1 from jsonb_array_elements_text(v_rule->'dates') d where d !~ '^\d{4}-\d{2}-\d{2}$') then raise exception 'Invalid custom date';end if;
   if exists(select 1 from jsonb_array_elements_text(v_rule->'dates') d where d::date<p_start_date or d::date>=v_end)
    or (select count(distinct d) from jsonb_array_elements_text(v_rule->'dates') d)<>jsonb_array_length(v_rule->'dates')
    or (select min(d) from jsonb_array_elements_text(v_rule->'dates') d)<>v_rule->>'firstDate'
   then raise exception 'Choose unique custom dates within this month';end if;
  end if;
  if not exists(select 1 from generate_series(0,(v_end-p_start_date)-1) d where private.monthly_routine_quantity(v_rule,p_start_date+d)>0) then raise exception 'Each product needs a delivery within this month';end if;
  v_milk:=v_milk or v_rule->>'id'='milk';
 end loop;
 if p_bottle_choice is null or (v_milk and p_bottle_choice not in ('return','new')) or (not v_milk and p_bottle_choice<>'none') then raise exception 'Choose a valid bottle option';end if;
 perform pg_advisory_xact_lock(hashtextextended(v_user::text,0));
 if exists(select 1 from public.delivery_plans where user_id=v_user and status in ('active','paused')) then raise exception 'You already have a current paid plan. Open its delivery calendar or contact the farm before starting another.';end if;
 select id into v_plan from public.delivery_plans where user_id=v_user and status='pending_confirmation' for update;
 if v_plan is not null then
  if exists(select 1 from public.orders where delivery_plan_id=v_plan and (status='pending_payment' or (status='draft' and razorpay_order_id is not null))) then raise exception 'A payment checkout is already in progress. Finish or resolve it before changing this plan.';end if;
  update public.orders set status='cancelled',updated_at=now() where delivery_plan_id=v_plan and status in ('draft','pending_payment');
  delete from public.weekly_delivery_items where plan_id=v_plan;
  delete from public.scheduled_delivery_items where plan_id=v_plan;
  update public.delivery_plans set start_date=p_start_date,bottle_choice=p_bottle_choice,billing_model='calendar_month',period_end_exclusive=v_end,schedule_rules=p_rules,purchased_deliveries=0,delivered_deliveries=0,updated_at=now() where id=v_plan and user_id=v_user;
 else
  insert into public.delivery_plans(user_id,status,start_date,bottle_choice,billing_model,period_end_exclusive,schedule_rules,purchased_deliveries,delivered_deliveries)
  values(v_user,'pending_confirmation',p_start_date,p_bottle_choice,'calendar_month',v_end,p_rules,0,0) returning id into v_plan;
 end if;
 for v_day in select p_start_date+d from generate_series(0,(v_end-p_start_date)-1) d loop
  for v_rule in select value from jsonb_array_elements(p_rules) loop
   v_quantity:=private.monthly_routine_quantity(v_rule,v_day);
   if v_quantity>0 then insert into public.scheduled_delivery_items(plan_id,user_id,product_key,delivery_date,quantity,unit)
    values(v_plan,v_user,v_rule->>'id',v_day,v_quantity,case when v_rule->>'id'='milk' then 'litre' else '500 g' end);end if;
  end loop;
 end loop;
 return v_plan;
end;
$$;
revoke all on function public.save_pending_monthly_plan(date,text,jsonb) from public,anon;
grant execute on function public.save_pending_monthly_plan(date,text,jsonb) to authenticated;

create or replace function private.complete_monthly_plan()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.plan_id is null or new.status<>'delivered' then return new;end if;
 if exists(select 1 from public.delivery_plans p where p.id=new.plan_id and p.billing_model='calendar_month' and p.status in ('active','paused'))
 and not exists(select 1 from public.scheduled_delivery_items s where s.plan_id=new.plan_id and not exists(select 1 from public.daily_deliveries d where d.plan_id=s.plan_id and d.delivery_date=s.delivery_date and d.status='delivered'))
 then update public.delivery_plans set status='completed',updated_at=now() where id=new.plan_id and billing_model='calendar_month';end if;
 return new;
end;
$$;
revoke all on function private.complete_monthly_plan() from public,anon,authenticated;
create trigger complete_monthly_plan after update of status on public.daily_deliveries for each row execute function private.complete_monthly_plan();

-- Preserve operational function bodies, extending only versioned monthly behavior.
-- public.reserve_order_capacity
CREATE OR REPLACE FUNCTION public.reserve_order_capacity(p_order_id uuid, p_hold_hours integer DEFAULT 24)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_order record;
  v_product_key text;
  v_delivery_date date;
  v_quantity numeric(8, 2);
  v_daily_limit numeric(8, 2);
  v_active_plans numeric(8, 2);
  v_paid_once numeric(8, 2);
  v_pending_holds numeric(8, 2);
  v_reserved_dates integer := 0;
  v_offset integer;
  v_monthly_end date;
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_hold_hours < 1 or p_hold_hours > 48 then
    raise exception 'Capacity hold must be between 1 and 48 hours';
  end if;

  select id, delivery_plan_id, purchase_mode, start_date, status
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if v_order.id is null then
    raise exception 'Order not found';
  end if;

  if v_order.status not in ('draft', 'pending_payment') then
    raise exception 'This order cannot reserve production capacity';
  end if;

  if v_order.start_date is null then
    raise exception 'A delivery start date is required';
  end if;

  if v_order.purchase_mode = 'plan' and v_order.delivery_plan_id is null then
    raise exception 'A delivery plan is required';
  end if;

  -- Lock every tracked product in a fixed order so two checkouts cannot oversell.
  select period_end_exclusive into v_monthly_end from public.delivery_plans where id=v_order.delivery_plan_id and billing_model='calendar_month';

  for v_product_key in
    select capacity.product_key
    from public.production_capacity as capacity
    where capacity.product_key in ('milk', 'paneer', 'ghee')
    order by capacity.product_key
  loop
    perform 1
    from public.production_capacity
    where product_key = v_product_key
    for update;
  end loop;

  update public.order_capacity_reservations
  set status = 'released', expires_at = null, updated_at = now()
  where status = 'pending'
    and expires_at <= now();

  update public.order_capacity_reservations
  set status = 'released', expires_at = null, updated_at = now()
  where order_id = p_order_id
    and status = 'pending';

  for v_product_key in
    select capacity.product_key
    from public.production_capacity as capacity
    where capacity.product_key in ('milk', 'paneer', 'ghee')
    order by capacity.product_key
  loop
    for v_offset in 0..(case when v_monthly_end is not null then (v_monthly_end-v_order.start_date)-1 when v_order.purchase_mode = 'plan' then 6 else 0 end)
    loop
      v_delivery_date := v_order.start_date + v_offset;

      if v_order.purchase_mode = 'plan' then
        v_quantity := public.plan_product_quantity(
          v_order.delivery_plan_id,
          v_product_key,
          v_delivery_date
        );
      else
        select coalesce(sum(item.quantity), 0)
        into v_quantity
        from public.order_items as item
        where item.order_id = p_order_id
          and item.product_key = v_product_key
          and item.frequency = 'once'
          and coalesce(item.delivery_date, v_order.start_date) = v_delivery_date;
      end if;

      if v_quantity <= 0 then
        continue;
      end if;

      select coalesce(override.daily_limit, capacity.daily_limit)
      into v_daily_limit
      from public.production_capacity as capacity
      left join public.production_capacity_overrides as override
        on override.product_key = capacity.product_key
        and override.delivery_date = v_delivery_date
      where capacity.product_key = v_product_key;

      select coalesce(sum(public.plan_product_quantity(
        plan.id,
        v_product_key,
        v_delivery_date
      )), 0)
      into v_active_plans
      from public.delivery_plans as plan
      where plan.status = 'active'
        and plan.start_date <= v_delivery_date
        and (plan.billing_model='calendar_month' or plan.delivered_deliveries < plan.purchased_deliveries)
        and plan.id is distinct from v_order.delivery_plan_id
        and not exists (
          select 1
          from public.delivery_pauses as pause
          where pause.plan_id = plan.id
            and v_delivery_date between pause.start_date and pause.end_date
        );

      select coalesce(sum(item.quantity), 0)
      into v_paid_once
      from public.orders as paid_order
      join public.order_items as item on item.order_id = paid_order.id
      where paid_order.status = 'paid'
        and paid_order.purchase_mode = 'once'
        and paid_order.id <> p_order_id
        and item.product_key = v_product_key
        and item.frequency = 'once'
        and coalesce(item.delivery_date, paid_order.start_date) = v_delivery_date;

      select coalesce(sum(reservation.quantity), 0)
      into v_pending_holds
      from public.order_capacity_reservations as reservation
      where reservation.product_key = v_product_key
        and reservation.delivery_date = v_delivery_date
        and reservation.order_id <> p_order_id
        and reservation.status = 'pending'
        and reservation.expires_at > now();

      if v_active_plans + v_paid_once + v_pending_holds + v_quantity > v_daily_limit then
        raise exception '% capacity is full for %. Choose another delivery date.',
          initcap(v_product_key),
          to_char(v_delivery_date, 'FMDay, FMDD FMMonth');
      end if;

      insert into public.order_capacity_reservations (
        order_id,
        product_key,
        delivery_date,
        quantity,
        status,
        expires_at
      )
      values (
        p_order_id,
        v_product_key,
        v_delivery_date,
        v_quantity,
        'pending',
        now() + make_interval(hours => p_hold_hours)
      )
      on conflict (order_id, product_key, delivery_date)
      do update set
        quantity = excluded.quantity,
        status = 'pending',
        expires_at = excluded.expires_at,
        updated_at = now();

      v_reserved_dates := v_reserved_dates + 1;
    end loop;
  end loop;

  return jsonb_build_object(
    'reserved', true,
    'reserved_product_dates', v_reserved_dates,
    'expires_at', now() + make_interval(hours => p_hold_hours)
  );
end;
$function$;


-- public.product_capacity_snapshot
CREATE OR REPLACE FUNCTION public.product_capacity_snapshot(p_product_key text, p_start_date date, p_days integer DEFAULT 7)
 RETURNS TABLE(delivery_date date, capacity_limit numeric, active_plan_quantity numeric, paid_once_quantity numeric, checkout_holds_quantity numeric, available_quantity numeric)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_product_key not in ('milk', 'paneer', 'ghee') then
    raise exception 'Unsupported capacity product';
  end if;

  if p_days < 1 or p_days > 31 then
    raise exception 'Capacity view must cover between 1 and 31 days';
  end if;

  return query
  with dates as (
    select generate_series(
      p_start_date,
      p_start_date + (p_days - 1),
      interval '1 day'
    )::date as day
  ),
  usage as (
    select
      dates.day,
      (
        select coalesce(sum(public.plan_product_quantity(
          plan.id,
          p_product_key,
          dates.day
        )), 0)
        from public.delivery_plans as plan
        where plan.status = 'active'
          and plan.start_date <= dates.day
          and (plan.billing_model='calendar_month' or plan.delivered_deliveries < plan.purchased_deliveries)
          and not exists (
            select 1
            from public.delivery_pauses as pause
            where pause.plan_id = plan.id
              and dates.day between pause.start_date and pause.end_date
          )
      ) as active_plans,
      (
        select coalesce(sum(item.quantity), 0)
        from public.orders as paid_order
        join public.order_items as item on item.order_id = paid_order.id
        where paid_order.status = 'paid'
          and paid_order.purchase_mode = 'once'
          and item.product_key = p_product_key
          and item.frequency = 'once'
          and coalesce(item.delivery_date, paid_order.start_date) = dates.day
      ) as paid_once,
      (
        select coalesce(sum(reservation.quantity), 0)
        from public.order_capacity_reservations as reservation
        where reservation.product_key = p_product_key
          and reservation.delivery_date = dates.day
          and reservation.status = 'pending'
          and reservation.expires_at > now()
      ) as checkout_holds
    from dates
  )
  select
    usage.day,
    coalesce(override.daily_limit, capacity.daily_limit),
    usage.active_plans,
    usage.paid_once,
    usage.checkout_holds,
    greatest(
      coalesce(override.daily_limit, capacity.daily_limit)
        - usage.active_plans
        - usage.paid_once
        - usage.checkout_holds,
      0
    )
  from usage
  cross join public.production_capacity as capacity
  left join public.production_capacity_overrides as override
    on override.product_key = capacity.product_key
    and override.delivery_date = usage.day
  where capacity.product_key = p_product_key
  order by usage.day;
end;
$function$;


-- private.record_delivery_visit_impl
CREATE OR REPLACE FUNCTION private.record_delivery_visit_impl(p_delivery_ids uuid[], p_delivery_confirmed boolean, p_bottles_returned integer, p_driver_note text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_actor_role text;
  v_clean_note text := nullif(trim(p_driver_note), '');
  v_delivery record;
  v_expected integer := coalesce(array_length(p_delivery_ids, 1), 0);
  v_found integer;
  v_visit_count integer;
  v_bottles_expected integer;
  v_changed boolean := false;
  v_first_delivery_id uuid;
  v_first_order_id uuid;
  v_user_id uuid;
  v_new_delivered integer;
  v_new_status text;
begin
  if v_actor_id is null then
    raise exception 'Sign in is required';
  end if;

  if v_expected < 1 or v_expected > 50 or array_position(p_delivery_ids, null) is not null then
    raise exception 'Choose between 1 and 50 delivery rows';
  end if;

  if p_delivery_confirmed is null or p_bottles_returned is null then
    raise exception 'Delivery and bottle counts are required';
  end if;
  v_new_status := case when p_delivery_confirmed then 'delivered' else 'failed' end;

  if char_length(coalesce(v_clean_note, '')) > 250 then
    raise exception 'Driver note is too long';
  end if;

  select role into v_actor_role
  from public.farm_staff
  where user_id = v_actor_id and active;

  if v_actor_role is null or v_actor_role not in ('driver', 'manager', 'admin') then
    raise exception 'Farm staff access required';
  end if;

  -- Lock every child row in a consistent order before validating or updating.
  perform 1
  from public.daily_deliveries
  where id = any(p_delivery_ids)
  order by id
  for update;

  select
    count(*),
    count(distinct visit_key),
    count(*) filter (where bottle_return_required and status <> 'cancelled'),
    (array_agg(id order by id) filter (where status <> 'cancelled'))[1],
    (array_agg(order_id order by id) filter (where order_id is not null and status <> 'cancelled'))[1],
    (array_agg(user_id order by id))[1]
  into
    v_found,
    v_visit_count,
    v_bottles_expected,
    v_first_delivery_id,
    v_first_order_id,
    v_user_id
  from public.daily_deliveries
  where id = any(p_delivery_ids);

  if v_found <> v_expected then
    raise exception 'One or more delivery rows could not be found';
  end if;

  if v_visit_count <> 1 then
    raise exception 'Only rows from one doorstep visit can be completed together';
  end if;

  if p_bottles_returned < 0 or p_bottles_returned > v_bottles_expected then
    raise exception 'Bottle returns must be between 0 and %', v_bottles_expected;
  end if;

  if v_actor_role = 'driver' and exists (
    select 1
    from public.daily_deliveries
    where id = any(p_delivery_ids)
      and assigned_driver_id is distinct from v_actor_id
  ) then
    raise exception 'This visit is not assigned to you';
  end if;

  if not p_delivery_confirmed and exists (
    select 1
    from public.daily_deliveries
    where id = any(p_delivery_ids)
      and (delivery_confirmed or status = 'delivered')
  ) then
    raise exception 'A completed visit cannot be reopened';
  end if;

  if not exists (
    select 1
    from public.daily_deliveries
    where id = any(p_delivery_ids)
      and status <> 'cancelled'
  ) then
    raise exception 'A cancelled visit cannot be completed';
  end if;

  for v_delivery in
    select
      delivery.*,
      exists (
        select 1 from public.daily_delivery_items as item
        where item.delivery_id = delivery.id and item.product_key = 'milk'
      ) as has_milk,
      row_number() over (
        partition by (delivery.bottle_return_required and delivery.status <> 'cancelled')
        order by delivery.id
      ) as bottle_number
    from public.daily_deliveries as delivery
    where delivery.id = any(p_delivery_ids)
    order by delivery.id
  loop
    if v_delivery.status = 'cancelled' then
      continue;
    end if;

    if v_delivery.status is distinct from v_new_status then
      v_changed := true;
    end if;

    update public.daily_deliveries
    set status = v_new_status,
        delivery_confirmed = p_delivery_confirmed,
        bottle_returned = case
          when v_delivery.bottle_return_required
            then v_delivery.bottle_number <= p_bottles_returned
          else false
        end,
        delivered_confirmed_at = case
          when p_delivery_confirmed then coalesce(delivered_confirmed_at, now())
          else null
        end,
        bottle_returned_at = case
          when v_delivery.bottle_return_required
            and v_delivery.bottle_number <= p_bottles_returned
            then coalesce(bottle_returned_at, now())
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
      and v_delivery.has_milk
      and exists(select 1 from public.delivery_plans p where p.id=v_delivery.plan_id and p.billing_model='milk_credits')
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
  end loop;

  if v_changed then
    insert into public.customer_notifications (
      user_id, kind, title, message, order_id, delivery_id
    ) values (
      v_user_id,
      case when p_delivery_confirmed then 'delivery_completed' else 'delivery_failed' end,
      case when p_delivery_confirmed then 'Delivery completed' else 'Delivery needs attention' end,
      case
        when p_delivery_confirmed then 'Your farm delivery was marked delivered.'
        else 'The farm could not complete this visit. No milk credit was used.'
      end,
      v_first_order_id,
      v_first_delivery_id
    );
  end if;

  return 1;
end;
$function$;



create or replace function public.milk_capacity_snapshot(p_start_date date,p_days integer default 7)
returns table(delivery_date date,capacity_limit numeric,active_plan_litres numeric,paid_once_litres numeric,checkout_holds_litres numeric,available_litres numeric)
language sql set search_path='' as $$
 select * from public.product_capacity_snapshot('milk',p_start_date,p_days);
$$;

-- Atomically freeze a checked invoice before starting a provider request.
-- Draft edits and checkout creation lock the same plan, closing the read/edit race.
create or replace function public.claim_monthly_checkout(p_order_id uuid,p_expected_rules jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_order public.orders%rowtype;v_plan public.delivery_plans%rowtype;
begin
 if (select auth.role()) is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501';end if;
 select * into v_order from public.orders where id=p_order_id;
 if v_order.id is null or v_order.delivery_plan_id is null then raise exception 'Order missing';end if;
 select * into v_plan from public.delivery_plans where id=v_order.delivery_plan_id for update;
 select * into v_order from public.orders where id=p_order_id for update;
 if v_plan.billing_model<>'calendar_month' or v_plan.user_id<>v_order.user_id or v_plan.status<>'pending_confirmation'
 or v_order.start_date is distinct from v_plan.start_date or v_order.status not in ('draft','pending_payment') or v_plan.schedule_rules is distinct from p_expected_rules
 then raise exception 'Your selection changed. Review the order again.';end if;
 if v_order.status='pending_payment' then
  if v_order.razorpay_order_id is null then raise exception 'Payment preparation is already in progress. Please contact the farm if it does not finish.';end if;
  return true;
 end if;
 update public.orders set status='pending_payment',updated_at=now() where id=p_order_id;
 return true;
end;$$;
revoke all on function public.claim_monthly_checkout(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.claim_monthly_checkout(uuid,jsonb) to service_role;
