-- Operational safeguards for plan purchases, route movement, and grouped doorstep visits.

create or replace function private.prevent_overlapping_delivery_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status not in ('pending_confirmation', 'active', 'paused') then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  if exists (
    select 1
    from public.delivery_plans as existing
    where existing.user_id = new.user_id
      and existing.id is distinct from new.id
      and existing.status in ('pending_confirmation', 'active', 'paused')
  ) then
    raise exception 'This customer already has a current delivery plan';
  end if;

  return new;
end;
$$;

revoke execute on function private.prevent_overlapping_delivery_plan()
from public, anon, authenticated;

drop trigger if exists prevent_overlapping_delivery_plan
on public.delivery_plans;

create trigger prevent_overlapping_delivery_plan
before insert or update of status on public.delivery_plans
for each row execute function private.prevent_overlapping_delivery_plan();

create or replace function public.update_delivery_route_settings(
  p_route_id uuid,
  p_area_id uuid,
  p_name text,
  p_code text,
  p_match_terms text[],
  p_postal_codes text[],
  p_stop_capacity integer
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
begin
  if not exists (
    select 1 from public.farm_staff
    where user_id = v_actor_id
      and active
      and role in ('manager', 'admin')
  ) then
    raise exception 'Farm manager access required';
  end if;

  if not exists (
    select 1 from public.delivery_areas
    where id = p_area_id and active
  ) then
    raise exception 'Choose an active service area';
  end if;

  if p_route_id is null
    or char_length(trim(coalesce(p_name, ''))) not between 2 and 80
    or char_length(trim(coalesce(p_code, ''))) > 24
    or p_stop_capacity not between 1 and 200
  then
    raise exception 'Enter valid route settings';
  end if;

  update public.delivery_routes
  set area_id = p_area_id,
      name = trim(p_name),
      code = nullif(trim(p_code), ''),
      match_terms = coalesce(p_match_terms, '{}'),
      postal_codes = coalesce(p_postal_codes, '{}'),
      stop_capacity = p_stop_capacity,
      updated_at = now()
  where id = p_route_id;

  if not found then
    raise exception 'Route not found';
  end if;

  update public.customer_profiles
  set delivery_area_id = p_area_id,
      updated_at = now()
  where delivery_route_id = p_route_id
    and delivery_area_id is distinct from p_area_id;

  return p_route_id;
end;
$$;

revoke execute on function public.update_delivery_route_settings(uuid, uuid, text, text, text[], text[], integer)
from public, anon;
grant execute on function public.update_delivery_route_settings(uuid, uuid, text, text, text[], text[], integer)
to authenticated;

create or replace function private.record_delivery_visit_impl(
  p_delivery_ids uuid[],
  p_delivery_confirmed boolean,
  p_bottle_returned boolean,
  p_driver_note text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery_id uuid;
  v_expected integer := coalesce(array_length(p_delivery_ids, 1), 0);
  v_found integer;
  v_user_count integer;
  v_date_count integer;
  v_route_count integer;
begin
  if v_expected < 1 or v_expected > 20 or array_position(p_delivery_ids, null) is not null then
    raise exception 'Choose between 1 and 20 delivery rows';
  end if;

  select count(*), count(distinct user_id), count(distinct delivery_date),
         count(distinct coalesce(delivery_route_id::text, 'unassigned'))
  into v_found, v_user_count, v_date_count, v_route_count
  from public.daily_deliveries
  where id = any(p_delivery_ids);

  if v_found <> v_expected then
    raise exception 'One or more delivery rows could not be found';
  end if;

  if v_user_count <> 1 or v_date_count <> 1 or v_route_count <> 1 then
    raise exception 'Only rows from one customer visit can be completed together';
  end if;

  foreach v_delivery_id in array p_delivery_ids loop
    perform private.record_delivery_stop_impl(
      v_delivery_id,
      p_delivery_confirmed,
      p_bottle_returned,
      p_driver_note
    );
  end loop;

  return v_expected;
end;
$$;

revoke execute on function private.record_delivery_visit_impl(uuid[], boolean, boolean, text)
from public, anon;
grant execute on function private.record_delivery_visit_impl(uuid[], boolean, boolean, text)
to authenticated;

create or replace function public.record_delivery_visit(
  p_delivery_ids uuid[],
  p_delivery_confirmed boolean,
  p_bottle_returned boolean,
  p_driver_note text default null
)
returns integer
language sql
security invoker
set search_path = ''
as $$
  select private.record_delivery_visit_impl(
    p_delivery_ids,
    p_delivery_confirmed,
    p_bottle_returned,
    p_driver_note
  );
$$;

revoke execute on function public.record_delivery_visit(uuid[], boolean, boolean, text)
from public, anon;
grant execute on function public.record_delivery_visit(uuid[], boolean, boolean, text)
to authenticated;

create index if not exists cancellation_requests_order_id_idx
on public.cancellation_requests (order_id);

create index if not exists cancellation_requests_plan_id_idx
on public.cancellation_requests (plan_id);

create index if not exists cancellation_requests_resolved_by_idx
on public.cancellation_requests (resolved_by);

create index if not exists cancellation_requests_user_id_idx
on public.cancellation_requests (user_id);

create index if not exists customer_notifications_delivery_id_idx
on public.customer_notifications (delivery_id);

create index if not exists customer_notifications_order_id_idx
on public.customer_notifications (order_id);
