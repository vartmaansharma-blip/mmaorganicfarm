"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { readSheet } from "read-excel-file/universal";
import {
  areaSlug,
  canManageLocations,
  requireFarmStaff,
} from "@/lib/farm-dashboard";
import {
  parseCustomerImport,
  parseCustomerRows,
  type CustomerImportRow,
} from "@/lib/customer-import";
import {
  FARM_PRODUCTS,
  type FarmProductSelection,
} from "@/lib/farm-products";
import { nextDeliveryDateInIndia } from "@/lib/delivery-calendar";
import { MILK_PLAN_DAYS, type WeeklyMilkSchedule } from "@/lib/milk-plan";
import {
  calculateOrderPricing,
  calculatePlanPricing,
  MILK_PRICE_PER_LITRE,
  PLAN_DELIVERY_COUNT,
  type BottleChoice,
} from "@/lib/order-pricing";
import { createAdminClient } from "@/lib/supabase/admin";

function textValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 12 && digits.startsWith("91")
    ? digits.slice(2)
    : digits;
}

function normalizedLookup(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function importResult(created: number, updated: number, skipped: number, error?: string): never {
  const parameters = new URLSearchParams({
    created: String(created),
    skipped: String(skipped),
    updated: String(updated),
  });
  if (error) parameters.set("importError", error);
  redirect(`/farm/locations?${parameters.toString()}`);
}

async function requireLocationManager() {
  const context = await requireFarmStaff("/farm/locations");
  if (!canManageLocations(context.role)) {
    throw new Error("Manager access is required.");
  }
  return context;
}

type CustomerProfileInput = {
  address: string;
  areaId: string | null;
  email: string | null;
  fullName: string;
  landmark: string | null;
  locality: string | null;
  phone: string | null;
  postalCode: string | null;
};

function customerProfileInput(formData: FormData): CustomerProfileInput {
  const fullName = textValue(formData, "fullName");
  const email = textValue(formData, "email").toLowerCase() || null;
  const normalizedPhone = normalizePhone(textValue(formData, "phone"));
  const phone = normalizedPhone ? `+91${normalizedPhone}` : null;
  const address = textValue(formData, "address");
  const locality = textValue(formData, "locality") || null;
  const landmark = textValue(formData, "landmark") || null;
  const postalCode = textValue(formData, "postalCode") || null;
  const areaId = textValue(formData, "areaId") || null;

  if (fullName.length < 2 || fullName.length > 120) {
    throw new Error("Enter the customer's name.");
  }
  if (!email && !phone) throw new Error("Add a phone number or email address.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid email address.");
  }
  if (normalizedPhone && normalizedPhone.length !== 10) {
    throw new Error("Enter a valid 10-digit phone number.");
  }
  if (address.length < 8 || address.length > 500) {
    throw new Error("Enter a complete delivery address.");
  }
  if (locality && (locality.length < 2 || locality.length > 120)) {
    throw new Error("Enter a valid locality.");
  }
  if (landmark && landmark.length > 180) throw new Error("The landmark is too long.");
  if (postalCode && !/^\d{6}$/.test(postalCode)) {
    throw new Error("Enter a valid 6-digit postal code.");
  }

  return { address, areaId, email, fullName, landmark, locality, phone, postalCode };
}

async function createManagedCustomer(input: CustomerProfileInput) {
  const admin = createAdminClient();
  const duplicateQueries = [
    input.email
      ? admin.from("customer_profiles").select("user_id").ilike("email", input.email).limit(1).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    input.phone
      ? admin.from("customer_profiles").select("user_id").eq("phone", input.phone).limit(1).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ];
  const [emailMatch, phoneMatch] = await Promise.all(duplicateQueries);
  const lookupError = emailMatch.error ?? phoneMatch.error;
  if (lookupError) throw lookupError;
  if (emailMatch.data || phoneMatch.data) {
    throw new Error("A customer with this phone number or email already exists.");
  }

  const { data, error } = await admin.auth.admin.createUser({
    ...(input.email ? { email: input.email } : {}),
    ...(input.phone ? { phone: input.phone } : {}),
    app_metadata: { customer_source: "farm" },
    user_metadata: { full_name: input.fullName },
  });
  if (error || !data.user) throw error ?? new Error("The customer account could not be created.");

  const { error: profileError } = await admin.from("customer_profiles").upsert({
    address_line: input.address,
    delivery_area_id: input.areaId,
    delivery_route_id: null,
    email: input.email,
    full_name: input.fullName,
    landmark: input.landmark,
    locality: input.locality,
    phone: input.phone,
    postal_code: input.postalCode,
    route_stop_order: null,
    updated_at: new Date().toISOString(),
    user_id: data.user.id,
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id);
    throw profileError;
  }

  return data.user.id;
}

export async function createCustomerProfile(formData: FormData) {
  await requireLocationManager();
  try {
    await createManagedCustomer(customerProfileInput(formData));
  } catch (error) {
    const message = error instanceof Error ? error.message : "The customer could not be added.";
    redirect(`/farm/locations?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/farm");
  revalidatePath("/farm/locations");
  redirect("/farm/locations?message=Customer+profile+added.");
}

export async function createArea(formData: FormData) {
  const { supabase } = await requireLocationManager();
  const name = textValue(formData, "name");
  const slug = areaSlug(name);

  if (name.length < 2 || !slug) throw new Error("Enter a valid area name.");

  const { error } = await supabase
    .from("delivery_areas")
    .upsert({ active: true, name, slug }, { onConflict: "slug" });
  if (error) throw error;

  revalidatePath("/farm");
  revalidatePath("/farm/locations");
}

export async function assignCustomerLocation(formData: FormData) {
  const { supabase } = await requireLocationManager();
  const userId = textValue(formData, "userId");
  const fullName = textValue(formData, "fullName");
  const phone = normalizePhone(textValue(formData, "phone"));
  const address = textValue(formData, "address");
  const locality = textValue(formData, "locality");
  const landmark = textValue(formData, "landmark");
  const postalCode = textValue(formData, "postalCode");
  const areaId = textValue(formData, "areaId") || null;

  if (!userId) throw new Error("Customer is required.");
  if (fullName.length < 2 || fullName.length > 120) {
    throw new Error("Enter the customer's name.");
  }
  if (phone && phone.length !== 10) {
    throw new Error("Enter a valid 10-digit phone number.");
  }
  if (address && (address.length < 8 || address.length > 500)) {
    throw new Error("Enter a complete delivery address.");
  }
  if (locality && (locality.length < 2 || locality.length > 120)) {
    throw new Error("Enter a valid locality.");
  }
  if (landmark.length > 180) throw new Error("The landmark is too long.");
  if (postalCode && !/^\d{6}$/.test(postalCode)) {
    throw new Error("Enter a valid 6-digit postal code.");
  }

  const { data, error } = await supabase
    .from("customer_profiles")
    .update({
      address_line: address || null,
      delivery_area_id: areaId,
      delivery_route_id: null,
      full_name: fullName,
      landmark: landmark || null,
      locality: locality || null,
      phone: phone ? `+91${phone}` : null,
      postal_code: postalCode || null,
      route_stop_order: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .select("user_id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("The customer profile was not updated.");

  revalidatePath("/farm");
  revalidatePath("/farm/locations");
}

function manualProducts(formData: FormData): FarmProductSelection[] {
  return FARM_PRODUCTS.flatMap((product) => {
    const quantity = Number(formData.get(`${product.id}Quantity`) ?? 0);
    return Number.isInteger(quantity) && quantity >= 1 && quantity <= 5
      ? [{ ...product, days: [], frequency: "once" as const, quantity }]
      : [];
  });
}

export async function recordCustomerOrder(formData: FormData) {
  await requireLocationManager();
  const admin = createAdminClient();
  const userId = textValue(formData, "userId");
  const purchaseMode = textValue(formData, "purchaseMode") === "plan" ? "plan" : "once";
  const requestedBottle = textValue(formData, "bottleChoice");
  const bottleChoice: BottleChoice = requestedBottle === "new"
    ? "new"
    : requestedBottle === "none"
      ? "none"
      : "return";
  const startDate = textValue(formData, "startDate");
  const earliestStart = nextDeliveryDateInIndia();
  const products = manualProducts(formData);
  const onceMilk = Number(formData.get("milkLitres") ?? 0);
  const schedule = MILK_PLAN_DAYS.map((_, index) =>
    Number(formData.get(`milkDay${index + 1}`) ?? 0),
  ) as WeeklyMilkSchedule;

  if (!userId) redirect("/farm/locations?error=Choose+a+customer.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || startDate < earliestStart) {
    redirect("/farm/locations?error=Choose+a+valid+delivery+start+date.");
  }
  if (
    purchaseMode === "plan" &&
    (schedule.some((quantity) => !Number.isInteger(quantity) || quantity < 0 || quantity > 5) ||
      schedule.every((quantity) => quantity === 0))
  ) {
    redirect("/farm/locations?error=Add+a+valid+seven-day+milk+schedule.");
  }
  if (
    purchaseMode === "once" &&
    (!Number.isInteger(onceMilk) || onceMilk < 0 || onceMilk > 5)
  ) {
    redirect("/farm/locations?error=Enter+a+valid+milk+quantity.");
  }
  if (purchaseMode === "once" && onceMilk === 0 && products.length === 0) {
    redirect("/farm/locations?error=Add+milk+or+at+least+one+farm+product.");
  }

  const { data: profile, error: profileError } = await admin
    .from("customer_profiles")
    .select("user_id, phone, address_line")
    .eq("user_id", userId)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile?.phone || !profile.address_line) {
    redirect("/farm/locations?error=Save+the+customer%27s+phone+and+address+before+recording+an+order.");
  }

  const pricing = purchaseMode === "plan"
    ? calculatePlanPricing({ bottleChoice, products, schedule, startDate })
    : calculateOrderPricing({ bottleChoice, milkLitres: onceMilk, products });

  let deliveryPlanId: string | null = null;
  if (purchaseMode === "plan") {
    const { data: plan, error: planError } = await admin
      .from("delivery_plans")
      .insert({
        bottle_choice: bottleChoice,
        delivered_deliveries: 0,
        is_test: false,
        purchased_deliveries: PLAN_DELIVERY_COUNT,
        start_date: startDate,
        status: "pending_confirmation",
        user_id: userId,
      })
      .select("id")
      .single();
    if (planError || !plan) throw planError ?? new Error("The delivery plan could not be created.");
    deliveryPlanId = plan.id;

    const weeklyItems = schedule.flatMap((quantity, index) =>
      quantity > 0
        ? [{
            day_of_week: index + 1,
            plan_id: plan.id,
            product_key: "milk",
            quantity,
            unit: "litre",
            user_id: userId,
          }]
        : [],
    );
    const { error: scheduleError } = await admin.from("weekly_delivery_items").insert(weeklyItems);
    if (scheduleError) {
      await admin.from("delivery_plans").delete().eq("id", plan.id);
      throw scheduleError;
    }
  }

  const { data: order, error: orderError } = await admin
    .from("orders")
    .insert({
      address_snapshot: profile.address_line,
      bottle_charge_paise: pricing.bottleCharge * 100,
      bottle_choice: bottleChoice,
      currency: "INR",
      delivery_plan_id: deliveryPlanId,
      is_test: false,
      milk_litres: pricing.milkLitres,
      paid_total_paise: null,
      phone_snapshot: profile.phone,
      purchase_mode: purchaseMode,
      start_date: startDate,
      status: "pending_payment",
      subtotal_paise: (pricing.total - pricing.bottleCharge) * 100,
      total_paise: pricing.total * 100,
      user_id: userId,
    })
    .select("id")
    .single();
  if (orderError || !order) {
    if (deliveryPlanId) await admin.from("delivery_plans").delete().eq("id", deliveryPlanId);
    throw orderError ?? new Error("The order could not be recorded.");
  }

  const scheduledDays = purchaseMode === "plan"
    ? schedule.flatMap((quantity, index) => quantity > 0 ? [index + 1] : [])
    : [];
  const orderItems = [
    ...(pricing.milkLitres > 0
      ? [{
          delivery_date: startDate,
          frequency: purchaseMode === "plan" ? "weekly" : "once",
          line_total_paise: pricing.milkTotal * 100,
          order_id: order.id,
          product_key: "milk",
          product_name: "Fresh farm milk",
          quantity: pricing.milkLitres,
          scheduled_days: scheduledDays,
          unit: purchaseMode === "plan" ? "litres / 30 deliveries" : "litre",
          unit_price_paise: MILK_PRICE_PER_LITRE * 100,
          user_id: userId,
        }]
      : []),
    ...products.map((product) => ({
      delivery_date: startDate,
      frequency: "once",
      line_total_paise: (pricing.productTotals[product.id] ?? 0) * 100,
      order_id: order.id,
      product_key: product.id,
      product_name: product.name,
      quantity: product.quantity,
      scheduled_days: [],
      unit: product.unit,
      unit_price_paise: product.price * 100,
      user_id: userId,
    })),
  ];
  const { error: itemsError } = await admin.from("order_items").insert(orderItems);
  if (itemsError) {
    await admin.from("orders").delete().eq("id", order.id);
    if (deliveryPlanId) await admin.from("delivery_plans").delete().eq("id", deliveryPlanId);
    throw itemsError;
  }

  revalidatePath("/farm");
  revalidatePath("/farm/locations");
  redirect("/farm/locations?message=Order+recorded.+Payment+is+pending.");
}

export async function deleteCustomerProfile(formData: FormData) {
  const { role } = await requireFarmStaff("/farm/locations");
  if (role !== "admin") {
    redirect("/farm/locations?error=Only+an+admin+can+delete+a+customer+profile.");
  }

  const userId = textValue(formData, "userId");
  const confirmed = textValue(formData, "confirmDelete") === "yes";
  if (!userId || !confirmed) {
    redirect("/farm/locations?error=Confirm+the+profile+deletion+first.");
  }

  const admin = createAdminClient();
  const [planResult, orderResult] = await Promise.all([
    admin
      .from("delivery_plans")
      .select("id")
      .eq("user_id", userId)
      .in("status", ["pending_confirmation", "active", "paused"])
      .limit(1)
      .maybeSingle(),
    admin
      .from("orders")
      .select("id")
      .eq("user_id", userId)
      .in("status", ["draft", "pending_payment"])
      .limit(1)
      .maybeSingle(),
  ]);
  const lookupError = planResult.error ?? orderResult.error;
  if (lookupError) throw lookupError;
  if (planResult.data || orderResult.data) {
    redirect(
      "/farm/locations?error=Cancel+the+active+plan+or+unfinished+order+before+deleting+this+profile.",
    );
  }

  const { error } = await admin
    .from("customer_profiles")
    .delete()
    .eq("user_id", userId);
  if (error) throw error;

  revalidatePath("/farm");
  revalidatePath("/farm/locations");
  redirect("/farm/locations?message=Customer+profile+deleted.");
}

export async function setOrderMode(formData: FormData) {
  const { role } = await requireFarmStaff("/farm/locations");
  if (role !== "admin") {
    redirect("/farm/locations?error=Only+an+admin+can+change+an+order+mode.");
  }

  const orderId = textValue(formData, "orderId");
  const mode = textValue(formData, "mode");
  if (!orderId || !["live", "test"].includes(mode)) {
    redirect("/farm/locations?error=Choose+a+valid+order+mode.");
  }

  const admin = createAdminClient();
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id, delivery_plan_id, purchase_mode, status")
    .eq("id", orderId)
    .maybeSingle();
  if (orderError) throw orderError;
  if (!order) redirect("/farm/locations?error=Order+not+found.");

  const isTest = mode === "test";
  const { error: updateOrderError } = await admin
    .from("orders")
    .update({ is_test: isTest, updated_at: new Date().toISOString() })
    .eq("id", orderId);
  if (updateOrderError) throw updateOrderError;

  const { error: paymentError } = await admin
    .from("payments")
    .update({ is_test: isTest })
    .eq("order_id", orderId);
  if (paymentError) throw paymentError;

  if (order.delivery_plan_id) {
    const planStatus = isTest
      ? "cancelled"
      : order.status === "paid"
        ? "active"
        : "pending_confirmation";
    const { error: planError } = await admin
      .from("delivery_plans")
      .update({
        is_test: isTest,
        status: planStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.delivery_plan_id);
    if (planError) throw planError;

    const { error: deliveryError } = await admin
      .from("daily_deliveries")
      .update({
        is_test: isTest,
        ...(isTest ? { status: "cancelled" } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("plan_id", order.delivery_plan_id)
      .in("status", ["planned", "ready", "out_for_delivery"]);
    if (deliveryError) throw deliveryError;
  }

  revalidatePath("/account");
  revalidatePath("/farm");
  revalidatePath("/farm/delivery-sheet");
  revalidatePath("/farm/locations");
  revalidatePath("/farm/payments");
  redirect(`/farm/locations?message=Order+labelled+${mode}.`);
}

export async function importCustomerProfiles(formData: FormData) {
  const { supabase } = await requireLocationManager();
  const admin = createAdminClient();
  const upload = formData.get("customerFile");

  if (!(upload instanceof File) || !upload.size) {
    importResult(0, 0, 0, "Choose an Excel or CSV file.");
  }
  if (upload.size > 2_000_000) {
    importResult(0, 0, 0, "The customer file must be smaller than 2 MB.");
  }
  const extension = upload.name.toLowerCase().split(".").pop();
  if (!extension || !["csv", "xlsx"].includes(extension)) {
    importResult(0, 0, 0, "Upload an .xlsx or .csv file.");
  }

  let rows: CustomerImportRow[];
  try {
    rows = extension === "xlsx"
      ? parseCustomerRows(await readSheet(upload))
      : parseCustomerImport(await upload.text());
  } catch (error) {
    importResult(
      0,
      0,
      0,
      error instanceof Error ? error.message : "The CSV could not be read.",
    );
  }

  if (!rows.length) {
    importResult(0, 0, 0, "No customer rows with an email or phone were found.");
  }

  const [profilesResult, areasResult, routesResult] = await Promise.all([
    supabase
      .from("customer_profiles")
      .select("user_id, email, phone"),
    supabase.from("delivery_areas").select("id, name"),
    supabase.from("delivery_routes").select("id, area_id, name, code"),
  ]);
  const databaseError = [
    profilesResult.error,
    areasResult.error,
    routesResult.error,
  ].find(Boolean);
  if (databaseError) throw databaseError;

  const profiles = profilesResult.data ?? [];
  const profileByEmail = new Map(
    profiles
      .filter((profile) => profile.email)
      .map((profile) => [profile.email!.trim().toLowerCase(), profile]),
  );
  const profileByPhone = new Map(
    profiles
      .filter((profile) => profile.phone)
      .map((profile) => [normalizePhone(profile.phone!), profile]),
  );
  const areas = areasResult.data ?? [];
  const routes = routesResult.data ?? [];
  const areaByName = new Map(
    areas.map((area) => [normalizedLookup(area.name), area]),
  );
  const emptyAssignmentLabels = new Set(["", "none", "noroute", "unassigned"]);

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const processedUsers = new Set<string>();

  for (const row of rows) {
    const emailMatch = row.email
      ? profileByEmail.get(row.email.trim().toLowerCase())
      : undefined;
    const normalizedPhone = row.phone ? normalizePhone(row.phone) : "";
    const phoneMatch = normalizedPhone
      ? profileByPhone.get(normalizedPhone)
      : undefined;

    if (emailMatch && phoneMatch && emailMatch.user_id !== phoneMatch.user_id) {
      skipped += 1;
      continue;
    }
    if (row.phone && normalizedPhone.length !== 10) {
      skipped += 1;
      continue;
    }
    if (row.name && (row.name.length < 2 || row.name.length > 120)) {
      skipped += 1;
      continue;
    }
    if (row.address && (row.address.length < 8 || row.address.length > 500)) {
      skipped += 1;
      continue;
    }
    if (row.postalCode && !/^\d{6}$/.test(row.postalCode)) {
      skipped += 1;
      continue;
    }

    const update: Record<string, string | number | null> = {};
    if (row.name) update.full_name = row.name.slice(0, 120);
    if (normalizedPhone.length === 10) update.phone = `+91${normalizedPhone}`;
    if (row.address) update.address_line = row.address.slice(0, 500);
    if (row.locality) update.locality = row.locality.slice(0, 120);
    if (row.landmark) update.landmark = row.landmark.slice(0, 180);
    if (row.postalCode && /^\d{6}$/.test(row.postalCode)) {
      update.postal_code = row.postalCode;
    }

    const areaName = normalizedLookup(row.area);
    const routeName = normalizedLookup(row.route);
    let area = !emptyAssignmentLabels.has(areaName)
      ? areaByName.get(areaName)
      : undefined;
    if (row.area && !emptyAssignmentLabels.has(areaName) && !area) {
      skipped += 1;
      continue;
    }

    if (row.route && !emptyAssignmentLabels.has(routeName)) {
      const route = routes.find(
        (candidate) =>
          (!area || candidate.area_id === area.id) &&
          (normalizedLookup(candidate.name) === routeName ||
            normalizedLookup(candidate.code) === routeName),
      );
      if (!route) {
        skipped += 1;
        continue;
      }
      update.delivery_route_id = route.id;
      update.delivery_area_id = route.area_id;
      area = areas.find((candidate) => candidate.id === route.area_id);
    } else if (area) {
      update.delivery_area_id = area.id;
    }

    if (row.stopOrder) {
      const stopOrder = Number(row.stopOrder);
      if (!Number.isInteger(stopOrder) || stopOrder < 1) {
        skipped += 1;
        continue;
      }
      update.route_stop_order = stopOrder;
    }

    let profile = emailMatch ?? phoneMatch;
    if (!profile) {
      if (!row.name || !row.address || (!row.email && !normalizedPhone)) {
        skipped += 1;
        continue;
      }
      try {
        const userId = await createManagedCustomer({
          address: row.address.slice(0, 500),
          areaId: typeof update.delivery_area_id === "string" ? update.delivery_area_id : null,
          email: row.email?.trim().toLowerCase() ?? null,
          fullName: row.name.slice(0, 120),
          landmark: row.landmark?.slice(0, 180) ?? null,
          locality: row.locality?.slice(0, 120) ?? null,
          phone: normalizedPhone ? `+91${normalizedPhone}` : null,
          postalCode: row.postalCode ?? null,
        });
        profile = { user_id: userId, email: row.email ?? null, phone: normalizedPhone ? `+91${normalizedPhone}` : null };
        if (row.email) profileByEmail.set(row.email.trim().toLowerCase(), profile);
        if (normalizedPhone) profileByPhone.set(normalizedPhone, profile);
        created += 1;
      } catch {
        skipped += 1;
        continue;
      }
    }

    if (processedUsers.has(profile.user_id)) {
      skipped += 1;
      continue;
    }
    update.updated_at = new Date().toISOString();

    const { data, error } = await admin
      .from("customer_profiles")
      .update(update)
      .eq("user_id", profile.user_id)
      .select("user_id")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      skipped += 1;
      continue;
    }

    processedUsers.add(profile.user_id);
    if (!emailMatch && !phoneMatch) {
      // Counted as created above.
    } else {
      updated += 1;
    }
  }

  revalidatePath("/farm");
  revalidatePath("/farm/locations");
  importResult(created, updated, skipped);
}
