-- Spoken future-service requests are not today's delivery outcomes.
begin;
create table public.delivery_customer_requests (
 id uuid primary key,
 request_key uuid not null unique,
 user_id uuid not null references auth.users(id),
 source_delivery_id uuid not null references public.daily_deliveries(id) on delete restrict,
 source_date date not null,
 recorded_by uuid not null references auth.users(id),
 plan_id uuid references public.delivery_plans(id),
 requested_date date not null,
 kind text not null check(kind in ('skip_milk','quantity_change','other')),
 customer_words text not null check(char_length(trim(customer_words)) between 3 and 300),
 status text not null default 'requested' check(status in ('requested','approved','declined','follow_up')),
 creation_event_id uuid not null references public.delivery_operation_events(id),
 resolution_event_id uuid references public.delivery_operation_events(id),
 reviewed_by uuid references auth.users(id),
 decision_note text,
 created_at timestamptz not null default now(),
 reviewed_at timestamptz
);
create index delivery_customer_requests_queue_idx on public.delivery_customer_requests(status,requested_date,created_at);
create index delivery_customer_requests_driver_idx on public.delivery_customer_requests(recorded_by,source_date);
create index delivery_customer_requests_user_idx on public.delivery_customer_requests(user_id);
create index delivery_customer_requests_source_idx on public.delivery_customer_requests(source_delivery_id);
create index delivery_customer_requests_plan_idx on public.delivery_customer_requests(plan_id);
alter table public.delivery_customer_requests enable row level security;
revoke all on public.delivery_customer_requests from public,anon,authenticated;
grant select on public.delivery_customer_requests to authenticated;
create policy "Staff read permitted spoken requests" on public.delivery_customer_requests for select to authenticated
 using ((select private.is_operations_manager()) or (recorded_by=(select auth.uid()) and exists(select 1 from public.farm_staff where user_id=(select auth.uid()) and active)) or user_id=(select auth.uid()));

create function private.record_customer_request(p_delivery_id uuid,p_requested_date date,p_kind text,p_words text,p_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_role text:=private.operations_role();v_source public.daily_deliveries%rowtype;v_old public.delivery_customer_requests%rowtype;
 v_payload jsonb;v_id uuid:=gen_random_uuid();v_event uuid:=gen_random_uuid();v_plans uuid[];
begin
 if p_key is null or p_requested_date is null or p_requested_date<=private.operational_today() or p_requested_date>private.operational_today()+30
 or p_kind is null or p_kind not in ('skip_milk','quantity_change','other') or char_length(trim(coalesce(p_words,''))) not between 3 and 300 then raise exception 'Choose a future date and record the customer request';end if;
 select * into v_source from public.daily_deliveries where id=p_delivery_id and not is_test;
 if not found or v_source.status='cancelled' or v_source.delivery_date<>private.operational_today() or (v_role='driver' and v_source.assigned_driver_id is distinct from auth.uid())
 or not exists(select 1 from public.delivery_dispatches where delivery_date=v_source.delivery_date and status='released') then raise exception 'Use a released visit assigned to you today' using errcode='42501';end if;
 v_payload:=jsonb_build_object('delivery_id',p_delivery_id,'date',p_requested_date,'kind',p_kind,'words',trim(p_words));
 perform pg_advisory_xact_lock(hashtextextended(p_key::text,8146));
 select * into v_old from public.delivery_customer_requests where request_key=p_key;
 if found then
  if v_old.recorded_by<>auth.uid() or (select request_payload from public.delivery_operation_events where id=v_old.creation_event_id)<>v_payload then raise exception 'Request key was used for different details';end if;
  return jsonb_build_object('id',v_old.id,'status',v_old.status,'reused',true);
 end if;
 select array_agg(distinct d.plan_id) into v_plans from public.daily_deliveries d join public.daily_delivery_items i on i.delivery_id=d.id
  where d.delivery_date=v_source.delivery_date and d.visit_key=v_source.visit_key and d.user_id=v_source.user_id and d.plan_id is not null and i.product_key='milk';
 insert into public.delivery_operation_events(id,request_key,delivery_date,visit_key,user_id,actor_id,actor_role,action,reason,request_payload,before_state,after_state)
 values(v_event,p_key,v_source.delivery_date,v_source.visit_key,v_source.user_id,auth.uid(),v_role,'customer_request_recorded',trim(p_words),v_payload,'{}',jsonb_build_object('request_id',v_id,'status','requested'));
 insert into public.delivery_customer_requests(id,request_key,user_id,source_delivery_id,source_date,recorded_by,plan_id,requested_date,kind,customer_words,creation_event_id)
 values(v_id,p_key,v_source.user_id,p_delivery_id,v_source.delivery_date,auth.uid(),case when cardinality(v_plans)=1 then v_plans[1] else null end,p_requested_date,p_kind,trim(p_words),v_event);
 return jsonb_build_object('id',v_id,'status','requested');
end $$;
revoke all on function private.record_customer_request(uuid,date,text,text,uuid) from public,anon,authenticated;
create function public.record_driver_customer_request(p_delivery_id uuid,p_requested_date date,p_kind text,p_words text,p_key uuid)
returns jsonb language sql security definer set search_path='' as $$ select private.record_customer_request(p_delivery_id,p_requested_date,p_kind,p_words,p_key); $$;
revoke all on function public.record_driver_customer_request(uuid,date,text,text,uuid) from public,anon;
grant execute on function public.record_driver_customer_request(uuid,date,text,text,uuid) to authenticated;

create function private.review_customer_request(p_id uuid,p_decision text,p_note text,p_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_role text:=private.operations_role();v_request public.delivery_customer_requests%rowtype;v_event uuid:=gen_random_uuid();v_old public.delivery_operation_events%rowtype;v_payload jsonb;v_quantity numeric;
begin
 if v_role not in ('manager','admin') then raise exception 'Manager access required' using errcode='42501';end if;
 if p_key is null or p_decision is null or p_decision not in ('approve','decline','follow_up') or char_length(trim(coalesce(p_note,''))) not between 3 and 300 then raise exception 'Choose a decision and give a reason';end if;
 v_payload:=jsonb_build_object('id',p_id,'decision',p_decision,'note',trim(p_note));
 select * into v_request from public.delivery_customer_requests where id=p_id for update;
 if not found then raise exception 'Customer request not found';end if;
 select * into v_old from public.delivery_operation_events where request_key=p_key;
 if found then
  if v_old.actor_id<>auth.uid() or v_old.request_payload<>v_payload or v_old.action<>'customer_request_reviewed' then raise exception 'Request key was used for another decision';end if;
  return jsonb_build_object('id',v_request.id,'status',v_request.status,'reused',true);
 end if;
 if v_request.status not in ('requested','follow_up') then raise exception 'This request was already decided';end if;
 if p_decision='approve' then
  if v_request.kind<>'skip_milk' then raise exception 'Quantity and other changes require a reviewed plan or paid-order workflow; record follow-up instead';end if;
  if v_request.plan_id is null then raise exception 'No single milk plan is identified. Review the customer before applying changes';end if;
  if v_request.requested_date<private.operational_today() then raise exception 'This service date has passed; coordinate a follow-up instead';end if;
  perform private.lock_operational_day(v_request.requested_date);
  if exists(select 1 from public.delivery_plans where id=v_request.plan_id and billing_model='calendar_month') then raise exception 'Calendar-month schedule changes require a reviewed plan adjustment; choose follow-up';end if;
  perform 1 from public.delivery_plans where id=v_request.plan_id and user_id=v_request.user_id and status='active' and not is_test and entitlement_model='legacy_delivery_count' and delivered_deliveries<purchased_deliveries for update;
  if not found or not exists(select 1 from public.orders o join public.payments p on p.order_id=o.id where o.delivery_plan_id=v_request.plan_id and o.status='paid' and not o.is_test and p.status='captured' and not p.is_test) then raise exception 'A verified active paid milk plan is required';end if;
  if exists(select 1 from public.delivery_dispatches where delivery_date=v_request.requested_date and status='released')
  or (select action from public.delivery_day_reviews where delivery_date=v_request.requested_date order by version desc limit 1)='closed' then raise exception 'The requested day is released or closed. Review a dispatch amendment first';end if;
  if exists(select 1 from public.daily_deliveries where plan_id=v_request.plan_id and delivery_date=v_request.requested_date and (status not in ('planned','ready') or replacement_of_delivery_id is not null or fulfilment_root_id is not null))
  or exists(select 1 from public.delivery_exceptions where plan_id=v_request.plan_id and delivery_date=v_request.requested_date and product_key='milk' and action='override') then raise exception 'Existing quantity or replacement work needs a separate review before skipping';end if;
  v_quantity:=public.plan_product_quantity(v_request.plan_id,'milk',v_request.requested_date);
  if v_quantity<=0 then raise exception 'There is no milk due on the requested day';end if;
  insert into public.delivery_exceptions(plan_id,user_id,delivery_date,product_key,action,quantity,unit)
   values(v_request.plan_id,v_request.user_id,v_request.requested_date,'milk','skip',null,null)
   on conflict(plan_id,product_key,delivery_date) do update set action='skip',quantity=null,unit=null,updated_at=now();
  -- Update only the affected unlocked rows. Preserve routing and other products.
  delete from public.daily_delivery_items i using public.daily_deliveries d
   where i.delivery_id=d.id and d.plan_id=v_request.plan_id and d.delivery_date=v_request.requested_date and d.status in ('planned','ready') and d.replacement_of_delivery_id is null and i.product_key='milk';
  delete from public.daily_deliveries d where d.plan_id=v_request.plan_id and d.delivery_date=v_request.requested_date and d.status in ('planned','ready') and d.replacement_of_delivery_id is null and not exists(select 1 from public.daily_delivery_items i where i.delivery_id=d.id);
 end if;
 insert into public.delivery_operation_events(id,request_key,delivery_date,user_id,actor_id,actor_role,action,reason,request_payload,before_state,after_state)
 values(v_event,p_key,v_request.requested_date,v_request.user_id,auth.uid(),v_role,'customer_request_reviewed',trim(p_note),v_payload,to_jsonb(v_request),jsonb_build_object('decision',p_decision,'milk_skipped',p_decision='approve'));
 update public.delivery_customer_requests set status=case p_decision when 'approve' then 'approved' when 'decline' then 'declined' else 'follow_up' end,
 reviewed_by=auth.uid(),decision_note=trim(p_note),reviewed_at=now(),resolution_event_id=v_event where id=p_id returning * into v_request;
 return jsonb_build_object('id',v_request.id,'status',v_request.status);
end $$;
revoke all on function private.review_customer_request(uuid,text,text,uuid) from public,anon,authenticated;
create function public.review_driver_customer_request(p_id uuid,p_decision text,p_note text,p_key uuid)
returns jsonb language sql security definer set search_path='' as $$ select private.review_customer_request(p_id,p_decision,p_note,p_key); $$;
revoke all on function public.review_driver_customer_request(uuid,text,text,uuid) from public,anon;
grant execute on function public.review_driver_customer_request(uuid,text,text,uuid) to authenticated;
commit;
