-- One database transaction serializes checkout verification and webhook retries.
-- No existing business rows are changed when this migration is installed.
create table private.razorpay_payment_confirmations (
  order_id uuid primary key references public.orders(id) on delete restrict,
  provider_payment_id text not null unique,
  outcome text not null check (outcome in ('fulfilled', 'test', 'review_required')),
  completed_at timestamptz not null default now()
);
alter table private.razorpay_payment_confirmations enable row level security;
revoke all on private.razorpay_payment_confirmations from public, anon, authenticated;
grant select, insert on private.razorpay_payment_confirmations to service_role;

create function public.record_razorpay_payment(
  p_order_id uuid,
  p_provider_order_id text,
  p_payment_id text,
  p_amount_paise integer,
  p_currency text,
  p_is_test boolean,
  p_status text
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_payment public.payments%rowtype;
  v_confirmation private.razorpay_payment_confirmations%rowtype;
  v_adjustment public.delivery_adjustments%rowtype;
  v_plan public.delivery_plans%rowtype;
  v_review boolean := false;
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('authorized', 'captured')
    or p_amount_paise is null or p_amount_paise <= 0
    or p_currency is distinct from 'INR'
    or p_is_test is null
    or p_payment_id is null or p_payment_id !~ '^pay_[A-Za-z0-9]+$'
    or p_provider_order_id is null or p_provider_order_id !~ '^order_[A-Za-z0-9]+$'
  then
    raise exception 'Invalid provider payment';
  end if;

  -- The order is the shared lock for every payment attempt and event for it.
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null
    or v_order.razorpay_order_id is distinct from p_provider_order_id
    or v_order.total_paise is distinct from p_amount_paise
    or v_order.currency is distinct from p_currency
    or v_order.is_test is distinct from p_is_test
  then
    raise exception 'Provider payment does not match the stored order';
  end if;

  insert into public.payments (
    order_id,user_id,provider,provider_order_id,provider_payment_id,
    status,amount_paise,currency,signature_verified,is_test,paid_at
  ) values (
    v_order.id,v_order.user_id,'razorpay',p_provider_order_id,p_payment_id,
    p_status,p_amount_paise,p_currency,true,p_is_test,
    case when p_status='captured' then now() else null end
  ) on conflict (provider_payment_id) do nothing;

  select * into v_payment from public.payments
    where provider_payment_id=p_payment_id for update;
  if v_payment.provider is distinct from 'razorpay'
    or v_payment.order_id is distinct from v_order.id
    or v_payment.user_id is distinct from v_order.user_id
    or v_payment.provider_order_id is distinct from p_provider_order_id
    or v_payment.amount_paise is distinct from p_amount_paise
    or v_payment.currency is distinct from p_currency
    or v_payment.is_test is distinct from p_is_test
  then
    raise exception 'Provider payment is already bound to different details';
  end if;

  select * into v_confirmation from private.razorpay_payment_confirmations
    where order_id=v_order.id;
  if p_status='authorized' then
    -- A delayed authorization must never downgrade an already captured payment.
    if v_payment.status <> 'captured' then
      update public.payments set status='authorized',signature_verified=true
        where id=v_payment.id;
    end if;
    return jsonb_build_object('status',case
      when v_confirmation.provider_payment_id=p_payment_id
        then case when v_confirmation.outcome='review_required' then 'review_required' else 'paid' end
      else 'processing' end);
  end if;

  update public.payments set status='captured',signature_verified=true,
    paid_at=coalesce(paid_at,now()) where id=v_payment.id;

  if v_confirmation.order_id is not null then
    -- Preserve an additional captured payment as financial evidence, without
    -- granting the same order another entitlement or notification.
    return jsonb_build_object('status',case
      when v_confirmation.provider_payment_id<>p_payment_id or v_confirmation.outcome='review_required'
        then 'review_required' else 'paid' end,'duplicate',true);
  end if;

  if v_order.is_test then
    insert into private.razorpay_payment_confirmations(order_id,provider_payment_id,outcome)
      values(v_order.id,p_payment_id,'test');
    return jsonb_build_object('status','paid','isTest',true);
  end if;

  if v_order.delivery_plan_id is not null then
    select * into v_plan from public.delivery_plans
      where id=v_order.delivery_plan_id and user_id=v_order.user_id for update;
    if v_plan.id is null or v_plan.is_test then
      raise exception 'Paid delivery plan does not match the order';
    end if;
    v_review := v_plan.status='cancelled';
  end if;
  v_review := v_review or v_order.status='cancelled';

  if v_order.purchase_mode='adjustment' then
    select * into v_adjustment from public.delivery_adjustments
      where order_id=v_order.id and user_id=v_order.user_id for update;
    if v_adjustment.id is null
      or (v_order.delivery_plan_id is not null and v_order.delivery_plan_id<>v_adjustment.plan_id) then
      raise exception 'Paid quantity change could not be found';
    end if;
    -- Applied legacy adjustments are already complete: never overwrite later edits.
    if v_adjustment.status='cancelled' then v_review := true; end if;
    select * into v_plan from public.delivery_plans
      where id=v_adjustment.plan_id and user_id=v_order.user_id for update;
    if v_plan.id is null or v_plan.is_test then
      raise exception 'Paid quantity change has an invalid delivery plan';
    end if;
    v_review := v_review or v_plan.status='cancelled';
  end if;

  if v_review then
    insert into private.razorpay_payment_confirmations(order_id,provider_payment_id,outcome)
      values(v_order.id,p_payment_id,'review_required');
    return jsonb_build_object('status','review_required');
  end if;

  update public.orders set status='paid',paid_total_paise=total_paise,updated_at=now()
    where id=v_order.id and (status<>'paid' or paid_total_paise is distinct from total_paise);
  if v_order.purchase_mode='adjustment' then
    if v_adjustment.status='pending_payment' then
      insert into public.delivery_exceptions (
        action,delivery_date,plan_id,product_key,quantity,unit,user_id,updated_at
      ) values (
        'override',v_adjustment.delivery_date,v_adjustment.plan_id,'milk',
        v_adjustment.requested_quantity,'litre',v_order.user_id,now()
      ) on conflict (plan_id,product_key,delivery_date) do update
        set action=excluded.action,quantity=excluded.quantity,unit=excluded.unit,updated_at=excluded.updated_at;
      update public.delivery_adjustments set status='applied',updated_at=now()
        where id=v_adjustment.id;
    end if;
  elsif v_order.delivery_plan_id is not null then
    update public.delivery_plans set status='active',updated_at=now()
      where id=v_order.delivery_plan_id and user_id=v_order.user_id and status='pending_confirmation';
  end if;

  perform public.consume_order_capacity(v_order.id);
  -- The order lock also serializes notification creation. Preserve an existing
  -- legacy confirmation rather than notifying the customer again on recovery.
  if not exists(select 1 from public.customer_notifications
    where order_id=v_order.id and kind='payment_confirmed') then
    insert into public.customer_notifications(kind,message,order_id,title,user_id)
      values('payment_confirmed',case
        when v_order.purchase_mode='adjustment' then 'Your additional payment is confirmed and the milk quantity was updated.'
        when v_order.delivery_plan_id is not null then 'Your payment is confirmed. Open your account to see the current status of your delivery plan.'
        else 'Your payment is confirmed and your farm order is accepted.' end,
        v_order.id,'Payment confirmed',v_order.user_id);
  end if;
  insert into private.razorpay_payment_confirmations(order_id,provider_payment_id,outcome)
    values(v_order.id,p_payment_id,'fulfilled');
  return jsonb_build_object('status','paid');
end;
$$;
revoke all on function public.record_razorpay_payment(uuid,text,text,integer,text,boolean,text)
  from public,anon,authenticated;
grant execute on function public.record_razorpay_payment(uuid,text,text,integer,text,boolean,text)
  to service_role;
comment on function public.record_razorpay_payment(uuid,text,text,integer,text,boolean,text) is
  'Trusted server-only recording of verified provider evidence. Atomic effects, serialized retries, no provider calls or charge initiation.';
