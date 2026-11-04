-- Local verification draft. Service-only; the caller authenticates the manager
-- and supplies the verified catalogue revision and server-calculated quote.
create function public.record_monthly_farm_payment(
  p_order_id uuid,
  p_user_id uuid,
  p_start_date date,
  p_bottle_choice text,
  p_rules jsonb,
  p_items jsonb,
  p_catalog_revision uuid,
  p_total_paise integer,
  p_bottle_paise integer,
  p_payment_method text,
  p_reference text,
  p_handling_paise integer default 0,
  p_platform_paise integer default 0
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_profile public.customer_profiles%rowtype;
  v_plan_id uuid;
  v_end date;
  v_subtotal integer;
  v_revision uuid;
begin
  if p_order_id is null or p_user_id is null or p_start_date is null
    or p_catalog_revision is null or p_total_paise is null or p_total_paise <= 0
    or p_bottle_paise is null or p_bottle_paise < 0
    or p_handling_paise is null or p_handling_paise < 0
    or p_platform_paise is null or p_platform_paise < 0
    or jsonb_typeof(p_rules) is distinct from 'array'
    or jsonb_typeof(p_items) is distinct from 'array'
  then raise exception 'Invalid monthly farm order'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  if exists (
    select 1 from public.orders o
    join public.delivery_plans plan on plan.id=o.delivery_plan_id
    join public.payments receipt on receipt.order_id=o.id
    where o.id=p_order_id and o.user_id=p_user_id and o.status='paid'
      and plan.billing_model='calendar_month' and plan.schedule_rules=p_rules
      and o.start_date=p_start_date and o.bottle_choice=p_bottle_choice
      and o.catalog_revision=p_catalog_revision and o.total_paise=p_total_paise
      and o.bottle_charge_paise=p_bottle_paise and o.handling_fee_paise=p_handling_paise
      and o.platform_fee_paise=p_platform_paise and receipt.provider='manual'
      and receipt.status='captured' and receipt.payment_method=p_payment_method
      and receipt.provider_payment_id=p_reference
  ) then return p_order_id; end if;

  if p_start_date < private.operational_today() + 1 then
    raise exception 'Choose a start date from tomorrow';
  end if;

  if exists (
    select 1 from public.delivery_plans
    where user_id=p_user_id and status in ('pending_confirmation','active','paused')
  ) then raise exception 'This customer already has a current delivery plan'; end if;

  select * into v_profile from public.customer_profiles where user_id=p_user_id;
  if not found or nullif(btrim(v_profile.phone),'') is null or nullif(btrim(v_profile.address_line),'') is null
  then raise exception 'Save the customer phone and address before recording an order'; end if;

  v_end := (p_start_date + interval '1 month')::date;
  select sum(item.line_total_paise) into v_subtotal
  from jsonb_to_recordset(p_items) as item(line_total_paise integer);
  if v_subtotal is null or v_subtotal <= 0 or v_subtotal + p_bottle_paise + p_handling_paise + p_platform_paise > p_total_paise
    or jsonb_array_length(p_items) <> jsonb_array_length(p_rules)
    or (select count(distinct item->>'product_key') from jsonb_array_elements(p_items) items(item))
       <> jsonb_array_length(p_items)
  then raise exception 'Invalid monthly farm invoice'; end if;

  insert into public.delivery_plans (
    user_id,status,start_date,bottle_choice,billing_model,
    period_end_exclusive,schedule_rules,purchased_deliveries,delivered_deliveries
  ) values (
    p_user_id,'pending_confirmation',p_start_date,p_bottle_choice,'calendar_month',
    v_end,p_rules,0,0
  ) returning id into v_plan_id;

  insert into public.scheduled_delivery_items (plan_id,user_id,product_key,delivery_date,quantity,unit)
  select v_plan_id,p_user_id,rule->>'id',p_start_date+day_offset,amount,
    case when rule->>'id'='milk' then 'litre' else '500 g' end
  from jsonb_array_elements(p_rules) rules(rule)
  cross join generate_series(0,v_end-p_start_date-1) days(day_offset)
  cross join lateral (select private.monthly_routine_quantity(rule,p_start_date+day_offset) amount) qty
  where amount > 0;

  if exists (
    select 1 from jsonb_to_recordset(p_items) item(product_key text, quantity integer)
    left join (
      select product_key,sum(quantity) as quantity from public.scheduled_delivery_items
      where plan_id=v_plan_id group by product_key
    ) dated using (product_key)
    where dated.quantity is distinct from item.quantity::numeric
  ) or (select count(distinct product_key) from public.scheduled_delivery_items where plan_id=v_plan_id) <> jsonb_array_length(p_items)
  then raise exception 'Invoice quantities do not match the dated schedule'; end if;

  insert into public.orders (
    id,user_id,address_snapshot,bottle_charge_paise,handling_fee_paise,platform_fee_paise,bottle_choice,currency,
    delivery_plan_id,is_test,milk_litres,phone_snapshot,purchase_mode,start_date,
    status,subtotal_paise,total_paise
  ) values (
    p_order_id,p_user_id,v_profile.address_line,p_bottle_paise,p_handling_paise,p_platform_paise,p_bottle_choice,'INR',
    v_plan_id,false,coalesce((select sum(quantity) from public.scheduled_delivery_items
      where plan_id=v_plan_id and product_key='milk'),0),v_profile.phone,'plan',p_start_date,
    'pending_payment',v_subtotal,p_total_paise
  ) returning catalog_revision into v_revision;

  if v_revision is distinct from p_catalog_revision then
    raise exception 'Product prices changed. Review the total before recording payment';
  end if;

  insert into public.order_items (
    order_id,user_id,product_key,product_name,quantity,unit,unit_price_paise,
    line_total_paise,frequency,delivery_date,scheduled_days
  )
  select p_order_id,p_user_id,item.product_key,item.product_name,item.quantity,item.unit,
    item.unit_price_paise,item.line_total_paise,'once',item.delivery_date,'{}'
  from jsonb_to_recordset(p_items) as item(
    product_key text,product_name text,quantity integer,unit text,
    unit_price_paise integer,line_total_paise integer,delivery_date date
  );

  perform public.reserve_order_capacity(p_order_id,24);
  perform public.capture_farm_order_payment(p_order_id,p_payment_method,p_reference);
  return p_order_id;
end;
$$;
revoke all on function public.record_monthly_farm_payment(uuid,uuid,date,text,jsonb,jsonb,uuid,integer,integer,text,text,integer,integer)
from public,anon,authenticated;
grant execute on function public.record_monthly_farm_payment(uuid,uuid,date,text,jsonb,jsonb,uuid,integer,integer,text,text,integer,integer)
to service_role;
