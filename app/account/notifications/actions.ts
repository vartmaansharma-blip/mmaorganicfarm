"use server";

import { createClient } from "@/lib/supabase/server";
import { todayInIndia } from "@/lib/delivery-calendar";
import {
  deliveryNoticeKinds, notificationFilters, paymentNoticeKinds, uuidPattern,
  type CustomerNotification, type NotificationFilter,
} from "@/lib/customer-notifications";

const fields = "id,kind,title,message,order_id,delivery_id,created_at,read_at";
const pageSize = 20;

function decodeCursor(value: string | null) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,120}$/.test(value)) return null;
  const [created, id, extra] = Buffer.from(value, "base64url").toString().split("|");
  if (extra || !id || !uuidPattern.test(id)) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(created) || !Number.isFinite(Date.parse(created))) return null;
  return { created, id };
}

export async function loadCustomerNotifications(mode: "count" | "preview" | "inbox", filter: NotificationFilter = "all", before: string | null = null) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError && (authError.name === "AuthRetryableFetchError" || authError.status === 429 || (authError.status ?? 0) >= 500)) {
    return { status: "error" as const, message: "Notifications couldn’t be loaded. Try again." };
  }
  if (!user || user.is_anonymous) return { status: "signed-out" as const };
  if (!["count", "preview", "inbox"].includes(mode) || !notificationFilters.some(value => value.key === filter)) {
    return { status: "error" as const, message: "Choose a valid notification view." };
  }
  const cursor = decodeCursor(before);
  if (before && !cursor) return { status: "error" as const, message: "This notification page is unavailable." };

  let query = supabase.from("customer_notifications").select(fields)
    .eq("user_id", user.id).order("created_at", { ascending: false }).order("id", { ascending: false });
  if (filter === "deliveries") query = query.in("kind", deliveryNoticeKinds);
  if (filter === "payments") query = query.in("kind", paymentNoticeKinds);
  if (cursor) query = query.or(`created_at.lt.${cursor.created},and(created_at.eq.${cursor.created},id.lt.${cursor.id})`);

  // Historical alerts can remain unread after resolution. Use live order state
  // for actionable payments and leave ordinary delivery notices in the inbox.
  const [unread, page, pending] = await Promise.all([
    supabase.from("customer_notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null),
    mode === "count" || filter === "attention" ? Promise.resolve({ data: [], error: null }) : query.limit(mode === "preview" ? 5 : pageSize + 1),
    mode === "inbox" && filter === "attention"
      ? supabase.from("orders").select("id").eq("user_id", user.id).eq("is_test", false)
          .eq("status", "pending_payment").gte("start_date", todayInIndia()).limit(1)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (unread.error || page.error || pending.error) return { status: "error" as const, message: "Notifications couldn’t be loaded. Try again." };
  const rows = (page.data ?? []) as CustomerNotification[];
  const items = rows.slice(0, pageSize);
  const last = items.at(-1);
  const next = last && rows.length > pageSize ? Buffer.from(`${last.created_at}|${last.id}`).toString("base64url") : null;
  return { status: "ok" as const, unread: unread.count ?? 0, items, next, pendingPayment: Boolean(pending.data?.length) };
}

export async function readCustomerNotifications(id: string | null) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) return { error: "Sign in to update your notifications." };
  if (id !== null && (typeof id !== "string" || !uuidPattern.test(id))) return { error: "Choose a valid notification." };

  let query = supabase.from("customer_notifications").update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id).is("read_at", null);
  if (id !== null) query = query.eq("id", id);
  const { error } = await query;
  return error ? { error: "The read status couldn’t be saved. Try again." } : { ok: true };
}
