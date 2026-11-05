-- Apply after unified_delivery_details (20261105073030).
-- Existing batches keep their original fee policy through the nullable date.
alter table public.checkout_batches add column shared_delivery_date date;

create or replace function private.update_farm_prices(p_prices jsonb,p_reason text,p_expected_revision uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_catalog public.farm_catalog_prices%rowtype;v_revision uuid;
begin
  if auth.uid() is null or not exists(select 1 from public.farm_staff where user_id=auth.uid() and active and role='admin') then
    raise exception 'Owner access is required to change prices' using errcode='42501';end if;
  if char_length(btrim(coalesce(p_reason,''))) not between 3 and 300 then raise exception 'Add a short reason for the price change';end if;
  if jsonb_typeof(p_prices) is distinct from 'object' or not (p_prices ?& array['milk','paneer','ghee','bottle'])
     or (select count(*) from jsonb_object_keys(p_prices)) not in (4,8,9)
     or exists (
       select 1 from jsonb_each(p_prices) x
       where key not in ('milk','paneer','ghee','bottle','delivery_once','delivery_scheduled','delivery_free_at','handling','platform')
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

create function public.prepare_delivery_details_checkout(
  p_user_id uuid, p_checkout_id uuid, p_catalogue_revision uuid,
  p_once jsonb, p_once_items jsonb, p_plan jsonb, p_plan_items jsonb, p_rules jsonb,
  p_shared_delivery_date date
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_existing public.checkout_batches%rowtype;
  v_batch public.checkout_batches%rowtype;
  v_batch_id uuid;
  v_shared_date date;
begin
  if current_user not in ('service_role','postgres') or p_user_id is null then
    raise exception 'Service role and checkout identity required' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  select * into v_existing from public.checkout_batches
    where once_order_id = p_checkout_id and user_id = p_user_id for update;
  if found and v_existing.status = 'draft' and v_existing.shared_delivery_date is distinct from p_shared_delivery_date then
    raise exception 'Review the updated basket to start a new checkout';
  end if;

  v_batch_id := public.prepare_unified_checkout(
    p_user_id,p_checkout_id,p_catalogue_revision,p_once,p_once_items,p_plan,p_plan_items,p_rules
  );

  if v_existing.id is null then
    select once_order.start_date into v_shared_date
    from public.checkout_batches b
    join public.orders once_order on once_order.id = b.once_order_id
    join public.orders scheduled_order on scheduled_order.id = b.plan_order_id
    where b.id = v_batch_id and exists (
      select 1 from public.scheduled_delivery_items item
      where item.plan_id = scheduled_order.delivery_plan_id and item.delivery_date = once_order.start_date
        and item.user_id = p_user_id and item.quantity > 0
    );
    if v_shared_date is distinct from p_shared_delivery_date then
      raise exception 'The shared delivery date changed. Review the basket before paying';
    end if;
    if v_shared_date is not null then
      update public.checkout_batches set shared_delivery_date = v_shared_date where id = v_batch_id;
    end if;
  end if;

  select * into v_batch from public.checkout_batches where id = v_batch_id and user_id = p_user_id;
  return jsonb_build_object('id',v_batch.id,'status',v_batch.status,'amount_paise',v_batch.amount_paise);
end;
$$;
revoke all on function public.prepare_delivery_details_checkout(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,date)
  from public,anon,authenticated;
grant execute on function public.prepare_delivery_details_checkout(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,date)
  to service_role;
