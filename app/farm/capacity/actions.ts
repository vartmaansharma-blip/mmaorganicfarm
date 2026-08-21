"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  canManageLocations,
  requireFarmStaff,
} from "@/lib/farm-dashboard";
import {
  capacityProduct,
  isCapacityProductId,
} from "@/lib/capacity-products";
import { nextDeliveryDateInIndia } from "@/lib/delivery-calendar";
import { createAdminClient } from "@/lib/supabase/admin";

function capacityValue(formData: FormData) {
  const productKey = String(formData.get("productKey") ?? "");
  if (!isCapacityProductId(productKey)) {
    throw new Error("Choose a valid farm product.");
  }
  const value = Number(formData.get("dailyLimit"));
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100000 ||
    (productKey !== "milk" && !Number.isInteger(value))
  ) {
    throw new Error(
      `Enter a valid daily ${capacityProduct(productKey).unitLabel} limit.`,
    );
  }
  return { dailyLimit: Math.round(value * 100) / 100, productKey };
}

function capacityPath(productKey: string, key: "error" | "message", message: string) {
  const product = isCapacityProductId(productKey) ? productKey : "milk";
  return `/farm/capacity?product=${product}&${key}=${encodeURIComponent(message)}`;
}

function parsedCapacityValue(formData: FormData) {
  const requestedProduct = String(formData.get("productKey") ?? "");
  try {
    return capacityValue(formData);
  } catch (error) {
    redirect(capacityPath(
      requestedProduct,
      "error",
      error instanceof Error ? error.message : "Enter a valid capacity limit.",
    ));
  }
}

async function requireCapacityManager() {
  const context = await requireFarmStaff("/farm/capacity");
  if (!canManageLocations(context.role)) {
    throw new Error("Manager access is required.");
  }
  return context;
}

export async function updateDefaultCapacity(formData: FormData) {
  const { user } = await requireCapacityManager();
  const admin = createAdminClient();
  const { dailyLimit, productKey } = parsedCapacityValue(formData);
  const { error } = await admin
    .from("production_capacity")
    .upsert({
      daily_limit: dailyLimit,
      product_key: productKey,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    });
  if (error) redirect(capacityPath(productKey, "error", error.message));
  revalidatePath("/farm/capacity");
  revalidatePath("/farm");
  redirect(capacityPath(productKey, "message", "Normal daily capacity updated."));
}

export async function saveCapacityOverride(formData: FormData) {
  const { user } = await requireCapacityManager();
  const admin = createAdminClient();
  const deliveryDate = String(formData.get("deliveryDate") ?? "");
  const { dailyLimit, productKey } = parsedCapacityValue(formData);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)) {
    redirect(capacityPath(productKey, "error", "Choose a valid delivery date."));
  }
  if (deliveryDate < nextDeliveryDateInIndia()) {
    redirect(capacityPath(productKey, "error", "Capacity can only be changed for future deliveries."));
  }

  const { error } = await admin.from("production_capacity_overrides").upsert(
    {
      daily_limit: dailyLimit,
      delivery_date: deliveryDate,
      product_key: productKey,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    },
    { onConflict: "product_key,delivery_date" },
  );
  if (error) redirect(capacityPath(productKey, "error", error.message));
  revalidatePath("/farm/capacity");
  revalidatePath("/farm");
  redirect(capacityPath(productKey, "message", "Capacity for that date was saved."));
}

export async function removeCapacityOverride(formData: FormData) {
  await requireCapacityManager();
  const admin = createAdminClient();
  const deliveryDate = String(formData.get("deliveryDate") ?? "");
  const productKey = String(formData.get("productKey") ?? "");
  if (!isCapacityProductId(productKey)) {
    redirect(capacityPath(productKey, "error", "Choose a valid farm product."));
  }
  const { error } = await admin
    .from("production_capacity_overrides")
    .delete()
    .eq("product_key", productKey)
    .eq("delivery_date", deliveryDate);
  if (error) redirect(capacityPath(productKey, "error", error.message));
  revalidatePath("/farm/capacity");
  revalidatePath("/farm");
  redirect(capacityPath(productKey, "message", "The normal daily limit is active again."));
}
