begin;

-- Customers may mark their own messages as read. The original RLS policies
-- continue to govern row ownership. Only trusted producers can edit content.
revoke update on table public.customer_notifications from public, anon, authenticated;
grant update (read_at) on table public.customer_notifications to authenticated;

create index if not exists customer_notifications_user_cursor_idx
  on public.customer_notifications (user_id, created_at desc, id desc);

commit;
