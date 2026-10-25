"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useRef } from "react";
import { advanceFilm, clamp01, FILM_DURATION_MS, filmFrame, heroProgress, liquidGeometry, macroPresentation, milkFill, playing, startFilm, type HeroFilm } from "@/lib/hero-motion";
import { condensationFrame, GLASS_BEADS } from "@/lib/hero-condensation";
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
    const panel = root.firstElementChild as HTMLElement;
    const html = document.documentElement;
    const body = document.body;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let film: HeroFilm = { state: history.state?.mmaHeroCompleted ? "COMPLETED" : "FILLING", time: history.state?.mmaHeroCompleted ? FILM_DURATION_MS : 0 };
    let frame = 0, lastTime = 0, waitingSince = 0, wetTime = 0, wetLast = 0;
    const beads = Array.from(root.querySelectorAll<SVGGElement>("[data-condensation-drop]")).map(group => ({
      bead: group.querySelector<SVGGElement>("[data-bead]")!,
      satellite: group.querySelector<SVGEllipseElement>("[data-satellite]")!,
      trail: group.querySelector<SVGPathElement>("[data-trail]")!,
    }));
    let disposed = false, initialized = false, armed = true, visitedContent = false, anchorNavigation = false, staticFallback = false;
    let assets: "loading" | "ready" | "failed" = "loading";
    let hold: { y: number; restore: () => void } | undefined;
    const persist = () => history.replaceState({ ...history.state, mmaHeroCompleted: film.state !== "FILLING" }, "");
    const geometry = () => {
      const rect = root.getBoundingClientRect();
      const header = parseFloat(getComputedStyle(panel).top) || 0;
      const y = hold ? hold.y : window.scrollY;
      return { rect, header, y, trigger: y + rect.top - header + Math.max(1, rect.height - panel.offsetHeight) };
    };
    const saveStyles = (element: HTMLElement, properties: string[]) => {
      const saved = properties.map(key => [key, element.style.getPropertyValue(key), element.style.getPropertyPriority(key)]);
      return () => saved.forEach(([key, value, priority]) => value ? element.style.setProperty(key, value, priority) : element.style.removeProperty(key));
    };
    const lock = (y: number) => {
      if (hold) return;
      const restoreHtml = saveStyles(html, ["overflow", "scroll-behavior"]);
      const restoreBody = saveStyles(body, ["position", "top", "left", "right", "padding-right", "overflow"]);
      const gutter = window.innerWidth - html.clientWidth;
      const padding = parseFloat(getComputedStyle(body).paddingRight) || 0;
      html.style.scrollBehavior = "auto";
      window.scrollTo({ top: y, behavior: "instant" });
      html.style.overflow = "hidden";
      // A fixed body with overflow-x:hidden becomes a new sticky scroll
      // container. Keep overflow visible so the approved header/panel stay pinned.
      body.style.overflow = "visible";
      body.style.position = "fixed";
      body.style.top = `${-y}px`;
      body.style.left = "0";
      body.style.right = "0";
      body.style.paddingRight = `${padding + gutter}px`;
      hold = { y, restore: () => { restoreBody(); restoreHtml(); } };
      root.dataset.held = "true";
    };
    const unlock = (y = hold?.y) => {
      if (!hold) return;
      hold.restore();
      hold = undefined;
      // Explicit instant behavior overrides the site's smooth anchor scrolling.
      window.scrollTo({ top: y, behavior: "instant" });
      root.dataset.held = "false";
    };
    const clearChrome = () => {
      delete html.dataset.heroImmersive;
      html.style.removeProperty("--hero-chrome-opacity");
    };
    const schedule = () => {
      if (!disposed && !document.hidden && !frame) frame = requestAnimationFrame(paint);
    };
    const cancel = () => {
      film = { state: "COMPLETED", time: FILM_DURATION_MS };
      waitingSince = 0;
      lastTime = 0;
      unlock();
      persist();
      clearChrome();
      schedule();
    };
    const paint = (now: number) => {
      frame = 0;
      if (disposed || document.hidden) return;
      let g = geometry();
      const scroll = heroProgress(g.rect.top, g.rect.height, panel.offsetHeight, g.header);
      if (!initialized) {
        // Restored/anchored content must never be dragged back into an introduction.
        if (location.hash && location.hash !== "#home") anchorNavigation = true;
        if (g.y > g.trigger + 24 || anchorNavigation) film = { state: "COMPLETED", time: FILM_DURATION_MS };
        visitedContent = g.y > g.trigger + 24;
        initialized = true;
      }
      if (motion.matches) {
        film = { state: "COMPLETED", time: FILM_DURATION_MS };
        unlock();
      } else if (!anchorNavigation) {
        if (film.state === "FILLING") {
          if (scroll < .94) armed = true;
          if (scroll >= .999 && armed) {
            // All responsive images decode before the clock starts. Loading has
            // a bounded budget; a failed/slow connection keeps a loaded front.
            lock(g.trigger);
            if (assets === "ready") {
              film = startFilm(film);
              waitingSince = 0;
              lastTime = now;
            } else {
              if (!waitingSince) waitingSince = now;
              if (assets === "failed" || now - waitingSince >= 1500) { staticFallback = true; cancel(); }
            }
          }
        } else if (film.state === "COMPLETED") {
          if (g.y > g.trigger + 24) visitedContent = true;
          if (visitedContent && g.y <= g.trigger && assets === "ready" && !staticFallback) {
            lock(g.trigger);
            film = startFilm(film, true);
            lastTime = now;
            visitedContent = false;
          }
        }
      }
      if (playing(film)) {
        const reverse = film.state === "PLAYING_REVERSE";
        film = advanceFilm(film, lastTime ? now - lastTime : 0);
        lastTime = now;
        if (!playing(film)) {
          if (reverse) armed = false;
          unlock(reverse ? (hold?.y ?? g.trigger) - 2 : undefined);
          persist();
          lastTime = 0;
        }
      }
      g = geometry();
      const fillScroll = heroProgress(g.rect.top, g.rect.height, panel.offsetHeight, g.header);
      const fill = film.state === "FILLING" && !hold ? milkFill(fillScroll) : 1;
      const values = filmFrame(film.time);
      // Failed imagery never reveals a blank camera layer.
      if (assets !== "ready" || motion.matches || staticFallback) Object.assign(values, { coffee: assets === "ready" && !staticFallback ? 1 : 0, side: 0, top: 0, macro: 0, macroDrift: 0, overheadSettle: 1 });
      const progress = film.state === "FILLING" ? fill * .5 : .5 + .5 * film.time / FILM_DURATION_MS;
      const liquid = liquidGeometry(fill);
      const curtain = macroPresentation(g.rect.bottom, window.innerHeight, values.macro, g.header);
      root.style.setProperty("--scroll-progress", String(progress));
      root.style.setProperty("--fill-progress", String(fill));
      root.style.setProperty("--coffee-progress", String(values.coffee));
      root.style.setProperty("--angle-opacity", String(Math.min(1, values.side + values.top + values.macro)));
      root.style.setProperty("--side-opacity", String(values.side));
      root.style.setProperty("--top-opacity", String(values.top));
      root.style.setProperty("--macro-opacity", String(curtain.opacity));
      root.style.setProperty("--macro-offset", `${curtain.offsetY}px`);
      root.style.setProperty("--macro-drift", String(values.macroDrift));
      root.style.setProperty("--overhead-settle", String(values.overheadSettle));
      root.style.setProperty("--liquid-y", `${liquid.y * 100}%`);
      root.style.setProperty("--liquid-left", `${liquid.left * 100}%`);
      root.style.setProperty("--liquid-depth", `${liquid.depth * 100}%`);
      liquidMask.current?.setAttribute("d", liquid.path);
      const wetVisible = !motion.matches && fill > .06 && values.top < .999 && values.macro < .999 && g.rect.bottom > g.header + 22 && g.rect.top < innerHeight;
      root.style.setProperty("--condensation-opacity", String(wetVisible ? Math.min(1, fill * 2) * (1 - values.top) * (1 - values.macro) : 0));
      if (wetVisible) {
        if (wetLast) wetTime += Math.min(50, now - wetLast);
        condensationFrame(wetTime).forEach((drop, i) => {
          const elements = beads[i];
          elements.bead.setAttribute("transform", `translate(0 ${drop.distance}) scale(${drop.radius} ${drop.radius * 1.32})`);
          elements.bead.setAttribute("opacity", String(drop.opacity));
          elements.satellite.setAttribute("opacity", String(drop.satelliteOpacity));
          elements.trail.setAttribute("d", `M 0 ${Math.max(0, drop.distance - 42)} L 0 ${Math.max(0, drop.distance - drop.radius)}`);
          elements.trail.setAttribute("opacity", String(drop.trailOpacity));
        });
      }
      wetLast = wetVisible ? now : 0;
      root.dataset.state = film.state;
      root.dataset.filmTime = String(Math.round(film.time));
      root.dataset.filmStage = values.stage;
      root.dataset.assets = assets;
      root.dataset.transitioning = String(playing(film));
      root.dataset.progressStage = progress >= .999 ? "complete" : progress >= .5 ? "middle" : "beginning";
      root.dataset.fill = fill.toFixed(3);
      root.dataset.progress = progress.toFixed(3);
      root.dataset.shot = values.macro > .5 ? "macro" : values.top > .5 ? "top" : values.side > .5 ? "side" : "front";
      root.dataset.immersive = String(curtain.immersive);
      root.dataset.macroVisible = String(curtain.opacity > .001);
      html.dataset.heroImmersive = String(curtain.immersive);
      html.style.setProperty("--hero-chrome-opacity", String(1 - curtain.opacity));
      if (immersiveExit.current) immersiveExit.current.tabIndex = curtain.opacity > .001 ? 0 : -1;
      const description = motion.matches ? "Introduction complete. Scroll to explore the farm." : hold && !playing(film) ? "Milk full. Preparing the introduction." : film.state === "FILLING" ? `Milk ${Math.round(fill * 100)}% full. Scroll to fill; a short film follows.` : film.state === "COMPLETED" ? "Introduction complete. Scroll to explore the farm." : film.state === "PLAYING_REVERSE" ? "Introduction playing backward. Scroll upward afterward to empty the glass." : "Introduction playing automatically. Scroll to explore afterward, or skip at any time.";
      storyProgress.current?.setAttribute("aria-valuenow", String(Math.round(clamp01(progress) * 100)));
      storyProgress.current?.setAttribute("aria-valuetext", description);
      if (playing(film) || hold || wetVisible) schedule();
    };
    const scroll = () => { if (hold && window.scrollY !== 0) window.scrollTo({ top: 0, behavior: "instant" }); schedule(); };
    const resize = () => {
      if (hold) { hold.y = geometry().trigger; body.style.top = `${-hold.y}px`; }
      lastTime = 0;
      schedule();
    };
    const visibility = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      lastTime = 0;
      wetLast = 0;
      if (!document.hidden) { waitingSince = 0; schedule(); }
    };
    let lastTouchY: number | undefined;
    const touchStart = (event: TouchEvent) => { lastTouchY = event.touches.length === 1 ? event.touches[0].clientY : undefined; };
    const touchEnd = () => { lastTouchY = undefined; };
    const input = (event: Event) => {
      anchorNavigation = false;
      let delta = 0;
      if (event instanceof WheelEvent) delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1);
      if (event.type === "touchmove") {
        const y = (event as TouchEvent).touches?.[0]?.clientY;
        if (y !== undefined && lastTouchY !== undefined) delta = lastTouchY - y;
        lastTouchY = y;
      }
      if (!hold && !motion.matches && event.cancelable) {
        const g = geometry();
        const forwardBoundary = film.state === "FILLING" && armed && delta > 0 && g.y <= g.trigger && g.y + delta >= g.trigger;
        const reverseBoundary = film.state === "COMPLETED" && delta < 0 && g.y > g.trigger && g.y + delta <= g.trigger && (visitedContent || g.y > g.trigger + 24) && assets === "ready" && !staticFallback;
        if (forwardBoundary || reverseBoundary) {
          // Take the crossing gesture at the boundary before the compositor can
          // paint an overshoot. Ordinary filling/content scrolling stays native.
          if (reverseBoundary) visitedContent = true;
          lock(g.trigger);
          schedule();
        }
      }
      if (hold && event.cancelable) event.preventDefault();
    };
    const key = (event: KeyboardEvent) => {
      if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(event.key) && !(event.target as HTMLElement).closest("button, a, input, textarea, select")) input(event);
      if (event.key === "Escape" && hold) cancel();
    };
    const navigate = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const link = target.closest<HTMLAnchorElement>("a[href]");
      if (link && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0 && link.target !== "_blank") {
        const url = new URL(link.href, location.href);
        if (url.origin !== location.origin || url.pathname !== location.pathname || url.hash) {
          cancel();
          anchorNavigation = true;
          if (url.hash === "#home") { film = { state: "FILLING", time: 0 }; armed = true; visitedContent = false; persist(); }
        }
      }
      // Release our hold before the existing menu acquires its own scroll lock.
      if (target.closest('button[aria-haspopup="dialog"]')) cancel();
    };
    const hash = () => { cancel(); anchorNavigation = true; if (location.hash === "#home") { film = { state: "FILLING", time: 0 }; armed = true; visitedContent = false; persist(); } };
    const restore = () => {
      unlock();
      film = { state: history.state?.mmaHeroCompleted ? "COMPLETED" : "FILLING", time: history.state?.mmaHeroCompleted ? FILM_DURATION_MS : 0 };
      anchorNavigation = true;
      visitedContent = false;
      lastTime = 0;
      schedule();
    };
    const pagehide = () => { if (hold) cancel(); cancelAnimationFrame(frame); frame = 0; };
    const pageshow = () => { lastTime = 0; schedule(); };
    // Decode the actual Next.js-selected responsive sources, not separate raw URLs.
    Promise.all(Array.from(root.querySelectorAll<HTMLImageElement>("img")).map(image => image.decode())).then(() => {
      if (!disposed) { assets = "ready"; schedule(); }
    }, () => { if (!disposed) { assets = "failed"; schedule(); } });
    schedule();
    window.addEventListener("scroll", scroll, { passive: true });
    window.addEventListener("resize", resize);
    window.addEventListener("pageshow", pageshow);
    window.addEventListener("pagehide", pagehide);
    window.addEventListener("hashchange", hash);
    window.addEventListener("popstate", restore);
    window.addEventListener("wheel", input, { passive: false });
    window.addEventListener("touchmove", input, { passive: false });
    window.addEventListener("touchstart", touchStart, { passive: true });
    window.addEventListener("touchend", touchEnd, { passive: true });
    window.addEventListener("touchcancel", touchEnd, { passive: true });
    document.addEventListener("keydown", key);
    document.addEventListener("click", navigate, true);
    document.addEventListener("visibilitychange", visibility);
    motion.addEventListener("change", resize);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      unlock();
      clearChrome();
      window.removeEventListener("scroll", scroll);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pageshow", pageshow);
      window.removeEventListener("pagehide", pagehide);
      window.removeEventListener("hashchange", hash);
      window.removeEventListener("popstate", restore);
      window.removeEventListener("wheel", input);
      window.removeEventListener("touchmove", input);
      window.removeEventListener("touchstart", touchStart);
      window.removeEventListener("touchend", touchEnd);
      window.removeEventListener("touchcancel", touchEnd);
      document.removeEventListener("keydown", key);
      document.removeEventListener("click", navigate, true);
      document.removeEventListener("visibilitychange", visibility);
      motion.removeEventListener("change", resize);
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
          <div className={styles.glass} role="img" aria-label="Scroll to fill a traditional grooved glass with milk. A short automatic film then reveals coffee, an elevated view, a full-screen macro and an overhead finish. Returning from the farm plays the film backward before upward scrolling empties the glass.">
            <Image className={styles.empty} src="/hero/glass-empty.webp" alt="" width={800} height={1200} priority sizes="(max-width: 720px) 240px, 38vw" />
            <svg className={styles.maskDefinitions} width="1" height="1" aria-hidden="true" focusable="false">
              <defs>
                <clipPath id={maskId} clipPathUnits="objectBoundingBox">
                  <path ref={liquidMask} d={liquidGeometry(0).path} />
                </clipPath>
              </defs>
            </svg>
            <div className={styles.milk} style={{ clipPath: `url(#${maskId})` }}>
              <Image src="/hero/glass-milk.webp" alt="" width={800} height={1200} loading="eager" sizes="(max-width: 720px) 240px, 38vw" />
            </div>
            <span className={styles.surface} />
            <Image className={styles.coffee} src="/hero/coffee-front.webp" alt="" width={800} height={1200} loading="eager" sizes="(max-width: 720px) 240px, 38vw" />
            <Image className={styles.side} src="/hero/coffee-side-v2.webp" alt="" width={800} height={1200} loading="eager" sizes="(max-width: 720px) 240px, 38vw" />
            <Image className={styles.top} src="/hero/coffee-top.webp" alt="" width={800} height={1200} loading="eager" sizes="(max-width: 720px) 260px, 38vw" />
            <svg className={styles.condensation} viewBox="0 0 800 1200" aria-hidden="true" focusable="false" data-condensation>
              <defs>
                <clipPath id={`${maskId}-glass-surface`}><path d="M 125 200 Q 400 155 675 200 L 600 1015 Q 400 1050 200 1015 Z" /></clipPath>
                <radialGradient id={`${maskId}-water`} cx="35%" cy="25%" r="75%">
                  <stop offset="0" stopColor="#fff" stopOpacity=".05" />
                  <stop offset=".6" stopColor="#fff" stopOpacity=".015" />
                  <stop offset=".86" stopColor="#08130d" stopOpacity=".25" />
                  <stop offset="1" stopColor="#fff" stopOpacity=".58" />
                </radialGradient>
                <linearGradient id={`${maskId}-trail`} x1="0" y1="0" x2="0" y2="1">
                  <stop stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#fff" />
                </linearGradient>
              </defs>
              <g clipPath={`url(#${maskId}-glass-surface)`}>
                {GLASS_BEADS.map((drop, i) => (
                  <g key={i} data-condensation-drop transform={`translate(${drop.x} ${drop.y})`}>
                    <path data-trail stroke={`url(#${maskId}-trail)`} strokeWidth="1.2" strokeLinecap="round" opacity="0" />
                    <ellipse data-satellite cx=".7" cy="55" rx={drop.radius * .7} ry={drop.radius * .8} fill={`url(#${maskId}-water)`} opacity="0" />
                    <g data-bead opacity="0">
                      <ellipse rx="1" ry="1" fill={`url(#${maskId}-water)`} stroke="#08130d" strokeOpacity=".16" strokeWidth=".12" />
                      <path d="M -.58 -.25 Q -.55 -.65 -.12 -.73" fill="none" stroke="#fff" strokeOpacity=".86" strokeWidth=".24" strokeLinecap="round" />
                    </g>
                  </g>
                ))}
              </g>
            </svg>
          </div>
        </div>

        <div className={styles.macro} aria-hidden="true">
          <Image src="/hero/coffee-macro.webp" alt="" fill loading="eager" sizes="(max-aspect-ratio: 16/9) 178vh, 100vw" />
        </div>
        <a ref={immersiveExit} className={styles.immersiveExit} href="#site-content" tabIndex={-1}>Skip introduction <span aria-hidden="true">↘</span></a>

        <div className={styles.storyRail}>
        <span ref={storyProgress} className={styles.progressMeter} role="progressbar" aria-label="Glass story progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={0} />
        <ol className={styles.chapters} aria-label="From the glass to your home">
          <li className={styles.current}><span>01</span><small>The glass</small></li>
          <li><a href="#farm"><span>02</span><small>Our farm</small></a></li>
          <li><a href="#milk"><span>03</span><small>Your home</small></a></li>
        </ol>
        </div>

        <a className={styles.scroll} href="#site-content">
          <span className={styles.mouse} aria-hidden="true"><i /></span>
          <span>Scroll to fill<small>Then watch the story</small></span>
          <span className={styles.down} aria-hidden="true">↓</span>
        </a>
        <a className={styles.skip} href="#site-content">Skip introduction <span aria-hidden="true">↘</span></a>
      </div>
    </section>
  );
}
