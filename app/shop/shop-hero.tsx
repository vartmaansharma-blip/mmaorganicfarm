"use client";
import { useProductPricing } from "../components/product-pricing";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { SHOP_PRODUCTS } from "@/lib/shop-products";
import styles from "./shop.module.css";
export function ShopHero() {
  const {prices} = useProductPricing();
  const [index, setIndex] = useState(0),
    [reduced, setReduced] = useState(false);
  const pressed = useRef(false);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  useEffect(() => {
    if (reduced) return;
    const timer = setInterval(() => {
      if (!document.hidden && !pressed.current)
        setIndex((current) => (current + 1) % SHOP_PRODUCTS.length);
    }, 3000);
    return () => clearInterval(timer);
  }, [reduced]);
  const product = SHOP_PRODUCTS[index];
  return (
    <section className={styles.hero} aria-labelledby="shop-title">
      <div className={styles.intro}>
        <p className={styles.eyebrow}>M’ma Organic Farm</p>
        <h1 className="customer-page-heading" id="shop-title">
          Bring M’ma
          <br />
          home<span>.</span>
        </h1>
        <p>
          Milk, paneer and ghee.
          <br />
          Good things for your everyday.
        </p>
      </div>
      <Link
        className={styles.heroPhoto}
        href={`/shop/${product.id}`}
        aria-label={`Explore ${product.name}`}
        onPointerDown={() => {
          pressed.current = true;
        }}
        onPointerCancel={() => {
          pressed.current = false;
        }}
        onPointerLeave={() => {
          pressed.current = false;
        }}
        onClick={() => {
          pressed.current = false;
        }}
      >
        {SHOP_PRODUCTS.map((p, i) => (
          <span
            key={p.id}
            className={styles.slide}
            data-position={
              i === index
                ? "current"
                : i === (index + 1) % SHOP_PRODUCTS.length
                  ? "next"
                  : "previous"
            }
            aria-hidden={i !== index}
          >
            <Image
              src={p.image}
              alt={p.alt}
              fill
              sizes="(max-width: 600px) 94vw, (max-width: 1100px) 55vw, 650px"
              priority={i === 0}
            />
          </span>
        ))}
      </Link>
      <div className={styles.heroCaption}>
        <div>
          <h2>{product.name}</h2>
          <p>
            ₹{prices[product.id]} / {product.unit}
          </p>
        </div>
        <p>Tap the photograph to explore.</p>
      </div>
    </section>
  );
}
