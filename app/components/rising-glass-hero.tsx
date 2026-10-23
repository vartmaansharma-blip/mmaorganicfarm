"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useRef } from "react";
import { dampProgress, heroFrame, heroProgress, liquidGeometry } from "@/lib/hero-motion";
import styles from "./rising-glass-hero.module.css";

export function RisingGlassHero() {
  const section = useRef<HTMLElement>(null);
  const liquidMask = useRef<SVGPathElement>(null);
  const maskId = `milk-${useId().replace(/:/g, "")}`;

  useEffect(() => {
    const root = section.current;
    if (!root) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let lastTime = 0;
    let current = -1;
    const paint = (time: number) => {
      const rect = root.getBoundingClientRect();
      const panel = root.firstElementChild as HTMLElement;
      const headerHeight = parseFloat(getComputedStyle(panel).top) || 0;
      const target = heroProgress(rect.top, rect.height, panel.offsetHeight, headerHeight);
      const snap = current < 0 || motion.matches || target === 0 || target === 1;
      current = snap ? target : dampProgress(current, target, lastTime ? Math.min(64, time - lastTime) : 16.67);
      const values = heroFrame(current, motion.matches);
      const liquid = liquidGeometry(values.fill);
      root.style.setProperty("--fill-progress", String(values.fill));
      root.style.setProperty("--coffee-progress", String(values.coffee));
      root.style.setProperty("--angle-opacity", String(values.angle));
      root.style.setProperty("--detail-progress", String(values.detail));
      root.style.setProperty("--liquid-y", `${liquid.y * 100}%`);
      root.style.setProperty("--liquid-left", `${liquid.left * 100}%`);
      root.style.setProperty("--liquid-depth", `${liquid.depth * 100}%`);
      liquidMask.current?.setAttribute("d", liquid.path);
      root.dataset.fill = values.fill.toFixed(3);
      root.dataset.progress = (motion.matches ? 1 : current).toFixed(3);
      if (!motion.matches && Math.abs(target - current) > 0.0001) {
        lastTime = time;
        frame = window.requestAnimationFrame(paint);
      } else {
        frame = 0;
        lastTime = 0;
      }
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(paint); };
    const reset = () => { current = -1; schedule(); };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", reset);
    window.addEventListener("pageshow", reset);
    motion.addEventListener("change", reset);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", reset);
      window.removeEventListener("pageshow", reset);
      motion.removeEventListener("change", reset);
    };
  }, []);

  return (
    <section ref={section} className={styles.sequence} id="home" aria-labelledby="hero-heading">
      <div className={styles.panel}>
        <div className={styles.copy}>
          <p className={styles.label}>MAMA ORGANIC FARM</p>
          <span className={styles.rule} aria-hidden="true" />
          <h1 id="hero-heading">Every glass<br />has a beginning<span className={styles.period}>.</span></h1>
          <p className={styles.description}>Discover the farm behind<br className={styles.desktopBreak} /> your everyday milk.</p>
          <div className={styles.actions}>
            <Link className={styles.primary} href="/milk" prefetch={false}>Shop Mama <span aria-hidden="true">→</span></Link>
            <a className={styles.secondary} href="#farm">Explore the Farm</a>
          </div>
        </div>

        <div className={styles.visual} role="img" aria-label="A traditional grooved glass fills with milk, reveals coffee ribbons, then changes viewpoint as you scroll">
          <div className={styles.glass} aria-hidden="true">
            <Image className={styles.empty} src="/hero/glass-empty.webp" alt="" width={1024} height={1536} priority sizes="(max-width: 720px) 240px, 38vw" />
            <svg className={styles.maskDefinitions} width="1" height="1" aria-hidden="true" focusable="false">
              <defs>
                <clipPath id={maskId} clipPathUnits="objectBoundingBox">
                  <path ref={liquidMask} d={liquidGeometry(0).path} />
                </clipPath>
              </defs>
            </svg>
            <div className={styles.milk} style={{ clipPath: `url(#${maskId})` }}>
              <Image src="/hero/glass-milk.webp" alt="" width={1024} height={1536} priority sizes="(max-width: 720px) 240px, 38vw" />
            </div>
            <span className={styles.surface} />
            <Image className={styles.coffee} src="/hero/coffee-front.webp" alt="" width={1024} height={1536} loading="eager" sizes="(max-width: 720px) 240px, 38vw" />
            <Image className={styles.angle} src="/hero/coffee-angle.webp" alt="" width={1024} height={1536} loading="eager" sizes="(max-width: 720px) 240px, 38vw" />
          </div>
        </div>

        <ol className={styles.chapters} aria-label="From the glass to your home">
          <li className={styles.current}><span>01</span><small>The glass</small></li>
          <li><a href="#farm"><span>02</span><small>Our farm</small></a></li>
          <li><a href="#milk"><span>03</span><small>Your home</small></a></li>
        </ol>

        <a className={styles.scroll} href="#site-content">
          <span className={styles.mouse} aria-hidden="true"><i /></span>
          <span>Scroll to fill<small>Discover the story</small></span>
          <span className={styles.down} aria-hidden="true">↓</span>
        </a>
        <a className={styles.skip} href="#site-content">Skip introduction <span aria-hidden="true">↘</span></a>
      </div>
    </section>
  );
}
