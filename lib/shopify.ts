import "server-only";

type ShopifyCartLine = {
  attributes?: Array<{ key: string; value: string }>;
  merchandiseId: string;
  quantity: number;
};

const variantEnvironmentKeys = {
  ghee: "SHOPIFY_VARIANT_GHEE",
  milk: "SHOPIFY_VARIANT_MILK",
  paneer: "SHOPIFY_VARIANT_PANEER",
} as const;

export type ShopifyProductKey = keyof typeof variantEnvironmentKeys;

const requiredCheckoutKeys: readonly string[] = [
  "SHOPIFY_STORE_DOMAIN",
  variantEnvironmentKeys.milk,
  variantEnvironmentKeys.paneer,
  variantEnvironmentKeys.ghee,
];

export function isShopifyProductKey(value: string): value is ShopifyProductKey {
  return value in variantEnvironmentKeys;
}

function shopifyDomain() {
  const value = process.env.SHOPIFY_STORE_DOMAIN?.trim() ?? "";
  return value.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function numericVariantId(value: string) {
  const id = value.replace(/^gid:\/\/shopify\/ProductVariant\//, "");
  if (!/^\d+$/.test(id)) {
    throw new Error("A Shopify product variant ID is invalid.");
  }
  return id;
}

export function hasShopifyStorefrontConfig() {
  return shopifyMissingConfiguration().length === 0;
}

export function shopifyMissingConfiguration() {
  return requiredCheckoutKeys.filter((key) => {
    if (key === "SHOPIFY_STORE_DOMAIN") return !shopifyDomain();
    return !process.env[key]?.trim();
  });
}

export function hasShopifyWebhookConfig() {
  return Boolean(process.env.SHOPIFY_WEBHOOK_SECRET);
}

export function shopifyVariantId(productKey: ShopifyProductKey) {
  const environmentKey = variantEnvironmentKeys[productKey];
  const value = process.env[environmentKey]?.trim();
  if (!value) {
    throw new Error(`Shopify product variant is not configured for ${productKey}.`);
  }
  return numericVariantId(value);
}

export function shopifyWebhookSecret() {
  const value = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!value) throw new Error("Shopify webhook secret is not configured.");
  return value;
}

export async function createShopifyCart({
  attributes,
  buyer,
  lines,
}: {
  attributes: Array<{ key: string; value: string }>;
  buyer: { email?: string; phone?: string };
  buyerIp?: string;
  lines: ShopifyCartLine[];
}) {
  const domain = shopifyDomain();
  if (!domain) throw new Error("Shopify checkout is not configured.");
  if (!lines.length) throw new Error("The order has no products to check out.");

  const cartLines = lines
    .map((line) => {
      const quantity = Math.round(line.quantity);
      if (quantity < 1) throw new Error("The order has an invalid quantity.");
      return `${numericVariantId(line.merchandiseId)}:${quantity}`;
    })
    .join(",");

  const checkoutUrl = new URL(`https://${domain}/cart/${cartLines}`);
  for (const attribute of attributes) {
    checkoutUrl.searchParams.set(`attributes[${attribute.key}]`, attribute.value);
  }
  if (buyer.email) checkoutUrl.searchParams.set("checkout[email]", buyer.email);
  if (buyer.phone) checkoutUrl.searchParams.set("attributes[delivery_phone]", buyer.phone);

  const internalOrderId =
    attributes.find((attribute) => attribute.key === "mma_order_id")?.value ??
    "order";
  return {
    checkoutUrl: checkoutUrl.toString(),
    id: `permalink:${internalOrderId}`,
  };
}
