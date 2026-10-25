import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isShopProduct } from "@/lib/shop-draft";
import { shopProduct } from "@/lib/shop-products";
import { ProductDetails } from "../product-details";
type Props = {
  params: Promise<{
    product: string;
  }>;
};
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { product } = await params;
  if (!isShopProduct(product)) return {};
  const p = shopProduct(product);
  return {
    title: p.name,
    description: p.description,
    alternates: { canonical: `/shop/${product}` },
  };
}
export default async function ProductPage({ params }: Props) {
  const { product } = await params;
  if (!isShopProduct(product)) notFound();
  return <ProductDetails key={product} id={product} />;
}
