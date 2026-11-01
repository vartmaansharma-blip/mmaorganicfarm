"use client";

import { useEffect, useRef, useState } from "react";
import type { DeliveryState } from "@/lib/customer-delivery";
import styles from "./delivery-scene.module.css";

// A stage illustration, never a map or a measurement of the driver's movement.
export function DeliveryScene({ state }: { state: DeliveryState }) {
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(false);
  const scene = useRef<HTMLDivElement>(null);
  const animated = state === "out" || state === "preparing";
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

  return <div ref={scene} className={styles.scene} data-scene-state={state} data-motion={visible && !paused ? "running" : "paused"}>
    <div className={styles.art} aria-hidden="true"><svg viewBox="0 0 720 240" fill="none">
      <g transform="translate(549 42)"><circle r="24" fill="var(--scene-sun)" /><path d="M0-34v-5M0 34v5M34 0h5M-34 0h-5M24-24l4-4M-24 24l-4 4M24 24l4 4M-24-24l-4-4" stroke="var(--scene-sun)" strokeWidth="3" strokeLinecap="round" /></g>
      <g className={styles.clouds} fill="var(--scene-cloud)"><path d="M201 37c-1-11 13-17 20-8 5-15 28-10 27 5 13-4 21 13 9 17h-57c-11-1-10-13 1-14Z" /><path d="M410 61c0-8 10-12 16-6 5-10 20-7 21 3 13-2 16 13 4 15h-41c-9-1-9-11 0-12Z" /></g>
      <path d="M0 136c82-47 141-23 230 3 94 27 167-49 263-30 83 17 153 52 227 18v65H0Z" fill="var(--scene-hill-back)" /><path d="M0 160c129-30 171-7 284-1 135 8 256-48 436-4v45H0Z" fill="var(--scene-hill-front)" />
      <g stroke="var(--scene-outline)" strokeWidth="2" strokeLinejoin="round">
        <path d="M30 181V116l54-39 54 39v65" fill="var(--scene-barn)" /><path d="m19 117 65-48 65 48-9 6-56-40-57 40Z" fill="var(--scene-roof)" />
        <path d="M59 181v-44h49v44" fill="var(--scene-cream)" /><path d="m59 137 49 44m0-44-49 44" stroke="var(--scene-roof)" /><rect x="72" y="108" width="24" height="17" rx="2" fill="var(--scene-sky)" /><path d="M84 108v17m-12-8h24" stroke="var(--scene-cream)" />
        <path d="M15 183v-28m-12 8h24M158 184v-29m-12 9h24" stroke="var(--scene-fence)" strokeWidth="4" strokeLinecap="round" />
      </g>
      <g transform="translate(182 139)" stroke="var(--scene-outline)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 7c-8-12-3-19-9-19M8 26v18m25-18v18M4 8h36v23H4Z" fill="var(--scene-cream)" /><path d="M12 8v9l7 4 7-7V8M33 21l7-4v14H30Z" fill="var(--scene-outline)" stroke="none" /><path d="m39 9 3-10 11 3 4 11-4 12-12-3Z" fill="var(--scene-cream)" /><path d="m44 0-4-5m12 7 5-3" /><ellipse cx="49" cy="21" rx="7" ry="4" fill="var(--scene-peach)" /><path d="M48 9h.1" strokeWidth="3" />
      </g>
      <g stroke="var(--scene-outline)" strokeWidth="1.7"><path d="M276 184v-41m-6 22 6 6 7-12" strokeWidth="3" /><path d="M260 146c-22-12-7-33 6-31-2-20 29-25 34-5 18 1 23 31 2 36Z" fill="var(--scene-tree)" /><path d="M527 183v-28m-4 16 4 4 5-7" strokeWidth="3" /><path d="M515 156c-15-5-11-24 1-27 0-15 23-17 27-2 17 2 18 26 1 29Z" fill="var(--scene-tree-light)" /></g>
      <g stroke="var(--scene-outline)" strokeWidth="2" strokeLinejoin="round">
        <path d="M586 183v-72l48-38 49 38v72" fill="var(--scene-home)" /><path d="m575 114 59-48 60 48-8 8-52-41-51 41Z" fill="var(--scene-home-roof)" /><path d="M620 183v-43h26v43" fill="var(--scene-door)" /><circle cx="639" cy="164" r="2" fill="var(--scene-cream)" stroke="none" /><rect x="597" y="124" width="16" height="22" rx="2" fill="var(--scene-sky)" /><rect x="655" y="124" width="16" height="22" rx="2" fill="var(--scene-sky)" /><path d="M605 125v20m-8-10h16m50-10v20m-8-10h16" stroke="var(--scene-cream)" /><path d="M579 182v-11m-6 0h12" stroke="var(--scene-fence)" strokeWidth="3" />
      </g>
      <path d="M0 186H720v54H0Z" fill="var(--scene-road)" /><path d="M0 190H720" stroke="var(--scene-road-edge)" strokeWidth="3" /><path className={styles.roadmarks} d="M-40 219H760" stroke="var(--scene-road-mark)" strokeWidth="3" strokeDasharray="26 25" strokeLinecap="round" />
      <g className={styles.packing} stroke="var(--scene-outline)" strokeWidth="1.7"><rect x="145" y="153" width="27" height="29" rx="4" fill="var(--scene-box)" /><path d="M154 153v-11h8v11m-11-11h14m-13 24h14" strokeLinecap="round" /><path className={styles.packingSpark} d="M149 135v-5m-9 10-4-3m29-4 3-4" stroke="var(--scene-sun)" strokeWidth="3" strokeLinecap="round" /></g>
      <g className={styles.rider}><g className={styles.bounce}>
        <ellipse cx="49" cy="203" rx="65" ry="5" fill="var(--scene-outline)" opacity=".13" /><g fill="var(--scene-wheel)" stroke="var(--scene-outline)" strokeWidth="2"><circle cx="10" cy="185" r="16" /><circle cx="95" cy="185" r="16" /></g>
        <g stroke="var(--scene-wheel-hub)" strokeWidth="2.5"><circle cx="10" cy="185" r="9" /><circle cx="95" cy="185" r="9" /><path className={styles.spokeBack} d="M10 176v18m-9-9h18" /><path className={styles.spokeFront} d="M95 176v18m-9-9h18" /></g>
        <path d="M8 169h30l8-30h25l-5 32h16l-3-44h13l12 44H85c-7 0-9 14-21 14H39c-11 0-12-14-31-16Z" fill="var(--scene-scooter)" stroke="var(--scene-outline)" strokeWidth="2.5" strokeLinejoin="round" /><path d="m80 126-8-17h15M31 141h26" stroke="var(--scene-outline)" strokeWidth="5" strokeLinecap="round" /><rect x="87" y="133" width="8" height="7" rx="3" fill="var(--scene-cream)" />
        <rect x="-15" y="126" width="39" height="34" rx="6" fill="var(--scene-box)" stroke="var(--scene-outline)" strokeWidth="2" /><path d="M-6 139h21m-11-7v14" stroke="var(--scene-box-ink)" strokeWidth="2" strokeLinecap="round" />
        <path d="m55 109-8 22 19 11-7 28" stroke="var(--scene-trousers)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" /><path d="m56 106 14 13 15-4" stroke="var(--scene-shirt)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" /><path d="m51 99-6 24 16 7 6-22" fill="var(--scene-shirt)" /><path d="m59 171 8 1" stroke="var(--scene-outline)" strokeWidth="6" strokeLinecap="round" /><circle cx="58" cy="88" r="12" fill="var(--scene-skin)" stroke="var(--scene-outline)" strokeWidth="1.8" /><path d="M44 86a14 14 0 0 1 28 0H44Z" fill="var(--scene-helmet)" stroke="var(--scene-outline)" strokeWidth="1.8" /><path d="M48 89v8h14" stroke="var(--scene-outline)" strokeWidth="1.5" />
      </g></g>
      <g className={styles.completion}><circle cx="635" cy="39" r="20" fill="var(--scene-confirm)" /><path d="m626 39 6 6 12-14" stroke="var(--scene-cream)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /><g fill="var(--scene-sun)"><circle cx="606" cy="26" r="3" /><circle cx="661" cy="51" r="3" /><path d="m665 20 5 5-5 5-5-5Z" /></g></g>
    </svg></div>
    <div className={styles.caption}><span>Delivery illustration</span>{animated ? <button className={styles.motionControl} type="button" onClick={() => setPaused(value => !value)} aria-pressed={paused}>{paused ? "Resume animation" : "Pause animation"}</button> : null}</div>
  </div>;
}
