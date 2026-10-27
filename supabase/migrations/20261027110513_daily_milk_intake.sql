-- Physical receipt evidence, independent of order capacity and finished stock.
begin;
create table public.milk_intakes (
 id uuid primary key default gen_random_uuid(), intake_date date not null,
 received_at timestamptz not null, source text not null, reference text not null,
 received_litres numeric(12,2) not null check(received_litres>0),
 accepted_litres numeric(12,2) not null check(accepted_litres>=0 and accepted_litres<=received_litres),
 rejected_litres numeric(12,2) generated always as (received_litres-accepted_litres) stored,
 rejection_reason text not null default '',
 handling text not null check(handling in ('chilled','awaiting_chilling','segregated')),
 storage_location text not null, quality_notes text not null default '',
 status text not null default 'recorded' check(status in ('recorded','voided')),
 version integer not null default 1 check(version>0),
 recorded_by uuid not null references auth.users(id), recorded_at timestamptz not null default now(),
 updated_by uuid not null references auth.users(id), updated_at timestamptz not null default now(),
 check((received_at at time zone 'Asia/Kolkata')::date=intake_date),
 check(length(trim(source)) between 2 and 100),check(length(trim(reference)) between 1 and 100),
 check(length(trim(storage_location)) between 2 and 120),check(length(quality_notes)<=500),
 check(length(rejection_reason)<=300 and (accepted_litres=received_litres or length(trim(rejection_reason))>=3))
);
create unique index milk_intakes_receipt_identity on public.milk_intakes(intake_date,lower(trim(source)),lower(trim(reference))) where status='recorded';
create index milk_intakes_day_idx on public.milk_intakes(intake_date,received_at desc,id);
create index milk_intakes_recorded_by_idx on public.milk_intakes(recorded_by);
create index milk_intakes_updated_by_idx on public.milk_intakes(updated_by);
create table public.milk_intake_events (
 id uuid primary key default gen_random_uuid(), intake_id uuid not null references public.milk_intakes(id),
 intake_date date not null,version integer not null,
 request_key uuid not null unique,actor_id uuid not null references auth.users(id),
 action text not null check(action in ('create','correct','void')),payload jsonb not null,
 reason text not null default '',before_state jsonb,after_state jsonb not null,
 created_at timestamptz not null default now(),unique(intake_id,version)
);
create index milk_intake_events_actor_idx on public.milk_intake_events(actor_id);
alter table public.milk_intakes enable row level security;
alter table public.milk_intake_events enable row level security;
revoke all on public.milk_intakes,public.milk_intake_events from public,anon,authenticated;
create trigger immutable_milk_intake_evidence before update or delete on public.milk_intake_events for each row execute function private.immutable_delivery_evidence();
create trigger owner_milk_intake_activity after insert on public.milk_intake_events for each row execute function private.capture_farm_notification();

create function private.require_intake_manager() returns void
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.farm_staff where user_id=auth.uid() and active and role in ('admin','manager'))
 then raise exception 'Active farm manager access required' using errcode='42501';end if;
end $$;
revoke all on function private.require_intake_manager() from public,anon,authenticated;

create function private.milk_intake_command(p_action text,p_payload jsonb,p_request_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_old public.milk_intakes%rowtype;v_new public.milk_intakes%rowtype;v_event public.milk_intake_events%rowtype;
 v_id uuid;v_date date;v_time timestamptz;v_received numeric;v_accepted numeric;v_reason text:=trim(coalesce(p_payload->>'reason',''));
begin
 perform private.require_intake_manager();
 if p_request_key is null or jsonb_typeof(p_payload) is distinct from 'object' or p_action is null or p_action not in ('create','correct','void') then raise exception 'Choose an intake operation';end if;
 perform pg_advisory_xact_lock(hashtextextended('milk-intake:'||p_request_key::text,0));
 select * into v_event from public.milk_intake_events where request_key=p_request_key;
 if found then
  if v_event.actor_id<>auth.uid() or v_event.action<>p_action or v_event.payload<>p_payload then raise exception 'This request key belongs to another intake save';end if;
  return jsonb_build_object('id',v_event.intake_id,'date',v_event.intake_date,'version',v_event.version,'replayed',true);
 end if;
 if p_action='create' then
  if coalesce(p_payload->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Choose an intake date';end if;
  v_date:=(p_payload->>'date')::date;v_id:=gen_random_uuid();
 else
  v_id:=(p_payload->>'id')::uuid;
  select * into v_old from public.milk_intakes where id=v_id for update;
  if not found then raise exception 'Intake record not found';end if;
  if v_old.status='voided' then raise exception 'A voided record stays in history. Record a new receipt if needed';end if;
  if (p_payload->>'version')::integer is distinct from v_old.version then raise exception 'This intake changed. Refresh and review its latest version before saving';end if;
  if length(v_reason) not between 3 and 300 then raise exception 'Explain this correction or void in 3 to 300 characters';end if;
  v_date:=v_old.intake_date;
 end if;
 if p_action<>'void' then
  if coalesce(p_payload->>'time','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Enter the actual receipt time in IST';end if;
  v_time:=(v_date+(p_payload->>'time')::time) at time zone 'Asia/Kolkata';
  if v_time>now() then raise exception 'An intake cannot be recorded before it is received';end if;
  if coalesce(p_payload->>'received_litres','') !~ '^[0-9]+([.][0-9]{1,2})?$' or coalesce(p_payload->>'accepted_litres','') !~ '^[0-9]+([.][0-9]{1,2})?$'
  then raise exception 'Enter received and accepted litres with at most two decimal places';end if;
  v_received:=(p_payload->>'received_litres')::numeric;v_accepted:=(p_payload->>'accepted_litres')::numeric;
  if v_received<=0 or v_accepted<0 or v_accepted>v_received then raise exception 'Accepted litres must be between zero and the received litres';end if;
  if length(trim(coalesce(p_payload->>'source',''))) not between 2 and 100 or length(trim(coalesce(p_payload->>'reference',''))) not between 1 and 100
   or length(trim(coalesce(p_payload->>'storage_location',''))) not between 2 and 120 or coalesce(p_payload->>'handling','') not in ('chilled','awaiting_chilling','segregated')
   or length(coalesce(p_payload->>'quality_notes',''))>500 or length(coalesce(p_payload->>'rejection_reason',''))>300
  then raise exception 'Complete the source, receipt reference and actual handling details';end if;
  if v_accepted<v_received and length(trim(coalesce(p_payload->>'rejection_reason','')))<3 then raise exception 'Explain the rejected or unusable quantity';end if;
 end if;
 if p_action='create' then
  insert into public.milk_intakes(id,intake_date,received_at,source,reference,received_litres,accepted_litres,rejection_reason,handling,storage_location,quality_notes,recorded_by,updated_by)
  values(v_id,v_date,v_time,trim(p_payload->>'source'),trim(p_payload->>'reference'),v_received,v_accepted,trim(coalesce(p_payload->>'rejection_reason','')),p_payload->>'handling',trim(p_payload->>'storage_location'),trim(coalesce(p_payload->>'quality_notes','')),auth.uid(),auth.uid()) returning * into v_new;
 elsif p_action='correct' then
  update public.milk_intakes set received_at=v_time,source=trim(p_payload->>'source'),reference=trim(p_payload->>'reference'),received_litres=v_received,accepted_litres=v_accepted,
   rejection_reason=trim(coalesce(p_payload->>'rejection_reason','')),handling=p_payload->>'handling',storage_location=trim(p_payload->>'storage_location'),quality_notes=trim(coalesce(p_payload->>'quality_notes','')),
   version=version+1,updated_by=auth.uid(),updated_at=now() where id=v_id returning * into v_new;
 else
  update public.milk_intakes set status='voided',version=version+1,updated_by=auth.uid(),updated_at=now() where id=v_id returning * into v_new;
 end if;
 insert into public.milk_intake_events(intake_id,intake_date,version,request_key,actor_id,action,payload,reason,before_state,after_state)
 values(v_id,v_date,v_new.version,p_request_key,auth.uid(),p_action,p_payload,v_reason,case when p_action='create' then null else to_jsonb(v_old) end,to_jsonb(v_new));
 return jsonb_build_object('id',v_id,'date',v_date,'version',v_new.version,'replayed',false);
end $$;
revoke all on function private.milk_intake_command(text,jsonb,uuid) from public,anon,authenticated;
create function public.milk_intake_command(p_action text,p_payload jsonb,p_request_key uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.milk_intake_command(p_action,p_payload,p_request_key); $$;
revoke all on function public.milk_intake_command(text,jsonb,uuid) from public,anon;
grant execute on function public.milk_intake_command(text,jsonb,uuid),private.milk_intake_command(text,jsonb,uuid) to authenticated;

create function private.milk_intake_workspace(p_date date,p_page integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform private.require_intake_manager();
 if p_date is null or p_page is null or p_page not between 0 and 10000 then raise exception 'Choose an intake date and page';end if;
 return jsonb_build_object('date',p_date,'page',p_page,'total',(select count(*) from public.milk_intakes where intake_date=p_date),
 'summary',(select jsonb_build_object('received',coalesce(sum(received_litres) filter(where status='recorded'),0),'accepted',coalesce(sum(accepted_litres) filter(where status='recorded'),0),
 'rejected',coalesce(sum(rejected_litres) filter(where status='recorded'),0),'recorded',count(*) filter(where status='recorded'),'voided',count(*) filter(where status='voided')) from public.milk_intakes where intake_date=p_date),
 'records',coalesce((select jsonb_agg(to_jsonb(x) order by x.received_at desc,x.id) from (
  select i.*,coalesce(nullif(p.full_name,''),'Farm staff') recorded_by_name from public.milk_intakes i left join public.customer_profiles p on p.user_id=i.recorded_by
  where i.intake_date=p_date order by i.received_at desc,i.id limit 50 offset p_page*50
 ) x),'[]'));
end $$;
revoke all on function private.milk_intake_workspace(date,integer) from public,anon,authenticated;
create function public.get_milk_intake_workspace(p_date date,p_page integer default 0) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.milk_intake_workspace(p_date,p_page); $$;
revoke all on function public.get_milk_intake_workspace(date,integer) from public,anon;
grant execute on function public.get_milk_intake_workspace(date,integer),private.milk_intake_workspace(date,integer) to authenticated;

create function private.milk_intake_history(p_id uuid,p_before integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform private.require_intake_manager();
 return coalesce((select jsonb_agg(to_jsonb(x) order by x.version desc) from (
 select e.version,e.action,e.reason,e.before_state,e.after_state,e.created_at,coalesce(nullif(p.full_name,''),'Farm staff') actor
 from public.milk_intake_events e left join public.customer_profiles p on p.user_id=e.actor_id
 where e.intake_id=p_id and (p_before is null or e.version<p_before) order by e.version desc limit 21) x),'[]');
end $$;
revoke all on function private.milk_intake_history(uuid,integer) from public,anon,authenticated;
create function public.get_milk_intake_history(p_id uuid,p_before integer default null) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.milk_intake_history(p_id,p_before); $$;
revoke all on function public.get_milk_intake_history(uuid,integer) from public,anon;
grant execute on function public.get_milk_intake_history(uuid,integer),private.milk_intake_history(uuid,integer) to authenticated;
notify pgrst,'reload schema';
commit;
