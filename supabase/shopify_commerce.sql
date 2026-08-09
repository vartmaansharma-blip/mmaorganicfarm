-- Link Shopify commerce records to the existing Supabase delivery engine.
alter table public.orders
  add column if not exists commerce_provider text,
  add column if not exists shopify_cart_id text,
  add column if not exists shopify_checkout_url text,
  add column if not exists shopify_order_id text,
  add column if not exists shopify_order_name text,
  add column if not exists paid_total_paise integer;

alter table public.orders
  drop constraint if exists orders_commerce_provider_check;
alter table public.orders
  add constraint orders_commerce_provider_check
  check (commerce_provider is null or commerce_provider in ('razorpay', 'shopify'));

alter table public.orders
  drop constraint if exists orders_paid_total_paise_check;
alter table public.orders
  add constraint orders_paid_total_paise_check
  check (paid_total_paise is null or paid_total_paise > 0);

create unique index if not exists orders_shopify_order_id_idx
  on public.orders (shopify_order_id)
  where shopify_order_id is not null;

alter table public.payments drop constraint if exists payments_provider_check;
alter table public.payments
  add constraint payments_provider_check
  check (provider in ('razorpay', 'shopify'));

-- Customer access remains read/insert-only. Shopify synchronization uses the
-- server-side Supabase secret and does not add a public update policy.
revoke update (commerce_provider, shopify_cart_id, shopify_checkout_url,
  shopify_order_id, shopify_order_name, paid_total_paise)
  on public.orders from anon, authenticated;
