-- Delivery preparation requires at least one day's notice.
create or replace function public.enforce_next_day_delivery_start()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_earliest_start date := ((now() at time zone 'Asia/Kolkata')::date + 1);
begin
  if new.status = 'pending_confirmation'
    and new.start_date < v_earliest_start
  then
    raise exception 'Delivery plans can begin from tomorrow';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_next_day_delivery_start
on public.delivery_plans;

create trigger enforce_next_day_delivery_start
before insert or update of start_date, status
on public.delivery_plans
for each row
execute function public.enforce_next_day_delivery_start();
