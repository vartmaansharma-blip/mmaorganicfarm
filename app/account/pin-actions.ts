"use server";

import { createClient } from "@/lib/supabase/server";

export async function saveDeliveryPin(pin: {
  address: string; latitude: number; longitude: number; accuracy_metres: number;
}): Promise<{ ok: boolean; message: string }> {
  if (typeof pin.address !== "string" || !pin.address.trim() || pin.address.length > 500 ||
    !Number.isFinite(pin.latitude) || Math.abs(pin.latitude) > 90 ||
    !Number.isFinite(pin.longitude) || Math.abs(pin.longitude) > 180 ||
    !Number.isFinite(pin.accuracy_metres) || pin.accuracy_metres <= 0 || pin.accuracy_metres > 100) {
    return { ok: false, message: "Check your address and capture an accurate location again." };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Sign in again before saving your delivery entrance." };
  const { error } = await supabase.rpc("save_my_delivery_pin", {
    p_latitude: pin.latitude, p_longitude: pin.longitude,
    p_accuracy_metres: pin.accuracy_metres, p_address_line: pin.address,
  });
  if (error) return { ok: false, message: "We couldn’t save this pin. Refresh to check your address, then try again." };
  return { ok: true, message: "Entrance saved for matching future, unreleased deliveries." };
}
