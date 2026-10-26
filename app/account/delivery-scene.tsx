"use client";
import { useEffect, useRef, useState } from "react";
import type { DeliveryState } from "@/lib/customer-delivery";
import styles from "./account.module.css";
export function DeliveryScene({ state }: { state: DeliveryState }) {
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(false);
  const scene = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = scene.current;
    if (!element) return;
    let intersecting = false;
    const update = () => setVisible(intersecting && !document.hidden);
    const observer = new IntersectionObserver(entries => { intersecting = entries[0].isIntersecting; update(); });
    observer.observe(element);
    document.addEventListener("visibilitychange", update);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", update); };
  }, []);
  return <div ref={scene} className={styles.sceneWrap} data-scene-state={state} data-motion={visible && !paused ? "running" : "paused"}>
    <div className={styles.scene} aria-hidden="true"><svg viewBox="0 0 720 150" fill="none"><path d="M20 124H700" stroke="currentColor" opacity=".25"/><path className={styles.roadmarks} d="M20 135H700" stroke="currentColor" opacity=".22" strokeWidth="2" strokeDasharray="22 22"/><g opacity=".3" stroke="currentColor" strokeWidth="1.5"><path d="M48 122V78l27-19 27 19v44M40 79l35-26 35 26M65 122V99h18v23M57 87h7v7h-7zM87 87h7v7h-7z"/><path d="M628 122V67l25-18 25 18v55M620 69l33-26 33 26M641 122V92h23v30"/><path d="M174 122v-29m-10 0c-7-1-10-7-7-13-6-13 4-27 15-22 10-7 21 3 17 14 9 6 4 18-6 19z"/><path d="M545 123v-22m-7 0c-9-4-8-14 0-16-1-14 17-16 21-4 10 1 11 15 2 19z"/></g><g className={styles.rider}><g className={styles.bounce}><ellipse cx="51" cy="124" rx="58" ry="3" fill="currentColor" opacity=".08"/><circle cx="12" cy="111" r="13" fill="var(--color-surface-raised)" stroke="currentColor" strokeWidth="4"/><circle cx="94" cy="111" r="13" fill="var(--color-surface-raised)" stroke="currentColor" strokeWidth="4"/><path className={styles.wheelspoke} d="M12 101v20M2 111h20" stroke="currentColor" opacity=".5"/><path className={styles.wheelspoke} d="M94 101v20m-10-10h20" stroke="currentColor" opacity=".5"/><path d="M10 98h30l7-24h19l-4 26h21l-1-38h12l8 38H86c-5 0-8 13-19 13H44c-11 0-13-16-34-15Z" fill="currentColor"/><path d="M30 75h27" stroke="currentColor" strokeWidth="7" strokeLinecap="round"/><path d="m83 62-8-14h12" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/><rect x="-12" y="57" width="36" height="31" rx="5" fill="var(--color-surface)" stroke="currentColor" strokeWidth="2"/><path d="M-2 68h16M6 62v13" stroke="currentColor" opacity=".5"/><path d="m53 41-7 22 18 9-7 27" stroke="currentColor" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"/><path d="m55 47 16 10 12-4" stroke="currentColor" strokeWidth="6" strokeLinecap="round"/><circle cx="57" cy="27" r="11" fill="var(--color-surface)" stroke="currentColor" strokeWidth="2"/><path d="M45 26a12 12 0 0 1 24 0H45Z" fill="currentColor"/><path d="M49 37v6" stroke="currentColor" strokeWidth="4"/></g></g><g className={styles.completion} transform="translate(650,27)"><circle r="14" fill="var(--color-surface)"/><path d="m-6 0 4 4 8-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></g></svg></div>
    {state === "out" ? <button className={styles.motionControl} type="button" onClick={() => setPaused(!paused)} aria-pressed={paused}>{paused ? "Resume animation" : "Pause animation"}</button> : null}
  </div>;
}
