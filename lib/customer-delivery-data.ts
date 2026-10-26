import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildCustomerDeliverySnapshot, indiaDate, type CustomerPlan, type CustomerOrder, type DeliveryRecord, type DeliveryHistory } from "./customer-delivery";

export async function loadCustomerDelivery(supabase: SupabaseClient, userId: string) {
  const now = new Date();
  const today = indiaDate(now);
  const end = new Date(`${today}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 60);
  const through = end.toISOString().slice(0, 10);
  const [plans, orders, deliveries, history] = await Promise.all([
    supabase.from("delivery_plans").select("id,status,start_date,billing_model,period_end_exclusive,purchased_deliveries,delivered_deliveries,weekly_delivery_items(day_of_week,product_key,quantity,unit),scheduled_delivery_items(delivery_date,product_key,quantity,unit),delivery_exceptions(delivery_date,product_key,action,quantity,unit),delivery_pauses(start_date,end_date)").eq("user_id", userId).in("status", ["active", "paused", "pending_confirmation"]).limit(1000),
    supabase.from("orders").select("id,status,purchase_mode,start_date,order_items(product_key,quantity,unit)").eq("user_id", userId).in("status", ["paid", "draft", "pending_payment", "payment_failed"]).gte("start_date", today).lte("start_date", through).limit(1000),
    supabase.from("daily_deliveries").select("id,plan_id,order_id,delivery_date,visit_key,status,updated_at,delivery_confirmed,delivered_confirmed_at,replacement_of_delivery_id,fulfilment_root_id,daily_delivery_items(product_key,quantity,unit,fulfilled_quantity)").eq("user_id", userId).eq("is_test", false).gte("delivery_date", today).lte("delivery_date", through).limit(1000),
    // Optional historical context only. Today's status always comes from date-filtered owned rows above.
    supabase.rpc("get_customer_delivery_outcomes", { p_user_id: userId, p_limit: 50 }),
  ]);
  if (plans.error || orders.error || deliveries.error || [plans, orders, deliveries].some(r => (r.data?.length ?? 0) >= 1000)) throw new Error("Delivery updates are temporarily unavailable");
  return buildCustomerDeliverySnapshot({ plans: (plans.data ?? []) as CustomerPlan[], orders: (orders.data ?? []) as CustomerOrder[], records: (deliveries.data ?? []) as DeliveryRecord[], history: history.error ? [] : (history.data ?? []) as DeliveryHistory[], now });
}
