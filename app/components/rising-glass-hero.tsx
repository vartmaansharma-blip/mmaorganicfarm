"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useRef } from "react";
import { dampProgress, heroFrame, heroProgress, liquidGeometry, macroPresentation, stepCamera, type CameraTransition } from "@/lib/hero-motion";
import styles from "./rising-glass-hero.module.css";

export function RisingGlassHero() {
  const section = useRef<HTMLElement>(null);
  const liquidMask = useRef<SVGPathElement>(null);
  const storyProgress = useRef<HTMLSpanElement>(null);
  const immersiveExit = useRef<HTMLAnchorElement>(null);
  const maskId = `milk-${useId().replace(/:/g, "")}`;

  useEffect(() => {
    const root = section.current;
    if (!root) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let lastTime = 0;
    let current = -1;
    let camera: CameraTransition | undefined;
    const paint = (time: number) => {
      const rect = root.getBoundingClientRect();
      const panel = root.firstElementChild as HTMLElement;
      const headerHeight = parseFloat(getComputedStyle(panel).top) || 0;
      const target = heroProgress(rect.top, rect.height, panel.offsetHeight, headerHeight);
      const firstPaint = current < 0;
      const snap = firstPaint || motion.matches || target === 0 || target === 1;
      current = snap ? target : dampProgress(current, target, lastTime ? Math.min(64, time - lastTime) : 16.67);
      const progress = motion.matches ? 1 : current;
      root.style.setProperty("--scroll-progress", String(progress));
      root.dataset.progressStage = progress >= .999 ? "complete" : progress >= .5 ? "middle" : "beginning";
      storyProgress.current?.setAttribute("aria-valuenow", String(Math.round(progress * 100)));
      const targetFrame = heroFrame(current, motion.matches, camera?.to);
      const shot = stepCamera(camera, targetFrame, time, firstPaint || motion.matches);
      camera = shot.state;
      const values = { fill: targetFrame.fill, ...shot.values };
      root.dataset.transitioning = String(shot.active);
      const liquid = liquidGeometry(values.fill);
      root.style.setProperty("--fill-progress", String(values.fill));
      root.style.setProperty("--coffee-progress", String(values.coffee));
      const curtain = macroPresentation(rect.bottom, window.innerHeight, values.macro, headerHeight);
      root.style.setProperty("--angle-opacity", String(Math.min(1, values.side + values.top + values.macro)));
      root.style.setProperty("--side-opacity", String(values.side));
      root.style.setProperty("--top-opacity", String(values.top));
      root.style.setProperty("--macro-opacity", String(curtain.opacity));
      root.style.setProperty("--macro-offset", `${curtain.offsetY}px`);
      root.dataset.immersive = String(curtain.immersive);
      root.dataset.macroVisible = String(curtain.opacity > .001);
      document.documentElement.dataset.heroImmersive = String(curtain.immersive);
      document.documentElement.style.setProperty("--hero-chrome-opacity", String(1 - curtain.opacity));
      if (immersiveExit.current) immersiveExit.current.tabIndex = curtain.immersive ? 0 : -1;
      root.dataset.shot = values.macro > .5 ? "macro" : values.top > .5 ? "top" : values.side > .5 ? "side" : "front";
      root.style.setProperty("--liquid-y", `${liquid.y * 100}%`);
      root.style.setProperty("--liquid-left", `${liquid.left * 100}%`);
      root.style.setProperty("--liquid-depth", `${liquid.depth * 100}%`);
      liquidMask.current?.setAttribute("d", liquid.path);
      root.dataset.fill = values.fill.toFixed(3);
      root.dataset.progress = (motion.matches ? 1 : current).toFixed(3);
      if (!motion.matches && (Math.abs(target - current) > 0.0001 || shot.active)) {
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
      delete document.documentElement.dataset.heroImmersive;
      document.documentElement.style.removeProperty("--hero-chrome-opacity");
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
          <p className={styles.label}>M&apos;MA ORGANIC FARM</p>
          <span className={styles.rule} aria-hidden="true" />
          <h1 id="hero-heading">Every glass<br />has a beginning<span className={styles.period} aria-hidden="true">.</span></h1>
          <p className={styles.description}>Discover the farm behind<br className={styles.desktopBreak} /> your everyday milk.</p>
          <div className={styles.actions}>
            <Link className={styles.primary} href="/milk" prefetch={false} data-conversion="hero_cta_click" data-location="hero">Shop M&apos;ma <span aria-hidden="true">→</span></Link>
            <a className={styles.secondary} href="#farm">Explore the Farm</a>
          </div>
        </div>

        <div className={styles.visual}>
          <div className={styles.glass} role="img" aria-label="A traditional grooved glass fills with milk, reveals coffee ribbons, then reveals side and top-down views as you scroll">
            <Image className={styles.empty} src="/hero/glass-empty.webp" alt="" width={800} height={1200} priority sizes="(max-width: 720px) 240px, 38vw" />
            <svg className={styles.maskDefinitions} width="1" height="1" aria-hidden="true" focusable="false">
              <defs>
                <clipPath id={maskId} clipPathUnits="objectBoundingBox">
                  <path ref={liquidMask} d={liquidGeometry(0).path} />
                </clipPath>
              </defs>
            </svg>
            <div className={styles.milk} style={{ clipPath: `url(#${maskId})` }}>
              <Image src="/hero/glass-milk.webp" alt="" width={800} height={1200} loading="lazy" sizes="(max-width: 720px) 240px, 38vw" />
            </div>
            <span className={styles.surface} />
            <Image className={styles.coffee} src="/hero/coffee-front.webp" alt="" width={800} height={1200} loading="lazy" sizes="(max-width: 720px) 240px, 38vw" />
            <Image className={styles.side} src="/hero/coffee-side-v2.webp" alt="" width={800} height={1200} loading="lazy" sizes="(max-width: 720px) 240px, 38vw" />
            <Image className={styles.top} src="/hero/coffee-top.webp" alt="" width={800} height={1200} loading="lazy" sizes="(max-width: 720px) 260px, 38vw" />
          </div>
        </div>

        <div className={styles.macro} aria-hidden="true">
          <Image src="/hero/coffee-macro.webp" alt="" fill loading="lazy" sizes="(max-aspect-ratio: 16/9) 178vh, 100vw" />
        </div>
        <a ref={immersiveExit} className={styles.immersiveExit} href="#site-content" tabIndex={-1}>Continue to the site</a>

        <div className={styles.storyRail}>
        <span ref={storyProgress} className={styles.progressMeter} role="progressbar" aria-label="Glass story scroll progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={0} />
        <ol className={styles.chapters} aria-label="From the glass to your home">
          <li className={styles.current}><span>01</span><small>The glass</small></li>
          <li><a href="#farm"><span>02</span><small>Our farm</small></a></li>
          <li><a href="#milk"><span>03</span><small>Your home</small></a></li>
        </ol>
        </div>

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
