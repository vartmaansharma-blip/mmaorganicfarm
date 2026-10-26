"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireFarmManager } from "@/lib/farm-dashboard";
import { PRODUCT_PRICE_KEYS } from "@/lib/product-prices";

export async function updateProductPrices(form: FormData) {
  const { role, supabase } = await requireFarmManager("/farm/settings");
  if (role !== "admin")
    redirect("/farm/settings?error=Owner+access+is+required.");
  const prices: Record<string, number> = {};
  for (const key of PRODUCT_PRICE_KEYS) {
    const raw = String(form.get(key) ?? "").trim();
    if (
      !/^\d+(?:\.\d{1,2})?$/.test(raw) ||
      Number(raw) <= 0 ||
      Number(raw) > 100000
    )
      redirect(
        "/farm/settings?error=Enter+positive+prices+with+up+to+two+decimal+places.",
      );
    prices[key] = Math.round(Number(raw) * 100);
  }
  const { error } = await supabase.rpc("update_farm_prices", {
    p_prices: prices,
    p_reason: String(form.get("reason") ?? "").trim(),
    p_expected_revision: String(form.get("revision") ?? ""),
  });
  if (error)
    redirect(`/farm/settings?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/", "layout");
  redirect(
    "/farm/settings?message=Product+prices+saved.+Existing+orders+keep+their+agreed+prices.",
  );
}
