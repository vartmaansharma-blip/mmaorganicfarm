-- Local verification. Saved preferences are separate from paid obligations and dispatch.
begin;

create table private.master_delivery_calendars (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision integer not null default 0
);

-- A weekly plan is order-scoped today. These versions survive a purchase or
-- renewal and provide one continuing pattern for a customer.
create table private.master_weekly_versions (
  user_id uuid not null references private.master_delivery_calendars(user_id) on delete cascade,
  revision integer not null,
  effective_from date not null,
  quantities jsonb not null,
  primary key (user_id, revision)
);
create index master_weekly_versions_effective_idx
  on private.master_weekly_versions(user_id, effective_from desc, revision desc);

-- Existing delivery_exceptions require a plan FK. These preferences can be
-- saved before a plan exists and can only affect unfunded, projected dates.
create table private.master_date_preferences (
  user_id uuid not null references private.master_delivery_calendars(user_id) on delete cascade,
  delivery_date date not null,
  product_key text not null check (product_key in ('milk','paneer','ghee')),
  quantity integer not null check (quantity between 0 and 5),
  primary key (user_id, delivery_date, product_key)
);

alter table private.master_delivery_calendars enable row level security;
alter table private.master_weekly_versions enable row level security;
alter table private.master_date_preferences enable row level security;
revoke all on private.master_delivery_calendars, private.master_weekly_versions,
  private.master_date_preferences from public, anon, authenticated, service_role;

create function private.read_master_delivery_schedule(p_from date, p_through date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_user uuid := auth.uid();
  v_today date := private.operational_today();
begin
  if v_user is null then raise exception 'Sign in to open your schedule' using errcode='42501'; end if;
  if p_from is null or p_through is null or p_through-p_from not between 0 and 31
    or p_from < v_today-366 or p_through > v_today+367
  then raise exception 'Choose a month within one year'; end if;

  return jsonb_build_object(
    'revision', coalesce((select revision from private.master_delivery_calendars where user_id=v_user), 0),
    'versions', coalesce((
      select jsonb_agg(jsonb_build_object('effective_from', w.effective_from, 'quantities', w.quantities)
        order by w.effective_from, w.revision)
      from private.master_weekly_versions w
      where w.user_id=v_user and (w.effective_from between p_from and greatest(p_through,v_today+1)
        or w.revision = (
          select a.revision from private.master_weekly_versions a
          where a.user_id=v_user and a.effective_from<p_from
          order by a.effective_from desc, a.revision desc limit 1
        ))
    ), '[]'::jsonb),
    'exceptions', coalesce((
      select jsonb_agg(jsonb_build_object('delivery_date', d.delivery_date, 'product_key', d.product_key,
        'quantity', d.quantity) order by d.delivery_date, d.product_key)
      from private.master_date_preferences d
      where d.user_id=v_user and d.delivery_date between p_from and p_through
    ), '[]'::jsonb)
  );
end;
$$;

create function private.save_master_delivery_schedule(p_revision integer, p_date date, p_quantities jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_user uuid := auth.uid();
  v_today date := private.operational_today();
  v_revision integer;
  v_product text;
  v_value jsonb;
begin
  if v_user is null then raise exception 'Sign in to save your schedule' using errcode='42501'; end if;
  if jsonb_typeof(p_quantities) is distinct from 'object'
    or not (p_quantities ?& array['milk','paneer','ghee'])
    or (select count(*) from jsonb_object_keys(p_quantities)) <> 3
  then raise exception 'Enter quantities for milk, paneer and ghee'; end if;

  if p_date is null then
    for v_value in select value from jsonb_each(p_quantities) loop
      if jsonb_typeof(v_value) <> 'array' then raise exception 'Enter seven weekday quantities'; end if;
      if jsonb_array_length(v_value) <> 7 or exists (
        select 1 from jsonb_array_elements(v_value) as q(value)
        where jsonb_typeof(q.value)<>'number' or q.value::text !~ '^[0-5]$'
      ) then raise exception 'Enter seven weekday quantities from zero to five'; end if;
    end loop;
  else
    if p_date <= v_today or p_date > v_today+366 then
      raise exception 'Choose a future date within one year';
    end if;
    if exists (
      select 1 from jsonb_each(p_quantities)
      where jsonb_typeof(value)<>'null' and (jsonb_typeof(value)<>'number' or value::text !~ '^[0-5]$')
    ) then raise exception 'Enter date quantities from zero to five'; end if;
  end if;

  -- Match the checkout/plan lock when a preference and a purchase overlap.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text,0));
  insert into private.master_delivery_calendars(user_id) values(v_user) on conflict do nothing;
  select revision into v_revision from private.master_delivery_calendars where user_id=v_user for update;
  if v_revision is distinct from p_revision then
    raise exception 'Your schedule changed. Review it and try again.';
  end if;

  if p_date is null then
    insert into private.master_weekly_versions(user_id, revision, effective_from, quantities)
    values(v_user, v_revision+1, v_today+1, p_quantities);
  else
    if exists(select 1 from public.daily_deliveries where user_id=v_user and delivery_date=p_date
      and not is_test and status<>'cancelled') or exists(
      select 1 from public.orders where user_id=v_user and start_date=p_date
        and not is_test and purchase_mode='once' and status='paid'
    ) or exists(
      select 1 from public.delivery_plans p
      where p.user_id=v_user and not p.is_test and p.start_date<=p_date
        and ((p.billing_model='calendar_month' and p_date<p.period_end_exclusive and p.status in ('active','paused','completed'))
          or (p.billing_model='milk_credits' and p.status in ('active','paused')))
    ) then raise exception 'Use the paid delivery controls to change this date'; end if;

    for v_product, v_value in select key, value from jsonb_each(p_quantities) loop
      if jsonb_typeof(v_value)='null' then
        delete from private.master_date_preferences
          where user_id=v_user and delivery_date=p_date and product_key=v_product;
      else
        insert into private.master_date_preferences(user_id,delivery_date,product_key,quantity)
        values(v_user,p_date,v_product,v_value::text::integer)
        on conflict (user_id,delivery_date,product_key) do update set quantity=excluded.quantity;
      end if;
    end loop;
  end if;

  update private.master_delivery_calendars set revision=v_revision+1 where user_id=v_user;
end;
$$;

create function public.read_master_delivery_schedule(p_from date, p_through date)
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.read_master_delivery_schedule(p_from,p_through);
$$;
create function public.save_master_delivery_schedule(p_revision integer, p_date date, p_quantities jsonb)
returns void language sql security invoker set search_path='' as $$
  select private.save_master_delivery_schedule(p_revision,p_date,p_quantities);
$$;

revoke all on function private.read_master_delivery_schedule(date,date), public.read_master_delivery_schedule(date,date),
  private.save_master_delivery_schedule(integer,date,jsonb), public.save_master_delivery_schedule(integer,date,jsonb)
  from public, anon, authenticated, service_role;
grant execute on function private.read_master_delivery_schedule(date,date), public.read_master_delivery_schedule(date,date),
  private.save_master_delivery_schedule(integer,date,jsonb), public.save_master_delivery_schedule(integer,date,jsonb)
  to authenticated;

-- Preserve the existing dated materialization path for reviewed monthly orders.
create or replace function private.monthly_routine_quantity(p_rule jsonb,p_date date)
returns integer language plpgsql immutable set search_path='' as $$
begin
 if p_rule ? 'dateQuantities' then
  if p_rule->>'repeat' is distinct from 'custom'
    or jsonb_typeof(p_rule->'dates') is distinct from 'array'
    or jsonb_typeof(p_rule->'dateQuantities') is distinct from 'object'
  then raise exception 'Invalid dated quantities'; end if;
  if (select count(*) from jsonb_object_keys(p_rule->'dateQuantities')) <> jsonb_array_length(p_rule->'dates')
    or exists(
      select 1 from jsonb_array_elements_text(p_rule->'dates') as d(value)
      where jsonb_typeof(p_rule->'dateQuantities'->d.value) is distinct from 'number'
        or (p_rule->'dateQuantities'->>d.value) !~ '^[1-5]$'
    ) then raise exception 'Invalid dated quantities'; end if;
  return coalesce((p_rule->'dateQuantities'->>to_char(p_date,'YYYY-MM-DD'))::integer,0);
 end if;
 return case when p_date<(p_rule->>'firstDate')::date then 0
 when p_rule->>'repeat'='custom' and p_rule->'dates' ? to_char(p_date,'YYYY-MM-DD') then (p_rule->>'quantity')::integer
 when p_rule->>'repeat'='daily' then (p_rule->>'quantity')::integer
 when p_rule->>'repeat'='once' and p_date=(p_rule->>'firstDate')::date then (p_rule->>'quantity')::integer
 when p_rule->>'repeat'='weekly' and mod(p_date-(p_rule->>'firstDate')::date,7)=0 then (p_rule->>'quantity')::integer
 when p_rule->>'repeat'='fortnightly' and mod(p_date-(p_rule->>'firstDate')::date,14)=0 then (p_rule->>'quantity')::integer
 when p_rule->>'repeat'='monthly' and extract(day from p_date)=least(extract(day from (p_rule->>'firstDate')::date),extract(day from date_trunc('month',p_date)+interval '1 month - 1 day')) then (p_rule->>'quantity')::integer
 when p_rule->>'repeat'='days' then coalesce((p_rule->'week'->>(extract(isodow from p_date)::integer-1))::integer,0)
 else 0 end;
end;
$$;

commit;
