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

/** A short product film: anticipation, a gentle camera lift, a lingering macro payoff. */
export const FILM_CUES = {
  coffeeStart: 300,
  coffeeEnd: 620,
  cameraInStart: 940,
  elevatedStart: 1440,
  elevatedEnd: 2840,
  macroStart: 3340,
  macroFull: 3660,
  overheadStart: 4920,
  overheadFull: 5280,
  end: 5860,
} as const;
export const FILM_DURATION_MS = FILM_CUES.end;
export const FILM_STAGES = [
  { at: 0, name: "filled-front" },
  { at: FILM_CUES.coffeeStart, name: "coffee-treatment" },
  { at: FILM_CUES.elevatedStart, name: "elevated" },
  { at: FILM_CUES.macroStart, name: "macro-push" },
  { at: FILM_CUES.macroFull, name: "macro-hold" },
  { at: FILM_CUES.overheadStart, name: "overhead-pull" },
  { at: FILM_CUES.overheadFull, name: "settled-overhead" },
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
  const cue = FILM_CUES;
  const top = easeBetween(t, cue.overheadStart, cue.overheadFull);
  // Zero velocity and acceleration at both ends lets the moving photographs
  // enter and leave their still holds without a visible kick, in either direction.
  const lift = clamp01((t - cue.elevatedStart) / (cue.elevatedEnd - cue.elevatedStart));
  const elevation = lift * lift * lift * (lift * (lift * 6 - 15) + 10);
  return {
    coffee: easeBetween(t, cue.coffeeStart, cue.coffeeEnd),
    elevation,
    cameraZoom: easeBetween(t, cue.cameraInStart, cue.elevatedStart) * (1 - easeBetween(t, cue.macroFull, cue.overheadStart)),
    side: easeBetween(elevation, .55, 1) * (1 - top),
    top,
    macro: easeBetween(t, cue.macroStart, cue.macroFull) * (1 - top),
    // A restrained 2.5% creep keeps the full-screen photograph alive, while
    // the final overhead relaxes by 2%. Both retrace the exact path in reverse.
    macroDrift: easeBetween(t, cue.macroFull, cue.overheadStart) * (1 - top),
    overheadSettle: easeBetween(t, cue.overheadFull, cue.end),
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
