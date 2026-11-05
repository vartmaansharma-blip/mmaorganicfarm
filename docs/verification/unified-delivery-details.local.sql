-- Apply after the approved combined_checkout_retry migration (20261104134208).
-- This is an additive release prerequisite for the single delivery form.
create function public.prepare_unified_checkout(
  p_user_id uuid, p_checkout_id uuid, p_catalogue_revision uuid,
  p_once jsonb, p_once_items jsonb, p_plan jsonb, p_plan_items jsonb, p_rules jsonb
)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_once public.orders%rowtype := jsonb_populate_record(null::public.orders,p_once);
  v_plan public.orders%rowtype := jsonb_populate_record(null::public.orders,p_plan);
  v_existing public.orders%rowtype;
  v_batch public.checkout_batches%rowtype;
  v_batch_id uuid;
  v_expected_items jsonb;
  v_actual_items jsonb;
begin
  if current_user not in ('service_role','postgres') or p_user_id is null
    or p_checkout_id is null or p_catalogue_revision is null then
    raise exception 'Service role and checkout identity required' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));

  select * into v_batch from public.checkout_batches
    where once_order_id = p_checkout_id and user_id = p_user_id for update;
  if found and v_batch.status <> 'draft' then
    return v_batch.id;
  end if;

  if jsonb_typeof(p_once_items) is distinct from 'array'
    or jsonb_array_length(p_once_items) not between 1 and 3
    or v_once.address_snapshot is distinct from v_plan.address_snapshot
    or v_once.phone_snapshot is distinct from v_plan.phone_snapshot then
    raise exception 'Invalid delivery selections';
  end if;

  select * into v_existing from public.orders where id = p_checkout_id;
  if found then
    if v_existing.user_id <> p_user_id or v_existing.purchase_mode <> 'once' or v_batch.id is null then
      raise exception 'Checkout is unavailable';
    end if;
    select jsonb_agg(jsonb_build_array(i.product_key,i.quantity,i.delivery_date) order by i.product_key)
      into v_actual_items from public.order_items i where i.order_id = p_checkout_id and i.user_id = p_user_id;
    select jsonb_agg(jsonb_build_array(i.product_key,i.quantity,i.delivery_date) order by i.product_key)
      into v_expected_items from jsonb_populate_recordset(null::public.order_items,p_once_items) i;
    if v_existing.start_date is distinct from v_once.start_date
      or v_existing.address_snapshot is distinct from v_once.address_snapshot
      or v_existing.phone_snapshot is distinct from v_once.phone_snapshot
      or v_existing.catalog_revision is distinct from p_catalogue_revision
      or v_actual_items is distinct from v_expected_items then
      raise exception 'Review the updated basket to start a new checkout';
    end if;
  else
    insert into public.orders(
      id,user_id,purchase_mode,start_date,address_snapshot,phone_snapshot,bottle_choice,milk_litres,
      subtotal_paise,bottle_charge_paise,handling_fee_paise,platform_fee_paise,total_paise,pricing_version
    ) values (
      p_checkout_id,p_user_id,'once',v_once.start_date,v_once.address_snapshot,v_once.phone_snapshot,
      v_once.bottle_choice,v_once.milk_litres,v_once.subtotal_paise,v_once.bottle_charge_paise,
      v_once.handling_fee_paise,v_once.platform_fee_paise,v_once.total_paise,2
    );
    insert into public.order_items(
      order_id,user_id,product_key,product_name,quantity,unit,unit_price_paise,
      line_total_paise,frequency,scheduled_days,delivery_date
    )
    select p_checkout_id,p_user_id,i.product_key,i.product_name,i.quantity,i.unit,i.unit_price_paise,
      i.line_total_paise,i.frequency,i.scheduled_days,i.delivery_date
    from jsonb_populate_recordset(null::public.order_items,p_once_items) i;
  end if;

  v_batch_id := public.prepare_combined_checkout(
    p_user_id,p_checkout_id,v_plan.start_date,p_rules,p_plan,p_plan_items
  );
  -- A catalogue change between the page quote and either stamped insert
  -- invalidates the whole attempt, including any superseded plan draft.
  if not exists (
    select 1 from public.checkout_batches b
    join public.orders o on o.id = b.once_order_id
    join public.orders s on s.id = b.plan_order_id
    where b.id = v_batch_id and o.catalog_revision = p_catalogue_revision
      and s.catalog_revision = p_catalogue_revision
  ) then
    raise exception 'The current prices changed before checkout';
  end if;
  return v_batch_id;
end;
$$;
revoke all on function public.prepare_unified_checkout(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,jsonb)
  from public,anon,authenticated;
grant execute on function public.prepare_unified_checkout(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,jsonb)
  to service_role;
