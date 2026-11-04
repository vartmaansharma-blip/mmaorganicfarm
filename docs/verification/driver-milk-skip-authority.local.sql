-- Local draft. Install only after review of driver authority and hosted schema.
create function private.review_customer_request_with_authority(p_id uuid,p_decision text,p_note text,p_key uuid,p_driver_authority boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_role text:=private.operations_role();v_request public.delivery_customer_requests%rowtype;v_event uuid:=gen_random_uuid();v_old public.delivery_operation_events%rowtype;v_payload jsonb;v_quantity numeric;
begin
 if v_role not in ('manager','admin') and not (v_role='driver' and p_driver_authority) then raise exception 'Manager access required' using errcode='42501';end if;
 if p_key is null or p_decision is null or p_decision not in ('approve','decline','follow_up') or char_length(trim(coalesce(p_note,''))) not between 3 and 300 then raise exception 'Choose a decision and give a reason';end if;
 v_payload:=jsonb_build_object('id',p_id,'decision',p_decision,'note',trim(p_note));
 select * into v_request from public.delivery_customer_requests where id=p_id for update;
 if not found then raise exception 'Customer request not found';end if;
 if v_role='driver' and (
   v_request.recorded_by is distinct from auth.uid() or v_request.kind<>'skip_milk' or p_decision<>'approve'
   or not exists (
     select 1 from public.daily_deliveries source
     join public.delivery_dispatches dispatch on dispatch.delivery_date=source.delivery_date
     where source.id=v_request.source_delivery_id and source.assigned_driver_id=auth.uid()
       and source.delivery_date=private.operational_today() and not source.is_test
       and source.status<>'cancelled' and dispatch.status='released'
   )
 ) then raise exception 'Use a released visit assigned to you today' using errcode='42501';end if;
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
revoke all on function private.review_customer_request_with_authority(uuid,text,text,uuid,boolean) from public,anon,authenticated;


create or replace function private.review_customer_request(p_id uuid,p_decision text,p_note text,p_key uuid)
returns jsonb language sql security definer set search_path='' as $$
  select private.review_customer_request_with_authority(p_id,p_decision,p_note,p_key,false);
$$;

create function public.record_and_apply_driver_milk_skip(
  p_delivery_id uuid,p_requested_date date,p_words text,p_key uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_result jsonb;
begin
  if private.operations_role() is distinct from 'driver' then
    raise exception 'Driver access required' using errcode='42501';
  end if;
  perform private.lock_operational_day(private.operational_today());
  v_result := private.record_customer_request(p_delivery_id,p_requested_date,'skip_milk',p_words,p_key);
  if v_result->>'status' <> 'requested' or v_result->>'reused'='true' then return v_result; end if;
  begin
    return private.review_customer_request_with_authority(
      (v_result->>'id')::uuid,'approve','Customer confirmed the future milk skip to the assigned driver',
      md5(p_key::text || ':driver-skip')::uuid,true
    );
  exception when raise_exception then
    -- Business restrictions leave the request in the manager queue. Any
    -- tentative schedule updates in the approval attempt are rolled back.
    return v_result;
  end;
end;
$$;
revoke all on function public.record_and_apply_driver_milk_skip(uuid,date,text,uuid) from public,anon,authenticated;
grant execute on function public.record_and_apply_driver_milk_skip(uuid,date,text,uuid) to authenticated;
