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
  ghee: "SHOPIFY_VARIANT_GHEE",
  milk: "SHOPIFY_VARIANT_MILK",
  paneer: "SHOPIFY_VARIANT_PANEER",
} as const;

export type ShopifyProductKey = keyof typeof variantEnvironmentKeys;

const requiredStorefrontKeys: readonly string[] = [
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

function shopifyApiVersion() {
  return process.env.SHOPIFY_STOREFRONT_API_VERSION?.trim() || "2026-07";
}

function variantGid(value: string) {
  return value.startsWith("gid://")
    ? value
    : `gid://shopify/ProductVariant/${value}`;
}

export function hasShopifyStorefrontConfig() {
  return shopifyMissingConfiguration().length === 0;
}

export function shopifyMissingConfiguration() {
  return requiredStorefrontKeys.filter((key) => {
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
  buyerIp,
  lines,
}: {
  attributes: Array<{ key: string; value: string }>;
  buyer: { email?: string; phone?: string };
  buyerIp?: string;
  lines: ShopifyCartLine[];
}) {
  const domain = shopifyDomain();
  const publicToken = process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN?.trim();
  const privateToken =
    process.env.SHOPIFY_STOREFRONT_PRIVATE_ACCESS_TOKEN?.trim();
  if (!domain) throw new Error("Shopify Storefront API is not configured.");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (privateToken) {
    headers["Shopify-Storefront-Private-Token"] = privateToken;
    if (buyerIp) headers["Shopify-Storefront-Buyer-IP"] = buyerIp;
  } else if (publicToken) {
    headers["X-Shopify-Storefront-Access-Token"] = publicToken;
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
      headers,
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
