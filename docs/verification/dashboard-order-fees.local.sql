-- Local verification draft. Deploy only after the production database change is approved.
alter table public.orders
  add column handling_fee_paise integer not null default 0 check (handling_fee_paise >= 0),
  add column platform_fee_paise integer not null default 0 check (platform_fee_paise >= 0);

create or replace function private.update_farm_prices(p_prices jsonb,p_reason text,p_expected_revision uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_catalog public.farm_catalog_prices%rowtype;v_revision uuid;
begin
  if auth.uid() is null or not exists(select 1 from public.farm_staff where user_id=auth.uid() and active and role='admin') then
    raise exception 'Owner access is required to change prices' using errcode='42501';end if;
  if char_length(btrim(coalesce(p_reason,''))) not between 3 and 300 then raise exception 'Add a short reason for the price change';end if;
  if jsonb_typeof(p_prices) is distinct from 'object' or not (p_prices ?& array['milk','paneer','ghee','bottle'])
     or (select count(*) from jsonb_object_keys(p_prices)) not in (4,8)
     or exists (
       select 1 from jsonb_each(p_prices) x
       where key not in ('milk','paneer','ghee','bottle','delivery_once','delivery_scheduled','handling','platform')
          or case when jsonb_typeof(value) <> 'number' or value::text !~ '^[0-9]+$' then true
             else value::text::numeric not between
               (case when key in ('milk','paneer','ghee','bottle') then 1 else 0 end) and 10000000
             end
     ) then raise exception 'Enter positive prices and non-negative fees with at most two decimal places';end if;
  select * into v_catalog from public.farm_catalog_prices where singleton for update;
  if v_catalog.revision is distinct from p_expected_revision then raise exception 'Prices changed while you were editing. Review the current prices and try again.';end if;
  p_prices := v_catalog.prices || p_prices;
  if v_catalog.prices=p_prices then return v_catalog.revision;end if;
  insert into private.catalog_price_revisions(prices,changed_by,reason) values(p_prices,auth.uid(),btrim(p_reason)) returning id into v_revision;
  update public.farm_catalog_prices set prices=p_prices,revision=v_revision,updated_at=now() where singleton;
  insert into public.farm_change_log(actor_id,record_type,record_id,action,reason,before_state,after_state)
    values(auth.uid(),'catalogue','farm','update_prices',btrim(p_reason),v_catalog.prices,p_prices);
  return v_revision;
end;$$;

create function private.change_checkout_bottle_mode(p_order_id uuid, p_mode text, p_expected_total integer, p_batch_id uuid)
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
     or v_order.discount_paise <> 0 or v_order.discount_code is not null
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
  update public.orders set bottle_choice=p_mode, bottle_charge_paise=v_charge,
    total_paise=v_order.total_paise-v_order.bottle_charge_paise+v_charge, updated_at=now()
    where id=v_order.id;
  if v_plan.id is not null then
    update public.delivery_plans set bottle_choice=p_mode, updated_at=now() where id=v_plan.id;
  end if;
end;$$;
revoke all on function private.change_checkout_bottle_mode(uuid,text,integer,uuid) from public,anon,authenticated,service_role;

create function private.set_checkout_bottle_mode(p_order_id uuid, p_mode text, p_expected_total integer)
returns void language sql security definer set search_path='' as $$
  select private.change_checkout_bottle_mode(p_order_id, p_mode, p_expected_total, null);
$$;
revoke all on function private.set_checkout_bottle_mode(uuid,text,integer) from public,anon,authenticated,service_role;
grant execute on function private.set_checkout_bottle_mode(uuid,text,integer) to authenticated;

create function public.set_checkout_bottle_mode(p_order_id uuid, p_mode text, p_expected_total integer)
returns void language sql security invoker set search_path='' as $$
  select private.set_checkout_bottle_mode(p_order_id, p_mode, p_expected_total);
$$;
revoke all on function public.set_checkout_bottle_mode(uuid,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.set_checkout_bottle_mode(uuid,text,integer) to authenticated;
