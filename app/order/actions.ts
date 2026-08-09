"use server";

import { redirect } from "next/navigation";
import {
  parseFarmProductSelections,
  serializeFarmProductSelections,
} from "@/lib/farm-products";
import {
  describeWeeklyMilkSchedule,
  formatPlanStartDate,
  normalizePlanStartDate,
  parseWeeklyMilkSchedule,
} from "@/lib/milk-plan";
import { nextDeliveryDateInIndia } from "@/lib/delivery-calendar";
import { calculateOrderPricing } from "@/lib/order-pricing";
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
    redirect("/sign-in?next=%2Forder&message=Sign+in+to+continue+your+order.");
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
  const requestedBottle = formData.get("bottle");
  const bottle =
    milkLitres === 0
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
  const pricing = calculateOrderPricing({
    bottleChoice: bottle,
    milkLitres:
      purchase === "plan" && weeklySchedule
        ? weeklySchedule.reduce((total, litres) => total + litres, 0)
        : milkLitres,
    products: selectedProducts,
  });

  if (
    purchase === "plan" &&
    (!weeklySchedule ||
      !start ||
      start < minimumStartDate ||
      (weeklySchedule.every((litres) => litres === 0) &&
        selectedProducts.length === 0) ||
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
          : "Return to products and complete your weekly milk schedule.",
        purchase,
        bottle,
        milk,
        extras,
        schedule,
        start,
      ),
    );
  }

  if (milkLitres === 0 && selectedProducts.length === 0) {
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
      ),
    );
  }

  const fullName =
    user.user_metadata.full_name ?? user.user_metadata.name ?? "Customer";
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
      ),
    );
  }

  if (purchase === "plan" && weeklySchedule) {
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
    const { error: planError } = await supabase.rpc(
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
        ),
      );
    }
  }

  const message = [
    "Hello M'ma Organic Farm, I'd like to continue a farm order.",
    `Name: ${fullName}`,
    `Phone: +91 ${phone}`,
    `Delivery address: ${address}`,
    `Order type: ${purchase === "plan" ? "Weekly farm plan" : "One-time farm order"}`,
    `Milk: ${milkLitres === 0 ? "No milk this time" : purchase === "plan" ? `${milkLitres} L per week` : `${milkLitres} L`}`,
    ...(purchase === "plan" && weeklySchedule
      ? [
          `Plan starts: ${formatPlanStartDate(start)}`,
          `Weekly schedule: ${describeWeeklyMilkSchedule(weeklySchedule)}`,
        ]
      : []),
    ...(milkLitres > 0
      ? [
          `Bottle: ${bottle === "new" ? "No return bottle (+₹10 once)" : "M'ma bottle will be returned on delivery (₹62 exchange price)"}`,
        ]
      : []),
    ...(selectedProducts.length
      ? [
          "Added farm products:",
          ...selectedProducts.map(
            (product) =>
              `- ${product.name}, ${product.quantity} × ${product.unit}, ₹${product.price * product.quantity}, ${
                product.frequency === "weekly"
                  ? `every ${product.days
                      .map((day) => ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][day - 1])
                      .join(", ")}`
                  : "first delivery"
              }`,
          ),
        ]
      : []),
    `${purchase === "plan" ? "First 7-day estimate" : "Order total"}: ₹${pricing.total}`,
  ].join("\n");
  const whatsapp = new URL("https://wa.me/919818804419");
  whatsapp.searchParams.set("text", message);
  redirect(whatsapp.toString());
}
