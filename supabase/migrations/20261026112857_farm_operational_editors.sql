begin;

-- The public catalogue contains prices only. Immutable private revisions preserve
-- the price agreed when each order was created.
create table private.catalog_price_revisions (
  id uuid primary key default gen_random_uuid(),
  prices jsonb not null,
  changed_by uuid references auth.users(id),
  reason text not null,
  is_initial boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index catalog_initial_revision on private.catalog_price_revisions(is_initial) where is_initial;
create index catalog_price_actor_idx on private.catalog_price_revisions(changed_by);
alter table private.catalog_price_revisions enable row level security;
revoke all on private.catalog_price_revisions from public,anon,authenticated,service_role;
create table public.farm_catalog_prices (
  singleton boolean primary key default true check(singleton),
  revision uuid not null references private.catalog_price_revisions(id),
  prices jsonb not null,
  updated_at timestamptz not null default now()
);
create index farm_catalog_revision_idx on public.farm_catalog_prices(revision);
alter table public.farm_catalog_prices enable row level security;
revoke all on public.farm_catalog_prices from public,anon,authenticated,service_role;
grant select on public.farm_catalog_prices to anon,authenticated,service_role;
create policy "Catalogue prices are public" on public.farm_catalog_prices for select to anon,authenticated using(true);
with seed as (
  insert into private.catalog_price_revisions(prices,reason,is_initial)
  values('{"milk":6200,"paneer":20000,"ghee":37500,"bottle":1000}','Initial catalogue; existing agreed prices',true)
  returning id,prices
) insert into public.farm_catalog_prices(revision,prices) select id,prices from seed;

create table public.farm_change_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id),
  record_type text not null,
  record_id text not null,
  action text not null,
  reason text not null,
  before_state jsonb not null,
  after_state jsonb not null,
  created_at timestamptz not null default now()
);
create index farm_change_record_idx on public.farm_change_log(record_type,record_id,created_at desc);
create index farm_change_actor_idx on public.farm_change_log(actor_id);
alter table public.farm_change_log enable row level security;
revoke all on public.farm_change_log from public,anon,authenticated,service_role;
grant select on public.farm_change_log to authenticated,service_role;
create policy "Managers read operational edits" on public.farm_change_log for select to authenticated
using(exists(select 1 from public.farm_staff where user_id=(select auth.uid()) and active and (role='admin' or (role='manager' and record_type<>'payment'))));

alter table public.orders add column catalog_revision uuid references private.catalog_price_revisions(id);
create index orders_catalog_revision_idx on public.orders(catalog_revision);
create function private.stamp_order_catalog_revision() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' then
    if new.catalog_revision is distinct from old.catalog_revision then raise exception 'The agreed catalogue revision cannot be changed';end if;
    return new;
  end if;
  select revision into new.catalog_revision from public.farm_catalog_prices where singleton;
  if new.catalog_revision is null then raise exception 'Catalogue prices are unavailable';end if;
  return new;
end;$$;
revoke all on function private.stamp_order_catalog_revision() from public,anon,authenticated,service_role;
create trigger stamp_order_catalog_revision before insert or update of catalog_revision on public.orders for each row execute function private.stamp_order_catalog_revision();

create function private.update_farm_prices(p_prices jsonb,p_reason text,p_expected_revision uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_catalog public.farm_catalog_prices%rowtype;v_revision uuid;
begin
  if auth.uid() is null or not exists(select 1 from public.farm_staff where user_id=auth.uid() and active and role='admin') then
    raise exception 'Owner access is required to change prices' using errcode='42501';end if;
  if char_length(btrim(coalesce(p_reason,''))) not between 3 and 300 then raise exception 'Add a short reason for the price change';end if;
  if jsonb_typeof(p_prices) is distinct from 'object' then raise exception 'Enter all four prices';end if;
  if (select count(*) from jsonb_object_keys(p_prices))<>4 or exists(
    select 1 from jsonb_each(p_prices) x where key not in ('milk','paneer','ghee','bottle')
      or jsonb_typeof(value)<>'number' or value::text!~'^[0-9]+$'
      or value::text::numeric not between 1 and 10000000
  ) then raise exception 'Enter positive prices with at most two decimal places';end if;
  select * into v_catalog from public.farm_catalog_prices where singleton for update;
  if v_catalog.revision is distinct from p_expected_revision then raise exception 'Prices changed while you were editing. Review the current prices and try again.';end if;
  if v_catalog.prices=p_prices then return v_catalog.revision;end if;
  insert into private.catalog_price_revisions(prices,changed_by,reason) values(p_prices,auth.uid(),btrim(p_reason)) returning id into v_revision;
  update public.farm_catalog_prices set prices=p_prices,revision=v_revision,updated_at=now() where singleton;
  insert into public.farm_change_log(actor_id,record_type,record_id,action,reason,before_state,after_state)
    values(auth.uid(),'catalogue','farm','update_prices',btrim(p_reason),v_catalog.prices,p_prices);
  return v_revision;
end;$$;
revoke all on function private.update_farm_prices(jsonb,text,uuid) from public,anon,authenticated,service_role;
grant execute on function private.update_farm_prices(jsonb,text,uuid) to authenticated;
create function public.update_farm_prices(p_prices jsonb,p_reason text,p_expected_revision uuid)
returns uuid language sql security invoker set search_path='' as $$ select private.update_farm_prices(p_prices,p_reason,p_expected_revision); $$;
revoke all on function public.update_farm_prices(jsonb,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.update_farm_prices(jsonb,text,uuid) to authenticated;

create function private.order_product_prices(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_order public.orders%rowtype;v_prices jsonb;
begin
  select * into v_order from public.orders where id=p_order_id;
  if v_order.id is null or ((auth.uid() is null or v_order.user_id is distinct from auth.uid()) and (select auth.role()) is distinct from 'service_role') then
    raise exception 'Order unavailable' using errcode='42501';end if;
  select prices into v_prices from private.catalog_price_revisions
    where id=coalesce(v_order.catalog_revision,(select id from private.catalog_price_revisions where is_initial));
  if v_prices is null then raise exception 'Agreed prices are unavailable';end if;
  return v_prices;
end;$$;
revoke all on function private.order_product_prices(uuid) from public,anon,authenticated,service_role;
grant execute on function private.order_product_prices(uuid) to authenticated,service_role;
create function public.order_product_prices(p_order_id uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.order_product_prices(p_order_id); $$;
revoke all on function public.order_product_prices(uuid) from public,anon,authenticated,service_role;
grant execute on function public.order_product_prices(uuid) to authenticated,service_role;

create function private.audit_customer_edit() returns trigger language plpgsql security definer set search_path='' as $$
declare v_before jsonb:=to_jsonb(old)-'updated_at';v_after jsonb:=to_jsonb(new)-'updated_at';
begin
  if v_before is distinct from v_after and exists(select 1 from public.farm_staff where user_id=auth.uid() and active and role in ('admin','manager')) then
    insert into public.farm_change_log(actor_id,record_type,record_id,action,reason,before_state,after_state)
      values(auth.uid(),'customer',new.user_id::text,'edit_customer','Customer profile or route updated from the farm workspace',v_before,v_after);
  end if;
  return new;
end;$$;
revoke all on function private.audit_customer_edit() from public,anon,authenticated,service_role;
create trigger audit_farm_customer_edit after update on public.customer_profiles for each row execute function private.audit_customer_edit();

alter table public.payments add column record_revision integer not null default 0;
create function private.guard_manual_payment_edit() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.provider='manual' and auth.uid() is not null and not exists(
    select 1 from public.farm_staff where user_id=auth.uid() and active and role='admin'
  ) then raise exception 'Owner access is required to correct a payment' using errcode='42501';end if;
  return new;
end;$$;
revoke all on function private.guard_manual_payment_edit() from public,anon,authenticated,service_role;
create trigger guard_farm_manual_payment_edit before update on public.payments for each row execute function private.guard_manual_payment_edit();

create function private.correct_manual_payment_details(p_payment_id uuid,p_method text,p_reference text,p_paid_at timestamptz,p_reason text,p_expected_revision integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_payment public.payments%rowtype;v_after jsonb;
begin
  if auth.uid() is null or not exists(select 1 from public.farm_staff where user_id=auth.uid() and active and role='admin') then
    raise exception 'Owner access is required to correct a payment' using errcode='42501';end if;
  if p_method not in ('cash','upi','bank_transfer','other') or p_method is null then raise exception 'Choose a payment method';end if;
  if char_length(coalesce(p_reference,''))>120 then raise exception 'Keep the payment reference under 120 characters';end if;
  if p_paid_at is null or p_paid_at>now()+interval '5 minutes' or p_paid_at<'2000-01-01'::timestamptz then raise exception 'Choose a valid received date';end if;
  if char_length(btrim(coalesce(p_reason,''))) not between 3 and 300 then raise exception 'Add a short reason for the correction';end if;
  select * into v_payment from public.payments where id=p_payment_id for update;
  if v_payment.id is null or v_payment.provider<>'manual' or v_payment.status<>'captured' or v_payment.is_test then raise exception 'Only a live farm-recorded payment can be edited';end if;
  if v_payment.record_revision is distinct from p_expected_revision then raise exception 'This receipt changed while you were editing. Review it and try again.';end if;
  update public.payments set payment_method=p_method,provider_payment_id=nullif(btrim(p_reference),''),paid_at=p_paid_at,record_revision=record_revision+1
    where id=p_payment_id returning to_jsonb(payments.*) into v_after;
  insert into public.farm_change_log(actor_id,record_type,record_id,action,reason,before_state,after_state)
    values(auth.uid(),'payment',p_payment_id::text,'correct_receipt',btrim(p_reason),to_jsonb(v_payment),v_after);
  return p_payment_id;
end;$$;
revoke all on function private.correct_manual_payment_details(uuid,text,text,timestamptz,text,integer) from public,anon,authenticated,service_role;
grant execute on function private.correct_manual_payment_details(uuid,text,text,timestamptz,text,integer) to authenticated;
create function public.correct_manual_payment_details(p_payment_id uuid,p_method text,p_reference text,p_paid_at timestamptz,p_reason text,p_expected_revision integer)
returns uuid language sql security invoker set search_path='' as $$ select private.correct_manual_payment_details(p_payment_id,p_method,p_reference,p_paid_at,p_reason,p_expected_revision); $$;
revoke all on function public.correct_manual_payment_details(uuid,text,text,timestamptz,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.correct_manual_payment_details(uuid,text,text,timestamptz,text,integer) to authenticated;

-- Staff can redistribute prepaid quantities, never silently add a charge or refund.
create function private.move_farm_prepaid_quantity(p_plan_id uuid,p_product text,p_source date,p_target date,p_quantity integer,p_expected_source integer,p_expected_target integer,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_plan public.delivery_plans%rowtype;v_day date;v_source numeric;v_target numeric:=0;v_remaining numeric;v_delivery uuid;v_quantity numeric;v_unit text;v_result jsonb;
begin
  if auth.uid() is null or not exists(select 1 from public.farm_staff where user_id=auth.uid() and active and role in ('admin','manager')) then raise exception 'Farm manager access required' using errcode='42501';end if;
  if p_product is null or p_product not in ('milk','paneer','ghee') or p_source is null or p_source<=private.operational_today() or (p_target is not null and (p_target<=private.operational_today() or p_target=p_source)) then raise exception 'Choose future delivery dates';end if;
  if p_quantity is null or p_quantity not between 1 and 5 or char_length(btrim(coalesce(p_reason,''))) not between 3 and 300 then raise exception 'Choose a quantity and add a short reason';end if;
  for v_day in select distinct d from unnest(array[p_source,p_target]) d where d is not null order by d loop perform private.lock_operational_day(v_day);end loop;
  select * into v_plan from public.delivery_plans where id=p_plan_id for update;
  if v_plan.id is null or v_plan.status<>'active' or v_plan.is_test or not exists(select 1 from public.orders o join public.payments p on p.order_id=o.id where o.delivery_plan_id=v_plan.id and o.status='paid' and not o.is_test and p.status='captured' and not p.is_test) then raise exception 'Choose an active paid plan';end if;
  if p_source<v_plan.start_date or (p_target is not null and p_target<v_plan.start_date) then raise exception 'Choose dates after the plan starts';end if;
  if v_plan.billing_model='calendar_month' then
    if p_target is null or p_source>=v_plan.period_end_exclusive or p_target>=v_plan.period_end_exclusive then raise exception 'Move products within the purchased month';end if;
    if exists(select 1 from public.delivery_exceptions where plan_id=v_plan.id and product_key=p_product and delivery_date in(p_source,p_target)) then raise exception 'Resolve the existing delivery exception before moving this product';end if;
  elsif p_product<>'milk' or v_plan.delivered_deliveries>=v_plan.purchased_deliveries then raise exception 'Only remaining prepaid milk can be adjusted on this plan';end if;
  for v_day in select distinct d from unnest(array[p_source,p_target]) d where d is not null loop
    if exists(select 1 from public.delivery_pauses where plan_id=v_plan.id and v_day between start_date and end_date) then raise exception 'Choose dates outside the plan pause';end if;
    if coalesce((select action from public.delivery_day_reviews where delivery_date=v_day order by version desc limit 1),'')='closed' then raise exception 'The delivery day is closed';end if;
    if exists(select 1 from public.delivery_dispatches where delivery_date=v_day and status='released') then raise exception 'Reopen dispatch before changing quantities';end if;
    if exists(select 1 from public.daily_deliveries d where d.user_id=v_plan.user_id and d.delivery_date=v_day and (d.status in ('out_for_delivery','delivered','failed') or d.delivery_confirmed or d.completed_at is not null or exists(select 1 from public.daily_delivery_items i where i.delivery_id=d.id and i.fulfilled_quantity is not null) or exists(select 1 from public.delivery_visit_outcomes o where o.delivery_date=d.delivery_date and o.visit_key=d.visit_key))) then raise exception 'Recorded delivery evidence cannot be edited';end if;
  end loop;
  perform 1 from public.production_capacity where product_key=p_product for update;
  v_source:=coalesce(public.plan_product_quantity(v_plan.id,p_product,p_source),0);
  if p_target is not null then v_target:=coalesce(public.plan_product_quantity(v_plan.id,p_product,p_target),0);end if;
  if v_source is distinct from p_expected_source::numeric or v_target is distinct from p_expected_target::numeric then raise exception 'The schedule changed. Review the current quantities and try again.';end if;
  if p_quantity>v_source or v_target+p_quantity>5 then raise exception 'Keep each delivery between zero and five units';end if;
  v_remaining:=v_source-p_quantity;
  v_unit:=case when p_product='milk' then 'litre' else '500 g' end;
  if v_plan.billing_model='calendar_month' then
    if v_remaining=0 then delete from public.scheduled_delivery_items where plan_id=v_plan.id and product_key=p_product and delivery_date=p_source;
    else update public.scheduled_delivery_items set quantity=v_remaining where plan_id=v_plan.id and product_key=p_product and delivery_date=p_source;end if;
    insert into public.scheduled_delivery_items(plan_id,user_id,product_key,delivery_date,quantity,unit) values(v_plan.id,v_plan.user_id,p_product,p_target,v_target+p_quantity,v_unit)
      on conflict(plan_id,product_key,delivery_date) do update set quantity=excluded.quantity;
  else
    if p_target is null then
      if v_remaining<>0 then raise exception 'A full skip must retain the entire prepaid delivery';end if;
      insert into public.delivery_exceptions(plan_id,user_id,product_key,delivery_date,action,quantity,unit) values(v_plan.id,v_plan.user_id,'milk',p_source,'skip',null,null)
        on conflict(plan_id,product_key,delivery_date) do update set action='skip',quantity=null,unit=null,updated_at=now();
    else
      if p_target<>p_source+1 or v_remaining<=0 then raise exception 'Reduced milk moves to the next calendar day; use a full skip for an entire delivery';end if;
      insert into public.delivery_exceptions(plan_id,user_id,product_key,delivery_date,action,quantity,unit) values
        (v_plan.id,v_plan.user_id,'milk',p_source,'override',v_remaining,'litre'),(v_plan.id,v_plan.user_id,'milk',p_target,'override',v_target+p_quantity,'litre')
        on conflict(plan_id,product_key,delivery_date) do update set action='override',quantity=excluded.quantity,unit=excluded.unit,updated_at=now();
    end if;
  end if;
  if p_target is not null and exists(select 1 from public.product_capacity_snapshot(p_product,p_target,1) where active_plan_quantity+paid_once_quantity+checkout_holds_quantity>capacity_limit) then raise exception 'The destination exceeds available product capacity';end if;
  -- Refresh only this plan's untouched sheet entries. Other customers and outcomes stay intact.
  for v_day in select distinct d from unnest(array[p_source,p_target]) d where d is not null loop
    v_quantity:=coalesce(public.plan_product_quantity(v_plan.id,p_product,v_day),0);
    select id into v_delivery from public.daily_deliveries where plan_id=v_plan.id and delivery_date=v_day and replacement_of_delivery_id is null for update;
    if v_delivery is null and v_quantity>0 and (exists(select 1 from public.daily_deliveries where delivery_date=v_day) or exists(select 1 from public.delivery_dispatches where delivery_date=v_day)) then
      insert into public.daily_deliveries(plan_id,user_id,delivery_date,bottle_choice,delivery_area_id,delivery_route_id,route_stop_order,customer_name,phone_snapshot,address_snapshot,generated_by)
        select v_plan.id,v_plan.user_id,v_day,v_plan.bottle_choice,delivery_area_id,delivery_route_id,route_stop_order,coalesce(full_name,'Customer'),phone,address_line,auth.uid() from public.customer_profiles where user_id=v_plan.user_id returning id into v_delivery;
    end if;
    if v_delivery is not null then
      if v_quantity>0 then
        insert into public.daily_delivery_items(delivery_id,product_key,quantity,unit) values(v_delivery,p_product,v_quantity,v_unit) on conflict(delivery_id,product_key) do update set quantity=excluded.quantity,unit=excluded.unit;
        update public.daily_deliveries set status='planned',updated_at=now() where id=v_delivery and status='cancelled';
      else delete from public.daily_delivery_items where delivery_id=v_delivery and product_key=p_product;end if;
      if not exists(select 1 from public.daily_delivery_items where delivery_id=v_delivery) then delete from public.daily_deliveries where id=v_delivery;end if;
    end if;
  end loop;
  v_result:=jsonb_build_object('source',p_source,'target',p_target,'source_quantity',v_remaining,'target_quantity',case when p_target is null then 0 else v_target+p_quantity end,'product',p_product,'moved',p_quantity);
  insert into public.farm_change_log(actor_id,record_type,record_id,action,reason,before_state,after_state) values(auth.uid(),'plan',v_plan.id::text,'move_prepaid_quantity',btrim(p_reason),jsonb_build_object('source_quantity',v_source,'target_quantity',v_target),v_result);
  insert into public.customer_notifications(user_id,kind,title,message) values(v_plan.user_id,'delivery_ready','Delivery schedule updated',case when p_target is null then 'The farm skipped your milk on '||p_source||'. This prepaid delivery stays at the end of your plan.' else 'The farm moved '||p_quantity||' '||v_unit||' of '||p_product||' from '||p_source||' to '||p_target||'. Your prepaid total is unchanged.' end);
  return v_result;
end;$$;
revoke all on function private.move_farm_prepaid_quantity(uuid,text,date,date,integer,integer,integer,text) from public,anon,authenticated,service_role;
grant execute on function private.move_farm_prepaid_quantity(uuid,text,date,date,integer,integer,integer,text) to authenticated;
create function public.move_farm_prepaid_quantity(p_plan_id uuid,p_product text,p_source date,p_target date,p_quantity integer,p_expected_source integer,p_expected_target integer,p_reason text)
returns jsonb language sql security invoker set search_path='' as $$ select private.move_farm_prepaid_quantity(p_plan_id,p_product,p_source,p_target,p_quantity,p_expected_source,p_expected_target,p_reason);$$;
revoke all on function public.move_farm_prepaid_quantity(uuid,text,date,date,integer,integer,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.move_farm_prepaid_quantity(uuid,text,date,date,integer,integer,integer,text) to authenticated;

notify pgrst,'reload schema';
commit;
