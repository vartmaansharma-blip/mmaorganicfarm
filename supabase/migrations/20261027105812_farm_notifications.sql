-- Role-scoped in-app farm activity. Business records remain the source of each event.
begin;
create table public.farm_notifications (
 id bigint generated always as identity primary key,
 event_key text not null unique,
 category text not null,
 severity text not null check (severity in ('info','attention')),
 title text not null,
 message text not null,
 href text not null check (href like '/farm%'),
 created_at timestamptz not null default now()
);
create index farm_notifications_recent_idx on public.farm_notifications(created_at desc,id desc);
create table public.farm_notification_dismissals (
 owner_id uuid not null references auth.users(id),
 notification_id bigint not null references public.farm_notifications(id),
 dismissed_at timestamptz not null default now(),
 primary key(owner_id,notification_id)
);
create index farm_notification_dismissals_event_idx on public.farm_notification_dismissals(notification_id);
alter table public.farm_notifications enable row level security;
alter table public.farm_notification_dismissals enable row level security;
revoke all on public.farm_notifications,public.farm_notification_dismissals from public,anon,authenticated;
create trigger immutable_owner_notification_evidence before update or delete on public.farm_notifications
 for each row execute function private.immutable_delivery_evidence();

create function private.require_farm_notification_viewer() returns text
language plpgsql stable security definer set search_path='' as $$
declare v_role text;
begin
 select role into v_role from public.farm_staff where user_id=auth.uid() and active and role in ('admin','manager');
 if v_role is null then raise exception 'Active farm manager or owner access required' using errcode='42501';end if;
 return v_role;
end $$;
revoke all on function private.require_farm_notification_viewer() from public,anon,authenticated;

create function private.capture_farm_notification() returns trigger
language plpgsql security definer set search_path='' as $$
declare v jsonb:=to_jsonb(new); v_old jsonb; v_category text; v_title text; v_message text;
 v_href text; v_severity text:='info'; v_key text; v_action text;
begin
 if tg_op='DELETE' then v:=to_jsonb(old); end if;
 if tg_op='UPDATE' then v_old:=to_jsonb(old); end if;
 v_key:=tg_table_name||':'||coalesce(v->>'id',gen_random_uuid()::text);
 case tg_table_name
 when 'delivery_operation_events' then
  v_action:=v->>'action';
  v_category:=case when v_action like 'customer_request_%' then 'Customer requests' else 'Deliveries' end;
  v_title:=case when v_action='outcome' then case v->'request_payload'->>'outcome'
   when 'delivered' then 'Delivery completed' when 'partial' then 'Delivery partly completed'
   when 'attempt_failed' then 'Delivery attempt failed' when 'skipped' then 'Delivery skipped'
   when 'reschedule_requested' then 'Delivery reschedule requested' else 'Delivery updated' end
   when v_action='customer_request_recorded' then 'Customer request received'
   when v_action='customer_request_reviewed' then 'Customer request reviewed'
   else initcap(replace(v_action,'_',' ')) end;
  v_message:='Service day '||coalesce(to_char((v->>'delivery_date')::date,'FMDD Mon'),'')||'. View delivery details.';
  if coalesce(v->'request_payload'->>'outcome','delivered')<>'delivered' or v_action='customer_request_recorded'
   then v_severity:='attention';end if;
  v_href:=case when v_category='Customer requests' then '/farm/cancellations' else '/farm/reconciliation' end||'?date='||(v->>'delivery_date');
 when 'driver_operations_events' then
  v_category:='Delivery runs';v_action:=v->>'action';
  v_title:=case v_action when 'create' then 'Delivery run prepared' when 'load' then 'Run load recorded' when 'acknowledge' then 'Driver accepted the load' when 'reject_load' then 'Driver rejected the load' when 'release' then 'Delivery run released' when 'start' then 'Driver started the run' when 'finish' then 'Driver returned to the farm' when 'close' then 'Delivery run closed' when 'cancel' then 'Delivery run cancelled' when 'profile' then 'Driver profile updated' when 'vehicle' then 'Vehicle details updated' when 'availability' then 'Driver availability updated' else 'Run manifest refreshed' end;
  v_message:='A recorded driver, vehicle or run update is available.';
  v_href:='/farm/runs'||case when v->'after_state'->>'delivery_date' is not null then '?date='||(v->'after_state'->>'delivery_date') else '' end;
  if v_action in ('reject_load','cancel') then v_severity:='attention';end if;
 when 'payments' then
  if coalesce((v->>'is_test')::boolean,false) or v->>'status'<>'captured'
   or exists(select 1 from public.orders where id=(v->>'order_id')::uuid and is_test)
   or (tg_op='UPDATE' and v_old->>'status'='captured') then return new;end if;
  v_category:='Payments';v_title:='Payment recorded';
  v_message:='INR '||to_char((v->>'amount_paise')::numeric/100,'FM9999999990.00')||' recorded as captured. Review the payment ledger for evidence.';
  v_href:='/farm/payments';v_key:=v_key||':captured';
 when 'delivery_automation_attempts' then
  v_category:='Automation';v_title:=case when v->>'status'='failed' then 'Dispatch preparation needs attention' else 'Dispatch preparation '||(v->>'status') end;
  v_message:='Service day '||(v->>'service_date')||'. Open activity to review this preparation attempt.';
  v_href:='/farm/activity';if v->>'status'='failed' then v_severity:='attention';end if;
 when 'production_capacity','production_capacity_overrides' then
  if tg_op='UPDATE' and v_old->'daily_limit'=v->'daily_limit' then return new;end if;
  v_category:='Capacity';v_title:=case when tg_op='DELETE' then 'One-day capacity restored to normal' else 'Production capacity updated' end;
  v_message:=case when tg_op='DELETE' then initcap(v->>'product_key')||' follows the normal limit for '||(v->>'delivery_date')||'. Previous override removed.' else initcap(v->>'product_key')||': '||(v->>'daily_limit')||case when v->>'delivery_date' is null then ' per day.' else ' for '||(v->>'delivery_date')||'.' end end;
  v_href:='/farm/capacity?product='||(v->>'product_key');
 when 'farm_staff' then
  if tg_op='UPDATE' and v_old->'active'=v->'active' and v_old->'role'=v->'role' then return new;end if;
  v_category:='Staff access';v_title:='Staff access updated';
  v_message:=initcap(v->>'role')||' access is '||case when (v->>'active')::boolean then 'active' else 'inactive' end||'. Review the staff account in access control.';
  v_href:='/farm/staff';
 when 'cancellation_requests' then
  -- Self-service plan cancellation completes in this transaction; do not alert on its transient requested state.
  if v->>'status'='requested' and v->>'plan_id' is not null then return new;end if;
  if tg_op='UPDATE' and v_old->'status'=v->'status' then return new;end if;
  v_category:='Customer requests';v_title:=case when v->>'status'='requested' then 'Cancellation request received' else 'Cancellation update recorded' end;
  v_message:='Recorded cancellation status: '||(v->>'status')||'. Review the customer service record for details.';
  v_href:='/farm/cancellations';v_key:=v_key||':'||(v->>'status');
  if v->>'status'='requested' then v_severity:='attention';end if;
 when 'milk_intake_events' then
  v_category:='Milk intake';v_title:=case v->>'action' when 'create' then 'Milk intake recorded' when 'correct' then 'Milk intake corrected' else 'Milk intake voided' end;
  v_message:='Intake day '||(v->>'intake_date')||'. Review the quantities and handling record.';
  v_href:='/farm/production?date='||(v->>'intake_date');
  if v->>'action'='void' or (v->'after_state'->>'rejected_litres')::numeric>0 then v_severity:='attention';end if;
 else return new;
 end case;
 insert into public.farm_notifications(event_key,category,severity,title,message,href)
 values(v_key,v_category,v_severity,left(coalesce(v_title,'Farm activity'),160),left(coalesce(v_message,''),500),coalesce(v_href,'/farm/activity'))
 on conflict(event_key) do nothing;
 return new;
end $$;
revoke all on function private.capture_farm_notification() from public,anon,authenticated;
create trigger owner_delivery_activity after insert on public.delivery_operation_events for each row execute function private.capture_farm_notification();
create trigger owner_run_activity after insert on public.driver_operations_events for each row execute function private.capture_farm_notification();
create trigger owner_payment_activity after insert or update of status on public.payments for each row execute function private.capture_farm_notification();
create trigger owner_preparation_activity after insert on public.delivery_automation_attempts for each row execute function private.capture_farm_notification();
create trigger owner_capacity_activity after update on public.production_capacity for each row execute function private.capture_farm_notification();
create trigger owner_capacity_override_activity after insert or update or delete on public.production_capacity_overrides for each row execute function private.capture_farm_notification();

create trigger owner_staff_activity after insert or update on public.farm_staff for each row execute function private.capture_farm_notification();
create trigger owner_cancellation_activity after insert or update on public.cancellation_requests for each row execute function private.capture_farm_notification();

create function private.farm_notifications(p_before bigint) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_rows jsonb; v_total integer; v_role text;
begin
 v_role:=private.require_farm_notification_viewer();
 select count(*)::integer into v_total
 from public.farm_notifications n
 where (v_role='admin' or n.category not in ('Payments','Staff access')) and n.created_at>=now()-interval '30 days' and not exists(
  select 1 from public.farm_notification_dismissals d where d.notification_id=n.id and d.owner_id=auth.uid());
 select coalesce(jsonb_agg(to_jsonb(x) order by x.sort_id desc),'[]') into v_rows from (
  select n.id::text id,n.id sort_id,n.category,n.severity,n.title,n.message,n.href,n.created_at
  from public.farm_notifications n
  where (v_role='admin' or n.category not in ('Payments','Staff access')) and n.created_at>=now()-interval '30 days' and (p_before is null or n.id<p_before)
  and not exists(select 1 from public.farm_notification_dismissals d where d.notification_id=n.id and d.owner_id=auth.uid())
  order by n.id desc limit 31
 ) x;
 return jsonb_build_object('items',v_rows,'total',v_total);
end $$;
revoke all on function private.farm_notifications(bigint) from public,anon,authenticated;
create function public.get_farm_notifications(p_before bigint default null) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.farm_notifications(p_before); $$;
revoke all on function public.get_farm_notifications(bigint) from public,anon;
grant execute on function public.get_farm_notifications(bigint),private.farm_notifications(bigint) to authenticated;

create function private.dismiss_farm_notifications(p_ids bigint[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_role text;
begin
 v_role:=private.require_farm_notification_viewer();
 if p_ids is null or cardinality(p_ids) not between 1 and 200 then raise exception 'Choose the notifications to dismiss';end if;
 insert into public.farm_notification_dismissals(owner_id,notification_id)
 select auth.uid(),n.id from public.farm_notifications n where n.id=any(p_ids) and (v_role='admin' or n.category not in ('Payments','Staff access'))
 on conflict(owner_id,notification_id) do nothing;
 return private.farm_notifications(null);
end $$;
revoke all on function private.dismiss_farm_notifications(bigint[]) from public,anon,authenticated;
create function public.dismiss_farm_notifications(p_ids bigint[]) returns jsonb
language sql security invoker set search_path='' as $$ select private.dismiss_farm_notifications(p_ids); $$;
revoke all on function public.dismiss_farm_notifications(bigint[]) from public,anon;
grant execute on function public.dismiss_farm_notifications(bigint[]),private.dismiss_farm_notifications(bigint[]) to authenticated;
notify pgrst,'reload schema';
commit;
