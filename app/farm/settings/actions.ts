"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { readProductCatalogue } from "@/lib/product-prices-server";
import { formatCheckoutAmount } from "@/lib/checkout-display";
import { requireFarmManager } from "@/lib/farm-dashboard";
import { DEFAULT_ORDER_FEES, ORDER_FEE_KEYS, ORDER_FEE_LABELS, PRODUCT_PRICE_KEYS } from "@/lib/product-prices";

export async function updateProductPrices(form: FormData) {
  const { role, supabase } = await requireFarmManager("/farm/settings");
  if (role !== "admin")
    redirect("/farm/settings?error=Owner+access+is+required.");
  const prices: Record<string, number> = {};
  for (const key of [...PRODUCT_PRICE_KEYS, ...ORDER_FEE_KEYS]) {
    const raw = String(form.get(key) ?? "").trim();
    if (
      !/^\d+(?:\.\d{1,2})?$/.test(raw) ||
      (PRODUCT_PRICE_KEYS.some((product) => product === key) && Number(raw) === 0) ||
      Number(raw) > 100000
    )
      redirect(
        "/farm/settings?error=Enter+positive+product+prices+and+non-negative+fees+with+up+to+two+decimal+places.",
      );
    prices[key] = Math.round(Number(raw) * 100);
  }
  const catalogue = await readProductCatalogue();
  const { error } = await supabase.rpc("update_farm_prices", {
    p_prices: prices,
    p_reason: "Updated from farm pricing settings",
    p_expected_revision: String(form.get("revision") ?? ""),
  });
  if (error)
    redirect(`/farm/settings?error=${encodeURIComponent(error.message)}`);
  const labels = { milk: "Milk", paneer: "Paneer", ghee: "Ghee", bottle: "New bottle", ...ORDER_FEE_LABELS };
  const previous = { ...DEFAULT_ORDER_FEES, ...catalogue.prices };
  const changed = ([...PRODUCT_PRICE_KEYS, ...ORDER_FEE_KEYS]).flatMap((key) =>
    Math.round(previous[key] * 100) === prices[key]
      ? [] : [`${labels[key]} ${formatCheckoutAmount(prices[key])}`],
  );
  revalidatePath("/", "layout");
  const message = changed.length
    ? `Updated for new orders: ${changed.join(", ")}.`
    : "Prices and fees are already up to date.";
  redirect(`/farm/settings?message=${encodeURIComponent(message)}`);
}
