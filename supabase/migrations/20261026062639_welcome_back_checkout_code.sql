begin;

-- One personal offer per account. Codes are random, but account ownership and
-- this durable record, rather than secrecy, enforce the one-use limit.
alter table public.orders add column discount_code text;
alter table public.orders add column discount_paise integer not null default 0;
alter table public.orders add constraint orders_discount_valid check (
  discount_paise >= 0 and discount_paise <= subtotal_paise and
  ((discount_code is null and discount_paise = 0) or
   (discount_code is not null and discount_paise > 0))
);
create table private.welcome_back_offers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique default ('MMA-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,16))),
  cancellation_id uuid not null references public.cancellation_requests(id),
  order_id uuid unique references public.orders(id),
  gross_total_paise integer,
  issued_at timestamptz not null default now(),
  redeemed_at timestamptz,
  check ((order_id is null and gross_total_paise is null and redeemed_at is null) or
         (order_id is not null and gross_total_paise > 0))
);
create index welcome_back_offers_cancellation_idx on private.welcome_back_offers(cancellation_id);
alter table private.welcome_back_offers enable row level security;
revoke all on private.welcome_back_offers from public, anon, authenticated, service_role;

create function private.eligible_welcome_back_cancellation(p_user uuid, p_before timestamptz)
returns uuid language sql stable set search_path = '' as $$
  select c.id from public.cancellation_requests c
  join public.delivery_plans plan on plan.id=c.plan_id and plan.user_id=c.user_id
  where c.user_id=p_user and c.status in ('completed','approved')
    and (select count(distinct first_cancel.plan_id) from public.cancellation_requests first_cancel
      where first_cancel.user_id=p_user and first_cancel.plan_id is not null
        and first_cancel.status in ('completed','approved'))=1
    and plan.status='cancelled' and not plan.is_test
    and coalesce(c.resolved_at,c.created_at)<=p_before
    and exists (
      select 1 from public.orders o join public.payments p on p.order_id=o.id
      where o.delivery_plan_id=plan.id and o.user_id=p_user and o.status='paid'
        and not o.is_test and p.status='captured' and not p.is_test
    )
    and not exists (
      select 1 from public.orders o join public.payments p on p.order_id=o.id
      where o.user_id=p_user and o.purchase_mode='plan' and o.status='paid'
        and not o.is_test and p.status='captured' and not p.is_test
        and o.created_at>coalesce(c.resolved_at,c.created_at)
    )
  order by coalesce(c.resolved_at,c.created_at) desc,c.id limit 1;
$$;
revoke all on function private.eligible_welcome_back_cancellation(uuid,timestamptz) from public,anon,authenticated,service_role;

create function private.ensure_welcome_back_offer(p_user uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_offer private.welcome_back_offers%rowtype; v_cancellation uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('welcome-back:'||p_user::text,0));
  select * into v_offer from private.welcome_back_offers where user_id=p_user;
  if not found then
    v_cancellation:=private.eligible_welcome_back_cancellation(p_user,now());
    if v_cancellation is null then return null;end if;
    insert into private.welcome_back_offers(user_id,cancellation_id)
    values(p_user,v_cancellation) returning * into v_offer;
  end if;
  return jsonb_build_object('code',v_offer.code,'state',case
    when v_offer.redeemed_at is not null then 'redeemed'
    when v_offer.order_id is not null then 'reserved' else 'available' end,
    'order_id',v_offer.order_id,'discount_percent',5);
end;$$;
revoke all on function private.ensure_welcome_back_offer(uuid) from public,anon,authenticated,service_role;

create function private.my_welcome_back_offer()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to view your offer' using errcode='42501';end if;
  if (select count(distinct plan_id) from public.cancellation_requests
    where user_id=auth.uid() and plan_id is not null and status in ('completed','approved'))<>1 then return null;end if;
  v_result:=private.ensure_welcome_back_offer(auth.uid());
  if v_result->>'state'='available' and private.eligible_welcome_back_cancellation(auth.uid(),now()) is null then return null;end if;
  return v_result;
end;$$;
revoke all on function private.my_welcome_back_offer() from public,anon,authenticated;
grant execute on function private.my_welcome_back_offer() to authenticated;
create function public.my_welcome_back_offer()
returns jsonb language sql security invoker set search_path='' as $$ select private.my_welcome_back_offer(); $$;
revoke all on function public.my_welcome_back_offer() from public,anon,authenticated;
grant execute on function public.my_welcome_back_offer() to authenticated;

create function private.issue_cancellation_offer()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.plan_id is not null and new.status in ('completed','approved') then
    perform private.ensure_welcome_back_offer(new.user_id);
  end if;
  return new;
end;$$;
revoke all on function private.issue_cancellation_offer() from public,anon,authenticated,service_role;
create trigger issue_welcome_back_offer after insert or update of status on public.cancellation_requests
for each row execute function private.issue_cancellation_offer();

create function private.apply_my_checkout_code(p_order_id uuid,p_code text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_order public.orders%rowtype;v_plan public.delivery_plans%rowtype;
  v_offer private.welcome_back_offers%rowtype;v_discount integer;v_code text:=upper(btrim(coalesce(p_code,'')));
begin
  if auth.uid() is null then raise exception 'Sign in to use your code' using errcode='42501';end if;
  select * into v_order from public.orders where id=p_order_id and user_id=auth.uid();
  if not found then raise exception 'Order unavailable' using errcode='42501';end if;
  -- Match the existing checkout's plan -> order lock order.
  select * into v_plan from public.delivery_plans where id=v_order.delivery_plan_id for update;
  select * into v_order from public.orders where id=p_order_id and user_id=auth.uid() for update;
  if v_order.status<>'draft' or v_order.razorpay_order_id is not null then
    raise exception 'Payment has started. This code cannot be changed.';
  end if;
  if v_order.purchase_mode<>'plan' or v_plan.billing_model is distinct from 'calendar_month'
     or v_plan.user_id<>auth.uid() or v_plan.status<>'pending_confirmation' or v_order.is_test then
    raise exception 'This offer is for your first monthly plan back.';
  end if;
  perform private.ensure_welcome_back_offer(auth.uid());
  select * into v_offer from private.welcome_back_offers where user_id=auth.uid();
  if v_code='' then
    if v_offer.order_id=p_order_id and v_offer.redeemed_at is null then
      update public.orders set total_paise=v_offer.gross_total_paise,discount_code=null,discount_paise=0,updated_at=now() where id=p_order_id;
      update private.welcome_back_offers set order_id=null,gross_total_paise=null where user_id=auth.uid();
    end if;
  else
    if v_offer.code is distinct from v_code then raise exception 'This code is not valid for your account.';end if;
    if v_offer.redeemed_at is not null then raise exception 'You have already used your welcome-back offer.';end if;
    if v_offer.order_id is not null and v_offer.order_id<>p_order_id then
      raise exception 'Your code is attached to another checkout. Open that order to continue or remove it there first.';
    end if;
    if private.eligible_welcome_back_cancellation(auth.uid(),v_order.created_at) is null then
      raise exception 'This offer is for your first monthly plan after cancelling a paid plan.';
    end if;
    if (select coalesce(sum(line_total_paise),0) from public.order_items where order_id=p_order_id and user_id=auth.uid())<>v_order.subtotal_paise then
      raise exception 'Review your order items before applying a code.';
    end if;
    v_discount:=round(v_order.subtotal_paise::numeric*5/100)::integer;
    if v_discount<=0 then raise exception 'There are no eligible products in this order.';end if;
    update private.welcome_back_offers set order_id=p_order_id,
      gross_total_paise=v_order.total_paise+v_order.discount_paise where user_id=auth.uid();
    update public.orders set discount_code=v_offer.code,discount_paise=v_discount,
      total_paise=total_paise+discount_paise-v_discount,updated_at=now() where id=p_order_id;
  end if;
  select * into v_order from public.orders where id=p_order_id;
  return jsonb_build_object('discount_paise',v_order.discount_paise,'total_paise',v_order.total_paise,'code',v_order.discount_code);
end;$$;
revoke all on function private.apply_my_checkout_code(uuid,text) from public,anon,authenticated;
grant execute on function private.apply_my_checkout_code(uuid,text) to authenticated;
create function public.apply_my_checkout_code(p_order_id uuid,p_code text)
returns jsonb language sql security invoker set search_path='' as $$ select private.apply_my_checkout_code(p_order_id,p_code); $$;
revoke all on function public.apply_my_checkout_code(uuid,text) from public,anon,authenticated;
grant execute on function public.apply_my_checkout_code(uuid,text) to authenticated;

create function private.guard_checkout_discount()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_offer private.welcome_back_offers%rowtype;
begin
  if tg_op='INSERT' then
    if new.discount_code is not null or new.discount_paise<>0 then raise exception 'Apply your personal code from checkout';end if;
    return new;
  end if;
  if new.discount_code is not null then
    perform pg_advisory_xact_lock(hashtextextended('welcome-back:'||new.user_id::text,0));
    select * into v_offer from private.welcome_back_offers where user_id=new.user_id and order_id=new.id;
    if v_offer.code is distinct from new.discount_code or new.discount_paise<>round(new.subtotal_paise::numeric*5/100)::integer
       or v_offer.gross_total_paise is distinct from new.total_paise+new.discount_paise then
      raise exception 'Discount does not match the reserved offer';
    end if;
    if new.status='paid' then
      update private.welcome_back_offers set redeemed_at=coalesce(redeemed_at,now()) where user_id=new.user_id;
    elsif new.status='pending_payment' and old.status is distinct from 'pending_payment' then
      if v_offer.redeemed_at is not null or private.eligible_welcome_back_cancellation(new.user_id,new.created_at) is null then
        raise exception 'This welcome-back offer is no longer available';
      end if;
    end if;
  end if;
  -- An abandoned draft without a provider order can safely release its code.
  if new.status='cancelled' and old.status='draft' and new.razorpay_order_id is null then
    update private.welcome_back_offers set order_id=null,gross_total_paise=null
      where user_id=new.user_id and order_id=new.id and redeemed_at is null;
    new.total_paise:=new.total_paise+new.discount_paise;new.discount_paise:=0;new.discount_code:=null;
  end if;
  return new;
end;$$;
revoke all on function private.guard_checkout_discount() from public,anon,authenticated,service_role;
create trigger guard_checkout_discount before insert or update on public.orders
for each row execute function private.guard_checkout_discount();

-- Freeze the reviewed price with the existing plan claim, before contacting
-- Razorpay. Concurrent coupon actions cannot change the provider amount.
create function private.claim_monthly_checkout_total(p_order_id uuid,p_expected_rules jsonb,p_expected_total integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_order public.orders%rowtype;
begin
  if (select auth.role()) is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501';end if;
  select * into v_order from public.orders where id=p_order_id;
  if not found then raise exception 'Order missing';end if;
  perform 1 from public.delivery_plans where id=v_order.delivery_plan_id for update;
  select * into v_order from public.orders where id=p_order_id for update;
  if v_order.total_paise is distinct from p_expected_total then raise exception 'Your total changed. Review the updated amount before paying.';end if;
  return public.claim_monthly_checkout(p_order_id,p_expected_rules);
end;$$;
revoke all on function private.claim_monthly_checkout_total(uuid,jsonb,integer) from public,anon,authenticated,service_role;
grant execute on function private.claim_monthly_checkout_total(uuid,jsonb,integer) to service_role;
grant usage on schema private to service_role;
create function public.claim_monthly_checkout_total(p_order_id uuid,p_expected_rules jsonb,p_expected_total integer)
returns boolean language sql security invoker set search_path='' as $$ select private.claim_monthly_checkout_total(p_order_id,p_expected_rules,p_expected_total); $$;
revoke all on function public.claim_monthly_checkout_total(uuid,jsonb,integer) from public,anon,authenticated,service_role;
grant execute on function public.claim_monthly_checkout_total(uuid,jsonb,integer) to service_role;

notify pgrst,'reload schema';
commit;
