"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import styles from "../landing.module.css";

const RisingGlassHero = dynamic(() => import("./rising-glass-hero").then(module => module.RisingGlassHero), { ssr: false, loading: () => <p role="status">Preparing the glass story…</p> });

export function LandingFilm() {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <section className={styles.film} aria-labelledby="film-title">
      <div className={styles.filmIntro}>
        <div><p className={styles.eyebrow}>A moment for your everyday glass</p><h2 id="film-title">The story in your glass.</h2><p>Watch milk meet coffee, then move closer to the details. Scroll at your own pace.</p></div>
        <button ref={trigger} type="button" className={styles.outline} aria-expanded={open} aria-controls={open ? "glass-story" : undefined} data-conversion={open ? undefined : "film_open"} data-location="film" onClick={() => setOpen(!open)}>{open ? "Close the glass story" : "Watch the glass story"}</button>
      </div>
      {open && <RisingGlassHero />}
    </section>
  );
}
