import { NextResponse } from "next/server";

export const runtime = "nodejs";

function shopifyDomain() {
  return (process.env.SHOPIFY_STORE_DOMAIN ?? "")
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
}

export async function GET() {
  if (process.env.VERCEL_ENV === "production") {
    return new NextResponse(null, { status: 404 });
  }

  const domain = shopifyDomain();
  if (!domain) {
    return NextResponse.json(
      { error: "Shopify store domain is not configured." },
      { status: 503 },
    );
  }

  const response = await fetch(`https://${domain}/products/milk.js`, {
    cache: "no-store",
  });
  if (!response.ok) {
    return NextResponse.json(
      { error: "The public Shopify milk product could not be read." },
      { status: response.status },
    );
  }

  const product = (await response.json()) as {
    handle?: string;
    title?: string;
    variants?: Array<{
      available?: boolean;
      id?: number;
      price?: number;
      title?: string;
    }>;
  };

  return NextResponse.json({
    handle: product.handle,
    title: product.title,
    variants: (product.variants ?? []).map((variant) => ({
      available: variant.available,
      id: variant.id,
      price: variant.price,
      title: variant.title,
    })),
  });
}
