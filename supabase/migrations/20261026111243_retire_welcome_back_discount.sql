-- The user was explicitly asked whether to disable coupon generation and
-- redemption while preserving all financial records. Their answer was:
-- "do what is good". Given their stated low dairy margins, retire the unused
-- discount and retain the invitation. No data rows are modified.
begin;

-- Discount cancelled by the farm owner before launch. Keep the migration/audit
-- history, but remove every issuance and redemption path.
drop trigger if exists issue_welcome_back_offer on public.cancellation_requests;
revoke all on function private.my_welcome_back_offer() from public,anon,authenticated,service_role;
revoke all on function private.apply_my_checkout_code(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.apply_my_checkout_code(uuid,text) from public,anon,authenticated,service_role;

create or replace function public.my_welcome_back_offer()
returns jsonb language sql security invoker set search_path='' as $$ select null::jsonb; $$;

-- Read-only production checks confirmed zero issued codes and zero discounted
-- orders. This retirement changes only executable feature paths. It performs
-- no INSERT, UPDATE, DELETE, table/column DROP, or financial data rewrite.
-- The owner chose to omit discounts because dairy margins are low and retain
-- the WhatsApp invitation. All permission/trigger changes are reversible.

create or replace function private.guard_checkout_discount()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.discount_code is not null or new.discount_paise<>0 then
    raise exception 'Discount offers are not available';
  end if;
  return new;
end;$$;

notify pgrst,'reload schema';
commit;
