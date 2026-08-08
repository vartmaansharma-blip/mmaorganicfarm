"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function orderUrl(
  type: "error" | "message",
  message: string,
  purchase: string,
  bottle: string,
) {
  const params = new URLSearchParams({ [type]: message, purchase, bottle });
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
  const bottle = formData.get("bottle") === "new" ? "new" : "return";

  if (phone.length !== 10) {
    redirect(
      orderUrl("error", "Enter a valid 10-digit mobile number.", purchase, bottle),
    );
  }

  if (address.length < 8) {
    redirect(
      orderUrl("error", "Enter your complete delivery address.", purchase, bottle),
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
      ),
    );
  }

  const message = [
    "Hello M'ma Organic Farm, I'd like to continue a fresh milk order.",
    `Name: ${fullName}`,
    `Phone: +91 ${phone}`,
    `Delivery address: ${address}`,
    `Order type: ${purchase === "plan" ? "Weekly milk plan" : "One-time order"}`,
    `Bottle: ${bottle === "new" ? "No return bottle (+₹10 once)" : "M'ma bottle will be returned on delivery (₹62 exchange price)"}`,
  ].join("\n");
  const whatsapp = new URL("https://wa.me/919818804419");
  whatsapp.searchParams.set("text", message);
  redirect(whatsapp.toString());
}
