"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { ShopProductId } from "@/lib/shop-draft";
import { shopProduct } from "@/lib/shop-products";
import styles from "./product-gallery.module.css";

const EXTRA_PHOTOS = {
  milk: { image: "/shop/milk-pasture.webp", alt: "A M’ma milk bottle and glass on a table overlooking the pasture", label: "In the pasture" },
  paneer: { image: "/shop/paneer-serving.webp", alt: "Golden paneer cubes and vegetables tossed above a bowl of salad", label: "At the table" },
  ghee: { image: "/shop/ghee-serving.webp", alt: "Golden ghee dripping from an open M’ma ghee jar", label: "A golden detail" },
} satisfies Record<ShopProductId, { image: string; alt: string; label: string }>;

export function ProductGallery({ id }: { id: ShopProductId }) {
  const product = shopProduct(id);
  const photos = [{ image: product.image, alt: product.alt, label: "The product" }, EXTRA_PHOTOS[id]];
  const root = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ x: number; y: number } | null>(null);
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState<number[]>([]);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [touching, setTouching] = useState(false);
  const [visible, setVisible] = useState(true);
  const [inView, setInView] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotion = () => setReduced(motion.matches);
    const syncVisibility = () => setVisible(!document.hidden);
    syncMotion(); syncVisibility();
    motion.addEventListener("change", syncMotion);
    document.addEventListener("visibilitychange", syncVisibility);
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: .25 });
    if (root.current) observer.observe(root.current);
    return () => {
      motion.removeEventListener("change", syncMotion);
      document.removeEventListener("visibilitychange", syncVisibility);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (reduced || hovered || focused || touching || !visible || !inView || !loaded.includes(1 - index)) return;
    const timer = setTimeout(() => setIndex(current => 1 - current), 6000);
    return () => clearTimeout(timer);
  }, [index, reduced, hovered, focused, touching, visible, inView, loaded]);

  function select(next: number) {
    if (loaded.includes(next)) setIndex(next);
  }

  return (
    <div ref={root} className={styles.gallery} role="region" aria-label={`${product.name} photographs`}
      data-product-gallery={id} data-photo={index}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
      <div className={styles.frame} tabIndex={0} aria-label="Product photograph. Swipe or use the arrow keys to browse."
        onKeyDown={event => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); select(1 - index); }
        }}
        onPointerDown={event => { gesture.current = { x: event.clientX, y: event.clientY }; setTouching(true); event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerUp={event => {
          const start = gesture.current;
          if (start && Math.abs(event.clientX - start.x) > 40 && Math.abs(event.clientX - start.x) > Math.abs(event.clientY - start.y)) select(1 - index);
          gesture.current = null; setTouching(false);
        }}
        onPointerCancel={() => { gesture.current = null; setTouching(false); }}
        onLostPointerCapture={() => { gesture.current = null; setTouching(false); }}>
        {photos.map((photo, i) => (
          <div key={photo.image} className={styles.photograph} data-current={i === index} aria-hidden={i !== index}>
            <Image src={photo.image} alt={photo.alt} fill priority={i === 0} loading={i === 0 ? undefined : "eager"}
              sizes="(max-width: 700px) 90vw, (max-width: 1100px) 42vw, 500px" draggable={false}
              onLoad={event => {
                void event.currentTarget.decode().then(() => setLoaded(current => current.includes(i) ? current : [...current, i])).catch(() => {});
              }} />
          </div>
        ))}
      </div>
      <div className={styles.thumbnails} aria-label="Choose a photograph">
        {photos.map((photo, i) => (
          <button key={photo.image} type="button" aria-label={`Show ${photo.label.toLowerCase()}`} aria-pressed={i === index}
            disabled={!loaded.includes(i)} onClick={() => select(i)}>
            <Image src={photo.image} alt="" width={64} height={80} sizes="64px" />
          </button>
        ))}
      </div>
      <p className={styles.caption} aria-live="off"><span>{photos[index].label}</span><span>0{index + 1} / 02</span></p>
    </div>
  );
}
