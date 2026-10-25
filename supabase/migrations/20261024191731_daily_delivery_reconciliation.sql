-- Apply after the ordered legacy baseline documented in docs/delivery-reconciliation.md.
-- Additive operational accounting. No payment capture/refund or purchased-term changes.
begin;

alter table public.delivery_plans add column entitlement_model text not null default 'legacy_delivery_count'
  check (entitlement_model in ('legacy_delivery_count', 'calendar_period'));
-- The current main includes monthly_product_schedules.sql; apply it first.
update public.delivery_plans set entitlement_model='calendar_period' where billing_model='calendar_month';
create function private.classify_plan_entitlement() returns trigger language plpgsql set search_path='' as $$
begin
 if new.billing_model='calendar_month' then new.entitlement_model:='calendar_period'; end if;
 return new;
end $$;
revoke all on function private.classify_plan_entitlement() from public,anon,authenticated;
create trigger classify_plan_entitlement before insert or update of billing_model on public.delivery_plans for each row execute function private.classify_plan_entitlement();
alter table public.delivery_plans add constraint delivery_plan_entitlement_matches_billing check ((billing_model='calendar_month' and entitlement_model='calendar_period') or (billing_model='milk_credits' and entitlement_model='legacy_delivery_count'));
alter table public.daily_deliveries
  add column replacement_of_delivery_id uuid unique references public.daily_deliveries(id) on delete restrict,
  add column fulfilment_root_id uuid references public.daily_deliveries(id) on delete restrict;
alter table public.daily_delivery_items add column fulfilled_quantity numeric(5,2)
  check (fulfilled_quantity >= 0 and fulfilled_quantity <= quantity);
-- Preserve original quantities; NULL explicitly means no new-format quantity evidence.
alter table public.daily_deliveries drop constraint daily_deliveries_plan_id_delivery_date_key;
create unique index daily_deliveries_original_plan_date_idx on public.daily_deliveries(plan_id,delivery_date)
  where replacement_of_delivery_id is null;
drop index public.daily_deliveries_order_date_idx;
create unique index daily_deliveries_order_date_idx on public.daily_deliveries(order_id,delivery_date)
  where order_id is not null and replacement_of_delivery_id is null;
create index daily_deliveries_fulfilment_root_idx on public.daily_deliveries(fulfilment_root_id);

create table public.delivery_operation_events (
  id uuid primary key default gen_random_uuid(),
  request_key uuid not null unique,
  delivery_date date not null,
  visit_key text,
  user_id uuid references auth.users(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  actor_role text not null check(actor_role in ('driver','manager','admin')),
  action text not null,
  reason text,
  request_payload jsonb not null,
  before_state jsonb not null,
  after_state jsonb not null,
  created_at timestamptz not null default now()
);
create index delivery_operation_events_date_visit_idx on public.delivery_operation_events(delivery_date,visit_key,created_at);
create index delivery_operation_events_user_idx on public.delivery_operation_events(user_id,created_at);
create index delivery_operation_events_actor_idx on public.delivery_operation_events(actor_id);
create table public.delivery_visit_outcomes (
  delivery_date date not null,
  visit_key text not null,
  event_id uuid not null references public.delivery_operation_events(id),
  user_id uuid not null references auth.users(id),
  outcome text not null check(outcome in ('delivered','partial','attempt_failed','skipped','reschedule_requested')),
  reason_code text check(reason_code in ('customer_unavailable','gate_locked','customer_requested_skip','address_issue','customer_refused_delivery','vehicle_issue','weather_disruption','product_shortage','quality_concern','delivery_delay','other')),
  note text check(char_length(note) <= 250),
  resolution text not null check(resolution in ('not_required','pending','retained','rescheduled','carry_forward')),
  follow_up_date date,
  primary key(delivery_date,visit_key),
  check(outcome = 'delivered' or reason_code is not null),
  check(reason_code is distinct from 'other' or char_length(trim(note)) >= 3)
);
create index delivery_visit_outcomes_queue_idx on public.delivery_visit_outcomes(delivery_date,resolution,reason_code);
create index delivery_visit_outcomes_event_idx on public.delivery_visit_outcomes(event_id);
create index delivery_visit_outcomes_user_idx on public.delivery_visit_outcomes(user_id);
create table public.delivery_entitlement_baselines (
  plan_id uuid primary key references public.delivery_plans(id),
  fulfilled_count integer not null check(fulfilled_count >= 0),
  captured_at timestamptz not null default now()
);
insert into public.delivery_entitlement_baselines(plan_id,fulfilled_count)
  select id,delivered_deliveries from public.delivery_plans where delivered_deliveries > 0;
create table public.delivery_entitlement_movements (
  root_delivery_id uuid primary key references public.daily_deliveries(id),
  plan_id uuid not null references public.delivery_plans(id),
  event_id uuid not null references public.delivery_operation_events(id),
  consumed integer not null check(consumed = 1),
  created_at timestamptz not null default now()
);
create index delivery_entitlement_movements_plan_idx on public.delivery_entitlement_movements(plan_id);
create index delivery_entitlement_movements_event_idx on public.delivery_entitlement_movements(event_id);
create table public.delivery_day_reviews (
  id uuid primary key default gen_random_uuid(),
  delivery_date date not null,
  version integer not null,
  action text not null check(action in ('closed','correction_required')),
  event_id uuid not null references public.delivery_operation_events(id),
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique(delivery_date,version)
);
create index delivery_day_reviews_event_idx on public.delivery_day_reviews(event_id);

create or replace function private.operational_today() returns date language sql stable set search_path='' as $$ select (now() at time zone 'Asia/Kolkata')::date; $$;
revoke all on function private.operational_today() from public,anon,authenticated;

create or replace function private.operations_role()
returns text language plpgsql security definer set search_path = '' as $$
declare v_role text;
begin
  select role into v_role from public.farm_staff where user_id = auth.uid() and active;
  if auth.uid() is null or v_role is null or v_role not in ('driver','manager','admin') then
    raise exception 'Active farm staff access required' using errcode='42501';
  end if;
  return v_role;
end $$;

create or replace function private.lock_operational_day(p_date date)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_date is null then raise exception 'Operational date is required'; end if;
  perform pg_advisory_xact_lock(8145, p_date - date '2000-01-01');
end $$;

create or replace function private.protect_closed_delivery_day()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_date date; v_action text;
begin
  if tg_table_name='daily_delivery_items' then
    select delivery_date into v_date from public.daily_deliveries where id=case when tg_op='DELETE' then old.delivery_id else new.delivery_id end;
  else
    v_date := case when tg_op='DELETE' then old.delivery_date else new.delivery_date end;
  end if;
  if v_date is null and tg_table_name='daily_delivery_items' and tg_op='DELETE' then return old; end if;
  perform private.lock_operational_day(v_date);
  select action into v_action from public.delivery_day_reviews where delivery_date=v_date order by version desc limit 1;
  if v_action='closed' then raise exception 'Day is closed; request an audited correction first'; end if;
  if tg_table_name='daily_deliveries' then
    if tg_op='UPDATE' then
      if old.delivery_date is distinct from new.delivery_date then raise exception 'Move fulfilment through an audited replacement; do not rewrite delivery history'; end if;
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger protect_closed_delivery_day before insert or update or delete on public.daily_deliveries
 for each row execute function private.protect_closed_delivery_day();
create trigger protect_closed_delivery_items before insert or update or delete on public.daily_delivery_items
 for each row execute function private.protect_closed_delivery_day();
create trigger protect_closed_dispatch before insert or update or delete on public.delivery_dispatches
 for each row execute function private.protect_closed_delivery_day();
create trigger protect_closed_assignments before insert or update or delete on public.daily_route_assignments
 for each row execute function private.protect_closed_delivery_day();

create or replace function private.immutable_delivery_evidence()
returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Operational evidence is append-only'; end $$;
create trigger immutable_delivery_events before update or delete on public.delivery_operation_events for each row execute function private.immutable_delivery_evidence();
create trigger immutable_day_reviews before update or delete on public.delivery_day_reviews for each row execute function private.immutable_delivery_evidence();
create trigger immutable_entitlement_baselines before update or delete on public.delivery_entitlement_baselines for each row execute function private.immutable_delivery_evidence();
create trigger immutable_entitlement_movements before update or delete on public.delivery_entitlement_movements for each row execute function private.immutable_delivery_evidence();

-- A direct manager REST update must not bypass the authoritative command path.
create or replace function private.require_delivery_command()
returns trigger language plpgsql set search_path='' as $$
declare v_parent uuid; v_reported boolean;
begin
 if current_user not in ('postgres','service_role') then
   if tg_table_name='daily_delivery_items' then
     v_parent:=case when tg_op='DELETE' then old.delivery_id else new.delivery_id end;
     select exists(select 1 from public.daily_deliveries d where d.id=v_parent and
       (d.status in ('delivered','failed') or exists(select 1 from public.delivery_visit_outcomes o where o.delivery_date=d.delivery_date and o.visit_key=d.visit_key))) into v_reported;
     if v_reported then raise exception 'Recorded product evidence requires an audited delivery command'; end if;
     if tg_op='UPDATE' then
       if new.fulfilled_quantity is distinct from old.fulfilled_quantity then raise exception 'Use the delivery outcome command'; end if;
     elsif tg_op='INSERT' then
       if new.fulfilled_quantity is not null then raise exception 'Use the delivery outcome command'; end if;
     end if;
   elsif tg_op='UPDATE' then
     if new.status in ('delivered','failed') or old.status in ('delivered','failed')
       or new.delivery_confirmed is distinct from old.delivery_confirmed or new.bottle_returned is distinct from old.bottle_returned
       or new.checked_by is distinct from old.checked_by then raise exception 'Use the delivery outcome command'; end if;
   elsif tg_op='INSERT' then
     if new.status in ('delivered','failed') or new.delivery_confirmed then raise exception 'Use the delivery outcome command'; end if;
   end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
create trigger require_delivery_command before insert or update on public.daily_deliveries for each row execute function private.require_delivery_command();
create trigger require_item_command before insert or update or delete on public.daily_delivery_items for each row execute function private.require_delivery_command();

create or replace function private.record_visit_outcome_impl(
  p_delivery_ids uuid[], p_outcome text, p_reason_code text, p_note text,
  p_bottles_returned integer, p_quantities jsonb, p_request_key uuid,
  p_correct_event uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_role text := private.operations_role(); v_actor uuid := auth.uid();
  v_date date; v_visit text; v_user uuid; v_ids uuid[]; v_payload jsonb;
  v_before jsonb; v_after jsonb; v_event uuid := gen_random_uuid(); v_existing public.delivery_operation_events%rowtype;
  v_previous public.delivery_visit_outcomes%rowtype;
  v_count integer; v_expected integer; v_item record; v_row record; v_root record;
  v_quantity numeric; v_all boolean; v_any boolean; v_root_id uuid; v_milk numeric; v_consumed integer;
  v_note text := nullif(trim(p_note),'');
begin
  if p_request_key is null or p_outcome is null or p_outcome not in ('delivered','partial','attempt_failed','skipped','reschedule_requested') then raise exception 'Choose a valid outcome and request key'; end if;
  if p_bottles_returned is null or p_bottles_returned < 0 or p_bottles_returned > 50 then raise exception 'Invalid returned bottle count'; end if;
  if char_length(coalesce(v_note,'')) > 250 then raise exception 'Keep the note within 250 characters'; end if;
  if p_outcome <> 'delivered' and (p_reason_code is null or p_reason_code not in ('customer_unavailable','gate_locked','customer_requested_skip','address_issue','customer_refused_delivery','vehicle_issue','weather_disruption','product_shortage','quality_concern','delivery_delay','other')) then raise exception 'A structured exception reason is required'; end if;
  if p_reason_code='other' and char_length(coalesce(v_note,'')) < 3 then raise exception 'Explain the other reason'; end if;
  if p_outcome='skipped' and (v_role='driver' or p_reason_code is distinct from 'customer_requested_skip') then raise exception 'Only a manager can record an approved customer skip'; end if;
  select array_agg(distinct id order by id),count(*) into v_ids,v_count from unnest(p_delivery_ids) id;
  if v_count is null or v_count < 1 or v_count > 50 or cardinality(v_ids) <> v_count or array_position(p_delivery_ids,null) is not null then raise exception 'Choose a complete visit with unique delivery IDs'; end if;
  v_payload := jsonb_build_object('ids',v_ids,'outcome',p_outcome,'reason',p_reason_code,'note',v_note,'bottles',p_bottles_returned,'quantities',p_quantities,'correct_event',p_correct_event);
  perform pg_advisory_xact_lock(hashtextextended('delivery-request:'||p_request_key::text,0));
  select * into v_existing from public.delivery_operation_events where request_key=p_request_key;
  if found then
    if v_existing.actor_id is distinct from v_actor or v_existing.request_payload <> v_payload then raise exception 'Request key was already used for a different action'; end if;
    return jsonb_build_object('event_id',v_existing.id,'saved',true,'replayed',true);
  end if;
  select min(delivery_date),min(visit_key),count(distinct (delivery_date,visit_key,user_id)) into v_date,v_visit,v_count from public.daily_deliveries where id=any(v_ids);
  if v_date is null or v_count<>1 or (select count(*) from public.daily_deliveries where id=any(v_ids))<>cardinality(v_ids) then raise exception 'Deliveries must belong to one existing doorstep visit'; end if;
  perform private.lock_operational_day(v_date);
  if exists(select 1 from public.delivery_day_reviews where delivery_date=v_date and version=(select max(version) from public.delivery_day_reviews where delivery_date=v_date) and action='closed') then raise exception 'Day is closed; request an audited correction first'; end if;
  perform 1 from public.daily_deliveries where delivery_date=v_date and visit_key=v_visit order by id for update;
  select user_id into v_user from public.daily_deliveries where id=v_ids[1];
  if exists(select 1 from public.daily_deliveries where delivery_date=v_date and visit_key=v_visit and status<>'cancelled' and not(id=any(v_ids))) then raise exception 'Submit every active delivery line in the visit'; end if;
  if not exists(select 1 from public.daily_deliveries where id=any(v_ids) and status<>'cancelled') then raise exception 'Cancelled visit cannot be completed'; end if;
  if v_date > private.operational_today() then raise exception 'Future visits cannot be recorded as attempted'; end if;
  if not exists(select 1 from public.delivery_dispatches where delivery_date=v_date and status='released') then raise exception 'Dispatch must be released before recording a visit'; end if;
  if v_role='driver' and (v_date<>private.operational_today() or exists(select 1 from public.daily_deliveries where id=any(v_ids) and assigned_driver_id is distinct from v_actor)) then raise exception 'This released visit is not assigned to you today' using errcode='42501'; end if;
  select * into v_previous from public.delivery_visit_outcomes where delivery_date=v_date and visit_key=v_visit;
  if v_previous.event_id is not null then
    if p_correct_event is distinct from v_previous.event_id or v_role='driver' or p_outcome<>'delivered' or char_length(coalesce(v_note,''))<3 or v_previous.outcome='delivered' then raise exception 'Visit already recorded; manager correction required'; end if;
    if exists(select 1 from public.daily_deliveries where replacement_of_delivery_id=any(v_ids)) then raise exception 'Resolve the linked replacement before correcting this visit'; end if;
  elsif p_correct_event is not null or exists(select 1 from public.daily_deliveries where id=any(v_ids) and status='delivered') then
    raise exception 'Existing historical delivery cannot be rewritten through an ordinary outcome';
  end if;
  if p_outcome in ('delivered','partial') and exists(
    select 1 from public.daily_deliveries d where d.id=any(v_ids) and d.status<>'cancelled' and not exists(
      select 1 from public.orders o join public.payments pay on pay.order_id=o.id
      where o.user_id=d.user_id and o.status='paid' and pay.status='captured'
        and ((d.plan_id is not null and o.delivery_plan_id=d.plan_id) or o.id=d.order_id)
    )
  ) then raise exception 'Fulfilment requires the original paid obligation'; end if;
  -- Lock affected plans in stable order before changing any entitlement counters.
  perform 1 from public.delivery_plans where id in(select plan_id from public.daily_deliveries where id=any(v_ids)) order by id for update;
  if exists(select 1 from public.daily_deliveries d join public.delivery_plans p on p.id=d.plan_id where d.id=any(v_ids) and (p.entitlement_model<>'legacy_delivery_count' and not(p.entitlement_model='calendar_period' and p.billing_model='calendar_month'))) and p_outcome in ('delivered','partial') then raise exception 'Calendar-period entitlement adapter is not activated; keep this visit pending resolution'; end if;
  if exists(select 1 from public.daily_deliveries d where d.id=any(v_ids) and d.status<>'cancelled' and not exists(select 1 from public.daily_delivery_items i where i.delivery_id=d.id)) then raise exception 'Missing scheduled product quantities'; end if;
  select count(*) filter(where bottle_return_required and status<>'cancelled') into v_expected from public.daily_deliveries where id=any(v_ids);
  if p_bottles_returned>v_expected then raise exception 'Returns exceed the documented visit expectation'; end if;
  if p_correct_event is not null then
    select count(*) filter(where bottle_return_required and bottle_returned and status<>'cancelled') into v_expected from public.daily_deliveries where id=any(v_ids);
    if p_bottles_returned<>v_expected then raise exception 'A historical delivery correction must preserve the recorded bottle count'; end if;
  end if;
  select jsonb_agg(to_jsonb(d)||jsonb_build_object('items',(select jsonb_agg(to_jsonb(i) order by product_key) from public.daily_delivery_items i where i.delivery_id=d.id)) order by d.id) into v_before from public.daily_deliveries d where d.id=any(v_ids);
  if p_outcome='partial' then
    if p_quantities is null or jsonb_typeof(p_quantities)<>'array' or jsonb_array_length(p_quantities)<>(select count(*) from public.daily_delivery_items i join public.daily_deliveries d on d.id=i.delivery_id where d.id=any(v_ids) and d.status<>'cancelled') then raise exception 'Enter every product quantity for partial fulfilment'; end if;
    if (select count(distinct (x->>'delivery_id',x->>'product_key')) from jsonb_array_elements(p_quantities) x)<>jsonb_array_length(p_quantities) then raise exception 'Duplicate product quantities'; end if;
  elsif p_quantities is not null then raise exception 'Quantity overrides are only allowed for partial fulfilment'; end if;
  for v_item in select i.* from public.daily_delivery_items i join public.daily_deliveries d on d.id=i.delivery_id where d.id=any(v_ids) and d.status<>'cancelled' order by i.delivery_id,i.product_key loop
    if p_outcome='partial' then
      select (x->>'quantity')::numeric into v_quantity from jsonb_array_elements(p_quantities) x where x->>'delivery_id'=v_item.delivery_id::text and x->>'product_key'=v_item.product_key;
    else v_quantity:=case when p_outcome='delivered' then v_item.quantity else 0 end; end if;
    if v_quantity is null or v_quantity<0 or v_quantity>v_item.quantity or v_quantity<>round(v_quantity,2) then raise exception 'Actual quantity is missing or outside the scheduled quantity'; end if;
    update public.daily_delivery_items set fulfilled_quantity=v_quantity where delivery_id=v_item.delivery_id and product_key=v_item.product_key;
  end loop;
  select bool_and(i.fulfilled_quantity=i.quantity),bool_or(i.fulfilled_quantity>0) into v_all,v_any from public.daily_delivery_items i join public.daily_deliveries d on d.id=i.delivery_id where d.id=any(v_ids) and d.status<>'cancelled';
  if p_outcome='partial' and (v_all or not v_any) then raise exception 'Partial fulfilment must contain delivered and outstanding quantities'; end if;
  for v_row in select d.* from public.daily_deliveries d where d.id=any(v_ids) and d.status<>'cancelled' order by d.id loop
    select bool_and(fulfilled_quantity=quantity) into v_all from public.daily_delivery_items where delivery_id=v_row.id;
    update public.daily_deliveries set status=case when v_all then 'delivered' else 'failed' end,
      delivery_confirmed=v_all,checked_by=v_actor,driver_note=v_note,completed_at=now(),
      delivered_confirmed_at=case when v_all then coalesce(delivered_confirmed_at,now()) else null end,updated_at=now()
      where id=v_row.id;
  end loop;
  with numbered as(select id,row_number() over(order by id) n from public.daily_deliveries where id=any(v_ids) and status<>'cancelled' and bottle_return_required)
  update public.daily_deliveries d set bottle_returned=(n.n<=p_bottles_returned),bottle_returned_at=case when n.n<=p_bottles_returned then coalesce(d.bottle_returned_at,now()) else null end from numbered n where d.id=n.id;
  select jsonb_agg(to_jsonb(d)||jsonb_build_object('items',(select jsonb_agg(to_jsonb(i) order by product_key) from public.daily_delivery_items i where i.delivery_id=d.id)) order by d.id) into v_after from public.daily_deliveries d where d.id=any(v_ids);
  insert into public.delivery_operation_events(id,request_key,delivery_date,visit_key,user_id,actor_id,actor_role,action,reason,request_payload,before_state,after_state)
    values(v_event,p_request_key,v_date,v_visit,v_user,v_actor,v_role,case when p_correct_event is null then 'outcome' else 'correction' end,coalesce(v_note,p_reason_code),v_payload,coalesce(v_before,'[]'),coalesce(v_after,'[]'));
  insert into public.delivery_visit_outcomes(delivery_date,visit_key,event_id,user_id,outcome,reason_code,note,resolution)
    values(v_date,v_visit,v_event,v_user,p_outcome,p_reason_code,v_note,case when p_outcome='delivered' then 'not_required' else 'pending' end)
    on conflict(delivery_date,visit_key) do update set event_id=excluded.event_id,outcome=excluded.outcome,reason_code=excluded.reason_code,note=excluded.note,resolution=excluded.resolution,follow_up_date=null;
  for v_root_id in select distinct coalesce(fulfilment_root_id,id) from public.daily_deliveries where id=any(v_ids) and plan_id is not null order by 1 loop
    select d.*,p.entitlement_model into v_root from public.daily_deliveries d join public.delivery_plans p on p.id=d.plan_id where d.id=v_root_id;
    if v_root.entitlement_model='calendar_period' then continue; end if;
    perform 1 from public.delivery_plans where id=v_root.plan_id for update;
    insert into public.delivery_entitlement_baselines(plan_id,fulfilled_count) select id,delivered_deliveries from public.delivery_plans where id=v_root.plan_id on conflict do nothing;
    select quantity into v_milk from public.daily_delivery_items where delivery_id=v_root_id and product_key='milk';
    if v_milk is not null and (select coalesce(sum(i.fulfilled_quantity),0) from public.daily_delivery_items i join public.daily_deliveries d on d.id=i.delivery_id where coalesce(d.fulfilment_root_id,d.id)=v_root_id and i.product_key='milk')>=v_milk then
      insert into public.delivery_entitlement_movements(root_delivery_id,plan_id,event_id,consumed) values(v_root_id,v_root.plan_id,v_event,1) on conflict do nothing;
      get diagnostics v_consumed=row_count;
      if v_consumed=1 then
        if exists(select 1 from public.delivery_plans where id=v_root.plan_id and delivered_deliveries>=purchased_deliveries) then raise exception 'Plan has no remaining entitlement'; end if;
        update public.delivery_plans set delivered_deliveries=delivered_deliveries+1,updated_at=now() where id=v_root.plan_id;
        update public.delivery_plans set status='completed',updated_at=now() where id=v_root.plan_id and delivered_deliveries=purchased_deliveries;
      end if;
    end if;
  end loop;
  insert into public.customer_notifications(user_id,kind,title,message,delivery_id)
    values(v_user,case when p_outcome='delivered' then 'delivery_completed' else 'delivery_failed' end,
      case when p_outcome='delivered' then 'Delivery completed' else 'Delivery needs review' end,
      case when p_outcome='delivered' then 'Your delivery was confirmed by farm staff.' else 'Your visit has an exception. Undelivered quantities remain subject to review; no automatic refund was issued.' end,v_ids[1]);
  return jsonb_build_object('event_id',v_event,'saved',true,'outcome',p_outcome);
end $$;

create or replace function public.record_delivery_outcome(p_delivery_ids uuid[],p_outcome text,p_reason_code text,p_note text,p_bottles_returned integer,p_quantities jsonb,p_request_key uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.record_visit_outcome_impl(p_delivery_ids,p_outcome,p_reason_code,p_note,p_bottles_returned,p_quantities,p_request_key); $$;

-- Every supported legacy completion caller delegates to the same implementation.
create or replace function private.record_delivery_visit_impl(p_delivery_ids uuid[],p_delivery_confirmed boolean,p_bottles_returned integer,p_driver_note text default null)
returns integer language plpgsql security definer set search_path='' as $$
declare v_key uuid;
begin
  if p_delivery_confirmed is null then raise exception 'Delivery confirmation is required'; end if;
  if not p_delivery_confirmed then raise exception 'Use Report issue and choose a structured reason'; end if;
  v_key:=md5(auth.uid()::text||coalesce((select string_agg(id::text,',' order by id) from unnest(p_delivery_ids) id),'')||p_bottles_returned::text||coalesce(p_driver_note,''))::uuid;
  perform private.record_visit_outcome_impl(p_delivery_ids,'delivered',null,p_driver_note,p_bottles_returned,null,v_key);
  return 1;
end $$;
create or replace function private.record_delivery_stop_impl(p_delivery_id uuid,p_delivery_confirmed boolean,p_bottle_returned boolean,p_driver_note text default null)
returns text language plpgsql security definer set search_path='' as $$
declare v_ids uuid[]; v_due integer;
begin
  select array_agg(d.id order by d.id),count(*) filter(where d.bottle_return_required) into v_ids,v_due from public.daily_deliveries d where (d.delivery_date,d.visit_key)=(select delivery_date,visit_key from public.daily_deliveries where id=p_delivery_id) and d.status<>'cancelled';
  perform private.record_delivery_visit_impl(v_ids,p_delivery_confirmed,case when p_bottle_returned then v_due else 0 end,p_driver_note);
  return 'delivered';
end $$;

create or replace function private.resolve_visit_exception_impl(
  p_date date,p_visit_key text,p_expected_event uuid,p_action text,p_note text,p_follow_up_date date,p_request_key uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_role text:=private.operations_role(); v_result public.delivery_visit_outcomes%rowtype;
  v_event uuid:=gen_random_uuid(); v_existing public.delivery_operation_events%rowtype;
  v_payload jsonb; v_ids uuid[]; v_row record; v_item record; v_new uuid;
  v_root uuid; v_quantity numeric; v_available numeric; v_route_capacity integer; v_route_count integer;
  v_bottles integer; v_note text:=nullif(trim(p_note),'');
begin
  if v_role not in ('manager','admin') then raise exception 'Manager access required' using errcode='42501'; end if;
  if p_action is null or p_action not in ('retain_entitlement','reschedule','confirm_delivered','carry_forward') or char_length(coalesce(v_note,'')) not between 3 and 250 or p_request_key is null then raise exception 'Choose a supported resolution and explain the decision'; end if;
  v_payload:=jsonb_build_object('date',p_date,'visit',p_visit_key,'expected',p_expected_event,'action',p_action,'note',v_note,'follow_up',p_follow_up_date);
  perform pg_advisory_xact_lock(hashtextextended('delivery-request:'||p_request_key::text,0));
  select * into v_existing from public.delivery_operation_events where request_key=p_request_key;
  if found then
    if v_existing.actor_id is distinct from auth.uid() or (v_existing.request_payload<>v_payload and not(p_action='confirm_delivered' and v_existing.action='correction' and v_existing.request_payload->>'correct_event'=p_expected_event::text and v_existing.request_payload->>'note'=v_note)) then raise exception 'Request key was used for a different action'; end if;
    return jsonb_build_object('saved',true,'event_id',v_existing.id,'replayed',true);
  end if;
  -- Old day before future day; all resolution paths acquire day locks in this order.
  perform private.lock_operational_day(p_date);
  if p_follow_up_date is not null and p_follow_up_date>p_date then perform private.lock_operational_day(p_follow_up_date); end if;
  if exists(select 1 from public.delivery_day_reviews where delivery_date=p_date and version=(select max(version) from public.delivery_day_reviews where delivery_date=p_date) and action='closed') then raise exception 'Day is closed; request an audited correction first'; end if;
  select * into v_result from public.delivery_visit_outcomes where delivery_date=p_date and visit_key=p_visit_key for update;
  if not found or v_result.event_id is distinct from p_expected_event or (v_result.resolution<>'pending' and not(v_result.resolution in ('retained','carry_forward') and p_action in ('reschedule','confirm_delivered'))) then raise exception 'Exception changed or is already resolved; refresh before acting'; end if;
  select array_agg(id order by id),count(*) filter(where bottle_return_required and bottle_returned) into v_ids,v_bottles from public.daily_deliveries where delivery_date=p_date and visit_key=p_visit_key and status<>'cancelled';
  perform 1 from public.daily_deliveries where id=any(v_ids) order by id for update;
  if p_action='confirm_delivered' then
    -- Preserve the original outcome event and recorded bottle return count.
    perform private.record_visit_outcome_impl(v_ids,'delivered',null,v_note,v_bottles,null,p_request_key,p_expected_event);
    return jsonb_build_object('saved',true,'corrected',true);
  end if;
  if p_follow_up_date is null or p_follow_up_date<=private.operational_today() then raise exception 'A future follow-up date is required'; end if;
  if p_action='carry_forward' and (v_result.reason_code<>'customer_requested_skip' or exists(select 1 from public.daily_deliveries d left join public.delivery_plans p on p.id=d.plan_id join public.daily_delivery_items i on i.delivery_id=d.id where d.id=any(v_ids) and (p.entitlement_model is distinct from 'legacy_delivery_count' or i.product_key<>'milk' or coalesce(i.fulfilled_quantity,0)<>0))) then raise exception 'Automatic plan-end carry-forward is only supported for an approved unfulfilled legacy milk skip'; end if;
  if p_action='reschedule' then
    if exists(select 1 from public.delivery_dispatches where delivery_date=p_follow_up_date and status='released') then raise exception 'Replacement date is already locked for dispatch'; end if;
    if exists(select 1 from public.delivery_day_reviews where delivery_date=p_follow_up_date and version=(select max(version) from public.delivery_day_reviews where delivery_date=p_follow_up_date) and action='closed') then raise exception 'Replacement day is closed'; end if;
    -- Share the same product locks as checkout reservations, always in product order.
    perform 1 from public.production_capacity where product_key in ('milk','paneer','ghee') order by product_key for update;
    for v_row in select * from public.daily_deliveries where id=any(v_ids) order by id loop
      if v_row.plan_id is not null then
        if not exists(select 1 from public.delivery_plans p join public.orders o on o.delivery_plan_id=p.id join public.payments pay on pay.order_id=o.id where p.id=v_row.plan_id and p.entitlement_model='legacy_delivery_count' and p.status in ('active','paused') and o.status='paid' and pay.status='captured') then raise exception 'Plan replacement requires a valid paid legacy entitlement'; end if;
        if exists(select 1 from public.delivery_pauses where plan_id=v_row.plan_id and p_follow_up_date between start_date and end_date) then raise exception 'Replacement date is paused'; end if;
      elsif not exists(select 1 from public.orders o join public.payments p on p.order_id=o.id where o.id=v_row.order_id and o.status='paid' and p.status='captured') then raise exception 'One-time obligation is not backed by a captured paid order'; end if;
      if v_row.delivery_route_id is null or not exists(select 1 from public.delivery_routes where id=v_row.delivery_route_id and active) then raise exception 'Assign an active route before approving replacement'; end if;
      if exists(select 1 from public.daily_deliveries where replacement_of_delivery_id=v_row.id) then raise exception 'A replacement already exists for this obligation'; end if;
      if not exists(select 1 from public.daily_delivery_items where delivery_id=v_row.id and fulfilled_quantity<quantity) then continue; end if;
      select stop_capacity into v_route_capacity from public.delivery_routes where id=v_row.delivery_route_id;
      select count(distinct visit_key) into v_route_count from public.daily_deliveries where delivery_date=p_follow_up_date and delivery_route_id=v_row.delivery_route_id and status<>'cancelled' and not is_test;
      if v_route_count>=v_route_capacity and not exists(select 1 from public.daily_deliveries where delivery_date=p_follow_up_date and delivery_route_id=v_row.delivery_route_id and user_id=v_row.user_id and address_snapshot is not distinct from v_row.address_snapshot and status<>'cancelled') then raise exception 'Replacement route is at its documented stop capacity'; end if;
      v_root:=coalesce(v_row.fulfilment_root_id,v_row.id);
      insert into public.daily_deliveries(plan_id,order_id,user_id,delivery_date,bottle_choice,delivery_area_id,delivery_route_id,route_stop_order,customer_name,phone_snapshot,address_snapshot,generated_by,replacement_of_delivery_id,fulfilment_root_id,is_test)
      values(v_row.plan_id,v_row.order_id,v_row.user_id,p_follow_up_date,v_row.bottle_choice,v_row.delivery_area_id,v_row.delivery_route_id,v_row.route_stop_order,v_row.customer_name,v_row.phone_snapshot,v_row.address_snapshot,auth.uid(),v_row.id,v_root,v_row.is_test) returning id into v_new;
      for v_item in select * from public.daily_delivery_items where delivery_id=v_row.id and fulfilled_quantity<quantity order by product_key loop
        v_quantity:=v_item.quantity-v_item.fulfilled_quantity;
        select available_quantity into v_available from public.product_capacity_snapshot(v_item.product_key,p_follow_up_date,1);
        if v_available is null or v_available<v_quantity then raise exception 'Replacement product capacity is unavailable or full'; end if;
        insert into public.daily_delivery_items(delivery_id,product_key,quantity,unit) values(v_new,v_item.product_key,v_quantity,v_item.unit);
      end loop;
    end loop;
  end if;
  insert into public.delivery_operation_events(id,request_key,delivery_date,visit_key,user_id,actor_id,actor_role,action,reason,request_payload,before_state,after_state)
    values(v_event,p_request_key,p_date,p_visit_key,v_result.user_id,auth.uid(),v_role,'resolution',v_note,v_payload,to_jsonb(v_result),jsonb_build_object('resolution',p_action,'follow_up_date',p_follow_up_date));
  update public.delivery_visit_outcomes set event_id=v_event,outcome=case when p_action='carry_forward' then 'skipped' else outcome end,resolution=case p_action when 'reschedule' then 'rescheduled' when 'carry_forward' then 'carry_forward' else 'retained' end,follow_up_date=p_follow_up_date where delivery_date=p_date and visit_key=p_visit_key;
  insert into public.customer_notifications(user_id,kind,title,message,delivery_id) values(v_result.user_id,'delivery_failed','Delivery review updated',case when p_action='reschedule' then 'The farm approved a replacement for '||p_follow_up_date::text||'. It remains outstanding until delivered.' else 'Your unfulfilled delivery remains tracked by the farm. No automatic charge or refund was issued.' end,v_ids[1]);
  return jsonb_build_object('saved',true,'event_id',v_event);
end $$;
create or replace function public.resolve_delivery_exception(p_date date,p_visit_key text,p_expected_event uuid,p_action text,p_note text,p_follow_up_date date,p_request_key uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.resolve_visit_exception_impl(p_date,p_visit_key,p_expected_event,p_action,p_note,p_follow_up_date,p_request_key); $$;

-- Read-only server aggregation, grouping commercial rows into doorstep visits.
create or replace function private.delivery_reconciliation_impl(p_date date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb; v_role text:=private.operations_role();
begin
  if v_role not in ('manager','admin') then raise exception 'Manager access required' using errcode='42501'; end if;
  if p_date is null then raise exception 'Choose an operational date'; end if;
  with lines as(select d.*,o.outcome,o.resolution,o.reason_code,o.follow_up_date from public.daily_deliveries d left join public.delivery_visit_outcomes o using(delivery_date,visit_key) where d.delivery_date=p_date and not d.is_test),
  visits as(select visit_key,bool_and(status='cancelled') cancelled,bool_and(status='delivered' or status='cancelled') and bool_or(status='delivered') delivered,
    bool_or(status='failed') failed,max(outcome) outcome,max(resolution) resolution,max(reason_code) reason,
    bool_or(status<>'cancelled' and (delivery_route_id is null or assigned_driver_id is null)) assignment_missing,
    bool_or(status='delivered' and (not delivery_confirmed or completed_at is null or checked_by is null)) missing_evidence
    from lines group by visit_key),
  quantities as(select i.product_key,i.unit,sum(i.quantity) scheduled,
    sum(case when d.status='cancelled' then 0 when i.fulfilled_quantity is not null then i.fulfilled_quantity when d.status='delivered' and d.delivery_confirmed then i.quantity else 0 end) delivered,
    sum(case when d.status='cancelled' then i.quantity else 0 end) cancelled,
    sum(case when d.status='cancelled' then 0 else i.quantity-coalesce(i.fulfilled_quantity,case when d.status='delivered' and d.delivery_confirmed then i.quantity else 0 end) end) outstanding
    from lines d join public.daily_delivery_items i on i.delivery_id=d.id group by i.product_key,i.unit),
  issues as(
    select 'unresolved_visit' code,visit_key entity,'Visit needs an outcome or an approved follow-up' message from visits where not cancelled and not delivered and coalesce(resolution,'pending')='pending'
    union all select 'outcome_conflict',visit_key,'Recorded visit outcome conflicts with fulfilment state' from visits where (outcome='delivered' and not delivered) or (delivered and outcome is not null and outcome<>'delivered')
    union all select 'missing_reason',visit_key,'Exception reason is missing' from visits where failed and reason is null
    union all select 'missing_evidence',visit_key,'Delivered visit lacks authoritative completion evidence' from visits where missing_evidence
    union all select 'missing_items',id::text,'Delivery has no scheduled product quantities' from lines l where status<>'cancelled' and not exists(select 1 from public.daily_delivery_items where delivery_id=l.id)
    union all select 'missing_quantities',l.id::text,'A recorded outcome has missing actual product quantities' from lines l join public.daily_delivery_items i on i.delivery_id=l.id where l.outcome is not null and i.fulfilled_quantity is null
    union all select 'entitlement_mismatch',p.id::text,'Plan count differs from baseline and recorded fulfilment movements' from public.delivery_plans p where p.id in(select plan_id from lines) and p.delivered_deliveries<>(coalesce((select fulfilled_count from public.delivery_entitlement_baselines b where b.plan_id=p.id),0)+(select coalesce(sum(consumed),0) from public.delivery_entitlement_movements m where m.plan_id=p.id))
    union all select 'premature_entitlement',m.root_delivery_id::text,'A consumed milk entitlement has unfulfilled quantities' from public.delivery_entitlement_movements m join public.daily_delivery_items root on root.delivery_id=m.root_delivery_id and root.product_key='milk' where m.plan_id in(select plan_id from lines) and root.quantity>(select coalesce(sum(i.fulfilled_quantity),0) from public.daily_deliveries d join public.daily_delivery_items i on i.delivery_id=d.id and i.product_key='milk' where coalesce(d.fulfilment_root_id,d.id)=m.root_delivery_id)
    union all select 'unsupported_entitlement',p.id::text,'Calendar-period accounting is not activated' from public.delivery_plans p where p.id in(select plan_id from lines) and p.entitlement_model<>'legacy_delivery_count' and p.billing_model<>'calendar_month'
    union all select 'follow_up_missing',visit_key,'Approved follow-up requires a future obligation/review date' from lines where resolution in ('retained','rescheduled','carry_forward') and follow_up_date is null
    union all select 'replacement_missing',visit_key,'Approved reschedule has no linked replacement obligation' from lines l where resolution='rescheduled' and not exists(select 1 from public.daily_deliveries r where r.replacement_of_delivery_id=l.id) and exists(select 1 from public.daily_delivery_items i where i.delivery_id=l.id and i.fulfilled_quantity<i.quantity)
  ) select jsonb_build_object(
    'date',p_date,'scheduled_visits',(select count(*) from visits),
    'released_visits',case when exists(select 1 from public.delivery_dispatches where delivery_date=p_date and status='released') then (select count(*) from visits where not cancelled) else 0 end,
    'delivered_visits',(select count(*) from visits where delivered),
    'failed_attempts',(select count(*) from visits where outcome='attempt_failed'),
    'partial_visits',(select count(*) from visits where outcome='partial'),
    'approved_skips',(select count(*) from visits where outcome='skipped' and resolution<>'pending'),
    'approved_reschedules',(select count(*) from visits where resolution='rescheduled'),
    'cancelled_visits',(select count(*) from visits where cancelled),
    'open_exceptions',(select count(*) from visits where coalesce(resolution,'pending')='pending' and not delivered and not cancelled),
    'follow_ups',(select count(*) from visits where resolution in ('retained','rescheduled','carry_forward')),
    'bottle_returns_expected',(select count(*) from lines where status<>'cancelled' and bottle_return_required),
    'bottle_returns_recorded',(select count(*) from lines where status<>'cancelled' and bottle_return_required and bottle_returned),
    'bottle_count_scope','Documented return checks only; issued stock and opening customer balances are not available.',
    'products',coalesce((select jsonb_agg(to_jsonb(q) order by product_key,unit) from quantities q),'[]'::jsonb),
    'blockers',coalesce((select jsonb_agg(to_jsonb(i) order by code,entity) from (select distinct * from issues) i),'[]'::jsonb),
    'last_review',(select to_jsonb(r) from public.delivery_day_reviews r where delivery_date=p_date order by version desc limit 1),
    'generated_at',now()) into v_result;
  return v_result;
end $$;
create or replace function public.get_delivery_reconciliation(p_date date)
returns jsonb language sql security invoker set search_path='' as $$ select private.delivery_reconciliation_impl(p_date); $$;

create or replace function private.close_delivery_day_impl(p_date date,p_action text,p_note text,p_request_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_role text:=private.operations_role(); v_snapshot jsonb; v_last public.delivery_day_reviews%rowtype;
  v_existing public.delivery_operation_events%rowtype; v_payload jsonb; v_event uuid:=gen_random_uuid(); v_review uuid:=gen_random_uuid();
begin
  if v_role not in ('manager','admin') then raise exception 'Manager access required' using errcode='42501'; end if;
  if p_action is null or p_action not in ('closed','correction_required') or p_date is null or p_request_key is null or char_length(trim(coalesce(p_note,''))) not between 3 and 250 then raise exception 'Choose a closeout action and explain the decision'; end if;
  if p_date>private.operational_today() then raise exception 'Future operational days cannot be closed'; end if;
  v_payload:=jsonb_build_object('date',p_date,'action',p_action,'note',trim(p_note));
  perform pg_advisory_xact_lock(hashtextextended('delivery-request:'||p_request_key::text,0));
  select * into v_existing from public.delivery_operation_events where request_key=p_request_key;
  if found then
    if v_existing.actor_id is distinct from auth.uid() or v_existing.request_payload<>v_payload then raise exception 'Request key was used for another action'; end if;
    return jsonb_build_object('saved',true,'replayed',true,'event_id',v_existing.id);
  end if;
  perform private.lock_operational_day(p_date);
  select * into v_last from public.delivery_day_reviews where delivery_date=p_date order by version desc limit 1;
  if p_action='closed' and v_last.action='closed' then return jsonb_build_object('saved',true,'already_closed',true,'review_id',v_last.id); end if;
  if p_action='correction_required' and v_last.action is distinct from 'closed' then raise exception 'Only a closed day can enter correction review'; end if;
  v_snapshot:=private.delivery_reconciliation_impl(p_date)-'last_review';
  if p_action='closed' and jsonb_array_length(v_snapshot->'blockers')>0 then raise exception 'Resolve reconciliation blockers before closing the day'; end if;
  if p_action='closed' and not exists(select 1 from public.delivery_dispatches where delivery_date=p_date and status='released') then raise exception 'Review and release the operational day before closeout'; end if;
  insert into public.delivery_operation_events(id,request_key,delivery_date,actor_id,actor_role,action,reason,request_payload,before_state,after_state)
    values(v_event,p_request_key,p_date,auth.uid(),v_role,p_action,trim(p_note),v_payload,coalesce(to_jsonb(v_last),'{}'),jsonb_build_object('review_id',v_review,'version',coalesce(v_last.version,0)+1,'snapshot',v_snapshot));
  insert into public.delivery_day_reviews(id,delivery_date,version,action,event_id,snapshot) values(v_review,p_date,coalesce(v_last.version,0)+1,p_action,v_event,v_snapshot);
  return jsonb_build_object('saved',true,'review_id',v_review,'event_id',v_event);
end $$;
create or replace function public.close_delivery_day(p_date date,p_action text,p_note text,p_request_key uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.close_delivery_day_impl(p_date,p_action,p_note,p_request_key); $$;

create or replace function private.delivery_exception_queue_impl(p_date date,p_resolution text,p_reason text,p_route uuid,p_driver uuid,p_customer text,p_offset integer,p_limit integer,p_area uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_role text:=private.operations_role(); v_data jsonb;
begin
  if v_role not in ('manager','admin') then raise exception 'Manager access required' using errcode='42501'; end if;
  if p_offset<0 or p_limit<1 or p_limit>100 then raise exception 'Invalid exception page'; end if;
  with grouped as(
    select d.delivery_date,d.visit_key,d.user_id,max(d.customer_name) customer,
      max(o.event_id::text)::uuid event_id,max(o.outcome) outcome,max(o.reason_code) reason_code,max(o.note) note,
      coalesce(max(o.resolution),'pending') resolution,max(o.follow_up_date) follow_up_date,
      string_agg(distinct r.name,', ') route,string_agg(distinct coalesce(cp.full_name,'Assigned driver'),', ') driver,
      count(*) filter(where d.bottle_return_required and not d.bottle_returned and d.status<>'cancelled') bottles_due,
      (select jsonb_agg(jsonb_build_object('delivery_id',x.id,'product_key',i.product_key,'quantity',i.quantity,'fulfilled_quantity',coalesce(i.fulfilled_quantity,case when x.status='delivered' and x.delivery_confirmed then i.quantity else 0 end),'unit',i.unit) order by x.id,i.product_key) from public.daily_deliveries x join public.daily_delivery_items i on i.delivery_id=x.id where x.delivery_date=d.delivery_date and x.visit_key=d.visit_key and x.status<>'cancelled') items
    from public.daily_deliveries d left join public.delivery_visit_outcomes o using(delivery_date,visit_key)
    left join public.delivery_routes r on r.id=d.delivery_route_id
    left join public.customer_profiles cp on cp.user_id=d.assigned_driver_id
    where d.delivery_date=p_date and not d.is_test
      and (p_route is null or d.delivery_route_id=p_route) and (p_driver is null or d.assigned_driver_id=p_driver)
      and (p_area is null or d.delivery_area_id=p_area)
      and (coalesce(p_customer,'')='' or d.customer_name ilike '%'||p_customer||'%')
    group by d.delivery_date,d.visit_key,d.user_id
    having bool_or(d.status='failed') or bool_or(o.resolution='pending') or bool_or(d.bottle_return_required and not d.bottle_returned and d.status<>'cancelled') or max(o.outcome) in ('skipped','reschedule_requested','partial')
  ),filtered as(select * from grouped where (coalesce(p_resolution,'')='' or resolution=p_resolution) and (coalesce(p_reason,'')='' or reason_code=p_reason))
  select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(to_jsonb(p)) from (select * from filtered order by case when resolution='pending' then 0 else 1 end,customer,visit_key offset p_offset limit p_limit) p),'[]')) into v_data;
  return v_data;
end $$;
create or replace function public.get_delivery_exceptions(p_date date,p_resolution text default '',p_reason text default '',p_route uuid default null,p_driver uuid default null,p_customer text default '',p_offset integer default 0,p_limit integer default 50,p_area uuid default null)
returns jsonb language sql security invoker set search_path='' as $$ select private.delivery_exception_queue_impl(p_date,p_resolution,p_reason,p_route,p_driver,p_customer,p_offset,p_limit,p_area); $$;

create or replace function private.customer_delivery_outcomes_impl(p_user_id uuid,p_limit integer)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or (auth.uid() is distinct from p_user_id and not exists(select 1 from public.farm_staff where user_id=auth.uid() and active and role in ('manager','admin'))) then raise exception 'Customer history access denied' using errcode='42501'; end if;
  if p_limit<1 or p_limit>50 then raise exception 'Invalid history size'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(h)),'[]') from (
    select d.delivery_date,d.visit_key,coalesce(max(o.outcome),case when bool_and(d.status='delivered' or d.status='cancelled') and bool_or(d.status='delivered') then 'delivered' when bool_and(d.status='cancelled') then 'cancelled' when bool_or(d.status='failed') then 'attempt_failed' else 'scheduled' end) outcome,
      max(o.resolution) resolution,max(o.follow_up_date) follow_up_date,
      jsonb_agg(jsonb_build_object('product_key',i.product_key,'quantity',i.quantity,'fulfilled_quantity',coalesce(i.fulfilled_quantity,case when d.status='delivered' and d.delivery_confirmed then i.quantity else null end),'unit',i.unit)) items
    from public.daily_deliveries d left join public.daily_delivery_items i on i.delivery_id=d.id
    left join public.delivery_visit_outcomes o using(delivery_date,visit_key)
    where d.user_id=p_user_id and not d.is_test group by d.delivery_date,d.visit_key order by d.delivery_date desc,d.visit_key limit p_limit
  ) h);
end $$;
create or replace function public.get_customer_delivery_outcomes(p_user_id uuid,p_limit integer default 20)
returns jsonb language sql security invoker set search_path='' as $$ select private.customer_delivery_outcomes_impl(p_user_id,p_limit); $$;

create or replace function public.update_daily_delivery_status(p_delivery_id uuid,p_status text)
returns text language plpgsql security definer set search_path='' as $$
declare v_role text:=private.operations_role(); v_ids uuid[]; v_date date; v_status text;
begin
  if v_role not in ('manager','admin') then raise exception 'Manager access required' using errcode='42501'; end if;
  if p_status='failed' then raise exception 'Report issue with a structured reason'; end if;
  select delivery_date,status into v_date,v_status from public.daily_deliveries where id=p_delivery_id;
  if v_date is null then raise exception 'Delivery not found'; end if;
  perform private.lock_operational_day(v_date);
  if p_status='delivered' then
    select array_agg(id order by id) into v_ids from public.daily_deliveries where (delivery_date,visit_key)=(select delivery_date,visit_key from public.daily_deliveries where id=p_delivery_id) and status<>'cancelled';
    perform private.record_delivery_visit_impl(v_ids,true,0,null);
  else
    if p_status is null or not ((v_status='planned' and p_status in ('ready','cancelled')) or (v_status='ready' and p_status in ('out_for_delivery','cancelled'))) then raise exception 'Invalid status transition; recorded visits require audited resolution'; end if;
    update public.daily_deliveries set status=p_status,updated_at=now() where id=p_delivery_id;
  end if;
  return p_status;
end $$;

-- Restrict raw new tables to read-only staff scope. Commands own all writes.
create or replace function private.is_operations_manager()
returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.farm_staff where user_id=auth.uid() and active and role in ('manager','admin')); $$;
do $$ declare t text; begin
  foreach t in array array['delivery_operation_events','delivery_visit_outcomes','delivery_entitlement_baselines','delivery_entitlement_movements','delivery_day_reviews'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy managers_read on public.%I for select to authenticated using ((select private.is_operations_manager()))',t);
  end loop;
end $$;
create policy drivers_read_visit_outcomes on public.delivery_visit_outcomes for select to authenticated using (
  exists(select 1 from public.farm_staff where user_id=auth.uid() and active and role='driver') and
  exists(select 1 from public.daily_deliveries d join public.delivery_dispatches x on x.delivery_date=d.delivery_date where d.delivery_date=delivery_visit_outcomes.delivery_date and d.visit_key=delivery_visit_outcomes.visit_key and d.assigned_driver_id=auth.uid() and x.status='released')
);
-- Internal helpers are not public APIs; public wrappers retain caller identity.
do $$ declare f record; begin
  for f in select p.oid::regprocedure signature,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('private','public') and p.proname in (
    'operations_role','lock_operational_day','protect_closed_delivery_day','immutable_delivery_evidence','require_delivery_command','record_visit_outcome_impl','record_delivery_outcome','resolve_visit_exception_impl','resolve_delivery_exception','delivery_reconciliation_impl','get_delivery_reconciliation','close_delivery_day_impl','close_delivery_day','delivery_exception_queue_impl','get_delivery_exceptions','customer_delivery_outcomes_impl','get_customer_delivery_outcomes','is_operations_manager','update_daily_delivery_status'
  ) loop
    execute format('revoke all on function %s from public,anon',f.signature);
    if f.signature::text !~ '(protect_closed|immutable_delivery|require_delivery_command|lock_operational_day)' then execute format('grant execute on function %s to authenticated',f.signature); end if;
  end loop;
end $$;

-- The existing generator remains authoritative; replacements survive draft regeneration.
create or replace function public.generate_daily_deliveries(p_delivery_date date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_delivery_id uuid;
  v_generated integer := 0;
  v_plan record;
  v_order record;
begin
  if p_delivery_date is null then
    raise exception 'Delivery date is required';
  end if;

  if p_delivery_date < private.operational_today() then
    raise exception 'Past delivery sheets cannot be regenerated';
  end if;

  if not exists (
    select 1
    from public.farm_staff
    where farm_staff.user_id = v_actor_id
      and farm_staff.active
      and farm_staff.role in ('manager', 'admin')
  ) then
    raise exception 'Farm manager access required';
  end if;

  perform private.lock_operational_day(p_delivery_date);
  if exists(select 1 from public.delivery_dispatches where delivery_date=p_delivery_date and status='released') then raise exception 'Reopen dispatch before regeneration'; end if;

  delete from public.daily_deliveries
  where delivery_date = p_delivery_date
    and status = 'planned' and replacement_of_delivery_id is null;

  for v_plan in
    select
      plans.id,
      plans.user_id,
      plans.bottle_choice,
      profiles.delivery_area_id,
      profiles.delivery_route_id,
      profiles.route_stop_order,
      coalesce(nullif(trim(profiles.full_name), ''), 'Customer') as customer_name,
      profiles.phone,
      concat_ws(
        ', ',
        nullif(trim(profiles.address_line), ''),
        nullif(trim(profiles.landmark), ''),
        nullif(trim(profiles.postal_code), '')
      ) as address_snapshot
    from public.delivery_plans as plans
    join public.customer_profiles as profiles
      on profiles.user_id = plans.user_id
    where plans.status = 'active'
      and ((plans.entitlement_model='legacy_delivery_count' and plans.delivered_deliveries<plans.purchased_deliveries) or (plans.entitlement_model='calendar_period' and plans.billing_model='calendar_month' and p_delivery_date<plans.period_end_exclusive))
      and not plans.is_test
      and not exists (select 1 from public.daily_deliveries d where d.plan_id=plans.id and d.delivery_date=p_delivery_date and d.replacement_of_delivery_id is null)
      and plans.start_date <= p_delivery_date
      and not exists (
        select 1
        from public.delivery_pauses
        where delivery_pauses.plan_id = plans.id
          and p_delivery_date between delivery_pauses.start_date and delivery_pauses.end_date
      )
  loop
    insert into public.daily_deliveries (
      plan_id,
      order_id,
      user_id,
      delivery_date,
      bottle_choice,
      delivery_area_id,
      delivery_route_id,
      route_stop_order,
      customer_name,
      phone_snapshot,
      address_snapshot,
      generated_by
    )
    values (
      v_plan.id,
      null,
      v_plan.user_id,
      p_delivery_date,
      v_plan.bottle_choice,
      v_plan.delivery_area_id,
      v_plan.delivery_route_id,
      v_plan.route_stop_order,
      v_plan.customer_name,
      v_plan.phone,
      nullif(v_plan.address_snapshot, ''),
      v_actor_id
    )
    returning id into v_delivery_id;

    with base_items as (
      select
        weekly.product_key,
        weekly.quantity,
        weekly.unit,
        1 as priority
      from public.weekly_delivery_items as weekly
      where weekly.plan_id = v_plan.id
        and weekly.day_of_week = extract(isodow from p_delivery_date)::smallint

      union all

      select
        scheduled.product_key,
        scheduled.quantity,
        scheduled.unit,
        2 as priority
      from public.scheduled_delivery_items as scheduled
      where scheduled.plan_id = v_plan.id
        and scheduled.delivery_date = p_delivery_date
    ),
    selected_base as (
      select distinct on (base_items.product_key)
        base_items.product_key,
        base_items.quantity,
        base_items.unit
      from base_items
      order by base_items.product_key, base_items.priority desc
    ),
    effective_items as (
      select
        selected_base.product_key,
        coalesce(exceptions.quantity, selected_base.quantity) as quantity,
        coalesce(exceptions.unit, selected_base.unit) as unit
      from selected_base
      left join public.delivery_exceptions as exceptions
        on exceptions.plan_id = v_plan.id
        and exceptions.delivery_date = p_delivery_date
        and exceptions.product_key = selected_base.product_key
      where exceptions.action is distinct from 'skip'

      union all

      select
        exceptions.product_key,
        exceptions.quantity,
        exceptions.unit
      from public.delivery_exceptions as exceptions
      where exceptions.plan_id = v_plan.id
        and exceptions.delivery_date = p_delivery_date
        and exceptions.action = 'override'
        and not exists (
          select 1
          from selected_base
          where selected_base.product_key = exceptions.product_key
        )
    )
    insert into public.daily_delivery_items (
      delivery_id,
      product_key,
      quantity,
      unit
    )
    select
      v_delivery_id,
      effective_items.product_key,
      effective_items.quantity,
      effective_items.unit
    from effective_items
    where effective_items.quantity is not null
      and effective_items.unit is not null;

    if exists (
      select 1
      from public.daily_delivery_items
      where daily_delivery_items.delivery_id = v_delivery_id
    ) then
      v_generated := v_generated + 1;
    else
      delete from public.daily_deliveries where id = v_delivery_id;
    end if;
  end loop;

  for v_order in
    select
      orders.id,
      orders.user_id,
      orders.bottle_choice,
      orders.phone_snapshot,
      orders.address_snapshot,
      profiles.delivery_area_id,
      profiles.delivery_route_id,
      profiles.route_stop_order,
      coalesce(nullif(trim(profiles.full_name), ''), 'Customer') as customer_name
    from public.orders
    join public.customer_profiles as profiles
      on profiles.user_id = orders.user_id
    where orders.purchase_mode = 'once'
      and not orders.is_test
      and not exists (select 1 from public.daily_deliveries d where d.order_id=orders.id and d.delivery_date=p_delivery_date and d.replacement_of_delivery_id is null)
      and orders.status = 'paid'
      and orders.start_date = p_delivery_date
  loop
    insert into public.daily_deliveries (
      plan_id,
      order_id,
      user_id,
      delivery_date,
      bottle_choice,
      delivery_area_id,
      delivery_route_id,
      route_stop_order,
      customer_name,
      phone_snapshot,
      address_snapshot,
      generated_by
    )
    values (
      null,
      v_order.id,
      v_order.user_id,
      p_delivery_date,
      v_order.bottle_choice,
      v_order.delivery_area_id,
      v_order.delivery_route_id,
      v_order.route_stop_order,
      v_order.customer_name,
      v_order.phone_snapshot,
      v_order.address_snapshot,
      v_actor_id
    )
    returning id into v_delivery_id;

    insert into public.daily_delivery_items (
      delivery_id,
      product_key,
      quantity,
      unit
    )
    select
      v_delivery_id,
      items.product_key,
      items.quantity,
      items.unit
    from public.order_items as items
    where items.order_id = v_order.id
      and items.frequency = 'once';

    if exists (
      select 1
      from public.daily_delivery_items
      where daily_delivery_items.delivery_id = v_delivery_id
    ) then
      v_generated := v_generated + 1;
    else
      delete from public.daily_deliveries where id = v_delivery_id;
    end if;
  end loop;

  return v_generated;
end;
$$;

revoke execute on function public.generate_daily_deliveries(date)
from public, anon;

grant execute on function public.generate_daily_deliveries(date)
to authenticated;

create or replace function public.reserve_order_capacity(
  p_order_id uuid,
  p_hold_hours integer default 24
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order record;
  v_product_key text;
  v_delivery_date date;
  v_quantity numeric(8, 2);
  v_daily_limit numeric(8, 2);
  v_active_plans numeric(8, 2);
  v_paid_once numeric(8, 2);
  v_pending_holds numeric(8, 2);
  v_reserved_dates integer := 0;
  v_offset integer;
  v_monthly_end date;
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_hold_hours < 1 or p_hold_hours > 48 then
    raise exception 'Capacity hold must be between 1 and 48 hours';
  end if;

  select id, delivery_plan_id, purchase_mode, start_date, status
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if v_order.id is null then
    raise exception 'Order not found';
  end if;

  if v_order.status not in ('draft', 'pending_payment') then
    raise exception 'This order cannot reserve production capacity';
  end if;

  if v_order.start_date is null then
    raise exception 'A delivery start date is required';
  end if;

  if v_order.purchase_mode = 'plan' and v_order.delivery_plan_id is null then
    raise exception 'A delivery plan is required';
  end if;

  select period_end_exclusive into v_monthly_end from public.delivery_plans where id=v_order.delivery_plan_id and billing_model='calendar_month';
  -- Lock every tracked product in a fixed order so two checkouts cannot oversell.
  for v_product_key in
    select capacity.product_key
    from public.production_capacity as capacity
    where capacity.product_key in ('milk', 'paneer', 'ghee')
    order by capacity.product_key
  loop
    perform 1
    from public.production_capacity
    where product_key = v_product_key
    for update;
  end loop;

  update public.order_capacity_reservations
  set status = 'released', expires_at = null, updated_at = now()
  where status = 'pending'
    and expires_at <= now();

  update public.order_capacity_reservations
  set status = 'released', expires_at = null, updated_at = now()
  where order_id = p_order_id
    and status = 'pending';

  for v_product_key in
    select capacity.product_key
    from public.production_capacity as capacity
    where capacity.product_key in ('milk', 'paneer', 'ghee')
    order by capacity.product_key
  loop
    for v_offset in 0..(case when v_monthly_end is not null then (v_monthly_end-v_order.start_date)-1 when v_order.purchase_mode = 'plan' then 6 else 0 end)
    loop
      v_delivery_date := v_order.start_date + v_offset;

      if v_order.purchase_mode = 'plan' then
        v_quantity := public.plan_product_quantity(
          v_order.delivery_plan_id,
          v_product_key,
          v_delivery_date
        );
      else
        select coalesce(sum(item.quantity), 0)
        into v_quantity
        from public.order_items as item
        where item.order_id = p_order_id
          and item.product_key = v_product_key
          and item.frequency = 'once'
          and coalesce(item.delivery_date, v_order.start_date) = v_delivery_date;
      end if;

      if v_quantity <= 0 then
        continue;
      end if;

      select coalesce(override.daily_limit, capacity.daily_limit)
      into v_daily_limit
      from public.production_capacity as capacity
      left join public.production_capacity_overrides as override
        on override.product_key = capacity.product_key
        and override.delivery_date = v_delivery_date
      where capacity.product_key = v_product_key;

      select coalesce(sum(public.plan_product_quantity(
        plan.id,
        v_product_key,
        v_delivery_date
      )), 0)
      into v_active_plans
      from public.delivery_plans as plan
      where plan.status = 'active'
        and plan.start_date <= v_delivery_date
        and (plan.billing_model='calendar_month' or plan.delivered_deliveries < plan.purchased_deliveries)
        and plan.id is distinct from v_order.delivery_plan_id
        and not exists (
          select 1
          from public.delivery_pauses as pause
          where pause.plan_id = plan.id
            and v_delivery_date between pause.start_date and pause.end_date
        );

      select coalesce(sum(item.quantity), 0)
      into v_paid_once
      from public.orders as paid_order
      join public.order_items as item on item.order_id = paid_order.id
      where paid_order.status = 'paid'
        and paid_order.purchase_mode = 'once'
        and paid_order.id <> p_order_id
        and item.product_key = v_product_key
        and item.frequency = 'once'
        and coalesce(item.delivery_date, paid_order.start_date) = v_delivery_date;

      select coalesce(sum(reservation.quantity), 0)
      into v_pending_holds
      from public.order_capacity_reservations as reservation
      where reservation.product_key = v_product_key
        and reservation.delivery_date = v_delivery_date
        and reservation.order_id <> p_order_id
        and reservation.status = 'pending'
        and reservation.expires_at > now();

      v_paid_once := v_paid_once + coalesce((select sum(i.quantity) from public.daily_deliveries d join public.daily_delivery_items i on i.delivery_id=d.id where d.delivery_date=v_delivery_date and d.replacement_of_delivery_id is not null and d.status<>'cancelled' and i.product_key=v_product_key and not d.is_test),0);

    if v_active_plans + v_paid_once + v_pending_holds + v_quantity > v_daily_limit then
        raise exception '% capacity is full for %. Choose another delivery date.',
          initcap(v_product_key),
          to_char(v_delivery_date, 'FMDay, FMDD FMMonth');
      end if;

      insert into public.order_capacity_reservations (
        order_id,
        product_key,
        delivery_date,
        quantity,
        status,
        expires_at
      )
      values (
        p_order_id,
        v_product_key,
        v_delivery_date,
        v_quantity,
        'pending',
        now() + make_interval(hours => p_hold_hours)
      )
      on conflict (order_id, product_key, delivery_date)
      do update set
        quantity = excluded.quantity,
        status = 'pending',
        expires_at = excluded.expires_at,
        updated_at = now();

      v_reserved_dates := v_reserved_dates + 1;
    end loop;
  end loop;

  return jsonb_build_object(
    'reserved', true,
    'reserved_product_dates', v_reserved_dates,
    'expires_at', now() + make_interval(hours => p_hold_hours)
  );
end;
$$;

revoke execute on function public.reserve_order_capacity(uuid, integer)
from public, anon, authenticated;
grant execute on function public.reserve_order_capacity(uuid, integer)
to service_role;


create or replace function public.product_capacity_snapshot(
  p_product_key text,
  p_start_date date,
  p_days integer default 7
)
returns table (
  delivery_date date,
  capacity_limit numeric,
  active_plan_quantity numeric,
  paid_once_quantity numeric,
  checkout_holds_quantity numeric,
  available_quantity numeric
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_product_key not in ('milk', 'paneer', 'ghee') then
    raise exception 'Unsupported capacity product';
  end if;

  if p_days < 1 or p_days > 31 then
    raise exception 'Capacity view must cover between 1 and 31 days';
  end if;

  return query
  with dates as (
    select generate_series(
      p_start_date,
      p_start_date + (p_days - 1),
      interval '1 day'
    )::date as day
  ),
  usage as (
    select
      dates.day,
      (
        select coalesce(sum(public.plan_product_quantity(
          plan.id,
          p_product_key,
          dates.day
        )), 0)
        from public.delivery_plans as plan
        where plan.status = 'active'
          and plan.start_date <= dates.day
          and (plan.billing_model='calendar_month' or plan.delivered_deliveries < plan.purchased_deliveries)
          and not exists (
            select 1
            from public.delivery_pauses as pause
            where pause.plan_id = plan.id
              and dates.day between pause.start_date and pause.end_date
          )
      ) as active_plans,
      (
        select coalesce(sum(item.quantity), 0)
        from public.orders as paid_order
        join public.order_items as item on item.order_id = paid_order.id
        where paid_order.status = 'paid'
          and paid_order.purchase_mode = 'once'
          and item.product_key = p_product_key
          and item.frequency = 'once'
          and coalesce(item.delivery_date, paid_order.start_date) = dates.day
      ) + (select coalesce(sum(i.quantity),0) from public.daily_deliveries d join public.daily_delivery_items i on i.delivery_id=d.id where d.delivery_date=dates.day and d.replacement_of_delivery_id is not null and d.status<>'cancelled' and i.product_key=p_product_key and not d.is_test) as paid_once,
      (
        select coalesce(sum(reservation.quantity), 0)
        from public.order_capacity_reservations as reservation
        where reservation.product_key = p_product_key
          and reservation.delivery_date = dates.day
          and reservation.status = 'pending'
          and reservation.expires_at > now()
      ) as checkout_holds
    from dates
  )
  select
    usage.day,
    coalesce(override.daily_limit, capacity.daily_limit),
    usage.active_plans,
    usage.paid_once,
    usage.checkout_holds,
    greatest(
      coalesce(override.daily_limit, capacity.daily_limit)
        - usage.active_plans
        - usage.paid_once
        - usage.checkout_holds,
      0
    )
  from usage
  cross join public.production_capacity as capacity
  left join public.production_capacity_overrides as override
    on override.product_key = capacity.product_key
    and override.delivery_date = usage.day
  where capacity.product_key = p_product_key
  order by usage.day;
end;
$$;

revoke execute on function public.product_capacity_snapshot(text, date, integer)
from public, anon, authenticated;
grant execute on function public.product_capacity_snapshot(text, date, integer)
to service_role;

-- Restrict drivers to assigned released stop profiles; subscription/financial
-- history stays customer/manager-only even for direct Data API requests.
drop policy "Customers and staff can read profiles" on public.customer_profiles;
create policy "Customers and staff can read profiles" on public.customer_profiles for select to authenticated using (
 user_id=(select auth.uid()) or (select private.is_operations_manager()) or (
 exists(select 1 from public.farm_staff where user_id=auth.uid() and active and role='driver') and
 exists(select 1 from public.daily_deliveries d join public.delivery_dispatches x on x.delivery_date=d.delivery_date
   where d.user_id=customer_profiles.user_id and d.assigned_driver_id=auth.uid() and x.status='released')
 ));
do $$ declare t text; p text; begin
 for t,p in select * from (values
 ('delivery_plans','Customers and staff can read delivery plans'),
 ('weekly_delivery_items','Customers and staff can read weekly delivery items'),
 ('scheduled_delivery_items','Customers and staff can read scheduled delivery items'),
 ('delivery_exceptions','Customers and staff can read delivery exceptions'),
 ('delivery_pauses','Customers and staff can read delivery pauses')) policy_names loop
 execute format('drop policy %I on public.%I',p,t);
 execute format('create policy %I on public.%I for select to authenticated using (user_id=(select auth.uid()) or (select private.is_operations_manager()))',p,t);
 end loop;
end $$;

commit;
