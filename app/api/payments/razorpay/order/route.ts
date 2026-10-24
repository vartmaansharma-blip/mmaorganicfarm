import { NextResponse } from "next/server";
import { quoteStoredMonthlyCheckout } from "@/lib/monthly-checkout";
import { quoteStoredCheckout } from "@/lib/checkout-quote";
import { firstScheduledPlanStart } from "@/lib/first-scheduled-plan";
import { parseWeeklyMilkSchedule } from "@/lib/milk-plan";
import {
  releaseOrderCapacity,
  reserveOrderCapacity,
} from "@/lib/production-capacity";
import {
  createRazorpayOrder,
  hasRazorpayConfig,
  publicRazorpayKey,
} from "@/lib/razorpay";
import {
  createAdminClient,
  hasSupabaseAdminConfig,
} from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json(
      { error: "Sign in to continue." },
      { status: 401 },
    );
  if (!hasRazorpayConfig() || !hasSupabaseAdminConfig())
    return NextResponse.json(
      { error: "Online payment is not enabled yet." },
      { status: 503 },
    );
  const body = (await request.json().catch(() => null)) as {
    orderId?: string;
    termsAccepted?: boolean;
  } | null;
  if (!body?.orderId || body.termsAccepted !== true)
    return NextResponse.json(
      { error: "Accept the order terms before payment." },
      { status: 400 },
    );
  const { data: order } = await supabase
    .from("orders")
    .select(
      "id,user_id,status,bottle_choice,purchase_mode,delivery_plan_id,start_date,total_paise,razorpay_order_id,phone_snapshot",
    )
    .eq("id", body.orderId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!order || !["draft", "pending_payment"].includes(order.status))
    return NextResponse.json(
      { error: "This order is not available for payment." },
      { status: 409 },
    );
  const { data: items } = await supabase
    .from("order_items")
    .select(
      "product_key,quantity,unit_price_paise,line_total_paise,frequency,scheduled_days",
    )
    .eq("order_id", order.id)
    .eq("user_id", user.id);
  if (!items?.length)
    return NextResponse.json(
      { error: "This order has no items." },
      { status: 400 },
    );
  let amount: number;
  let monthlyRules: unknown;
  try {
    let plan;
    let monthly;
    if (order.purchase_mode === "plan") {
      const { data: saved, error } = await supabase
        .from("delivery_plans")
        .select(
          "start_date,billing_model,period_end_exclusive,schedule_rules,scheduled_delivery_items(product_key,delivery_date,quantity),weekly_delivery_items(day_of_week,product_key,quantity)",
        )
        .eq("id", order.delivery_plan_id)
        .eq("user_id", user.id)
        .single();
      if (error || !saved || saved.start_date !== order.start_date)
        throw Error("Plan missing or date changed");
      if (saved.billing_model === "calendar_month") {
        monthly = saved;
        monthlyRules = saved.schedule_rules;
      } else {
        const quantities = new Map(
          saved.weekly_delivery_items
            .filter((x) => x.product_key === "milk")
            .map((x) => [x.day_of_week, Number(x.quantity)]),
        );
        const schedule = parseWeeklyMilkSchedule(
          Array.from({ length: 7 }, (_, i) => quantities.get(i + 1) ?? 0).join(
            ",",
          ),
        );
        if (!schedule) throw Error("Invalid plan");
        plan = {
          schedule,
          startDate: saved.start_date,
          firstPlanStart:
            (await firstScheduledPlanStart(supabase, user.id)) ??
            saved.start_date,
        };
      }
    }
    const invoice = items.map((item) => ({
      ...item,
      quantity: Number(item.quantity),
      unit_price_paise: Number(item.unit_price_paise),
      line_total_paise: Number(item.line_total_paise),
      scheduled_days: item.scheduled_days ?? [],
    }));
    const quote = monthly
      ? quoteStoredMonthlyCheckout(
          invoice,
          order.bottle_choice,
          monthly,
          monthly.scheduled_delivery_items.map((x) => ({
            ...x,
            quantity: Number(x.quantity),
          })),
          (await firstScheduledPlanStart(supabase, user.id)) ??
            monthly.start_date,
        )
      : quoteStoredCheckout(
          invoice,
          order.bottle_choice,
          order.purchase_mode,
          plan,
        );
    amount = Math.round(quote.total * 100);
  } catch {
    return NextResponse.json(
      {
        error:
          "This order could not be priced safely. Review your selection before payment.",
      },
      { status: 400 },
    );
  }
  if (amount !== order.total_paise)
    return NextResponse.json(
      { error: "The order total changed. Review it again." },
      { status: 409 },
    );
  try {
    await reserveOrderCapacity(order.id);
    if (monthlyRules) {
      const { error } = await createAdminClient().rpc(
        "claim_monthly_checkout",
        { p_order_id: order.id, p_expected_rules: monthlyRules },
      );
      if (error)
        throw new Error(
          "This selection changed or payment is already being prepared. Review your order before trying again.",
        );
    }
    let providerOrderId = order.razorpay_order_id;
    if (!providerOrderId)
      providerOrderId = (
        await createRazorpayOrder({
          amount,
          receipt: `mma_${order.id.replaceAll("-", "").slice(0, 32)}`,
        })
      ).id;
    const acceptedAt = new Date().toISOString();
    const { error } = await createAdminClient()
      .from("orders")
      .update({
        razorpay_order_id: providerOrderId,
        status: "pending_payment",
        terms_accepted_at: acceptedAt,
        updated_at: acceptedAt,
      })
      .eq("id", order.id)
      .eq("user_id", user.id);
    if (error) throw new Error("Payment could not be prepared.");
    return NextResponse.json({
      amount,
      keyId: publicRazorpayKey(),
      providerOrderId,
      prefill: {
        contact: order.phone_snapshot,
        email: user.email ?? "",
        name:
          user.user_metadata.full_name ?? user.user_metadata.name ?? "Customer",
      },
    });
  } catch (error) {
    await releaseOrderCapacity(order.id);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Payment could not be prepared.",
      },
      { status: 409 },
    );
  }
}
