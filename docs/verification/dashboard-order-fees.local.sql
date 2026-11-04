-- Local verification draft. Deploy only after the production database change is approved.
alter table public.orders
  add column handling_fee_paise integer not null default 0 check (handling_fee_paise >= 0),
  add column platform_fee_paise integer not null default 0 check (platform_fee_paise >= 0);

create or replace function private.update_farm_prices(p_prices jsonb,p_reason text,p_expected_revision uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_catalog public.farm_catalog_prices%rowtype;v_revision uuid;
begin
  if auth.uid() is null or not exists(select 1 from public.farm_staff where user_id=auth.uid() and active and role='admin') then
    raise exception 'Owner access is required to change prices' using errcode='42501';end if;
  if char_length(btrim(coalesce(p_reason,''))) not between 3 and 300 then raise exception 'Add a short reason for the price change';end if;
  if jsonb_typeof(p_prices) is distinct from 'object' or not (p_prices ?& array['milk','paneer','ghee','bottle'])
     or (select count(*) from jsonb_object_keys(p_prices)) not in (4,8)
     or exists (
       select 1 from jsonb_each(p_prices) x
       where key not in ('milk','paneer','ghee','bottle','delivery_once','delivery_scheduled','handling','platform')
          or case when jsonb_typeof(value) <> 'number' or value::text !~ '^[0-9]+$' then true
             else value::text::numeric not between
               (case when key in ('milk','paneer','ghee','bottle') then 1 else 0 end) and 10000000
             end
     ) then raise exception 'Enter positive prices and non-negative fees with at most two decimal places';end if;
  select * into v_catalog from public.farm_catalog_prices where singleton for update;
  if v_catalog.revision is distinct from p_expected_revision then raise exception 'Prices changed while you were editing. Review the current prices and try again.';end if;
  p_prices := v_catalog.prices || p_prices;
  if v_catalog.prices=p_prices then return v_catalog.revision;end if;
  insert into private.catalog_price_revisions(prices,changed_by,reason) values(p_prices,auth.uid(),btrim(p_reason)) returning id into v_revision;
  update public.farm_catalog_prices set prices=p_prices,revision=v_revision,updated_at=now() where singleton;
  insert into public.farm_change_log(actor_id,record_type,record_id,action,reason,before_state,after_state)
    values(auth.uid(),'catalogue','farm','update_prices',btrim(p_reason),v_catalog.prices,p_prices);
  return v_revision;
end;$$;
