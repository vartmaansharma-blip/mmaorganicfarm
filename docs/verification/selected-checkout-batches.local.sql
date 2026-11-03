-- A selected one-time order and a selected prepaid plan can share one gateway
-- charge while retaining their existing independent fulfilment obligations.
create table public.checkout_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  once_order_id uuid not null unique references public.orders(id),
  plan_order_id uuid not null unique references public.orders(id),
  amount_paise integer not null check (amount_paise > 0),
  currency text not null default 'INR' check (currency = 'INR'),
  is_test boolean not null default false,
  status text not null default 'draft'
    check (status in ('draft', 'preparing', 'pending_payment', 'paid', 'test_captured', 'payment_failed')),
  provider_order_id text unique,
  provider_payment_id text unique,
  terms_accepted_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint checkout_batches_distinct_orders check (once_order_id <> plan_order_id)
);

create index checkout_batches_user_created_idx
  on public.checkout_batches(user_id, created_at desc);
alter table public.checkout_batches enable row level security;
revoke all on public.checkout_batches from anon, authenticated;
grant select on public.checkout_batches to authenticated;
grant all on public.checkout_batches to service_role;
create policy "Customers can read their own combined checkouts"
  on public.checkout_batches for select to authenticated
  using ((select auth.uid()) = user_id);

-- Lock both child orders as a batch is created. A concurrent individual
-- checkout may have started from an older browser view.
create function private.guard_checkout_batch_insert()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_once public.orders%rowtype; v_plan public.orders%rowtype;
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  select * into v_once from public.orders where id = new.once_order_id for update;
  select * into v_plan from public.orders where id = new.plan_order_id for update;
  if v_once.id is null or v_plan.id is null
    or v_once.user_id is distinct from new.user_id
    or v_plan.user_id is distinct from new.user_id
    or v_once.purchase_mode <> 'once' or v_plan.purchase_mode <> 'plan'
    or v_once.status <> 'draft' or v_plan.status <> 'draft'
    or v_once.razorpay_order_id is not null or v_plan.razorpay_order_id is not null
    or v_once.is_test is distinct from new.is_test
    or v_plan.is_test is distinct from new.is_test
    or v_once.total_paise + v_plan.total_paise <> new.amount_paise then
    raise exception 'Selected orders changed before combined checkout';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_checkout_batch_insert() from public, anon, authenticated;
create trigger guard_checkout_batch_insert before insert on public.checkout_batches
  for each row execute function private.guard_checkout_batch_insert();

create function private.guard_batched_order_provider()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.razorpay_order_id is distinct from old.razorpay_order_id
    and exists (select 1 from public.checkout_batches
      where once_order_id = new.id or plan_order_id = new.id) then
    raise exception 'This order belongs to a combined checkout';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_batched_order_provider() from public, anon, authenticated;
create trigger guard_batched_order_provider before update of razorpay_order_id on public.orders
  for each row execute function private.guard_batched_order_provider();

-- A captured gateway payment is allocated to each child order. Only the
-- first allocation stores the unique gateway payment ID; both refer to the
-- batch, whose provider_payment_id is authoritative for reconciliation.
alter table public.payments
  add column checkout_batch_id uuid references public.checkout_batches(id);
alter table public.payments
  add constraint payments_checkout_batch_order_key unique (checkout_batch_id, order_id);

create function public.claim_checkout_batch(
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
    or v_once.discount_paise <> 0 or v_plan.discount_paise <> 0
    or v_once.total_paise + v_plan.total_paise <> v_batch.amount_paise then
    raise exception 'Combined checkout orders changed';
  end if;
  perform public.claim_monthly_checkout_total(
    v_plan.id, p_expected_plan_rules, v_plan.total_paise);
  update public.orders set status = 'pending_payment', updated_at = now()
    where id = v_once.id;
  update public.checkout_batches set status = 'preparing', updated_at = now()
    where id = v_batch.id;
end;
$$;
revoke all on function public.claim_checkout_batch(uuid, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.claim_checkout_batch(uuid, integer, jsonb)
  to service_role;

create function public.bind_checkout_batch(
  p_batch_id uuid,
  p_provider_order_id text
)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_batch public.checkout_batches%rowtype;
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  select * into v_batch from public.checkout_batches where id = p_batch_id for update;
  if not found or v_batch.status <> 'preparing'
    or v_batch.provider_order_id is not null
    or p_provider_order_id is null or p_provider_order_id = '' then
    raise exception 'Combined checkout cannot be bound';
  end if;
  update public.checkout_batches set status = 'pending_payment',
    provider_order_id = p_provider_order_id, terms_accepted_at = now(),
    updated_at = now() where id = p_batch_id;
  update public.orders set terms_accepted_at = now(), updated_at = now()
    where id in (v_batch.once_order_id, v_batch.plan_order_id);
end;
$$;
revoke all on function public.bind_checkout_batch(uuid, text)
  from public, anon, authenticated;
grant execute on function public.bind_checkout_batch(uuid, text)
  to service_role;

create function public.reset_rejected_checkout_batch(p_batch_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_batch public.checkout_batches%rowtype;
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  select * into v_batch from public.checkout_batches where id = p_batch_id for update;
  if not found or v_batch.status <> 'preparing'
    or v_batch.provider_order_id is not null then
    raise exception 'Combined checkout cannot be reset';
  end if;
  update public.orders set status = 'draft', updated_at = now()
    where id in (v_batch.once_order_id, v_batch.plan_order_id)
    and status = 'pending_payment' and razorpay_order_id is null;
  update public.checkout_batches set status = 'draft', updated_at = now()
    where id = p_batch_id;
  perform public.release_order_capacity(v_batch.once_order_id);
  perform public.release_order_capacity(v_batch.plan_order_id);
end;
$$;
revoke all on function public.reset_rejected_checkout_batch(uuid)
  from public, anon, authenticated;
grant execute on function public.reset_rejected_checkout_batch(uuid)
  to service_role;

create function public.capture_checkout_batch(
  p_batch_id uuid,
  p_provider_order_id text,
  p_provider_payment_id text,
  p_amount_paise integer
)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_batch public.checkout_batches%rowtype;
  v_once public.orders%rowtype;
  v_plan public.orders%rowtype;
  v_paid_at timestamptz := now();
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  select * into v_batch from public.checkout_batches
    where id = p_batch_id for update;
  if not found or v_batch.provider_order_id is distinct from p_provider_order_id
    or v_batch.amount_paise is distinct from p_amount_paise
    or p_provider_payment_id is null or p_provider_payment_id = '' then
    raise exception 'Combined payment mismatch';
  end if;
  if v_batch.status in ('paid', 'test_captured') then
    if v_batch.provider_payment_id = p_provider_payment_id then return; end if;
    raise exception 'Combined checkout already captured by another payment';
  end if;
  if v_batch.status <> 'pending_payment' then
    raise exception 'Combined checkout is not awaiting payment';
  end if;
  select * into v_once from public.orders where id = v_batch.once_order_id for update;
  select * into v_plan from public.orders where id = v_batch.plan_order_id for update;
  if v_once.id is null or v_plan.id is null
    or v_once.user_id is distinct from v_batch.user_id
    or v_plan.user_id is distinct from v_batch.user_id
    or v_once.purchase_mode <> 'once' or v_plan.purchase_mode <> 'plan'
    or v_once.status <> 'pending_payment' or v_plan.status <> 'pending_payment'
    or v_once.is_test is distinct from v_batch.is_test
    or v_plan.is_test is distinct from v_batch.is_test
    or v_once.razorpay_order_id is not null or v_plan.razorpay_order_id is not null
    or v_once.total_paise + v_plan.total_paise <> v_batch.amount_paise then
    raise exception 'Combined checkout orders changed';
  end if;

  insert into public.payments (
    order_id, user_id, provider, provider_order_id, provider_payment_id,
    status, amount_paise, currency, signature_verified, is_test,
    checkout_batch_id, paid_at
  ) values
    (v_once.id, v_batch.user_id, 'razorpay', p_provider_order_id,
      p_provider_payment_id, 'captured', v_once.total_paise, 'INR', true,
      v_batch.is_test, v_batch.id, v_paid_at),
    (v_plan.id, v_batch.user_id, 'razorpay', p_provider_order_id,
      null, 'captured', v_plan.total_paise, 'INR', true,
      v_batch.is_test, v_batch.id, v_paid_at);

  if not v_batch.is_test then
    update public.orders set status = 'paid', paid_total_paise = total_paise,
      updated_at = v_paid_at where id in (v_once.id, v_plan.id);
    update public.delivery_plans set status = 'active', updated_at = v_paid_at
      where id = v_plan.delivery_plan_id and user_id = v_batch.user_id
      and status = 'pending_confirmation';
    if not found then raise exception 'Combined plan could not be activated'; end if;
    perform public.consume_order_capacity(v_once.id);
    perform public.consume_order_capacity(v_plan.id);
    insert into public.customer_notifications (user_id, order_id, kind, title, message)
    values
      (v_batch.user_id, v_once.id, 'payment_confirmed', 'Payment confirmed',
        'Your one-time order is paid and accepted.'),
      (v_batch.user_id, v_plan.id, 'payment_confirmed', 'Payment confirmed',
        'Your prepaid delivery plan is paid and active.');
  end if;
  update public.checkout_batches set
    status = case when v_batch.is_test then 'test_captured' else 'paid' end,
    provider_payment_id = p_provider_payment_id, paid_at = v_paid_at,
    updated_at = v_paid_at where id = v_batch.id;
end;
$$;
revoke all on function public.capture_checkout_batch(uuid, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.capture_checkout_batch(uuid, text, text, integer)
  to service_role;
