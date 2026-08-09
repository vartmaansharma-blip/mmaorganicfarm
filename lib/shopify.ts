import "server-only";

type ShopifyCartLine = {
  attributes?: Array<{ key: string; value: string }>;
  merchandiseId: string;
  quantity: number;
};

type ShopifyCartCreateResponse = {
  cartCreate?: {
    cart?: { checkoutUrl: string; id: string } | null;
    userErrors?: Array<{ message: string }>;
  };
};

const variantEnvironmentKeys = {
  bottle: "SHOPIFY_VARIANT_GLASS_BOTTLE",
  ghee: "SHOPIFY_VARIANT_GHEE",
  milk: "SHOPIFY_VARIANT_MILK",
  paneer: "SHOPIFY_VARIANT_PANEER",
  papaya: "SHOPIFY_VARIANT_PAPAYA",
  sweets: "SHOPIFY_VARIANT_SWEETS",
} as const;

export type ShopifyProductKey = keyof typeof variantEnvironmentKeys;

function shopifyDomain() {
  const value = process.env.SHOPIFY_STORE_DOMAIN?.trim() ?? "";
  return value.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function shopifyApiVersion() {
  return process.env.SHOPIFY_STOREFRONT_API_VERSION?.trim() || "2026-07";
}

function variantGid(value: string) {
  return value.startsWith("gid://")
    ? value
    : `gid://shopify/ProductVariant/${value}`;
}

export function hasShopifyStorefrontConfig() {
  return Boolean(
    shopifyDomain() &&
      process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN &&
      process.env.SHOPIFY_VARIANT_MILK,
  );
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
  return variantGid(value);
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
  lines: ShopifyCartLine[];
}) {
  const domain = shopifyDomain();
  const token = process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN;
  if (!domain || !token) {
    throw new Error("Shopify Storefront API is not configured.");
  }

  const query = `
    mutation CreateMmaCart($input: CartInput!) {
      cartCreate(input: $input) {
        cart { id checkoutUrl }
        userErrors { message }
      }
    }
  `;
  const response = await fetch(
    `https://${domain}/api/${shopifyApiVersion()}/graphql.json`,
    {
      body: JSON.stringify({
        query,
        variables: {
          input: {
            attributes,
            buyerIdentity: {
              countryCode: "IN",
              ...(buyer.email ? { email: buyer.email } : {}),
              ...(buyer.phone ? { phone: buyer.phone } : {}),
            },
            lines,
          },
        },
      }),
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Storefront-Access-Token": token,
      },
      method: "POST",
    },
  );

  if (!response.ok) {
    throw new Error(`Shopify cart request failed with status ${response.status}.`);
  }

  const result = (await response.json()) as {
    data?: ShopifyCartCreateResponse;
    errors?: Array<{ message: string }>;
  };
  const error =
    result.errors?.[0]?.message ??
    result.data?.cartCreate?.userErrors?.[0]?.message;
  const cart = result.data?.cartCreate?.cart;
  if (error || !cart) {
    throw new Error(error || "Shopify did not create a checkout cart.");
  }

  const checkoutUrl = new URL(cart.checkoutUrl);
  if (checkoutUrl.protocol !== "https:") {
    throw new Error("Shopify returned an invalid checkout URL.");
  }

  return { checkoutUrl: checkoutUrl.toString(), id: cart.id };
}
