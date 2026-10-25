-- Synthetic, local PostgreSQL fixture. No real customers or provider transactions.
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema private;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
grant usage on schema auth,public to authenticated,anon,service_role;
grant execute on function auth.uid() to authenticated,anon,service_role;
create table auth.users(id uuid primary key);
create table public.delivery_plans(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id),status text not null default 'pending_confirmation',start_date date not null,bottle_choice text not null check(bottle_choice in ('new','return','none')),purchased_deliveries integer not null default 30 constraint delivery_plans_purchased_deliveries_check check(purchased_deliveries between 1 and 365),delivered_deliveries integer not null default 0 check(delivered_deliveries>=0),created_at timestamptz default now(),updated_at timestamptz default now(),check(delivered_deliveries<=purchased_deliveries),unique(id,user_id));
create unique index one_pending_delivery_plan_per_customer on public.delivery_plans(user_id) where status='pending_confirmation';
create table public.weekly_delivery_items(plan_id uuid,user_id uuid,product_key text,day_of_week smallint,quantity numeric,unit text,primary key(plan_id,product_key,day_of_week),foreign key(plan_id,user_id) references public.delivery_plans(id,user_id));
create table public.scheduled_delivery_items(plan_id uuid,user_id uuid,product_key text constraint scheduled_delivery_items_product_key_check check(product_key in ('paneer','ghee')),delivery_date date,quantity numeric check(quantity>0 and quantity<=5),unit text,primary key(plan_id,product_key,delivery_date),foreign key(plan_id,user_id) references public.delivery_plans(id,user_id));
create table public.delivery_exceptions(plan_id uuid,user_id uuid,product_key text,delivery_date date,action text,quantity numeric,unit text);
create table public.delivery_pauses(id uuid default gen_random_uuid(),plan_id uuid,user_id uuid,start_date date,end_date date);
create table public.orders(id uuid primary key default gen_random_uuid(),user_id uuid,delivery_plan_id uuid,purchase_mode text,status text,is_test boolean default false,start_date date,bottle_choice text,phone_snapshot text,address_snapshot text,razorpay_order_id text,updated_at timestamptz default now());
create table public.order_items(order_id uuid,product_key text,quantity numeric,frequency text,delivery_date date,unit text);
create table public.production_capacity(product_key text primary key,daily_limit numeric);
create table public.production_capacity_overrides(product_key text,delivery_date date,daily_limit numeric);
create table public.order_capacity_reservations(order_id uuid,product_key text,delivery_date date,quantity numeric,status text,expires_at timestamptz,updated_at timestamptz default now(),unique(order_id,product_key,delivery_date));
create table public.daily_deliveries(id uuid primary key default gen_random_uuid(),plan_id uuid,order_id uuid,user_id uuid,delivery_date date,status text default 'planned',visit_key text default 'visit',bottle_return_required boolean default false,bottle_choice text,delivery_area_id uuid,delivery_route_id uuid,route_stop_order integer,customer_name text,phone_snapshot text,address_snapshot text,generated_by uuid,assigned_driver_id uuid,delivery_confirmed boolean default false,bottle_returned boolean default false,delivered_confirmed_at timestamptz,bottle_returned_at timestamptz,checked_by uuid,driver_note text,completed_at timestamptz,updated_at timestamptz default now(),unique(plan_id,delivery_date));
create table public.daily_delivery_items(delivery_id uuid references public.daily_deliveries(id) on delete cascade,product_key text,quantity numeric,unit text);
create table public.farm_staff(user_id uuid,role text,active boolean);
create table public.customer_profiles(user_id uuid,full_name text,phone text,address_line text,landmark text,postal_code text,delivery_area_id uuid,delivery_route_id uuid,route_stop_order integer);
create table public.customer_notifications(user_id uuid,kind text,title text,message text,order_id uuid,delivery_id uuid);
do $$declare t text;begin foreach t in array array['delivery_plans','weekly_delivery_items','scheduled_delivery_items','delivery_exceptions','delivery_pauses'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('grant select,insert,update,delete on public.%I to authenticated',t);
 execute format('create policy owner on public.%I for all to authenticated using ((select auth.uid())=user_id) with check((select auth.uid())=user_id)',t);
end loop;end$$;

create table public.payments(order_id uuid,status text,is_test boolean default false);
