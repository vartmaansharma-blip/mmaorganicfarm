"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { normalizePlanStartDate } from "@/lib/milk-plan";
import { todayInIndia, weekdayFromYmd } from "@/lib/delivery-calendar";
import { createClient } from "@/lib/supabase/server";

const productKeys = new Set(["milk", "paneer", "ghee", "papaya", "sweets"]);

function calendarUrl(
  date: string,
  type: "error" | "message",
  message: string,
) {
  const params = new URLSearchParams({ date, [type]: message });
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
    .select("id, user_id, start_date")
    .eq("id", planId)
    .eq("user_id", user.id)
    .in("status", ["pending_confirmation", "active", "paused"])
    .maybeSingle();

  if (!plan) redirect("/milk");
  return { plan, supabase, user };
}

export async function saveDateChange(formData: FormData) {
  const planId = String(formData.get("plan_id") ?? "");
  const date = normalizePlanStartDate(String(formData.get("date") ?? ""));
  const productKey = String(formData.get("product_key") ?? "");
  const action = String(formData.get("change_action") ?? "normal");

  if (!date || !productKeys.has(productKey) || date < todayInIndia()) {
    redirect(calendarUrl(date || todayInIndia(), "error", "Choose a valid upcoming date."));
  }

  const { plan, supabase, user } = await getOwnedPlan(planId);
  if (date < plan.start_date) {
    redirect(calendarUrl(date, "error", "This date is before your plan starts."));
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
      redirect(calendarUrl(date, "error", "We could not restore this date."));
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
      redirect(calendarUrl(date, "error", "Choose a valid date change."));
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
      redirect(calendarUrl(date, "error", "We could not save this date change."));
    }
  }

  revalidatePath("/calendar");
  revalidatePath("/account");
  redirect(calendarUrl(date, "message", "Your delivery calendar was updated."));
}

export async function saveDeliveryDayChange(formData: FormData) {
  const planId = String(formData.get("plan_id") ?? "");
  const date = normalizePlanStartDate(String(formData.get("date") ?? ""));
  const action = String(formData.get("day_action") ?? "normal");

  if (!date || date < todayInIndia() || !["normal", "skip"].includes(action)) {
    redirect(calendarUrl(date || todayInIndia(), "error", "Choose a valid upcoming date."));
  }

  const { plan, supabase, user } = await getOwnedPlan(planId);
  if (date < plan.start_date) {
    redirect(calendarUrl(date, "error", "This date is before your plan starts."));
  }

  if (action === "normal") {
    const { error } = await supabase
      .from("delivery_exceptions")
      .delete()
      .eq("plan_id", plan.id)
      .eq("user_id", user.id)
      .eq("delivery_date", date);
    if (error) {
      redirect(calendarUrl(date, "error", "We could not restore this delivery day."));
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
      redirect(calendarUrl(date, "error", "There is no delivery scheduled on this date."));
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
      redirect(calendarUrl(date, "error", "We could not skip this delivery day."));
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
    ),
  );
}

export async function savePause(formData: FormData) {
  const planId = String(formData.get("plan_id") ?? "");
  const startDate = normalizePlanStartDate(String(formData.get("start_date") ?? ""));
  const endDate = normalizePlanStartDate(String(formData.get("end_date") ?? ""));
  const selectedDate = normalizePlanStartDate(String(formData.get("selected_date") ?? ""));

  if (
    !startDate ||
    !endDate ||
    startDate < todayInIndia() ||
    endDate <= startDate
  ) {
    redirect(
      calendarUrl(
        selectedDate || todayInIndia(),
        "error",
        "A pause must cover at least two consecutive days.",
      ),
    );
  }

  const { plan, supabase, user } = await getOwnedPlan(planId);
  if (startDate < plan.start_date) {
    redirect(calendarUrl(selectedDate, "error", "The pause cannot begin before your plan."));
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
    redirect(calendarUrl(selectedDate, "error", "Those dates are already paused."));
  }

  const { error } = await supabase.from("delivery_pauses").insert({
    end_date: endDate,
    plan_id: plan.id,
    start_date: startDate,
    user_id: user.id,
  });

  if (error) {
    redirect(calendarUrl(selectedDate, "error", "We could not pause those dates."));
  }

  revalidatePath("/calendar");
  revalidatePath("/account");
  redirect(calendarUrl(selectedDate, "message", "Your delivery pause was added."));
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
    redirect(calendarUrl(selectedDate, "error", "We could not remove this pause."));
  }

  revalidatePath("/calendar");
  revalidatePath("/account");
  redirect(calendarUrl(selectedDate, "message", "The pause was removed."));
}
