"use server";

import {
  parseRoutines,
  quoteMonthlySchedule,
  routinePrice,
} from "@/lib/monthly-schedule";
import { shopProduct } from "@/lib/shop-products";
import { orderReturnPath } from "@/lib/shop-draft";
import { firstScheduledPlanStart } from "@/lib/first-scheduled-plan";
import { redirect } from "next/navigation";
import {
  parseFarmProductSelections,
  serializeFarmProductSelections,
} from "@/lib/farm-products";
import {
  normalizePlanStartDate,
  parseWeeklyMilkSchedule,
} from "@/lib/milk-plan";
import { nextDeliveryDateInIndia } from "@/lib/delivery-calendar";
import {
  calculateOrderPricing,
  calculatePlanPricing,
  MILK_PRICE_PER_LITRE,
  type BottleChoice,
} from "@/lib/order-pricing";
import { createClient } from "@/lib/supabase/server";

function orderUrl(
  type: "error" | "message",
  message: string,
  purchase: string,
  bottle: string,
  milk: string,
  extras: string,
  schedule: string,
  start: string,
  routine = "",
) {
  const params = new URLSearchParams({
    [type]: message,
    purchase,
    bottle,
    milk,
  });
  if (extras) params.set("extras", extras);
  if (schedule) params.set("schedule", schedule);
  if (start) params.set("start", start);
  if (routine) params.set("routine", routine);
  return `/order?${params.toString()}`;
}

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 12 && digits.startsWith("91")
    ? digits.slice(2)
    : digits;
}

export async function saveDeliveryDetails(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const choices = Object.fromEntries(
      [
        "purchase",
        "bottle",
        "milk",
        "extras",
        "schedule",
        "start",
        "routine",
      ].map((key) => [key, String(formData.get(key) ?? "")]),
    );
    redirect(
      `/sign-in?next=${encodeURIComponent(orderReturnPath(choices))}&message=Sign+in+to+continue+your+order.`,
    );
  }

  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  const address = String(formData.get("address") ?? "").trim();
  const purchase = formData.get("purchase") === "plan" ? "plan" : "once";
  const parsedMilk = Number(formData.get("milk"));
  const maximumMilk = purchase === "plan" ? 35 : 5;
  const milkLitres =
    Number.isInteger(parsedMilk) && parsedMilk >= 0 && parsedMilk <= maximumMilk
      ? parsedMilk
      : purchase === "plan"
        ? 1
        : 0;
  const milk = String(milkLitres);
  const routine = String(formData.get("routine") ?? "");
  const monthlyRules =
    purchase === "plan" && routine
      ? parseRoutines(String(formData.get("start") ?? ""), routine)
      : null;
  const requestedBottle = String(formData.get("bottle") ?? "return");
  const bottle: BottleChoice = (
    monthlyRules ? !monthlyRules.some((r) => r.id === "milk") : milkLitres === 0
  )
    ? "none"
    : requestedBottle === "new"
      ? "new"
      : "return";
  const selectedProducts = parseFarmProductSelections(
    String(formData.get("extras") ?? ""),
  );
  const extras = serializeFarmProductSelections(selectedProducts);
  const schedule = String(formData.get("schedule") ?? "");
  const weeklySchedule = parseWeeklyMilkSchedule(schedule);
  const start = normalizePlanStartDate(String(formData.get("start") ?? ""));
  const minimumStartDate = nextDeliveryDateInIndia();
  const effectiveMilkLitres =
    purchase === "plan" && weeklySchedule
      ? weeklySchedule.reduce((total, litres) => total + litres, 0)
      : milkLitres;
  const firstPlanStart =
    purchase === "plan"
      ? await firstScheduledPlanStart(supabase, user.id)
      : null;
  const pricing = monthlyRules
    ? quoteMonthlySchedule({
        start,
        rules: monthlyRules,
        bottleChoice: bottle,
        firstPlanStart: firstPlanStart ?? start,
      })
    : purchase === "plan" && weeklySchedule
      ? calculatePlanPricing({
          bottleChoice: bottle,
          products: selectedProducts,
          schedule: weeklySchedule,
          startDate: start,
          firstPlanStart: firstPlanStart ?? start,
        })
      : calculateOrderPricing({
          bottleChoice: bottle,
          milkLitres: effectiveMilkLitres,
          products: selectedProducts,
        });
  const orderDeliveryDate =
    purchase === "plan"
      ? start
      : start && start >= minimumStartDate
        ? start
        : minimumStartDate;

  if (
    purchase === "plan" &&
    ((routine ? !monthlyRules : !weeklySchedule) ||
      !start ||
      start < minimumStartDate ||
      (!routine && weeklySchedule?.every((litres) => litres === 0)) ||
      selectedProducts.some(
        (product) =>
          product.frequency === "weekly" && product.days.length === 0,
      ))
  ) {
    redirect(
      orderUrl(
        "error",
        start && start < minimumStartDate
          ? "Delivery plans can begin from tomorrow. Choose a later start date."
          : "Return to products and complete your delivery calendar.",
        purchase,
        bottle,
        milk,
        extras,
        schedule,
        start,
        routine,
      ),
    );
  }

  if (!monthlyRules && milkLitres === 0 && selectedProducts.length === 0) {
    redirect(
      orderUrl(
        "error",
        "Choose milk or at least one farm product.",
        purchase,
        bottle,
        milk,
        extras,
        schedule,
        start,
        routine,
      ),
    );
  }

  if (phone.length !== 10) {
    redirect(
      orderUrl(
        "error",
        "Enter a valid 10-digit mobile number.",
        purchase,
        bottle,
        milk,
        extras,
        schedule,
        start,
        routine,
      ),
    );
  }

  if (address.length < 8) {
    redirect(
      orderUrl(
        "error",
        "Enter your complete delivery address.",
        purchase,
        bottle,
        milk,
        extras,
        schedule,
        start,
        routine,
      ),
    );
  }

  const fullName =
    user.user_metadata.full_name ?? user.user_metadata.name ?? "Customer";
  const { data: currentProfile, error: profileReadError } = await supabase
    .from("customer_profiles")
    .select("address_line")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profileReadError) {
    redirect(
      orderUrl(
        "error",
        "We could not check your delivery route. Please try again.",
        purchase,
        bottle,
        milk,
        extras,
        schedule,
        start,
        routine,
      ),
    );
  }
  const addressChanged =
    (currentProfile?.address_line ?? "").trim().toLowerCase() !==
    address.toLowerCase();
  const { error } = await supabase.from("customer_profiles").upsert(
    {
      user_id: user.id,
      full_name: fullName,
      email: user.email ?? null,
      avatar_url:
        user.user_metadata.avatar_url ?? user.user_metadata.picture ?? null,
      phone: `+91${phone}`,
      address_line: address,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    redirect(
      orderUrl(
        "error",
        "We could not save your details. Please try again.",
        purchase,
        bottle,
        milk,
        extras,
        schedule,
        start,
        routine,
      ),
    );
  }

  const { error: routeError } = await supabase.rpc("refresh_customer_route", {
    p_force_reroute: addressChanged,
    p_user_id: user.id,
  });
  if (routeError) {
    redirect(
      orderUrl(
        "error",
        "Your details were saved, but the farm route could not be refreshed.",
        purchase,
        bottle,
        milk,
        extras,
        schedule,
        start,
        routine,
      ),
    );
  }

  let deliveryPlanId: string | null = null;
  if (monthlyRules) {
    const { data: planId, error: planError } = await supabase.rpc(
      "save_pending_monthly_plan",
      { p_start_date: start, p_bottle_choice: bottle, p_rules: monthlyRules },
    );
    if (planError || !planId) {
      console.error("Unable to save monthly plan", planError?.message);
      redirect(
        orderUrl(
          "error",
          "We could not save this plan. If you have a current plan or payment in progress, open your account first; otherwise please try again.",
          purchase,
          bottle,
          milk,
          extras,
          schedule,
          start,
          routine,
        ),
      );
    }
    deliveryPlanId = planId;
  } else if (purchase === "plan" && weeklySchedule) {
    const { data: currentPlan, error: currentPlanError } = await supabase
      .from("delivery_plans")
      .select("id")
      .eq("user_id", user.id)
      .in("status", ["active", "paused"])
      .limit(1)
      .maybeSingle();
    if (currentPlanError) {
      redirect(
        orderUrl(
          "error",
          "We could not check your current plan. Please try again.",
          purchase,
          bottle,
          milk,
          extras,
          schedule,
          start,
          routine,
        ),
      );
    }
    if (currentPlan) {
      redirect(
        orderUrl(
          "error",
          "You already have an active milk plan. Edit its schedule from your delivery calendar instead.",
          purchase,
          bottle,
          milk,
          extras,
          schedule,
          start,
          routine,
        ),
      );
    }

    const scheduledAddOns = selectedProducts.flatMap((product) =>
      product.frequency === "weekly"
        ? product.days.map((day) => ({
            day_of_week: day,
            frequency: "weekly",
            product_key: product.id,
            quantity: product.quantity,
          }))
        : [
            {
              frequency: "once",
              product_key: product.id,
              quantity: product.quantity,
            },
          ],
    );
    const { data: planId, error: planError } = await supabase.rpc(
      "save_pending_delivery_plan",
      {
        p_add_ons: scheduledAddOns,
        p_bottle_choice: bottle,
        p_schedule: weeklySchedule,
        p_start_date: start,
      },
    );

    if (planError) {
      console.error("Unable to save weekly milk plan", planError.message);
      redirect(
        orderUrl(
          "error",
          "We saved your delivery details but could not save the weekly plan. Please try again.",
          purchase,
          bottle,
          milk,
          extras,
          schedule,
          start,
          routine,
        ),
      );
    }
    deliveryPlanId = planId;
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      address_snapshot: address,
      bottle_charge_paise: pricing.bottleCharge * 100,
      bottle_choice: bottle,
      currency: "INR",
      delivery_plan_id: deliveryPlanId,
      milk_litres: pricing.milkLitres,
      phone_snapshot: `+91${phone}`,
      purchase_mode: purchase,
      start_date: orderDeliveryDate,
      status: "draft",
      subtotal_paise:
        (pricing.total - pricing.bottleCharge - pricing.deliveryCharge) * 100,
      total_paise: pricing.total * 100,
      user_id: user.id,
    })
    .select("id")
    .single();
  if (orderError || !order)
    redirect(
      orderUrl(
        "error",
        "We saved your details but could not prepare checkout. Please try again.",
        purchase,
        bottle,
        milk,
        extras,
        schedule,
        start,
        routine,
      ),
    );

  const billedMilkLitres =
    purchase === "plan" ? pricing.milkLitres : effectiveMilkLitres;
  const orderItems = monthlyRules
    ? monthlyRules.map((rule) => {
        const q = quoteMonthlySchedule({ start, rules: monthlyRules });
        return {
          delivery_date: start,
          frequency: "once",
          line_total_paise: q.productTotals[rule.id] * 100,
          order_id: order.id,
          product_key: rule.id,
          product_name: shopProduct(rule.id).name,
          quantity: q.quantities[rule.id],
          scheduled_days: [],
          unit: rule.id === "milk" ? "litre" : "500 g",
          unit_price_paise: routinePrice(rule.id) * 100,
          user_id: user.id,
        };
      })
    : [
        ...(billedMilkLitres > 0
          ? [
              {
                delivery_date: orderDeliveryDate,
                frequency: purchase === "plan" ? "weekly" : "once",
                line_total_paise: pricing.milkTotal * 100,
                order_id: order.id,
                product_key: "milk",
                product_name: "Fresh farm milk",
                quantity: billedMilkLitres,
                scheduled_days:
                  purchase === "plan" && weeklySchedule
                    ? weeklySchedule.flatMap((litres, index) =>
                        litres > 0 ? [index + 1] : [],
                      )
                    : [],
                unit: purchase === "plan" ? "litres / 30 deliveries" : "litre",
                unit_price_paise: MILK_PRICE_PER_LITRE * 100,
                user_id: user.id,
              },
            ]
          : []),
        ...selectedProducts.map((product) => ({
          delivery_date:
            product.frequency === "once" ? orderDeliveryDate : null,
          frequency: product.frequency,
          line_total_paise: (pricing.productTotals[product.id] ?? 0) * 100,
          order_id: order.id,
          product_key: product.id,
          product_name: product.name,
          quantity: product.quantity,
          scheduled_days: product.days,
          unit: product.unit,
          unit_price_paise: product.price * 100,
          user_id: user.id,
        })),
      ];
  const { error: itemsError } = await supabase
    .from("order_items")
    .insert(orderItems);
  if (itemsError)
    redirect(
      orderUrl(
        "error",
        "We could not prepare your order summary. Please try again.",
        purchase,
        bottle,
        milk,
        extras,
        schedule,
        start,
        routine,
      ),
    );
  redirect(`/checkout/review?order=${order.id}`);
}
