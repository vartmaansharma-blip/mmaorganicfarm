-- Run after selected-checkout-batches.local.sql. Existing checkout and payment
-- entry points keep working while the storefront starts using this function.
-- Keep the existing schedule validation and write logic in one private routine.
create function private.save_pending_monthly_plan_for_user(v_user uuid, p_start_date date, p_bottle_choice text, p_rules jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare
 v_plan uuid;v_rule jsonb;v_day date;v_end date;v_quantity integer;v_milk boolean:=false;
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
revoke all on function private.save_pending_monthly_plan_for_user(uuid, date, text, jsonb)
  from public, anon, authenticated;
grant execute on function private.save_pending_monthly_plan_for_user(uuid, date, text, jsonb)
  to service_role;

-- Existing callers still use the authenticated customer's identity.
-- CREATE OR REPLACE retains the original owner, signature and grants.
create or replace function public.save_pending_monthly_plan(
  p_start_date date, p_bottle_choice text, p_rules jsonb
)
returns uuid language sql security definer set search_path = '' as $$
  select private.save_pending_monthly_plan_for_user(auth.uid(), p_start_date, p_bottle_choice, p_rules);
$$;

create function public.prepare_combined_checkout(
  p_user_id uuid,
  p_once_order_id uuid,
  p_start_date date,
  p_rules jsonb,
  p_order jsonb,
  p_items jsonb
)
returns uuid
language plpgsql security invoker
set search_path = ''
as $$
declare
  v_batch public.checkout_batches%rowtype;
  v_once public.orders%rowtype;
  v_details public.orders%rowtype := jsonb_populate_record(null::public.orders, p_order);
  v_plan public.delivery_plans%rowtype;
  v_scheduled public.orders%rowtype;
  v_plan_id uuid;
  v_order_id uuid;
  v_batch_id uuid;
begin
  if current_user not in ('service_role', 'postgres') or p_user_id is null then
    raise exception 'Service role and customer required' using errcode = '42501';
  end if;

  -- Share the monthly plan lock and follow the payment path's row lock order.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select * into v_batch from public.checkout_batches
    where once_order_id = p_once_order_id and user_id = p_user_id for update;

  if found then
    -- Keep a batch ID bound to the original reviewed orders, even if stale.
    -- Returning a started batch also prevents a second payment attempt.
    if v_batch.status = 'draft' then
      select * into v_plan from public.delivery_plans where id = (
        select delivery_plan_id from public.orders where id = v_batch.plan_order_id
      ) for update;
      select * into v_scheduled from public.orders where id = v_batch.plan_order_id;
      if v_scheduled.status = 'draft' and v_plan.status = 'pending_confirmation'
        and (v_plan.start_date is distinct from p_start_date
          or v_plan.schedule_rules is distinct from p_rules
          or v_scheduled.address_snapshot is distinct from v_details.address_snapshot
          or v_scheduled.phone_snapshot is distinct from v_details.phone_snapshot) then
        raise exception 'Review your updated selection in the cart to start a new checkout';
      end if;
    end if;
    return v_batch.id;
  end if;

  perform 1 from public.delivery_plans where user_id = p_user_id
    and status = 'pending_confirmation' for update;
  select * into v_once from public.orders
    where id = p_once_order_id and user_id = p_user_id for update;
  if not found or v_once.purchase_mode <> 'once' or v_once.status <> 'draft'
    or v_once.razorpay_order_id is not null or v_once.is_test
    or not exists (select 1 from public.order_items where order_id = v_once.id and user_id = p_user_id)
  then
    raise exception 'The one-time selection is unavailable';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Choose scheduled items';
  end if;

  v_plan_id := private.save_pending_monthly_plan_for_user(
    p_user_id, p_start_date, v_details.bottle_choice, p_rules
  );

  insert into public.orders (
    user_id, delivery_plan_id, purchase_mode, start_date, address_snapshot, phone_snapshot,
    bottle_choice, milk_litres, subtotal_paise, bottle_charge_paise, handling_fee_paise,
    platform_fee_paise, total_paise, pricing_version
  ) values (
    p_user_id, v_plan_id, 'plan', p_start_date, v_details.address_snapshot, v_details.phone_snapshot,
    v_details.bottle_choice, v_details.milk_litres, v_details.subtotal_paise,
    v_details.bottle_charge_paise, v_details.handling_fee_paise,
    v_details.platform_fee_paise, v_details.total_paise, 2
  ) returning id into v_order_id;

  insert into public.order_items (
    order_id, user_id, product_key, product_name, quantity, unit, unit_price_paise,
    line_total_paise, frequency, scheduled_days, delivery_date
  )
  select v_order_id, p_user_id, item.product_key, item.product_name, item.quantity, item.unit,
    item.unit_price_paise, item.line_total_paise, item.frequency, item.scheduled_days, item.delivery_date
  from jsonb_populate_recordset(null::public.order_items, p_items) as item;

  insert into public.checkout_batches (user_id, once_order_id, plan_order_id, amount_paise)
  values (p_user_id, v_once.id, v_order_id, v_once.total_paise + v_details.total_paise)
  returning id into v_batch_id;
  return v_batch_id;
end;
$$;

revoke all on function public.prepare_combined_checkout(uuid, uuid, date, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.prepare_combined_checkout(uuid, uuid, date, jsonb, jsonb, jsonb)
  to service_role;
