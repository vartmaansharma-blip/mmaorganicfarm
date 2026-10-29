"use client";

import Image from "next/image";
import { useState } from "react";
import type { ShopProductId } from "@/lib/shop-draft";
import { shopProduct } from "@/lib/shop-products";
import styles from "./shop.module.css";

const additionalImages: Record<ShopProductId, { src: string; alt: string }> = {
  milk: { src: "/shop/milk-pasture.webp", alt: "A bottle and glass of milk with cows in the background" },
  paneer: { src: "/shop/paneer-serving.webp", alt: "Paneer and vegetables above a bowl of salad" },
  ghee: { src: "/shop/ghee-serving.webp", alt: "Golden ghee dripping from a M’ma ghee jar" },
};

export function ProductGallery({ id }: { id: ShopProductId }) {
  const product = shopProduct(id);
  const images = [{ src: product.image, alt: product.alt }, additionalImages[id]];
  const [selected, setSelected] = useState(0);
  const current = images[selected];

  return (
    <div className={styles.detailPhoto}>
      <div className={styles.galleryMain}>
        <Image className={selected === 1 ? styles.galleryAdditional : undefined} src={current.src} alt={current.alt} width={800} height={1000}
          sizes="(max-width: 700px) 90vw, 45vw" priority={selected === 0} />
      </div>
      <div className={styles.galleryChoices} role="group" aria-label={`${product.name} photographs`}>
        {images.map((image, index) => (
          <button key={image.src} type="button" aria-label={`Show ${index === 0 ? "product" : "additional"} photo`}
            aria-pressed={selected === index} onClick={() => setSelected(index)}>
            <Image src={image.src} alt="" width={64} height={72} sizes="64px" />
          </button>
        ))}
      </div>
    </div>
  );
}
