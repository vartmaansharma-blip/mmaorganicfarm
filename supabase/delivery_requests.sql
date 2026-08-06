create table if not exists public.delivery_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  phone text not null check (length(trim(phone)) >= 7),
  address text not null check (length(trim(address)) >= 8),
  status text not null default 'new' check (status in ('new', 'contacted', 'planned', 'rejected')),
  created_at timestamptz not null default now()
);

alter table public.delivery_requests enable row level security;

grant insert, select on public.delivery_requests to authenticated;

create policy "Users can create their own delivery requests"
on public.delivery_requests
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can read their own delivery requests"
on public.delivery_requests
for select
to authenticated
using ((select auth.uid()) = user_id);
