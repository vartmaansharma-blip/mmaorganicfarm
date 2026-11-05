"use server";
import { CHECKOUT_ID, combinedSelection, deliveryOrderValues, oneTimeSelection, scheduledSelection } from "@/lib/delivery-details";
import { readProductCatalogue } from "@/lib/product-prices-server";
import { priceInPaise } from "@/lib/product-prices";

import {
  parseRoutines,
  quoteMonthlySchedule,
  routinePrice,
} from "@/lib/monthly-schedule";
import { shopProduct } from "@/lib/shop-products";
import { orderReturnPath } from "@/lib/shop-draft";
import { databaseErrorMessage } from "@/lib/database-errors";
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
  type BottleChoice,
} from "@/lib/order-pricing";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, hasSupabaseAdminConfig } from "@/lib/supabase/admin";

function baseOrderUrl(
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
  const nextPlan = String(formData.get("nextPlan") ?? "");
  const checkout = String(formData.get("checkout") ?? "");
  if (nextPlan.length > 1200 || (checkout && !nextPlan)) redirect("/shop");
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
        "nextPlan",
        "combineWith",
        "checkout",
      ].map((key) => [key, String(formData.get(key) ?? "")]),
    );
    redirect(
      `/sign-in?next=${encodeURIComponent(orderReturnPath(choices))}&message=Sign+in+to+continue+your+order.`,
    );
  }

  const rawCombineWith = String(formData.get("combineWith") ?? "");
  const combineWith = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawCombineWith)
    ? rawCombineWith : "";
  const orderUrl = (...args: Parameters<typeof baseOrderUrl>) => {
    const url = new URL(baseOrderUrl(...args), "https://mma.invalid");
    if (nextPlan) url.searchParams.set("nextPlan", nextPlan);
    if (CHECKOUT_ID.test(checkout)) url.searchParams.set("checkout", checkout);
    if (combineWith) url.searchParams.set("combineWith", combineWith);
    return `${url.pathname}${url.search}`;
  };

  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  const address = String(formData.get("address") ?? "").trim();
  const rawPurchase = String(formData.get("purchase") ?? "");
  const purchase = rawPurchase === "plan" ? "plan" : "once";
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
  const bottle: BottleChoice = (
    monthlyRules ? !monthlyRules.some((r) => r.id === "milk") : milkLitres === 0
  )
    ? "none"
    : "return";
  const { prices, revision } = await readProductCatalogue();
  const selectedProducts = parseFarmProductSelections(
    String(formData.get("extras") ?? ""), prices,
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
    purchase === "plan" || nextPlan
      ? await firstScheduledPlanStart(supabase, user.id)
      : null;
  const choices = {
    purchase: rawPurchase,
    start: String(formData.get("start") ?? ""),
    milk: String(formData.get("milk") ?? "0"),
    extras: String(formData.get("extras") ?? ""),
    routine,
    schedule,
  };
  const basket = nextPlan
    ? combinedSelection(choices, nextPlan, prices, minimumStartDate, firstPlanStart)
    : null;
  if (nextPlan && (!basket || rawCombineWith || !CHECKOUT_ID.test(checkout)
    || String(formData.get("catalogueRevision")) !== revision
    || String(formData.get("quotedTotal")) !== String(basket.totalPaise))) {
    const message = !basket || rawCombineWith
      ? "Some selected products or delivery dates need review. Open your cart to check both selections."
      : "Review the current basket and total before continuing.";
    const url = new URL(orderReturnPath({ ...choices, nextPlan, checkout }), "https://mma.invalid");
    url.searchParams.set("error", message);
    redirect(`${url.pathname}${url.search}`);
  }
  if (!nextPlan && (routine || (rawPurchase === "once" && choices.start))) {
    const selection = purchase === "plan"
      ? scheduledSelection(choices, prices, minimumStartDate, firstPlanStart)
      : oneTimeSelection(choices, prices, minimumStartDate);
    if (!selection) {
      const url = new URL(orderReturnPath({ ...choices, combineWith }), "https://mma.invalid");
      url.searchParams.set("error", "Some selected items or delivery dates need review. Open your cart to check the selection.");
      redirect(`${url.pathname}${url.search}`);
    }
  }
  const monthlyQuote = monthlyRules
    ? quoteMonthlySchedule({ prices,
        start,
        rules: monthlyRules,
        bottleChoice: bottle,
        firstPlanStart: firstPlanStart ?? start,
      })
    : null;
  const pricing = monthlyQuote ?? (purchase === "plan" && weeklySchedule
      ? calculatePlanPricing({ prices,
          bottleChoice: bottle,
          products: selectedProducts,
          schedule: weeklySchedule,
          startDate: start,
          firstPlanStart: firstPlanStart ?? start,
        })
      : calculateOrderPricing({ prices,
          bottleChoice: bottle,
          milkLitres: effectiveMilkLitres,
          products: selectedProducts,
        }));
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

  if (address.length < 8 || address.length > 500) {
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
    .select("address_line,full_name")
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
      full_name: currentProfile?.full_name ?? fullName,
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

  if (basket) {
    if (!hasSupabaseAdminConfig()) {
      redirect(orderUrl("error", "Combined checkout is temporarily unavailable. Your selections are saved in your cart.", purchase, bottle, milk, extras, schedule, start, routine));
    }
    const once = basket.once;
    const plan = basket.scheduled;
    const contact = `+91${phone}`;
    const { data: batchId, error: batchError } = await createAdminClient().rpc("prepare_unified_checkout", {
      p_user_id: user.id, p_checkout_id: checkout, p_catalogue_revision: revision,
      p_once: deliveryOrderValues(once.pricing, once.bottle, once.start, address, contact),
      p_once_items: once.lines,
      p_plan: deliveryOrderValues(plan.pricing, plan.bottle, plan.start, address, contact),
      p_plan_items: plan.lines,
      p_rules: plan.rules,
    });
    if (batchError || !batchId) {
      const message = batchError?.message ?? "";
      const reason = /current paid plan/.test(message)
        ? "You already have a prepaid plan. Manage it from My M’ma before starting another."
        : /payment checkout is already in progress/.test(message)
          ? "You have a checkout in progress. Open My M’ma to review it before starting another."
          : /updated basket|prices changed/.test(message)
            ? "Your basket or prices changed. Open your cart and review both selections again."
            : "Your combined order could not be prepared. Please try again or review your saved cart.";
      redirect(orderUrl("error", databaseErrorMessage(batchError, reason), purchase, bottle, milk, extras, schedule, start, routine));
    }
    redirect(`/checkout/batch/review?batch=${batchId}`);
  }

  const orderValues = deliveryOrderValues(pricing, bottle, orderDeliveryDate, address, `+91${phone}`);

  const billedMilkLitres =
    purchase === "plan" ? pricing.milkLitres : effectiveMilkLitres;
  const orderItems = monthlyRules && monthlyQuote
    ? monthlyRules.map((rule) => {
        return {
          delivery_date: monthlyQuote.days.find((day) => day.items.some((item) => item.id === rule.id))!.date,
          frequency: "once",
          line_total_paise: priceInPaise(monthlyQuote.productTotals[rule.id]),
          product_key: rule.id,
          product_name: shopProduct(rule.id).name,
          quantity: monthlyQuote.quantities[rule.id],
          scheduled_days: [],
          unit: rule.id === "milk" ? "litre" : "500 g",
          unit_price_paise: priceInPaise(routinePrice(rule.id, prices)),
        };
      })
    : [
        ...(billedMilkLitres > 0
          ? [
              {
                delivery_date: orderDeliveryDate,
                frequency: purchase === "plan" ? "weekly" : "once",
                line_total_paise: priceInPaise(pricing.milkTotal),
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
                unit_price_paise: priceInPaise(prices.milk),
              },
            ]
          : []),
        ...selectedProducts.map((product) => ({
          delivery_date:
            product.frequency === "once" ? orderDeliveryDate : null,
          frequency: product.frequency,
          line_total_paise: priceInPaise((pricing.productTotals[product.id] ?? 0)),
          product_key: product.id,
          product_name: product.name,
          quantity: product.quantity,
          scheduled_days: product.days,
          unit: product.unit,
          unit_price_paise: priceInPaise(product.price),
        })),
      ];

  if (purchase === "plan" && combineWith) {
    if (!monthlyRules || !monthlyQuote || !hasSupabaseAdminConfig()) {
      redirect(orderUrl("error", "Return to your cart and review both selections.", purchase, bottle, milk, extras, schedule, start, routine));
    }
    const { data: batchId, error: batchError } = await createAdminClient()
      .rpc("prepare_combined_checkout", {
        p_user_id: user.id,
        p_once_order_id: combineWith,
        p_start_date: start,
        p_rules: monthlyRules,
        p_order: orderValues,
        p_items: orderItems,
      });
    if (batchError || !batchId) {
      redirect(orderUrl(
        "error",
        databaseErrorMessage(batchError, "Your combined checkout could not be prepared. Review your saved cart or try again."),
        purchase, bottle, milk, extras, schedule, start, routine,
      ));
    }
    redirect(`/checkout/batch/review?batch=${batchId}`);
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
          databaseErrorMessage(planError, "We could not save this plan. If you have a current plan or payment in progress, open your account first; otherwise please try again."),
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
      ...orderValues,
      currency: "INR",
      delivery_plan_id: deliveryPlanId,
      purchase_mode: purchase,
      status: "draft",
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

  const { error: itemsError } = await supabase
    .from("order_items")
    .insert(orderItems.map((item) => ({ ...item, order_id: order.id, user_id: user.id })));
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
