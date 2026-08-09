create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  delivery_plan_id uuid references public.delivery_plans(id) on delete set null,
  purchase_mode text not null check (purchase_mode in ('once','plan')),
  status text not null default 'draft' check (status in ('draft','pending_payment','paid','payment_failed','cancelled')),
  currency text not null default 'INR' check (currency='INR'), milk_litres numeric(6,2) not null default 0 check (milk_litres>=0),
  bottle_choice text not null check (bottle_choice in ('return','new','none')),
  subtotal_paise integer not null check (subtotal_paise>=0), bottle_charge_paise integer not null default 0 check (bottle_charge_paise>=0),
  total_paise integer not null check (total_paise>0), phone_snapshot text not null, address_snapshot text not null,
  start_date date, razorpay_order_id text unique, terms_accepted_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  product_key text not null check (product_key in ('milk','paneer','ghee','papaya','sweets')),
  product_name text not null, quantity numeric(6,2) not null check (quantity>0), unit text not null,
  unit_price_paise integer not null check (unit_price_paise>0), line_total_paise integer not null check (line_total_paise>0),
  frequency text not null check (frequency in ('once','weekly')), scheduled_days smallint[] not null default '{}',
  delivery_date date, created_at timestamptz not null default now(),
  constraint order_items_schedule_days_valid check (scheduled_days <@ array[1,2,3,4,5,6,7]::smallint[])
);
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, provider text not null default 'razorpay' check (provider='razorpay'),
  provider_order_id text not null, provider_payment_id text unique,
  status text not null check (status in ('created','authorized','captured','failed')), amount_paise integer not null check (amount_paise>0),
  currency text not null default 'INR' check (currency='INR'), signature_verified boolean not null default false,
  created_at timestamptz not null default now(), paid_at timestamptz
);
create table if not exists public.payment_webhook_events (event_id text primary key, event_type text not null, processed_at timestamptz not null default now());
create index if not exists orders_user_created_idx on public.orders(user_id,created_at desc);
create index if not exists orders_delivery_plan_idx on public.orders(delivery_plan_id);
create index if not exists order_items_order_idx on public.order_items(order_id);
create index if not exists order_items_user_idx on public.order_items(user_id);
create index if not exists payments_order_idx on public.payments(order_id);
create index if not exists payments_user_idx on public.payments(user_id);
alter table public.orders enable row level security; alter table public.order_items enable row level security;
alter table public.payments enable row level security; alter table public.payment_webhook_events enable row level security;
revoke all on public.orders from anon,authenticated; revoke all on public.order_items from anon,authenticated;
revoke all on public.payments from anon,authenticated; revoke all on public.payment_webhook_events from anon,authenticated;
grant select,insert on public.orders to authenticated; grant select,insert on public.order_items to authenticated; grant select on public.payments to authenticated;
create policy "Customers can read their own orders" on public.orders for select to authenticated using ((select auth.uid())=user_id);
create policy "Customers can create their own draft orders" on public.orders for insert to authenticated with check ((select auth.uid())=user_id and status='draft' and razorpay_order_id is null and terms_accepted_at is null);
create policy "Customers can read their own order items" on public.order_items for select to authenticated using ((select auth.uid())=user_id);
create policy "Customers can add items to their own draft orders" on public.order_items for insert to authenticated with check ((select auth.uid())=user_id and exists(select 1 from public.orders where orders.id=order_items.order_id and orders.user_id=(select auth.uid()) and orders.status='draft'));
create policy "Customers can read their own payments" on public.payments for select to authenticated using ((select auth.uid())=user_id);
