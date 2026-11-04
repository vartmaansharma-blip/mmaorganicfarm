-- Run after selected-checkout-batches.local.sql. Existing checkout and payment
-- entry points keep working while the storefront starts using this function.
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
set "request.jwt.claim.sub" = ''
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

  -- The existing plan routine uses auth.uid(). Scope the verified customer
  -- subject to this service-only function and restore it on function exit.
  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  v_plan_id := public.save_pending_monthly_plan(p_start_date, v_details.bottle_choice, p_rules);

  insert into public.orders (
    user_id, delivery_plan_id, purchase_mode, start_date, address_snapshot, phone_snapshot,
    bottle_choice, milk_litres, subtotal_paise, bottle_charge_paise, handling_fee_paise,
    platform_fee_paise, total_paise
  ) values (
    p_user_id, v_plan_id, 'plan', p_start_date, v_details.address_snapshot, v_details.phone_snapshot,
    v_details.bottle_choice, v_details.milk_litres, v_details.subtotal_paise,
    v_details.bottle_charge_paise, v_details.handling_fee_paise,
    v_details.platform_fee_paise, v_details.total_paise
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
