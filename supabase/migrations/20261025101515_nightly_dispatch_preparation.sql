-- System preparation is separate from human release. NULL preparation actors
-- mean the system; every automated attempt has a dedicated run record.
begin;
alter table public.daily_deliveries alter column generated_by drop not null;
alter table public.delivery_dispatches alter column prepared_by drop not null;
alter table public.daily_route_assignments alter column updated_by drop not null;
create table public.delivery_automation_runs (
 id uuid primary key default gen_random_uuid(),
 job_key text not null check(job_key='nightly_dispatch'),
 service_date date not null,
 status text not null check(status in ('running','succeeded','failed','skipped')),
 attempts integer not null default 1 check(attempts>0),
 started_at timestamptz not null default now(),
 completed_at timestamptz,
 error_message text,
 summary jsonb not null default '{}',
 unique(job_key,service_date)
);
alter table public.delivery_automation_runs enable row level security;
revoke all on public.delivery_automation_runs from public,anon,authenticated;
grant select on public.delivery_automation_runs to authenticated;
create policy "Managers read automated preparation runs" on public.delivery_automation_runs
 for select to authenticated using ((select private.is_operations_manager()));
create index delivery_automation_runs_started_idx on public.delivery_automation_runs(started_at desc);

create or replace function private.generate_dispatch_deliveries(p_delivery_date date,p_system boolean) 
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := case when p_system then null else auth.uid() end;
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

  if not p_system and not exists (
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
    and not p_system and status = 'planned' and replacement_of_delivery_id is null;

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
      and plans.entitlement_model = 'legacy_delivery_count'
      and plans.delivered_deliveries < plans.purchased_deliveries
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


create or replace function private.prepare_dispatch_assignments(p_delivery_date date,p_system boolean)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := case when p_system then null else auth.uid() end;
  v_updated integer := 0;
begin
  if p_delivery_date is null then
    raise exception 'Delivery date is required';
  end if;

  if not p_system and not exists (
    select 1 from public.farm_staff
    where farm_staff.user_id = v_actor_id
      and farm_staff.active
      and farm_staff.role in ('manager', 'admin')
  ) then
    raise exception 'Farm manager access required';
  end if;

  if exists (
    select 1 from public.delivery_dispatches
    where delivery_date = p_delivery_date and status = 'released'
  ) then
    raise exception 'Reopen this dispatch before refreshing it';
  end if;

  insert into public.delivery_dispatches (
    delivery_date, status, prepared_by, prepared_at, updated_at
  ) values (
    p_delivery_date, 'draft', v_actor_id, now(), now()
  )
  on conflict (delivery_date) do update
  set prepared_by = excluded.prepared_by,
      prepared_at = excluded.prepared_at,
      updated_at = excluded.updated_at;

  insert into public.daily_route_assignments (
    delivery_date, route_id, driver_id, source, updated_by, updated_at
  )
  select distinct
    p_delivery_date,
    deliveries.delivery_route_id,
    defaults.driver_id,
    'default',
    v_actor_id,
    now()
  from public.daily_deliveries as deliveries
  join public.route_driver_assignments as defaults
    on defaults.route_id = deliveries.delivery_route_id
  where deliveries.delivery_date = p_delivery_date
    and not deliveries.is_test
    and deliveries.status <> 'cancelled'
    and deliveries.delivery_route_id is not null
  on conflict (delivery_date, route_id) do update
  set driver_id = excluded.driver_id,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  where daily_route_assignments.source = 'default';

  update public.daily_deliveries as deliveries
  set assigned_driver_id = assignments.driver_id,
      updated_at = now()
  from public.daily_route_assignments as assignments
  where deliveries.delivery_date = p_delivery_date
    and assignments.delivery_date = p_delivery_date
    and deliveries.delivery_route_id = assignments.route_id
    and not deliveries.is_test
    and deliveries.status in ('planned', 'ready', 'out_for_delivery', 'failed')
    and deliveries.assigned_driver_id is distinct from assignments.driver_id;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke all on function private.generate_dispatch_deliveries(date,boolean) from public,anon,authenticated;
revoke all on function private.prepare_dispatch_assignments(date,boolean) from public,anon,authenticated;
-- Both staff and system delegate to the same generation/preparation implementation.
create or replace function public.generate_daily_deliveries(p_delivery_date date)
returns integer language sql security definer set search_path='' as $$
 select private.generate_dispatch_deliveries(p_delivery_date,false);
$$;
create or replace function public.prepare_daily_dispatch(p_delivery_date date)
returns integer language sql security definer set search_path='' as $$
 select private.prepare_dispatch_assignments(p_delivery_date,false);
$$;
revoke all on function public.generate_daily_deliveries(date) from public,anon;
revoke all on function public.prepare_daily_dispatch(date) from public,anon;
grant execute on function public.generate_daily_deliveries(date) to authenticated;
grant execute on function public.prepare_daily_dispatch(date) to authenticated;

-- Keep each completed attempt immutable while the run row projects latest status.
create table public.delivery_automation_attempts (
 id uuid primary key default gen_random_uuid(),
 run_id uuid not null references public.delivery_automation_runs(id) on delete restrict,
 service_date date not null,
 attempt_number integer not null,
 status text not null check(status in ('succeeded','failed','skipped')),
 started_at timestamptz not null,
 completed_at timestamptz not null,
 error_message text,
 summary jsonb not null,
 unique(run_id,attempt_number)
);
alter table public.delivery_automation_attempts enable row level security;
revoke all on public.delivery_automation_attempts from public,anon,authenticated;
grant select on public.delivery_automation_attempts to authenticated;
create policy "Managers read preparation attempts" on public.delivery_automation_attempts
 for select to authenticated using ((select private.is_operations_manager()));
create index delivery_automation_attempts_date_idx on public.delivery_automation_attempts(service_date,attempt_number);
create trigger immutable_preparation_attempts before update or delete on public.delivery_automation_attempts
 for each row execute function private.immutable_delivery_evidence();
create function private.snapshot_preparation_attempt(p_id uuid) returns void language sql security definer set search_path='' as $$
 insert into public.delivery_automation_attempts(run_id,service_date,attempt_number,status,started_at,completed_at,error_message,summary)
 select id,service_date,attempts,status,started_at,completed_at,error_message,summary from public.delivery_automation_runs where id=p_id;
$$;
revoke all on function private.snapshot_preparation_attempt(uuid) from public,anon,authenticated;

create function private.run_dispatch_preparation(p_date date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_run public.delivery_automation_runs%rowtype;v_summary jsonb;v_count integer;v_blockers integer;
begin
 if p_date is null or p_date<private.operational_today() or p_date>private.operational_today()+1 then raise exception 'Only today or tomorrow may be prepared';end if;
 perform private.lock_operational_day(p_date);
 select * into v_run from public.delivery_automation_runs where job_key='nightly_dispatch' and service_date=p_date for update;
 if v_run.status='succeeded' then return jsonb_build_object('status','succeeded','reused',true,'summary',v_run.summary);end if;
 insert into public.delivery_automation_runs(job_key,service_date,status) values('nightly_dispatch',p_date,'running')
 on conflict(job_key,service_date) do update set status='running',attempts=delivery_automation_runs.attempts+1,started_at=now(),completed_at=null,error_message=null
 returning * into v_run;
 if exists(select 1 from public.delivery_dispatches where delivery_date=p_date and status='released')
 or (select action from public.delivery_day_reviews where delivery_date=p_date order by version desc limit 1)='closed' then
  update public.delivery_automation_runs set status='skipped',completed_at=now(),summary='{"reason":"Released or closed work is preserved"}' where id=v_run.id;
  perform private.snapshot_preparation_attempt(v_run.id);
  return jsonb_build_object('status','skipped','reason','Released or closed work is preserved');
 end if;
 -- Exceptions roll back generation/assignment together while preserving the failed run.
 begin
  perform private.generate_dispatch_deliveries(p_date,true);
  perform private.prepare_dispatch_assignments(p_date,true);
  select count(distinct visit_key),count(distinct visit_key) filter(where delivery_route_id is null or assigned_driver_id is null or nullif(trim(address_snapshot),'') is null)
   into v_count,v_blockers from public.daily_deliveries where delivery_date=p_date and not is_test and status<>'cancelled';
  v_summary:=jsonb_build_object('visits',v_count,'assignment_or_address_blockers',v_blockers,'dispatch','draft','actor','system');
  update public.delivery_automation_runs set status='succeeded',completed_at=now(),summary=v_summary where id=v_run.id;
  perform private.snapshot_preparation_attempt(v_run.id);
  return jsonb_build_object('status','succeeded','summary',v_summary);
 exception when others then
  update public.delivery_automation_runs set status='failed',completed_at=now(),error_message=left(sqlerrm,500) where id=v_run.id;
  perform private.snapshot_preparation_attempt(v_run.id);
  return jsonb_build_object('status','failed','run_id',v_run.id);
 end;
end $$;
revoke all on function private.run_dispatch_preparation(date) from public,anon,authenticated;
create function public.run_nightly_dispatch_preparation()
returns jsonb language sql security definer set search_path='' as $$
 select private.run_dispatch_preparation(private.operational_today()+1);
$$;
revoke all on function public.run_nightly_dispatch_preparation() from public,anon,authenticated;
grant execute on function public.run_nightly_dispatch_preparation() to service_role;
create function public.retry_dispatch_preparation(p_date date)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if private.operations_role() not in ('admin','manager') then raise exception 'Manager access required' using errcode='42501';end if;
 return private.run_dispatch_preparation(p_date);
end $$;
revoke all on function public.retry_dispatch_preparation(date) from public,anon;
grant execute on function public.retry_dispatch_preparation(date) to authenticated;
commit;
