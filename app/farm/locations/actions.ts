"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  areaSlug,
  canManageLocations,
  requireFarmStaff,
} from "@/lib/farm-dashboard";
import { parseCustomerImport } from "@/lib/customer-import";
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

function importResult(imported: number, skipped: number, error?: string): never {
  const parameters = new URLSearchParams({
    imported: String(imported),
    skipped: String(skipped),
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
  const upload = formData.get("customerFile");

  if (!(upload instanceof File) || !upload.size) {
    importResult(0, 0, "Choose a CSV file.");
  }
  if (upload.size > 256_000) {
    importResult(0, 0, "The CSV must be smaller than 256 KB.");
  }
  if (!upload.name.toLowerCase().endsWith(".csv")) {
    importResult(0, 0, "Upload a .csv file.");
  }

  let rows;
  try {
    rows = parseCustomerImport(await upload.text());
  } catch (error) {
    importResult(
      0,
      0,
      error instanceof Error ? error.message : "The CSV could not be read.",
    );
  }

  if (!rows.length) {
    importResult(0, 0, "No customer rows with an email or phone were found.");
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

  let imported = 0;
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

    if (
      (emailMatch && phoneMatch && emailMatch.user_id !== phoneMatch.user_id) ||
      (!emailMatch && !phoneMatch)
    ) {
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

    const profile = emailMatch ?? phoneMatch;
    if (!profile || processedUsers.has(profile.user_id)) {
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
    if (!Object.keys(update).length) {
      skipped += 1;
      continue;
    }
    update.updated_at = new Date().toISOString();

    const { data, error } = await supabase
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
    imported += 1;
  }

  revalidatePath("/farm");
  revalidatePath("/farm/locations");
  importResult(imported, skipped);
}
