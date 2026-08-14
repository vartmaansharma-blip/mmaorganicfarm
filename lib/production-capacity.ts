import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export async function reserveOrderCapacity(orderId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("reserve_order_capacity", {
    p_hold_hours: 24,
    p_order_id: orderId,
  });

  if (error) {
    throw new Error(
      error.message.includes("capacity is full")
        ? error.message
        : "We could not confirm product availability. Please try again.",
    );
  }

  return data;
}

export async function consumeOrderCapacity(orderId: string) {
  const admin = createAdminClient();
  const { error } = await admin.rpc("consume_order_capacity", {
    p_order_id: orderId,
  });
  if (error) throw new Error("Reserved product capacity could not be confirmed.");
}

export async function releaseOrderCapacity(orderId: string) {
  const admin = createAdminClient();
  const { error } = await admin.rpc("release_order_capacity", {
    p_order_id: orderId,
  });
  if (error) console.error("Unable to release order capacity", error.message);
}
