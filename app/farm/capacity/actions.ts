"use server";

import { revalidatePath } from "next/cache";
import {
  canManageLocations,
  requireFarmStaff,
} from "@/lib/farm-dashboard";
import {
  capacityProduct,
  isCapacityProductId,
} from "@/lib/capacity-products";
import { nextDeliveryDateInIndia } from "@/lib/delivery-calendar";

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

async function requireCapacityManager() {
  const context = await requireFarmStaff("/farm/capacity");
  if (!canManageLocations(context.role)) {
    throw new Error("Manager access is required.");
  }
  return context;
}

export async function updateDefaultCapacity(formData: FormData) {
  const { supabase, user } = await requireCapacityManager();
  const { dailyLimit, productKey } = capacityValue(formData);
  const { error } = await supabase
    .from("production_capacity")
    .upsert({
      daily_limit: dailyLimit,
      product_key: productKey,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    });
  if (error) throw error;
  revalidatePath("/farm/capacity");
  revalidatePath("/farm");
}

export async function saveCapacityOverride(formData: FormData) {
  const { supabase, user } = await requireCapacityManager();
  const deliveryDate = String(formData.get("deliveryDate") ?? "");
  const { dailyLimit, productKey } = capacityValue(formData);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)) {
    throw new Error("Choose a valid delivery date.");
  }
  if (deliveryDate < nextDeliveryDateInIndia()) {
    throw new Error("Capacity can only be changed for future deliveries.");
  }

  const { error } = await supabase.from("production_capacity_overrides").upsert(
    {
      daily_limit: dailyLimit,
      delivery_date: deliveryDate,
      product_key: productKey,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    },
    { onConflict: "product_key,delivery_date" },
  );
  if (error) throw error;
  revalidatePath("/farm/capacity");
  revalidatePath("/farm");
}

export async function removeCapacityOverride(formData: FormData) {
  const { supabase } = await requireCapacityManager();
  const deliveryDate = String(formData.get("deliveryDate") ?? "");
  const productKey = String(formData.get("productKey") ?? "");
  if (!isCapacityProductId(productKey)) {
    throw new Error("Choose a valid farm product.");
  }
  const { error } = await supabase
    .from("production_capacity_overrides")
    .delete()
    .eq("product_key", productKey)
    .eq("delivery_date", deliveryDate);
  if (error) throw error;
  revalidatePath("/farm/capacity");
  revalidatePath("/farm");
}
