"use client";

import { useProductPricing } from "../components/product-pricing";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { SHOP_PRODUCTS } from "@/lib/shop-products";
import styles from "./shop.module.css";

const SLIDES = [
  {
    id: "basket" as const,
    name: "Three everyday favourites",
    image: "/shop/farm-basket-olive.webp",
    alt: "A woven basket holding M’ma milk, a 500 g ghee jar and a wrapped 500 g paneer pack",
    href: "#counter-title",
  },
  ...SHOP_PRODUCTS.map(product => ({ ...product, href: `/shop/${product.id}` })),
];

export function ShopHero() {
  const { prices } = useProductPricing();
  const section = useRef<HTMLElement>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const engaged = hovered || focused;
  const [reduced, setReduced] = useState(false);
  const [visible, setVisible] = useState(true);
  const [inView, setInView] = useState(true);
  const [loaded, setLoaded] = useState<string[]>([]);
  const last = index === SLIDES.length - 1;

  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotion = () => setReduced(media.matches);
    const syncVisibility = () => setVisible(!document.hidden);
    syncMotion();
    syncVisibility();
    media.addEventListener("change", syncMotion);
    document.addEventListener("visibilitychange", syncVisibility);
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: .2 });
    if (section.current) observer.observe(section.current);
    return () => {
      media.removeEventListener("change", syncMotion);
      document.removeEventListener("visibilitychange", syncVisibility);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    // Decode before revealing. The collection progresses once, basket to ghee.
    if (reduced || paused || engaged || !visible || !inView || last || !loaded.includes(SLIDES[index + 1].id)) return;
    const timer = setTimeout(() => setIndex(current => Math.min(current + 1, SLIDES.length - 1)), index === 0 ? 6500 : 5500);
    return () => clearTimeout(timer);
  }, [index, reduced, paused, engaged, visible, inView, last, loaded]);

  const slide = SLIDES[index];
  return (
    <section ref={section} className={styles.hero} aria-labelledby="shop-title" data-shop-hero data-slide={slide.id}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
      <div className={styles.intro}>
        <p className={styles.eyebrow}>M’ma Organic Farm</p>
        <h1 id="shop-title">Bring M’ma<br />home<span>.</span></h1>
        <p>Milk, paneer and ghee.<br />Good things for your everyday.</p>
      </div>
      <Link className={styles.heroPhoto} href={slide.href} onPointerDown={() => setPaused(true)}
        aria-label={slide.id === "basket" ? "Explore all three farm products" : `Explore ${slide.name}`}>
        {SLIDES.map((item, i) => (
          <span key={item.id} className={styles.slide} data-position={i === index ? "current" : i < index ? "previous" : "next"} aria-hidden={i !== index}>
            <Image src={item.image} alt={item.alt} fill
              sizes="(max-width: 600px) 94vw, (max-width: 1100px) 55vw, 650px"
              priority={i === 0} loading={i === 0 ? undefined : "eager"}
              onLoad={event => {
                const image = event.currentTarget;
                void image.decode().then(() => setLoaded(current => current.includes(item.id) ? current : [...current, item.id])).catch(() => {});
              }} />
          </span>
        ))}
      </Link>
      <div className={styles.heroCaption}>
        <div className={styles.captionStack} aria-live="off">
          {SLIDES.map((item, i) => (
            <div key={item.id} className={styles.captionSlide} data-current={i === index} aria-hidden={i !== index}>
              <h2>{item.name}</h2>
              <p>{item.id === "basket" ? "Milk, paneer and ghee, from our farm." : `₹${prices[item.id]} / ${item.unit}`}</p>
            </div>
          ))}
        </div>
        <p>Tap the photograph to explore.</p>
        <div className={styles.heroControls}>
          <span className={styles.slideCount} aria-label={`Photograph ${index + 1} of ${SLIDES.length}`}>{String(index + 1).padStart(2, "0")} <span aria-hidden="true">/ {String(SLIDES.length).padStart(2, "0")}</span></span>
          <div className={styles.slideProgress} aria-hidden="true">{SLIDES.map((item, i) => <span key={item.id} data-filled={i <= index} />)}</div>
          {!reduced && <button type="button" onClick={() => setPaused(current => !current)} aria-label={paused ? "Play product photographs" : "Pause product photographs"} aria-pressed={paused} disabled={last}>{paused ? "Play" : "Pause"}</button>}
          <button type="button" onClick={() => setIndex(current => Math.min(current + 1, SLIDES.length - 1))} disabled={last || !loaded.includes(SLIDES[index + 1]?.id)} aria-label={last ? "Last product photograph" : "Next product photograph"}>Next <span aria-hidden="true">↗</span></button>
        </div>
      </div>
    </section>
  );
}
