-- Keep trial activity for audit while excluding it from live farm operations.
alter table public.orders
add column if not exists is_test boolean not null default false;

alter table public.payments
add column if not exists is_test boolean not null default false;

alter table public.delivery_plans
add column if not exists is_test boolean not null default false;

alter table public.daily_deliveries
add column if not exists is_test boolean not null default false;

create index if not exists orders_live_status_created_idx
on public.orders (status, created_at desc)
where not is_test;

create index if not exists payments_live_status_created_idx
on public.payments (status, created_at desc)
where not is_test;

create index if not exists delivery_plans_live_status_idx
on public.delivery_plans (status, updated_at desc)
where not is_test;

create index if not exists daily_deliveries_live_date_idx
on public.daily_deliveries (delivery_date, route_stop_order)
where not is_test;
