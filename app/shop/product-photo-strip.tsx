"use client";

import Image from "next/image";
import type { ShopProductId } from "@/lib/shop-draft";
import { shopProduct } from "@/lib/shop-products";
import styles from "./shop.module.css";

const extraPhotos: Record<ShopProductId, { src: string; alt: string }> = {
  milk: { src: "/shop/milk-pasture.webp", alt: "A bottle and glass of milk with cows in the background" },
  paneer: { src: "/shop/paneer-serving.webp", alt: "Paneer and vegetables above a bowl of salad" },
  ghee: { src: "/shop/ghee-serving.webp", alt: "Golden ghee dripping from a M’ma ghee jar" },
};

export function ProductPhotoStrip({ id }: { id: ShopProductId }) {
  const product = shopProduct(id);
  const extra = extraPhotos[id];
  return (
    <div className={styles.detailPhoto}>
      <div className={styles.photoStrip} role="region" aria-label={`${product.name} photographs`} tabIndex={0} onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        event.currentTarget.scrollBy({ left: event.key === "ArrowRight" ? event.currentTarget.clientWidth : -event.currentTarget.clientWidth });
      }}>
        <div className={styles.photoSlide}>
          <Image src={product.image} alt={product.alt} width={800} height={1000}
            sizes="(max-width: 700px) 90vw, 45vw" priority />
        </div>
        <div className={styles.photoSlide}>
          <Image className={styles.extraPhoto} src={extra.src} alt={extra.alt} width={800} height={1000}
            sizes="(max-width: 700px) 90vw, 45vw" />
        </div>
      </div>
      <p className={styles.photoHint}>Swipe or scroll for another photo <span aria-hidden="true">→</span></p>
    </div>
  );
}
