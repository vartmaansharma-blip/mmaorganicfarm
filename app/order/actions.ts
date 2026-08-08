"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function orderUrl(type: "error" | "message", message: string) {
  return `/order?${type}=${encodeURIComponent(message)}`;
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

  if (phone.length !== 10) {
    redirect(orderUrl("error", "Enter a valid 10-digit mobile number."));
  }

  if (address.length < 8) {
    redirect(orderUrl("error", "Enter your complete delivery address."));
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
    redirect(orderUrl("error", "We could not save your details. Please try again."));
  }

  const message = [
    "Hello M'ma Organic Farm, I'd like to continue a fresh milk order.",
    `Name: ${fullName}`,
    `Phone: +91 ${phone}`,
    `Delivery address: ${address}`,
  ].join("\n");
  const whatsapp = new URL("https://wa.me/919818804419");
  whatsapp.searchParams.set("text", message);
  redirect(whatsapp.toString());
}
