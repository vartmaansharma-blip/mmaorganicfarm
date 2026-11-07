-- Apply after referrals.local.sql in a disposable database.
-- A referral discount is a reviewed order adjustment, never a payment or credit balance.
begin;

create table private.referral_order_discounts (
  order_id uuid primary key references public.orders(id),
  recipient_id uuid not null references auth.users(id),
  customer_id uuid not null references private.referral_claims(customer_id),
  side text not null check (side in ('newcomer','referrer')),
  amount_paise integer not null check (amount_paise > 0),
  created_at timestamptz not null default now()
);
create index referral_order_discounts_claim_idx on private.referral_order_discounts(customer_id,side);
alter table private.referral_order_discounts enable row level security;
revoke all on private.referral_order_discounts from public, anon, authenticated, service_role;

-- Keep the existing guard closed to historical coupons and arbitrary discounts.
create or replace function private.guard_checkout_discount()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.discount_code is null and new.discount_paise=0 then
    if tg_op='UPDATE' and old.discount_code='REFERRAL_MONTH' then
      raise exception 'The reviewed referral discount cannot be removed';
    end if;
    return new;
  end if;
  if tg_op='INSERT' or new.discount_code is distinct from 'REFERRAL_MONTH'
    or new.purchase_mode<>'plan' or new.is_test or not exists(
      select 1 from private.referral_order_discounts r
      where r.order_id=new.id and r.recipient_id=new.user_id and r.amount_paise=new.discount_paise
    ) then raise exception 'Discount offers are not available'; end if;
  return new;
end;
$$;

create function private.apply_referral_checkout(p_order_id uuid, p_batch_id uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare
  v_user uuid := auth.uid();
  v_batch public.checkout_batches%rowtype;
  v_order public.orders%rowtype;
  v_plan public.delivery_plans%rowtype;
  v_claim uuid;
  v_side text;
  v_amount integer;
begin
  if v_user is null or (p_order_id is null) = (p_batch_id is null) then
    raise exception 'Choose an eligible checkout' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text,0));

  if p_batch_id is not null then
    select * into v_batch from public.checkout_batches where id=p_batch_id and user_id=v_user for update;
    if not found then raise exception 'Checkout unavailable' using errcode='42501'; end if;
    if v_batch.status<>'draft' or v_batch.provider_order_id is not null then return 0; end if;
    p_order_id := v_batch.plan_order_id;
  elsif exists(select 1 from public.checkout_batches where plan_order_id=p_order_id or once_order_id=p_order_id) then
    raise exception 'Use the combined checkout';
  end if;

  select * into v_order from public.orders where id=p_order_id and user_id=v_user;
  if not found then raise exception 'Checkout unavailable' using errcode='42501'; end if;
  if v_order.purchase_mode<>'plan' or v_order.is_test then return 0; end if;
  select * into v_plan from public.delivery_plans where id=v_order.delivery_plan_id and user_id=v_user for update;
  select * into strict v_order from public.orders where id=p_order_id and user_id=v_user for update;
  if v_plan.billing_model is distinct from 'calendar_month' or v_plan.status<>'pending_confirmation'
    or v_plan.is_test or v_order.status<>'draft' or v_order.razorpay_order_id is not null then return 0; end if;
  if v_order.discount_code='REFERRAL_MONTH' then return v_order.discount_paise; end if;
  if not (select enabled and discount_enabled from private.referral_settings where singleton for share) then return 0; end if;

  select c.customer_id, benefit.side, benefit.amount into v_claim, v_side, v_amount
  from private.referral_claims c
  cross join lateral (
    values ('newcomer', c.newcomer_paise, c.customer_id=v_user and c.claimed_at<=v_order.created_at
      and not exists(
        select 1 from public.orders o join public.delivery_plans p on p.id=o.delivery_plan_id
        where o.user_id=v_user and o.id<>v_order.id and o.purchase_mode='plan' and not o.is_test
          and p.billing_model='calendar_month' and (o.status='paid' or exists(
            select 1 from public.payments pay where pay.order_id=o.id and pay.status='captured' and not pay.is_test
          ))
      )),
    ('referrer', c.referrer_paise, c.referrer_id=v_user and c.qualified_at is not null and c.qualified_at<=v_order.created_at)
  ) benefit(side,amount,eligible)
  where benefit.eligible and benefit.amount>0
    and not exists(
      select 1 from private.referral_order_discounts r join public.orders o on o.id=r.order_id
      left join public.checkout_batches b on b.plan_order_id=o.id
      where r.customer_id=c.customer_id and r.side=benefit.side and (
        o.status<>'cancelled' or o.razorpay_order_id is not null or b.provider_order_id is not null
        or b.status in ('preparing','pending_payment','paid','review_required')
        or exists(select 1 from public.payments pay where pay.order_id=o.id and pay.status='captured' and not pay.is_test)
      )
    )
  order by (benefit.side='newcomer') desc, c.qualified_at nulls last, c.claimed_at, c.customer_id
  limit 1;

  if v_claim is null then return 0; end if;
  -- Preserve a positive gateway charge and never discount bottles or fees.
  v_amount := least(v_amount,v_order.subtotal_paise,v_order.total_paise-100);
  if v_amount<=0 then return 0; end if;
  insert into private.referral_order_discounts(order_id,recipient_id,customer_id,side,amount_paise)
    values(v_order.id,v_user,v_claim,v_side,v_amount);
  update public.orders set discount_code='REFERRAL_MONTH',discount_paise=v_amount,
    total_paise=total_paise-v_amount,updated_at=now() where id=v_order.id;
  if p_batch_id is not null then
    update public.checkout_batches set amount_paise=amount_paise-v_amount,updated_at=now() where id=p_batch_id;
  end if;
  return v_amount;
end;
$$;

create function public.apply_referral_checkout(p_order_id uuid, p_batch_id uuid)
returns integer language sql security invoker set search_path='' as $$
  select private.apply_referral_checkout(p_order_id,p_batch_id);
$$;
revoke all on function private.apply_referral_checkout(uuid,uuid), public.apply_referral_checkout(uuid,uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.apply_referral_checkout(uuid,uuid), public.apply_referral_checkout(uuid,uuid)
  to authenticated;

create or replace function private.change_checkout_bottle_mode(p_order_id uuid, p_mode text, p_expected_total integer, p_batch_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_user uuid := auth.uid();
  v_order public.orders%rowtype;
  v_plan public.delivery_plans%rowtype;
  v_charge integer;
begin
  if v_user is null or p_mode is null or p_mode not in ('return','new') then
    raise exception 'Choose a valid bottle mode.' using errcode='42501';
  end if;

  select * into v_order from public.orders where id=p_order_id and user_id=v_user;
  if not found then raise exception 'Order unavailable.' using errcode='42501'; end if;
  if v_order.delivery_plan_id is not null then
    -- Match monthly checkout and plan edits by locking the plan before the order.
    select * into v_plan from public.delivery_plans
      where id=v_order.delivery_plan_id and user_id=v_user for update;
  end if;
  select * into v_order from public.orders where id=p_order_id and user_id=v_user for update;
  if not found or v_order.status<>'draft' or v_order.razorpay_order_id is not null
     or v_order.terms_accepted_at is not null or v_order.purchase_mode not in ('once','plan')
     or v_order.milk_litres <= 0 or v_order.bottle_choice not in ('new','return')
     or (v_order.discount_code is not null and v_order.discount_code <> 'REFERRAL_MONTH')
     or (v_order.purchase_mode='plan' and (v_plan.id is null or v_plan.status<>'pending_confirmation'
         or v_plan.start_date is distinct from v_order.start_date)) then
    raise exception 'This order cannot change bottle mode.';
  end if;
  if v_order.total_paise is distinct from p_expected_total then
    raise exception 'The bill changed. Review it and try again.';
  end if;
  if exists (
    select 1 from public.checkout_batches b
    where (b.once_order_id = p_order_id or b.plan_order_id = p_order_id)
      and b.id is distinct from p_batch_id
  ) then
    raise exception 'Change bottle mode in the combined checkout.';
  end if;
  if v_order.bottle_choice=p_mode then return; end if;

  v_charge := case when p_mode='new' then round(
    v_order.milk_litres * (private.order_product_prices(p_order_id)->>'bottle')::integer
  )::integer else 0 end;
  if v_order.discount_code='REFERRAL_MONTH'
    and v_order.total_paise-v_order.bottle_charge_paise+v_charge<100 then
    raise exception 'Review a new checkout before changing bottle mode.';
  end if;
  update public.orders set bottle_choice=p_mode, bottle_charge_paise=v_charge,
    total_paise=v_order.total_paise-v_order.bottle_charge_paise+v_charge, updated_at=now()
    where id=v_order.id;
  if v_plan.id is not null then
    update public.delivery_plans set bottle_choice=p_mode, updated_at=now() where id=v_plan.id;
  end if;
end;$$;

create or replace function public.claim_checkout_batch(
  p_batch_id uuid,
  p_expected_amount_paise integer,
  p_expected_plan_rules jsonb
)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_batch public.checkout_batches%rowtype;
  v_once public.orders%rowtype;
  v_plan public.orders%rowtype;
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  select * into v_batch from public.checkout_batches where id = p_batch_id for update;
  if not found or v_batch.status <> 'draft'
    or v_batch.amount_paise <> p_expected_amount_paise then
    raise exception 'Combined checkout is already being prepared or changed';
  end if;
  perform 1 from public.delivery_plans where id = (
    select delivery_plan_id from public.orders where id = v_batch.plan_order_id
  ) for update;
  select * into v_once from public.orders where id = v_batch.once_order_id for update;
  select * into v_plan from public.orders where id = v_batch.plan_order_id for update;
  if v_once.id is null or v_plan.id is null
    or v_once.user_id is distinct from v_batch.user_id
    or v_plan.user_id is distinct from v_batch.user_id
    or v_once.purchase_mode <> 'once' or v_plan.purchase_mode <> 'plan'
    or v_once.status <> 'draft' or v_plan.status <> 'draft'
    or v_once.razorpay_order_id is not null or v_plan.razorpay_order_id is not null
    or v_once.is_test is distinct from v_batch.is_test
    or v_plan.is_test is distinct from v_batch.is_test
    or v_once.discount_paise <> 0 or v_once.discount_code is not null
    or (v_plan.discount_paise <> 0 and v_plan.discount_code is distinct from 'REFERRAL_MONTH')
    or v_once.total_paise + v_plan.total_paise <> v_batch.amount_paise then
    raise exception 'Combined checkout orders changed';
  end if;
  update public.checkout_batches set status = 'preparing', updated_at = now()
    where id = v_batch.id;
  perform public.claim_monthly_checkout_total(
    v_plan.id, p_expected_plan_rules, v_plan.total_paise);
  update public.orders set status = 'pending_payment', updated_at = now()
    where id = v_once.id;
end;
$$;

commit;
