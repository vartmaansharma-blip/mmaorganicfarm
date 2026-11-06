-- Apply after delivery reconciliation, routing and driver runs.
-- Retain request evidence independently of regenerated delivery rows.
begin;
alter table public.customer_notifications
  drop constraint customer_notifications_kind_check,
  add constraint customer_notifications_kind_check check (kind in (
    'payment_confirmed', 'delivery_ready', 'out_for_delivery', 'delivery_completed',
    'delivery_failed', 'delivery_cancelled', 'cancellation_update', 'delivery_change'
  ));

create table public.today_delivery_requests (
  id uuid primary key,
  delivery_id uuid not null,
  plan_id uuid,
  user_id uuid not null references auth.users(id),
  delivery_date date not null,
  kind text not null check (kind in ('quantity', 'issue')),
  product_key text check (product_key in ('milk', 'paneer', 'ghee')),
  previous_quantity numeric(5,2),
  requested_quantity numeric(5,2),
  note text not null check (length(note) <= 300),
  status text not null default 'requested' check (status in ('requested', 'applied', 'declined', 'follow_up', 'resolved')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  decision_note text check (length(decision_note) <= 300),
  moved_to date,
  created_at timestamptz not null default now(),
  check ((kind = 'issue' and product_key is null and previous_quantity is null and requested_quantity is null and length(note) >= 3)
    or (kind = 'quantity' and product_key is not null and previous_quantity is not null and requested_quantity is not null
        and previous_quantity between 0 and 5 and requested_quantity between 0 and 5 and previous_quantity <> requested_quantity)),
  check ((status = 'applied') = (moved_to is not null)),
  check ((status = 'requested') = (reviewed_at is null))
);
create unique index today_delivery_open_request_idx
  on public.today_delivery_requests(delivery_id, product_key) nulls not distinct where status = 'requested';
create index today_delivery_request_customer_idx on public.today_delivery_requests(user_id, delivery_date, created_at desc);
create index today_delivery_request_inbox_idx on public.today_delivery_requests(status, delivery_date, created_at);
create index today_delivery_request_driver_idx on public.today_delivery_requests(delivery_id, status);
alter table public.today_delivery_requests enable row level security;
revoke all on public.today_delivery_requests from public, anon, authenticated;
grant select on public.today_delivery_requests to authenticated;
create policy today_request_owner_or_manager on public.today_delivery_requests for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_operations_manager()));
-- Expose confirmed quantities to the assigned driver without customer notes.
create function private.get_driver_today_changes(p_date date)
returns table(id uuid, delivery_id uuid, product_key text, previous_quantity numeric, requested_quantity numeric)
language sql stable security definer set search_path = '' as $$
  select r.id, d.id, r.product_key, r.previous_quantity, r.requested_quantity
  from public.today_delivery_requests r
  join public.daily_deliveries d on d.user_id = r.user_id and d.delivery_date = r.delivery_date and not d.is_test
    and (d.id = r.delivery_id or (d.plan_id = r.plan_id and d.replacement_of_delivery_id is null))
  join public.delivery_dispatches x on x.delivery_date = d.delivery_date
  where r.status = 'applied' and r.delivery_date = p_date and x.status = 'released'
    and d.assigned_driver_id = auth.uid()
    and exists (select 1 from public.farm_staff s where s.user_id = auth.uid() and s.active and s.role = 'driver')
  order by r.reviewed_at desc, r.id
  limit 100;
$$;


create function private.request_today_delivery_change(
  p_id uuid, p_delivery uuid, p_kind text, p_product text, p_expected numeric, p_quantity numeric, p_note text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_today date := private.operational_today();
  v_delivery public.daily_deliveries%rowtype;
  v_existing public.today_delivery_requests%rowtype;
  v_before numeric;
  v_note text := trim(coalesce(p_note, ''));
begin
  if v_user is null then raise exception 'Sign in to manage your delivery' using errcode = '42501'; end if;
  if p_id is null or p_kind is null or p_kind not in ('quantity', 'issue') or length(v_note) > 300 then
    raise exception 'Review your request and try again';
  end if;
  perform private.lock_operational_day(v_today);
  select * into v_existing from public.today_delivery_requests where id = p_id and user_id = v_user;
  if found then
    if v_existing.delivery_id <> p_delivery or v_existing.kind <> p_kind or v_existing.product_key is distinct from p_product
      or v_existing.requested_quantity is distinct from p_quantity or v_existing.previous_quantity is distinct from p_expected
      or v_existing.note <> v_note then raise exception 'This request key is already in use'; end if;
    return jsonb_build_object('status', v_existing.status);
  end if;

  select * into v_delivery from public.daily_deliveries
    where id = p_delivery and user_id = v_user and delivery_date = v_today and not is_test for update;
  if not found then raise exception 'Select one of your confirmed deliveries today' using errcode = '42501'; end if;
  if p_kind = 'quantity' then
    if v_delivery.status not in ('planned', 'ready', 'out_for_delivery') or v_delivery.delivery_confirmed
      or exists (select 1 from public.delivery_visit_outcomes o where o.delivery_date = v_today and o.visit_key = v_delivery.visit_key) then
      raise exception 'Quantity changes are closed. Report a delivery issue if you need help.';
    end if;
    if p_product is null or p_product not in ('milk','paneer','ghee') or p_quantity is null or p_quantity not between 0 and 5
      or p_quantity <> round(p_quantity, case when p_product = 'milk' then 2 else 0 end) then
      raise exception 'Choose a supported product quantity between zero and five';
    end if;
    select quantity into v_before from public.daily_delivery_items where delivery_id = p_delivery and product_key = p_product;
    v_before := coalesce(v_before, 0);
    if p_expected is distinct from v_before then raise exception 'The delivery changed. Refresh before sending your request.'; end if;
    if p_quantity = v_before then raise exception 'Choose a different quantity'; end if;
  elsif p_product is not null or p_quantity is not null or p_expected is not null or length(v_note) < 3 then
    raise exception 'Describe the delivery issue in a few words';
  end if;
  if exists (select 1 from public.today_delivery_requests where delivery_id = p_delivery
    and product_key is not distinct from p_product and status = 'requested') then
    raise exception 'A request for this item is already awaiting the farm';
  end if;
  insert into public.today_delivery_requests(id, delivery_id, plan_id, user_id, delivery_date, kind, product_key, previous_quantity, requested_quantity, note)
  values (p_id, p_delivery, v_delivery.plan_id, v_user, v_today, p_kind, p_product, v_before, p_quantity, v_note);
  insert into public.customer_notifications(user_id, kind, title, message)
  values (v_user, 'delivery_change', case when p_kind = 'issue' then 'Delivery issue received' else 'Delivery change requested' end,
    'The farm will review your request. Your confirmed delivery and payment stay as shown.');
  return jsonb_build_object('status', 'requested');
end;
$$;

create function private.review_today_delivery_change(p_id uuid, p_decision text, p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_request public.today_delivery_requests%rowtype;
  v_delivery public.daily_deliveries%rowtype;
  v_plan public.delivery_plans%rowtype;
  v_target_delivery public.daily_deliveries%rowtype;
  v_day date;
  v_target date;
  v_next numeric;
  v_delta numeric;
  v_unit text;
  v_note text := trim(coalesce(p_note, ''));
begin
  if not private.is_operations_manager() then raise exception 'Farm manager access required' using errcode = '42501'; end if;
  if p_decision is null or p_decision not in ('applied', 'declined', 'follow_up', 'resolved') or length(v_note) not between 3 and 300 then
    raise exception 'Record a decision and a short customer-facing explanation';
  end if;
  select * into v_request from public.today_delivery_requests where id = p_id for update;
  if not found then raise exception 'Request not found'; end if;
  if v_request.status = p_decision and v_request.decision_note = v_note then
    return jsonb_build_object('status', v_request.status, 'moved_to', v_request.moved_to);
  end if;
  if not ((v_request.status = 'requested' and p_decision <> 'resolved')
    or (v_request.status = 'follow_up' and p_decision = 'resolved')) then
    raise exception 'This decision is unavailable for the current request status';
  end if;
  if p_decision = 'applied' then
    if v_request.kind <> 'quantity' or v_request.requested_quantity <= 0 or v_request.requested_quantity >= v_request.previous_quantity
      or v_request.delivery_date <> private.operational_today() then
      raise exception 'Only a partial prepaid reduction before packing can be applied here. Record a follow-up for this request.';
    end if;
    v_target := v_request.delivery_date + 1;
    for v_day in select unnest(array[v_request.delivery_date, v_target]) loop
      perform private.lock_operational_day(v_day);
      if exists (select 1 from public.delivery_dispatches where delivery_date = v_day and status = 'released')
        or coalesce((select action from public.delivery_day_reviews where delivery_date = v_day order by version desc limit 1), '') = 'closed' then
        raise exception 'Dispatch is released or closed. Coordinate a follow-up.';
      end if;
    end loop;
    select * into v_delivery from public.daily_deliveries where id = v_request.delivery_id and user_id = v_request.user_id
      and delivery_date = v_request.delivery_date for update;
    if v_delivery.plan_id is null or v_delivery.status <> 'planned' or v_delivery.is_test or v_delivery.delivery_confirmed
      or v_delivery.replacement_of_delivery_id is not null or v_delivery.fulfilment_root_id is not null
      or exists (select 1 from public.delivery_visit_outcomes o where o.delivery_date = v_delivery.delivery_date and o.visit_key = v_delivery.visit_key) then
      raise exception 'This delivery cannot be changed before packing. Coordinate a follow-up.';
    end if;
    select * into v_plan from public.delivery_plans where id = v_delivery.plan_id for update;
    if v_plan.status <> 'active' or v_plan.is_test or v_plan.user_id <> v_request.user_id
      or v_plan.billing_model <> 'calendar_month' or v_target >= v_plan.period_end_exclusive
      or exists (select 1 from public.delivery_pauses where plan_id = v_plan.id and v_target between start_date and end_date)
      or not exists (select 1 from public.orders o join public.payments p on p.order_id = o.id
        where o.delivery_plan_id = v_plan.id and o.status = 'paid' and not o.is_test and p.status = 'captured' and not p.is_test) then
      raise exception 'A verified prepaid monthly delivery and a next-day date within the plan are required';
    end if;
    select * into v_target_delivery from public.daily_deliveries
      where plan_id = v_plan.id and delivery_date = v_target and replacement_of_delivery_id is null for update;
    if exists (select 1 from public.delivery_runs r where r.status <> 'cancelled'
      and ((r.delivery_date = v_delivery.delivery_date and r.route_id = v_delivery.delivery_route_id)
        or (r.delivery_date = v_target and r.route_id = v_target_delivery.delivery_route_id)))
      or (v_target_delivery.id is null and exists (select 1 from public.delivery_dispatches where delivery_date = v_target))
      or (v_target_delivery.id is not null and (v_target_delivery.status <> 'planned' or v_target_delivery.delivery_confirmed
        or exists (select 1 from public.delivery_visit_outcomes o where o.delivery_date = v_target and o.visit_key = v_target_delivery.visit_key))) then
      raise exception 'A load or next-day sheet needs review before changing these quantities';
    end if;

    perform 1 from public.production_capacity where product_key = v_request.product_key for update;
    if not found then raise exception 'Product capacity has not been set'; end if;
    if exists (select 1 from public.delivery_exceptions where plan_id = v_plan.id and product_key = v_request.product_key
      and delivery_date in (v_delivery.delivery_date, v_target))
      or public.plan_product_quantity(v_plan.id, v_request.product_key, v_delivery.delivery_date) is distinct from v_request.previous_quantity
      or (select quantity from public.daily_delivery_items where delivery_id = v_delivery.id and product_key = v_request.product_key
        and fulfilled_quantity is null) is distinct from v_request.previous_quantity then
      raise exception 'The order changed since the request was sent. Review the current delivery.';
    end if;
    v_delta := v_request.previous_quantity - v_request.requested_quantity;
    v_next := coalesce(public.plan_product_quantity(v_plan.id, v_request.product_key, v_target), 0);
    if v_next + v_delta > 5 or not exists (select 1 from public.product_capacity_snapshot(v_request.product_key, v_target, 1)
      where available_quantity >= v_delta) then raise exception 'Tomorrow does not have enough capacity for the prepaid quantity'; end if;

    update public.scheduled_delivery_items set quantity = v_request.requested_quantity
      where plan_id = v_plan.id and product_key = v_request.product_key and delivery_date = v_delivery.delivery_date
      returning unit into strict v_unit;
    insert into public.scheduled_delivery_items(plan_id, user_id, product_key, delivery_date, quantity, unit)
      values (v_plan.id, v_request.user_id, v_request.product_key, v_target, v_next + v_delta, v_unit)
      on conflict (plan_id, product_key, delivery_date) do update set quantity = excluded.quantity;
    update public.daily_delivery_items set quantity = v_request.requested_quantity
      where delivery_id = v_delivery.id and product_key = v_request.product_key;
    update public.daily_deliveries set updated_at = now() where id = v_delivery.id;
    if v_target_delivery.id is not null then
      insert into public.daily_delivery_items(delivery_id, product_key, quantity, unit)
        values (v_target_delivery.id, v_request.product_key, v_next + v_delta, v_unit)
        on conflict (delivery_id, product_key) do update set quantity = excluded.quantity;
      update public.daily_deliveries set updated_at = now() where id = v_target_delivery.id;
    end if;
  end if;

  update public.today_delivery_requests
    set status = p_decision, reviewed_by = auth.uid(), reviewed_at = now(), decision_note = v_note, moved_to = v_target
    where id = p_id;
  insert into public.farm_change_log(actor_id, record_type, record_id, action, reason, before_state, after_state)
    values (auth.uid(), 'delivery_request', p_id::text, p_decision, v_note,
      jsonb_build_object('status', v_request.status, 'decision_note', v_request.decision_note),
      jsonb_build_object('status', p_decision, 'moved_to', v_target));
  insert into public.customer_notifications(user_id, kind, title, message)
    values (v_request.user_id, 'delivery_change',
      case p_decision when 'applied' then 'Delivery quantity updated' when 'declined' then 'Delivery request declined' when 'resolved' then 'Delivery follow-up closed' else 'Delivery follow-up needed' end,
      case when p_decision = 'applied' then initcap(v_request.product_key) || ' changed from ' ||
        trim_scale(v_request.previous_quantity) || ' to ' || trim_scale(v_request.requested_quantity) ||
        case when v_request.product_key = 'milk' then ' L' else ' packs' end ||
        '. The remaining prepaid quantity will be delivered on ' || v_target || '. Payment unchanged. '
        else 'Your confirmed delivery and payment stay as shown. ' end || v_note);
  return jsonb_build_object('status', p_decision, 'moved_to', v_target);
end;
$$;

-- Reuse the existing outcome command. Compare the quantities under its date lock
-- so a reopened and released dispatch cannot accept a stale driver confirmation.
create function private.record_current_delivery_outcome(
  p_delivery_ids uuid[], p_outcome text, p_reason_code text, p_note text,
  p_bottles_returned integer, p_quantities jsonb, p_request_key uuid, p_expected jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_role text := private.operations_role();
  v_date date;
  v_current jsonb;
begin
  if p_request_key is null or p_expected is null or coalesce(cardinality(p_delivery_ids), 0) not between 1 and 50 then
    raise exception 'Refresh this visit before recording an outcome';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('delivery-request:' || p_request_key::text, 0));
  if not exists (select 1 from public.delivery_operation_events where request_key = p_request_key) then
    select min(d.delivery_date) into v_date from public.daily_deliveries d
      where d.id = any(p_delivery_ids) and not d.is_test
        and (v_role <> 'driver' or d.assigned_driver_id = auth.uid());
    if v_date is null then raise exception 'Use a delivery assigned to you' using errcode = '42501'; end if;
    perform private.lock_operational_day(v_date);
    select coalesce(jsonb_agg(jsonb_build_object('delivery_id', i.delivery_id, 'product_key', i.product_key, 'quantity', i.quantity)
      order by i.delivery_id, i.product_key), '[]') into v_current
      from public.daily_delivery_items i join public.daily_deliveries d on d.id = i.delivery_id
      where d.id = any(p_delivery_ids) and d.delivery_date = v_date and not d.is_test
        and (v_role <> 'driver' or d.assigned_driver_id = auth.uid());
    if v_current is distinct from p_expected then raise exception 'This delivery changed. Refresh the route and review the quantities.'; end if;
  end if;
  return private.record_visit_outcome_impl(p_delivery_ids, p_outcome, p_reason_code, p_note,
    p_bottles_returned, p_quantities, p_request_key);
end;
$$;

create function public.get_driver_today_changes(p_date date)
returns table(id uuid, delivery_id uuid, product_key text, previous_quantity numeric, requested_quantity numeric)
language sql stable security invoker set search_path = '' as $$
  select * from private.get_driver_today_changes(p_date);
$$;
create function public.request_today_delivery_change(
  p_id uuid, p_delivery uuid, p_kind text, p_product text, p_expected numeric, p_quantity numeric, p_note text
) returns jsonb language sql security invoker set search_path = '' as $$
  select private.request_today_delivery_change(p_id, p_delivery, p_kind, p_product, p_expected, p_quantity, p_note);
$$;
create function public.review_today_delivery_change(p_id uuid, p_decision text, p_note text)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.review_today_delivery_change(p_id, p_decision, p_note);
$$;
create function public.record_current_delivery_outcome(
  p_delivery_ids uuid[], p_outcome text, p_reason_code text, p_note text,
  p_bottles_returned integer, p_quantities jsonb, p_request_key uuid, p_expected jsonb
) returns jsonb language sql security invoker set search_path = '' as $$
  select private.record_current_delivery_outcome(p_delivery_ids, p_outcome, p_reason_code, p_note,
    p_bottles_returned, p_quantities, p_request_key, p_expected);
$$;

revoke all on function
  private.get_driver_today_changes(date), public.get_driver_today_changes(date),
  private.request_today_delivery_change(uuid,uuid,text,text,numeric,numeric,text), public.request_today_delivery_change(uuid,uuid,text,text,numeric,numeric,text),
  private.review_today_delivery_change(uuid,text,text), public.review_today_delivery_change(uuid,text,text),
  private.record_current_delivery_outcome(uuid[],text,text,text,integer,jsonb,uuid,jsonb), public.record_current_delivery_outcome(uuid[],text,text,text,integer,jsonb,uuid,jsonb)
  from public, anon, authenticated;
grant execute on function
  private.get_driver_today_changes(date), public.get_driver_today_changes(date),
  private.request_today_delivery_change(uuid,uuid,text,text,numeric,numeric,text), public.request_today_delivery_change(uuid,uuid,text,text,numeric,numeric,text),
  private.review_today_delivery_change(uuid,text,text), public.review_today_delivery_change(uuid,text,text),
  private.record_current_delivery_outcome(uuid[],text,text,text,integer,jsonb,uuid,jsonb), public.record_current_delivery_outcome(uuid[],text,text,text,integer,jsonb,uuid,jsonb)
  to authenticated;
notify pgrst, 'reload schema';
commit;
