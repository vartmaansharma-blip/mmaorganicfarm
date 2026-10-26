import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  productPricesFromPaise,
  type ProductCatalogue,
} from "./product-prices";

// React cache deduplicates this public lookup within one server request. It is
// not a process-wide price cache, so a saved catalogue is visible immediately.
export const readProductCatalogue = cache(
  async (): Promise<ProductCatalogue> => {
    const client = await createClient();
    const { data, error } = await client
      .from("farm_catalog_prices")
      .select("revision,prices")
      .single();
    if (error || !data)
      throw Error(
        "Product prices are temporarily unavailable. Please try again.",
      );
    return {
      revision: data.revision,
      prices: productPricesFromPaise(data.prices),
    };
  },
);

export async function readOrderProductPrices(
  client: SupabaseClient,
  orderId: string,
) {
  const { data, error } = await client.rpc("order_product_prices", {
    p_order_id: orderId,
  });
  if (error || !data)
    throw Error("The agreed order prices could not be verified.");
  return productPricesFromPaise(data);
}
