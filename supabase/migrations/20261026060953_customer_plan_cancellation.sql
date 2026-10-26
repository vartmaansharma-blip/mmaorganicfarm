-- Customer cancellation is an immediate command, not a manager decision.
-- Preserve paid terms, recorded outcomes, closed reviews and payment history.
begin;

create function private.cancel_owned_delivery_plan(
  p_plan_id uuid, p_reason text default null, p_existing_request uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_user uuid := auth.uid();
  v_plan public.delivery_plans%rowtype;
  v_day date;
  v_request uuid;
  v_count integer := 0;
  v_reason text := nullif(btrim(coalesce(p_reason,'')), '');
  v_note text := 'Cancelled immediately by the customer. No farm approval or automatic refund. Recorded deliveries and purchased terms are preserved.';
begin
  if v_user is null then raise exception 'Sign in to cancel your plan' using errcode='42501'; end if;
  if char_length(coalesce(v_reason,''))>500 then raise exception 'Keep the reason under 500 characters'; end if;
  if v_reason is null then v_reason := 'Cancelled by customer.';
  elsif char_length(v_reason)<3 then v_reason := 'Customer note: '||v_reason; end if;
  if not exists(select 1 from public.delivery_plans where id=p_plan_id and user_id=v_user) then
    raise exception 'This plan cannot be cancelled' using errcode='42501';
  end if;

  -- Match the operational commands' day-first lock order before locking a plan.
  for v_day in select distinct delivery_date from public.daily_deliveries
    where plan_id=p_plan_id and delivery_date>=private.operational_today() order by delivery_date
  loop perform private.lock_operational_day(v_day); end loop;
  select * into v_plan from public.delivery_plans where id=p_plan_id and user_id=v_user for update;
  if not found then raise exception 'This plan cannot be cancelled' using errcode='42501'; end if;
  if v_plan.status not in ('pending_confirmation','active','paused','cancelled') then
    raise exception 'This plan cannot be cancelled';
  end if;
  if p_existing_request is not null and not exists(
    select 1 from public.cancellation_requests where id=p_existing_request
      and user_id=v_user and plan_id=p_plan_id and status='requested'
  ) then raise exception 'Cancellation record does not match this plan'; end if;

  if v_plan.status='cancelled' then
    if p_existing_request is not null then
      update public.cancellation_requests set status='completed',resolved_at=now(),resolved_by=v_user,
        resolution_note=v_note where id=p_existing_request;
      v_request := p_existing_request;
    else
      select id into v_request from public.cancellation_requests where plan_id=p_plan_id and user_id=v_user
        and status in ('completed','approved') order by created_at desc limit 1;
    end if;
    return jsonb_build_object('status','cancelled','request_id',v_request,'already_cancelled',true,'cancelled_deliveries',0);
  end if;

  update public.delivery_plans set status='cancelled',updated_at=now() where id=p_plan_id;
  -- Close an unpaid, unbound draft for the stopped plan. A provider checkout or
  -- captured payment remains intact because its financial outcome may be pending.
  update public.orders set status='cancelled',updated_at=now()
    where delivery_plan_id=p_plan_id and user_id=v_user and status='draft' and razorpay_order_id is null;
  -- A released route is not an approval gate. Preserve any physical outcome,
  -- partial quantity evidence and closed-day history instead of rewriting it.
  update public.daily_deliveries d set status='cancelled',updated_at=now()
    where d.plan_id=p_plan_id and d.delivery_date>=private.operational_today()
      and d.status in ('planned','ready','out_for_delivery') and not d.delivery_confirmed
      and not exists(select 1 from public.daily_delivery_items i where i.delivery_id=d.id and i.fulfilled_quantity is not null)
      and not exists(select 1 from public.delivery_visit_outcomes o where o.delivery_date=d.delivery_date and o.visit_key=d.visit_key)
      and coalesce((select action from public.delivery_day_reviews r where r.delivery_date=d.delivery_date order by version desc limit 1),'')<>'closed';
  get diagnostics v_count = row_count;

  if p_existing_request is null then
    insert into public.cancellation_requests(user_id,plan_id,reason,status,resolution_note,resolved_by,resolved_at)
      values(v_user,p_plan_id,v_reason,'completed',v_note,v_user,now()) returning id into v_request;
  else
    update public.cancellation_requests set status='completed',resolved_at=now(),resolved_by=v_user,
      resolution_note=v_note where id=p_existing_request returning id into v_request;
  end if;
  insert into public.customer_notifications(user_id,kind,title,message)
    values(v_user,'cancellation_update','Plan cancelled',
      'Your plan is cancelled. Unfulfilled scheduled visits have been stopped. Recorded deliveries and your paid history are preserved. No farm approval or automatic refund is required.');
  return jsonb_build_object('status','cancelled','request_id',v_request,'already_cancelled',false,'cancelled_deliveries',v_count);
end $$;
revoke all on function private.cancel_owned_delivery_plan(uuid,text,uuid) from public,anon,authenticated;
grant execute on function private.cancel_owned_delivery_plan(uuid,text,uuid) to authenticated;

create function public.cancel_my_delivery_plan(p_plan_id uuid,p_reason text default null)
returns jsonb language sql security invoker set search_path='' as $$
  select private.cancel_owned_delivery_plan(p_plan_id,p_reason);
$$;
revoke all on function public.cancel_my_delivery_plan(uuid,text) from public,anon,authenticated;
grant execute on function public.cancel_my_delivery_plan(uuid,text) to authenticated;

-- Older deployed clients can still insert a "requested" row. Complete that
-- customer's intent in the same transaction, so it can never wait for approval.
create function private.complete_legacy_customer_plan_cancellation()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.plan_id is not null and new.status='requested' and new.user_id=auth.uid() then
    perform private.cancel_owned_delivery_plan(new.plan_id,new.reason,new.id);
  end if;
  return new;
end $$;
revoke all on function private.complete_legacy_customer_plan_cancellation() from public,anon,authenticated;
create trigger complete_customer_plan_cancellation after insert on public.cancellation_requests
  for each row execute function private.complete_legacy_customer_plan_cancellation();

-- Close the generation/cancellation race. Generators already skip cancelled
-- plans; an in-flight generator must recheck after the customer's plan lock.
create function private.reject_cancelled_plan_delivery()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_status text;
begin
  if new.plan_id is not null and new.replacement_of_delivery_id is null
    and new.delivery_date>=private.operational_today() then
    select status into v_status from public.delivery_plans where id=new.plan_id for update;
    if v_status='cancelled' then raise exception 'This plan has been cancelled; no new scheduled visits may be created'; end if;
  end if;
  return new;
end $$;
revoke all on function private.reject_cancelled_plan_delivery() from public,anon,authenticated;
create trigger reject_cancelled_plan_delivery before insert on public.daily_deliveries
  for each row execute function private.reject_cancelled_plan_delivery();

comment on function public.cancel_my_delivery_plan(uuid,text) is
'Cancel only the authenticated customer''s own plan immediately, with idempotent retries, same-transaction history and preservation of recorded fulfilment.';
notify pgrst,'reload schema';
commit;
