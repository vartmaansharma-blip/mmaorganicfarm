-- Baseline live function definitions read 2026-10-24. Data only; local test fixture.
-- public.plan_product_quantity
CREATE OR REPLACE FUNCTION public.plan_product_quantity(p_plan_id uuid, p_product_key text, p_delivery_date date)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select coalesce(
    case
      when exception.action = 'skip' then 0
      when exception.action = 'override' then exception.quantity
      when scheduled.quantity is not null then scheduled.quantity
      else weekly.quantity
    end,
    0
  )
  from (select 1) as anchor
  left join public.weekly_delivery_items as weekly
    on weekly.plan_id = p_plan_id
    and weekly.product_key = p_product_key
    and weekly.day_of_week = extract(isodow from p_delivery_date)::smallint
  left join public.scheduled_delivery_items as scheduled
    on scheduled.plan_id = p_plan_id
    and scheduled.product_key = p_product_key
    and scheduled.delivery_date = p_delivery_date
  left join public.delivery_exceptions as exception
    on exception.plan_id = p_plan_id
    and exception.product_key = p_product_key
    and exception.delivery_date = p_delivery_date;
$function$;


-- public.generate_daily_deliveries
CREATE OR REPLACE FUNCTION public.generate_daily_deliveries(p_delivery_date date)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_delivery_id uuid;
  v_generated integer := 0;
  v_plan record;
  v_order record;
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
      plans.bottle_choice,
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
      order_id,
      user_id,
      delivery_date,
      bottle_choice,
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
      null,
      v_plan.user_id,
      p_delivery_date,
      v_plan.bottle_choice,
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
      delete from public.daily_deliveries where id = v_delivery_id;
    end if;
  end loop;

  for v_order in
    select
      orders.id,
      orders.user_id,
      orders.bottle_choice,
      orders.phone_snapshot,
      orders.address_snapshot,
      profiles.delivery_area_id,
      profiles.delivery_route_id,
      profiles.route_stop_order,
      coalesce(nullif(trim(profiles.full_name), ''), 'Customer') as customer_name
    from public.orders
    join public.customer_profiles as profiles
      on profiles.user_id = orders.user_id
    where orders.purchase_mode = 'once'
      and orders.status = 'paid'
      and orders.start_date = p_delivery_date
  loop
    insert into public.daily_deliveries (
      plan_id,
      order_id,
      user_id,
      delivery_date,
      bottle_choice,
      delivery_area_id,
      delivery_route_id,
      route_stop_order,
      customer_name,
      phone_snapshot,
      address_snapshot,
      generated_by
    )
    values (
      null,
      v_order.id,
      v_order.user_id,
      p_delivery_date,
      v_order.bottle_choice,
      v_order.delivery_area_id,
      v_order.delivery_route_id,
      v_order.route_stop_order,
      v_order.customer_name,
      v_order.phone_snapshot,
      v_order.address_snapshot,
      v_actor_id
    )
    returning id into v_delivery_id;

    insert into public.daily_delivery_items (
      delivery_id,
      product_key,
      quantity,
      unit
    )
    select
      v_delivery_id,
      items.product_key,
      items.quantity,
      items.unit
    from public.order_items as items
    where items.order_id = v_order.id
      and items.frequency = 'once';

    if exists (
      select 1
      from public.daily_delivery_items
      where daily_delivery_items.delivery_id = v_delivery_id
    ) then
      v_generated := v_generated + 1;
    else
      delete from public.daily_deliveries where id = v_delivery_id;
    end if;
  end loop;

  return v_generated;
end;
$function$;

-- private.require_paid_order_for_active_plan
CREATE OR REPLACE FUNCTION private.require_paid_order_for_active_plan()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.status = 'active'
    and (tg_op = 'INSERT' or old.status is distinct from new.status)
    and not exists (
      select 1
      from public.orders as farm_order
      join public.payments as payment on payment.order_id = farm_order.id
      where farm_order.delivery_plan_id = new.id
        and farm_order.user_id = new.user_id
        and farm_order.status = 'paid'
        and not farm_order.is_test
        and payment.status = 'captured'
        and not payment.is_test
    )
  then
    raise exception 'A delivery plan can become active only after payment is captured';
  end if;
  return new;
end;
$function$;


create trigger paid_activation_guard before insert or update of status on public.delivery_plans for each row execute function private.require_paid_order_for_active_plan();
