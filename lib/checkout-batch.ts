import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { quoteStoredCheckout, type StoredCheckoutItem } from "./checkout-quote";
import { quoteStoredMonthlyCheckout } from "./monthly-checkout";
import { readOrderProductPrices } from "./product-prices-server";
import { firstScheduledPlanStart } from "./first-scheduled-plan";

type Batch = {
  id: string;
  user_id: string;
  once_order_id: string;
  plan_order_id: string;
  amount_paise: number;
  is_test: boolean;
  status: string;
  provider_order_id: string | null;
};

async function readOrder(client: SupabaseClient, id: string, userId: string) {
  const { data: order, error } = await client.from("orders")
    .select("id,user_id,status,purchase_mode,delivery_plan_id,start_date,bottle_choice,total_paise,discount_code,discount_paise,razorpay_order_id,is_test,phone_snapshot")
    .eq("id", id).eq("user_id", userId).single();
  if (error || !order) throw new Error("A selected order could not be found.");
  const { data: items, error: itemsError } = await client.from("order_items")
    .select("product_key,quantity,unit_price_paise,line_total_paise,frequency,scheduled_days")
    .eq("order_id", id).eq("user_id", userId);
  if (itemsError || !items?.length) throw new Error("A selected order has no items.");
  const invoice: StoredCheckoutItem[] = items.map((item) => ({
    ...item,
    quantity: Number(item.quantity),
    unit_price_paise: Number(item.unit_price_paise),
    line_total_paise: Number(item.line_total_paise),
    scheduled_days: item.scheduled_days ?? [],
  }));
  return { order, invoice };
}

export async function quoteCheckoutBatch(client: SupabaseClient, batch: Batch) {
  const [{ order: once, invoice: onceItems }, { order: plan, invoice: planItems }] = await Promise.all([
    readOrder(client, batch.once_order_id, batch.user_id),
    readOrder(client, batch.plan_order_id, batch.user_id),
  ]);
  if (once.purchase_mode !== "once" || once.delivery_plan_id
    || plan.purchase_mode !== "plan" || !plan.delivery_plan_id
    || once.is_test !== batch.is_test || plan.is_test !== batch.is_test
    || once.razorpay_order_id || plan.razorpay_order_id
    || once.discount_paise || plan.discount_paise
    || once.discount_code || plan.discount_code)
    throw new Error("Selected orders cannot be combined safely.");
  const { data: monthly, error: planError } = await client.from("delivery_plans")
    .select("id,user_id,status,start_date,billing_model,period_end_exclusive,schedule_rules,scheduled_delivery_items(product_key,delivery_date,quantity)")
    .eq("id", plan.delivery_plan_id).eq("user_id", batch.user_id).single();
  if (planError || !monthly || monthly.billing_model !== "calendar_month"
    || monthly.status !== "pending_confirmation" || monthly.start_date !== plan.start_date)
    throw new Error("The prepaid delivery plan changed.");
  const [oncePrices, planPrices, firstStart] = await Promise.all([
    readOrderProductPrices(client, once.id),
    readOrderProductPrices(client, plan.id),
    firstScheduledPlanStart(client, batch.user_id),
  ]);
  const onceQuote = quoteStoredCheckout(onceItems, once.bottle_choice, "once", undefined, oncePrices);
  const planQuote = quoteStoredMonthlyCheckout(
    planItems, plan.bottle_choice, monthly,
    monthly.scheduled_delivery_items.map((item) => ({ ...item, quantity: Number(item.quantity) })),
    firstStart ?? monthly.start_date, planPrices,
  );
  const onceAmount = Math.round(onceQuote.total * 100);
  const planAmount = Math.round(planQuote.total * 100);
  if (onceAmount !== once.total_paise || planAmount !== plan.total_paise
    || onceAmount + planAmount !== batch.amount_paise)
    throw new Error("The selected total changed. Review it before paying.");
  return { amount: batch.amount_paise, once, plan, planRules: monthly.schedule_rules };
}
