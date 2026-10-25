import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { validShopDate } from "@/lib/shop-draft";
export async function firstScheduledPlanStart(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
) {
  const [orders, legacy] = await Promise.all([
    supabase
      .from("orders")
      .select("start_date")
      .eq("user_id", userId)
      .eq("purchase_mode", "plan")
      .eq("status", "paid")
      .eq("is_test", false)
      .order("start_date", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("delivery_plans")
      .select("start_date")
      .eq("user_id", userId)
      .in("status", ["active", "paused", "completed"])
      .eq("is_test", false)
      .order("start_date", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  if (orders.error || legacy.error)
    throw new Error(
      "We could not verify your scheduled-delivery offer. Please try again.",
    );
  const dates = [orders.data?.start_date, legacy.data?.start_date]
    .filter(validShopDate)
    .sort();
  return dates[0] ?? null;
}
