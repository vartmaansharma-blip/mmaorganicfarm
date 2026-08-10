import { NextResponse } from "next/server";
import { hasSupabaseAdminConfig } from "@/lib/supabase/admin";
import {
  hasShopifyStorefrontConfig,
  hasShopifyWebhookConfig,
  shopifyMissingConfiguration,
} from "@/lib/shopify";

export const runtime = "nodejs";

export function GET() {
  const storefront = hasShopifyStorefrontConfig();
  const webhook = hasShopifyWebhookConfig();
  const database = hasSupabaseAdminConfig();

  return NextResponse.json({
    configured: storefront && webhook && database,
    database,
    missing: [
      ...shopifyMissingConfiguration(),
      ...(!webhook ? ["SHOPIFY_WEBHOOK_SECRET"] : []),
      ...(!database ? ["SUPABASE_SECRET_KEY"] : []),
    ],
    storefront,
    webhook,
  });
}
