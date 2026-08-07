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
