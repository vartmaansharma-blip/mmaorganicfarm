-- Apply this to the verified M'ma/Mama Farms Supabase project once it is active.
create table if not exists public.customer_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  email text,
  avatar_url text,
  phone text,
  address_line text,
  city text default 'Jamshedpur',
  postal_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customer_profiles enable row level security;

grant select, insert, update on public.customer_profiles to authenticated;

create policy "Customers can read their profile"
on public.customer_profiles
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Customers can create their profile"
on public.customer_profiles
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Customers can update their profile"
on public.customer_profiles
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create or replace function public.sync_customer_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.customer_profiles (
    user_id,
    full_name,
    email,
    avatar_url
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.email,
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  )
  on conflict (user_id) do update
  set
    full_name = excluded.full_name,
    email = excluded.email,
    avatar_url = excluded.avatar_url,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists sync_customer_profile_from_auth on auth.users;

create trigger sync_customer_profile_from_auth
after insert or update of email, raw_user_meta_data
on auth.users
for each row execute function public.sync_customer_profile();

-- This function is trigger-only and must not be callable through the API.
revoke execute on function public.sync_customer_profile()
from public, anon, authenticated;
