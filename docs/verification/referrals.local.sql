-- Local verification only. Review and authorize production installation separately.
begin;

create table private.referral_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  discount_enabled boolean not null default false,
  referrer_paise integer not null default 10000 check (referrer_paise between 0 and 10000000),
  newcomer_paise integer not null default 10000 check (newcomer_paise between 0 and 10000000),
  revision uuid not null default gen_random_uuid(),
  check (not enabled or referrer_paise > 0 or newcomer_paise > 0)
);
insert into private.referral_settings default values;

create table private.referral_codes (
  owner_id uuid primary key references auth.users(id),
  code text not null unique default upper(replace(gen_random_uuid()::text, '-', '')),
  check (code ~ '^[0-9A-F]{32}$')
);

create table private.referral_claims (
  customer_id uuid primary key references auth.users(id),
  referrer_id uuid not null references private.referral_codes(owner_id),
  claimed_at timestamptz not null default now(),
  referrer_paise integer not null check (referrer_paise between 0 and 10000000),
  newcomer_paise integer not null check (newcomer_paise between 0 and 10000000),
  qualified_at timestamptz,
  qualifying_order_id uuid unique references public.orders(id),
  check (customer_id <> referrer_id),
  check ((qualified_at is null) = (qualifying_order_id is null))
);
create index referral_claims_referrer_idx on private.referral_claims(referrer_id);

revoke all on private.referral_settings, private.referral_codes, private.referral_claims
  from public, anon, authenticated, service_role;
alter table private.referral_settings enable row level security;
alter table private.referral_codes enable row level security;
alter table private.referral_claims enable row level security;

create function private.referral_workspace()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_user uuid := auth.uid();
  v_settings private.referral_settings%rowtype;
begin
  if v_user is null then raise exception 'Sign in to view referrals' using errcode='42501'; end if;
  select * into strict v_settings from private.referral_settings;
  return jsonb_build_object(
    'enabled', v_settings.enabled,
    'discount_enabled', v_settings.discount_enabled,
    'referrer_paise', v_settings.referrer_paise,
    'newcomer_paise', v_settings.newcomer_paise,
    'revision', v_settings.revision,
    'code', (select code from private.referral_codes where owner_id = v_user),
    'claim', (select jsonb_build_object('reward_paise', newcomer_paise, 'unlocked', qualified_at is not null)
      from private.referral_claims where customer_id = v_user),
    'invites', (select count(*) from private.referral_claims where referrer_id = v_user),
    'unlocked_invites', (select count(*) from private.referral_claims where referrer_id = v_user and qualified_at is not null),
    'earned_paise', (select coalesce(sum(referrer_paise), 0) from private.referral_claims
      where referrer_id = v_user and qualified_at is not null)
  );
end;
$$;

create function private.save_referral_settings(p_enabled boolean, p_referrer integer, p_newcomer integer, p_revision uuid, p_discount_enabled boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_before private.referral_settings%rowtype;
  v_after private.referral_settings%rowtype;
begin
  if auth.uid() is null or not exists (
    select 1 from public.farm_staff where user_id=auth.uid() and active and role='admin'
  ) then raise exception 'Owner access is required to change rewards' using errcode='42501'; end if;
  if p_enabled is null or p_discount_enabled is null or p_referrer is null or p_newcomer is null
    or p_referrer not between 0 and 10000000 or p_newcomer not between 0 and 10000000
    or (p_enabled and p_referrer = 0 and p_newcomer = 0)
  then raise exception 'Enter valid reward amounts and set at least one reward to enable referrals'; end if;
  select * into strict v_before from private.referral_settings for update;
  if v_before.revision is distinct from p_revision then
    raise exception 'Settings changed while you were editing. Review the current amounts.';
  end if;
  if (v_before.enabled, v_before.referrer_paise, v_before.newcomer_paise, v_before.discount_enabled) = (p_enabled, p_referrer, p_newcomer, p_discount_enabled) then
    return;
  end if;
  update private.referral_settings set enabled=p_enabled, referrer_paise=p_referrer,
    newcomer_paise=p_newcomer, discount_enabled=p_discount_enabled, revision=gen_random_uuid() where singleton returning * into v_after;
  insert into public.farm_change_log(actor_id, record_type, record_id, action, reason, before_state, after_state)
  values(auth.uid(), 'referral_settings', 'farm', 'update', 'Updated referral rewards',
    to_jsonb(v_before), to_jsonb(v_after));
end;
$$;

create function private.create_referral_code()
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Sign in to create a code' using errcode='42501'; end if;
  if not (select enabled from private.referral_settings where singleton for share) then
    raise exception 'Referrals are paused';
  end if;
  insert into private.referral_codes(owner_id) values(auth.uid()) on conflict (owner_id) do nothing;
end;
$$;

create function private.claim_referral_code(p_code text)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_user uuid := auth.uid();
  v_referrer uuid;
  v_settings private.referral_settings%rowtype;
begin
  if v_user is null then raise exception 'Sign in to use a code' using errcode='42501'; end if;
  select * into strict v_settings from private.referral_settings where singleton for share;
  if not v_settings.enabled then raise exception 'Referrals are paused'; end if;
  select owner_id into v_referrer from private.referral_codes where code=upper(btrim(p_code));
  if v_referrer is null or v_referrer=v_user then raise exception 'Use a valid code from someone else'; end if;
  if exists (select 1 from private.referral_claims where customer_id=v_user and referrer_id=v_referrer) then return; end if;
  if exists (select 1 from public.orders where user_id=v_user and not is_test
      and status in ('paid','pending_payment','payment_failed')) then
    raise exception 'Apply your code before starting your first payment';
  end if;
  insert into private.referral_claims(customer_id,referrer_id,referrer_paise,newcomer_paise)
  values (v_user,v_referrer,v_settings.referrer_paise,v_settings.newcomer_paise)
  on conflict (customer_id) do nothing;
  if not exists (select 1 from private.referral_claims where customer_id=v_user and referrer_id=v_referrer) then
    raise exception 'A referral code is already linked to this account';
  end if;
end;
$$;

create function private.qualify_referral_on_delivery()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.outcome not in ('delivered','partial') then return new; end if;

  update private.referral_claims as claim
  set qualified_at=now(), qualifying_order_id=eligible.id
  from (
    select o.id, c.customer_id
    from private.referral_claims c
    join public.daily_deliveries d on d.user_id=c.customer_id
    join public.delivery_plans plan on plan.id=d.plan_id and plan.user_id=d.user_id
    join public.orders o on o.delivery_plan_id=plan.id and o.user_id=d.user_id
    where c.customer_id=new.user_id and c.qualified_at is null
      and d.delivery_date=new.delivery_date and d.visit_key=new.visit_key
      and d.status='delivered' and d.delivery_confirmed and not d.is_test
      and plan.billing_model='calendar_month' and not plan.is_test
      and o.purchase_mode='plan' and o.status='paid' and not o.is_test
      and o.created_at >= c.claimed_at
      and exists (select 1 from public.payments p where p.order_id=o.id and p.status='captured' and not p.is_test)
    order by o.created_at, o.id
    limit 1
  ) eligible
  where claim.customer_id=eligible.customer_id and claim.qualified_at is null;
  return new;
end;
$$;

create trigger qualify_referral_on_delivery
  after insert or update of outcome on public.delivery_visit_outcomes
  for each row execute function private.qualify_referral_on_delivery();

create function public.referral_workspace() returns jsonb language sql stable security invoker set search_path=''
  as $$ select private.referral_workspace(); $$;
create function public.save_referral_settings(p_enabled boolean, p_referrer integer, p_newcomer integer, p_revision uuid, p_discount_enabled boolean default false)
  returns void language sql security invoker set search_path=''
  as $$ select private.save_referral_settings(p_enabled,p_referrer,p_newcomer,p_revision,p_discount_enabled); $$;
create function public.create_referral_code() returns void language sql security invoker set search_path=''
  as $$ select private.create_referral_code(); $$;
create function public.claim_referral_code(p_code text) returns void language sql security invoker set search_path=''
  as $$ select private.claim_referral_code(p_code); $$;

revoke all on function private.referral_workspace(), private.save_referral_settings(boolean,integer,integer,uuid,boolean),
  private.create_referral_code(), private.claim_referral_code(text), private.qualify_referral_on_delivery(),
  public.referral_workspace(), public.save_referral_settings(boolean,integer,integer,uuid,boolean),
  public.create_referral_code(), public.claim_referral_code(text)
  from public, anon, authenticated, service_role;
grant execute on function private.referral_workspace(), private.save_referral_settings(boolean,integer,integer,uuid,boolean),
  private.create_referral_code(), private.claim_referral_code(text),
  public.referral_workspace(), public.save_referral_settings(boolean,integer,integer,uuid,boolean),
  public.create_referral_code(), public.claim_referral_code(text) to authenticated;

create function private.referrals_enabled() returns boolean language sql stable security definer set search_path=''
  as $$ select enabled from private.referral_settings where singleton; $$;
create function public.referrals_enabled() returns boolean language sql stable security invoker set search_path=''
  as $$ select private.referrals_enabled(); $$;
revoke all on function public.referrals_enabled(), private.referrals_enabled()
  from public, anon, authenticated, service_role;
grant execute on function public.referrals_enabled(), private.referrals_enabled() to anon, authenticated;

commit;
