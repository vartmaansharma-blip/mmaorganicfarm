"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { normalizePlanStartDate } from "@/lib/milk-plan";
import {
  addCalendarDays,
  nextDeliveryDateInIndia,
  weekdayFromYmd,
} from "@/lib/delivery-calendar";
import { FARM_PRODUCTS } from "@/lib/farm-products";
import {
  calculateOrderPricing,
  calculatePaidMilkAdjustment,
  MILK_PRICE_PER_LITRE,
} from "@/lib/order-pricing";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const productKeys = new Set(["milk", ...FARM_PRODUCTS.map((product) => product.id)]);

function calendarUrl(
  date: string,
  type: "error" | "message",
  message: string,
  planId?: string,
) {
  const params = new URLSearchParams({ date, [type]: message });
  if (planId) params.set("plan", planId);
  return `/calendar?${params.toString()}`;
}

async function getOwnedPlan(planId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/sign-in?next=%2Fcalendar");

  const { data: plan } = await supabase
    .from("delivery_plans")
    .select("id, user_id, start_date, bottle_choice")
    .eq("id", planId)
    .eq("user_id", user.id)
    .in("status", ["pending_confirmation", "active", "paused"])
    .maybeSingle();

  if (!plan) redirect("/milk");
  return { plan, supabase, user };
}

async function planMilkQuantity(planId: string, date: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("plan_product_quantity", {
    p_delivery_date: date,
    p_plan_id: planId,
    p_product_key: "milk",
  });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

async function startMilkIncreasePayment({
  currentQuantity,
  date,
  plan,
  requestedQuantity,
  userId,
}: {
  currentQuantity: number;
  date: string;
  plan: { bottle_choice: "new" | "none" | "return"; id: string };
  requestedQuantity: number;
  userId: string;
}) {
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("delivery_adjustments")
    .select("order_id")
    .eq("plan_id", plan.id)
    .eq("user_id", userId)
    .eq("delivery_date", date)
    .eq("requested_quantity", requestedQuantity)
    .eq("status", "pending_payment")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.order_id) redirect(`/checkout/review?order=${existing.order_id}`);

  const { data: profile } = await admin
    .from("customer_profiles")
    .select("phone, address_line")
    .eq("user_id", userId)
    .maybeSingle();
  if (!profile?.phone || !profile.address_line) {
    redirect(calendarUrl(date, "error", "Add your phone and address before changing paid milk.", plan.id));
  }

  const extraLitres = requestedQuantity - currentQuantity;
  const pricing = calculateOrderPricing({
    bottleChoice: plan.bottle_choice === "new" ? "new" : "return",
    milkLitres: extraLitres,
    products: [],
  });
  const { data: order, error: orderError } = await admin
    .from("orders")
    .insert({
      address_snapshot: profile.address_line,
      bottle_charge_paise: pricing.bottleCharge * 100,
      bottle_choice: plan.bottle_choice === "new" ? "new" : "return",
      currency: "INR",
      delivery_plan_id: plan.id,
      milk_litres: extraLitres,
      phone_snapshot: profile.phone,
      purchase_mode: "adjustment",
      start_date: date,
      status: "draft",
      subtotal_paise: pricing.milkTotal * 100,
      total_paise: pricing.total * 100,
      user_id: userId,
    })
    .select("id")
    .single();
  if (orderError || !order) {
    redirect(calendarUrl(date, "error", "We could not prepare the additional payment.", plan.id));
  }

  const { error: itemError } = await admin.from("order_items").insert({
    delivery_date: date,
    frequency: "once",
    line_total_paise: pricing.milkTotal * 100,
    order_id: order.id,
    product_key: "milk",
    product_name: "Additional fresh farm milk",
    quantity: extraLitres,
    scheduled_days: [],
    unit: "litre",
    unit_price_paise: MILK_PRICE_PER_LITRE * 100,
    user_id: userId,
  });
  const { error: adjustmentError } = await admin
    .from("delivery_adjustments")
    .insert({
      delivery_date: date,
      order_id: order.id,
      plan_id: plan.id,
      previous_quantity: currentQuantity,
      requested_quantity: requestedQuantity,
      status: "pending_payment",
      user_id: userId,
    });
  if (itemError || adjustmentError) {
    redirect(calendarUrl(date, "error", "We could not save this quantity change.", plan.id));
  }

  redirect(`/checkout/review?order=${order.id}`);
}

async function applyMilkReduction({
  currentQuantity,
  date,
  planId,
  requestedQuantity,
  supabase,
  userId,
}: {
  currentQuantity: number;
  date: string;
  planId: string;
  requestedQuantity: number;
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
}) {
  const adjustment = calculatePaidMilkAdjustment(
    currentQuantity,
    requestedQuantity,
  );
  const carryDate = addCalendarDays(date, 1);
  const nextQuantity = await planMilkQuantity(planId, carryDate);
  const carriedQuantity = nextQuantity + adjustment.carryForwardLitres;
  if (carriedQuantity > 5) {
    redirect(
      calendarUrl(
        date,
        "error",
        "The carried milk would exceed 5 L tomorrow. Choose a smaller reduction.",
        planId,
      ),
    );
  }

  const now = new Date().toISOString();
  const { error } = await supabase.from("delivery_exceptions").upsert(
    [
      {
        action: "override",
        delivery_date: date,
        plan_id: planId,
        product_key: "milk",
        quantity: requestedQuantity,
        unit: "litre",
        updated_at: now,
        user_id: userId,
      },
      {
        action: "override",
        delivery_date: carryDate,
        plan_id: planId,
        product_key: "milk",
        quantity: carriedQuantity,
        unit: "litre",
        updated_at: now,
        user_id: userId,
      },
    ],
    { onConflict: "plan_id,product_key,delivery_date" },
  );
  if (error) {
    redirect(calendarUrl(date, "error", "We could not carry the milk forward.", planId));
  }

  const admin = createAdminClient();
  await admin.from("delivery_adjustments").insert({
    carry_forward_date: carryDate,
    carry_forward_quantity: adjustment.carryForwardLitres,
    delivery_date: date,
    plan_id: planId,
    previous_quantity: currentQuantity,
    requested_quantity: requestedQuantity,
    status: "applied",
    user_id: userId,
  });

  revalidatePath("/calendar");
  revalidatePath("/account");
  redirect(
    calendarUrl(
      date,
      "message",
      `${adjustment.carryForwardLitres} L was moved to ${carryDate}. No refund was issued.`,
      planId,
    ),
  );
}

export async function saveDateChange(formData: FormData) {
  const planId = String(formData.get("plan_id") ?? "");
  const date = normalizePlanStartDate(String(formData.get("date") ?? ""));
  const productKey = String(formData.get("product_key") ?? "");
  const action = String(formData.get("change_action") ?? "normal");

  const minimumDate = nextDeliveryDateInIndia();
  if (!date || !productKeys.has(productKey) || date < minimumDate) {
    redirect(
      calendarUrl(
        date || minimumDate,
        "error",
        "Choose tomorrow or a later delivery date.",
        planId,
      ),
    );
  }

  const { plan, supabase, user } = await getOwnedPlan(planId);
  if (date < plan.start_date) {
    redirect(calendarUrl(date, "error", "This date is before your plan starts.", planId));
  }

  if (action === "normal") {
    const { error } = await supabase
      .from("delivery_exceptions")
      .delete()
      .eq("plan_id", plan.id)
      .eq("user_id", user.id)
      .eq("delivery_date", date)
      .eq("product_key", productKey);

    if (error) {
      redirect(calendarUrl(date, "error", "We could not restore this date.", planId));
    }
  } else {
    const quantity = Number(formData.get("quantity"));
    const isOverride = action === "override";
    if (
      !["skip", "override"].includes(action) ||
      (isOverride &&
        (!Number.isInteger(quantity) || quantity < 1 || quantity > 5)) ||
      (productKey !== "milk" && isOverride)
    ) {
      redirect(calendarUrl(date, "error", "Choose a valid date change.", planId));
    }

    if (productKey === "milk" && isOverride) {
      const currentQuantity = await planMilkQuantity(plan.id, date);
      if (quantity > currentQuantity) {
        await startMilkIncreasePayment({
          currentQuantity,
          date,
          plan,
          requestedQuantity: quantity,
          userId: user.id,
        });
      }
      if (quantity < currentQuantity) {
        await applyMilkReduction({
          currentQuantity,
          date,
          planId: plan.id,
          requestedQuantity: quantity,
          supabase,
          userId: user.id,
        });
      }
    }

    const { error } = await supabase.from("delivery_exceptions").upsert(
      {
        action,
        delivery_date: date,
        plan_id: plan.id,
        product_key: productKey,
        quantity: isOverride ? quantity : null,
        unit: isOverride ? "litre" : null,
        updated_at: new Date().toISOString(),
        user_id: user.id,
      },
      { onConflict: "plan_id,product_key,delivery_date" },
    );

    if (error) {
      redirect(calendarUrl(date, "error", "We could not save this date change.", planId));
    }
  }

  revalidatePath("/calendar");
  revalidatePath("/account");
  redirect(calendarUrl(date, "message", "Your delivery calendar was updated.", planId));
}

export async function saveDeliveryDayChange(formData: FormData) {
  const planId = String(formData.get("plan_id") ?? "");
  const date = normalizePlanStartDate(String(formData.get("date") ?? ""));
  const action = String(formData.get("day_action") ?? "normal");

  const minimumDate = nextDeliveryDateInIndia();
  if (!date || date < minimumDate || !["normal", "skip"].includes(action)) {
    redirect(
      calendarUrl(
        date || minimumDate,
        "error",
        "Choose tomorrow or a later delivery date.",
        planId,
      ),
    );
  }

  const { plan, supabase, user } = await getOwnedPlan(planId);
  if (date < plan.start_date) {
    redirect(calendarUrl(date, "error", "This date is before your plan starts.", planId));
  }

  if (action === "normal") {
    const { error } = await supabase
      .from("delivery_exceptions")
      .delete()
      .eq("plan_id", plan.id)
      .eq("user_id", user.id)
      .eq("delivery_date", date);
    if (error) {
      redirect(calendarUrl(date, "error", "We could not restore this delivery day.", planId));
    }
  } else {
    const [
      { data: weeklyItems },
      { data: scheduledItems },
      { data: dateOverrides },
    ] = await Promise.all([
      supabase
        .from("weekly_delivery_items")
        .select("product_key")
        .eq("plan_id", plan.id)
        .eq("user_id", user.id)
        .eq("day_of_week", weekdayFromYmd(date)),
      supabase
        .from("scheduled_delivery_items")
        .select("product_key")
        .eq("plan_id", plan.id)
        .eq("user_id", user.id)
        .eq("delivery_date", date),
      supabase
        .from("delivery_exceptions")
        .select("product_key")
        .eq("plan_id", plan.id)
        .eq("user_id", user.id)
        .eq("delivery_date", date)
        .eq("action", "override"),
    ]);
    const scheduledProductKeys = [
      ...(weeklyItems ?? []),
      ...(scheduledItems ?? []),
      ...(dateOverrides ?? []),
    ].map((item) => item.product_key);
    const uniqueProductKeys = [...new Set(scheduledProductKeys)];

    if (!uniqueProductKeys.length) {
      redirect(calendarUrl(date, "error", "There is no delivery scheduled on this date.", planId));
    }

    const { error } = await supabase.from("delivery_exceptions").upsert(
      uniqueProductKeys.map((productKey) => ({
        action: "skip",
        delivery_date: date,
        plan_id: plan.id,
        product_key: productKey,
        quantity: null,
        unit: null,
        updated_at: new Date().toISOString(),
        user_id: user.id,
      })),
      { onConflict: "plan_id,product_key,delivery_date" },
    );

    if (error) {
      redirect(calendarUrl(date, "error", "We could not skip this delivery day.", planId));
    }
  }

  revalidatePath("/calendar");
  revalidatePath("/account");
  redirect(
    calendarUrl(
      date,
      "message",
      action === "skip"
        ? "This delivery day was skipped."
        : "This delivery day was restored.",
      planId,
    ),
  );
}

export async function savePause(formData: FormData) {
  const planId = String(formData.get("plan_id") ?? "");
  const startDate = normalizePlanStartDate(
    String(formData.get("start_date") ?? ""),
  );
  const endDate = normalizePlanStartDate(
    String(formData.get("end_date") ?? ""),
  );
  const selectedDate = normalizePlanStartDate(
    String(formData.get("selected_date") ?? ""),
  );
  const minimumDate = nextDeliveryDateInIndia();

  if (
    !startDate ||
    !endDate ||
    startDate < minimumDate ||
    endDate <= startDate
  ) {
    redirect(
      calendarUrl(
        selectedDate || minimumDate,
        "error",
        "A pause must cover at least two consecutive days.",
        planId,
      ),
    );
  }

  const { plan, supabase, user } = await getOwnedPlan(planId);
  if (startDate < plan.start_date) {
    redirect(calendarUrl(selectedDate, "error", "The pause cannot begin before your plan.", planId));
  }

  const { data: overlap } = await supabase
    .from("delivery_pauses")
    .select("id")
    .eq("plan_id", plan.id)
    .eq("user_id", user.id)
    .lte("start_date", endDate)
    .gte("end_date", startDate)
    .limit(1)
    .maybeSingle();

  if (overlap) {
    redirect(calendarUrl(selectedDate, "error", "Those dates are already paused.", planId));
  }

  const { error } = await supabase.from("delivery_pauses").insert({
    end_date: endDate,
    plan_id: plan.id,
    start_date: startDate,
    user_id: user.id,
  });

  if (error) {
    redirect(calendarUrl(selectedDate, "error", "We could not pause those dates.", planId));
  }

  revalidatePath("/calendar");
  revalidatePath("/account");
  redirect(calendarUrl(selectedDate, "message", "Your delivery pause was added.", planId));
}

export async function removePause(formData: FormData) {
  const planId = String(formData.get("plan_id") ?? "");
  const pauseId = String(formData.get("pause_id") ?? "");
  const selectedDate = normalizePlanStartDate(String(formData.get("selected_date") ?? ""));
  const { plan, supabase, user } = await getOwnedPlan(planId);

  const { error } = await supabase
    .from("delivery_pauses")
    .delete()
    .eq("id", pauseId)
    .eq("plan_id", plan.id)
    .eq("user_id", user.id);

  if (error) {
    redirect(calendarUrl(selectedDate, "error", "We could not remove this pause.", planId));
  }

  revalidatePath("/calendar");
  revalidatePath("/account");
  redirect(calendarUrl(selectedDate, "message", "The pause was removed.", planId));
}
