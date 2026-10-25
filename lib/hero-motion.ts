/** Continuous native-scroll fill and a reversible, time-based photographic film. */
export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function easeBetween(value: number, start: number, end: number): number {
  const t = clamp01((value - start) / (end - start));
  return t * t * (3 - 2 * t);
}

export function heroProgress(top: number, height: number, panelHeight: number, headerHeight: number): number {
  return clamp01((headerHeight - top) / Math.max(1, height - panelHeight));
}

/** One clock owns the complete film. Scroll never selects a photographic target. */
export const FILM_DURATION_MS = 1900;
export const FILM_STAGES = [
  { at: 0, name: "filled-front" },
  { at: 60, name: "coffee-treatment" },
  { at: 180, name: "elevated" },
  { at: 520, name: "macro-push" },
  { at: 900, name: "macro-hold" },
  { at: 1280, name: "overhead-pull" },
  { at: 1650, name: "settled-overhead" },
] as const;
export type HeroState = "FILLING" | "PLAYING_FORWARD" | "COMPLETED" | "PLAYING_REVERSE";
export type HeroFilm = { state: HeroState; time: number };
export const playing = (film: HeroFilm) => film.state === "PLAYING_FORWARD" || film.state === "PLAYING_REVERSE";
export function startFilm(film: HeroFilm, reverse = false): HeroFilm {
  if (playing(film) || (reverse ? film.state !== "COMPLETED" : film.state !== "FILLING")) return film;
  return { state: reverse ? "PLAYING_REVERSE" : "PLAYING_FORWARD", time: reverse ? FILM_DURATION_MS : 0 };
}
export function advanceFilm(film: HeroFilm, elapsedMs: number): HeroFilm {
  if (!playing(film)) return film;
  // A long main-thread stall cannot jump across a stage. Hidden time is excluded
  // by the browser adapter. Large foreground stalls stretch the film, never skip it.
  const delta = Math.min(50, Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0));
  const reverse = film.state === "PLAYING_REVERSE";
  const time = Math.min(FILM_DURATION_MS, Math.max(0, film.time + (reverse ? -delta : delta)));
  return { state: !reverse && time === FILM_DURATION_MS ? "COMPLETED" : reverse && time === 0 ? "FILLING" : film.state, time };
}
export function milkFill(scrollProgress: number): number {
  return easeBetween(scrollProgress, 0, 1);
}
export function filmFrame(time: number) {
  const t = Math.max(0, Math.min(FILM_DURATION_MS, time));
  const top = easeBetween(t, 1280, 1460);
  return {
    coffee: easeBetween(t, 60, 180),
    side: easeBetween(t, 180, 290) * (1 - top),
    top,
    macro: easeBetween(t, 520, 740) * (1 - easeBetween(t, 1280, 1460)),
    stage: [...FILM_STAGES].reverse().find(stage => t >= stage.at)!.name,
  };
}

/** A curved meniscus inside tapered photographic glass walls, in normalized coordinates. */
export function liquidGeometry(fill: number) {
  const t = clamp01(fill);
  const y = 0.75 - t * 0.55;
  const left = 0.215 - t * 0.1;
  const right = 1 - left;
  const depth = 0.012 + t * 0.006;
  const radius = (right - left) / 2;
  return {
    y, left, right, depth,
    path: `M ${left} ${y} A ${radius} ${depth} 0 0 1 ${right} ${y} L 0.772 0.786 Q 0.5 0.803 0.228 0.786 Z`,
  };
}

/** Bound the full-screen insert to this section, including anchor skips. */
export function macroPresentation(bottom: number, viewportHeight: number, opacity: number, headerHeight: number) {
  // Allow subpixel anchor rounding at the shared 20px scroll margin.
  const visible = bottom > headerHeight + 22 && opacity > .001;
  return {
    opacity: visible ? opacity : 0,
    offsetY: Math.min(0, bottom - viewportHeight),
    immersive: visible && opacity > .999,
  };
}
