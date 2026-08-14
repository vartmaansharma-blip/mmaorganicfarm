-- Paid quantity changes for active milk plans.
alter table public.orders
drop constraint if exists orders_purchase_mode_check;

alter table public.orders
add constraint orders_purchase_mode_check
check (purchase_mode in ('once', 'plan', 'adjustment'));

create table if not exists public.delivery_adjustments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null references public.delivery_plans(id) on delete cascade,
  order_id uuid unique references public.orders(id) on delete set null,
  delivery_date date not null,
  previous_quantity numeric(5, 2) not null check (previous_quantity >= 0),
  requested_quantity numeric(5, 2) not null check (requested_quantity >= 0 and requested_quantity <= 5),
  carry_forward_date date,
  carry_forward_quantity numeric(5, 2) check (carry_forward_quantity > 0 and carry_forward_quantity <= 5),
  status text not null check (status in ('pending_payment', 'applied', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (requested_quantity > previous_quantity and carry_forward_date is null and carry_forward_quantity is null)
    or
    (requested_quantity < previous_quantity and carry_forward_date is not null and carry_forward_quantity is not null)
  )
);

create index if not exists delivery_adjustments_user_created_idx
on public.delivery_adjustments (user_id, created_at desc);

create index if not exists delivery_adjustments_plan_date_idx
on public.delivery_adjustments (plan_id, delivery_date);

alter table public.delivery_adjustments enable row level security;

revoke all on public.delivery_adjustments from anon, authenticated;
grant select on public.delivery_adjustments to authenticated;

drop policy if exists "Customers can read their delivery adjustments"
on public.delivery_adjustments;
create policy "Customers can read their delivery adjustments"
on public.delivery_adjustments
for select
to authenticated
using ((select auth.uid()) = user_id);

comment on table public.delivery_adjustments is
'Audit trail for paid increases and next-day carry-forward reductions on active plans.';
