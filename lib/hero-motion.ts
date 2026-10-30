/** One-way native-scroll fill and a time-based photographic film. */
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

/** A photographic film: anticipation, a fixed-angle traverse, then the macro. */
// Editorial source range [0, 1.5s), played at 1x from the untouched 73-frame file.
export const MACRO_VIDEO_DURATION_MS = 1500;
export const FILM_CUES = {
  coffeeStart: 120,
  coffeeEnd: 440,
  cameraStart: 600,
  cameraEnd: 1400,
  macroStart: 1440,
  macroFull: 1900,
  overheadStart: 1900 + MACRO_VIDEO_DURATION_MS,
  overheadFull: 2400 + MACRO_VIDEO_DURATION_MS,
  end: 2700 + MACRO_VIDEO_DURATION_MS,
} as const;
export const FILM_DURATION_MS = FILM_CUES.end;
export const FILM_STAGES = [
  { at: 0, name: "filled-front" },
  { at: FILM_CUES.coffeeStart, name: "coffee-treatment" },
  { at: FILM_CUES.cameraStart, name: "glass-traverse" },
  { at: FILM_CUES.macroStart, name: "macro-push" },
  { at: FILM_CUES.macroFull, name: "macro-hold" },
  { at: FILM_CUES.overheadStart, name: "overhead-pull" },
  { at: FILM_CUES.overheadFull, name: "settled-overhead" },
] as const;
export type HeroState = "FILLING" | "PLAYING_FORWARD" | "COMPLETED";
export type HeroFilm = { state: HeroState; time: number };
export const playing = (film: HeroFilm) => film.state === "PLAYING_FORWARD";
export function startFilm(film: HeroFilm): HeroFilm {
  if (film.state !== "FILLING") return film;
  return { state: "PLAYING_FORWARD", time: 0 };
}
export function advanceFilm(film: HeroFilm, elapsedMs: number): HeroFilm {
  if (!playing(film)) return film;
  // A long main-thread stall cannot jump across a stage. Hidden time is excluded
  // by the browser adapter. Large foreground stalls stretch the film, never skip it.
  const delta = Math.min(50, Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0));
  const time = Math.min(FILM_DURATION_MS, film.time + delta);
  return { state: time === FILM_DURATION_MS ? "COMPLETED" : film.state, time };
}
export function milkFill(scrollProgress: number, previousFill = 0): number {
  return Math.max(clamp01(previousFill), easeBetween(scrollProgress, 0, 1));
}
export function filmFrame(time: number) {
  const t = Math.max(0, Math.min(FILM_DURATION_MS, time));
  const cue = FILM_CUES;
  const top = easeBetween(t, cue.overheadStart, cue.overheadFull);
  // Time-remap a quadratic Bezier camera path without changing its geometry.
  // Camera control points, as percentages of the photographic canvas:
  // (0, 0), (-6, 0), (0, 6). Positive camera Y travels downward; the glass
  // counter-translates. One frontal plate retains its rim, base and angle.
  const travel = clamp01((t - cue.cameraStart) / (cue.cameraEnd - cue.cameraStart));
  const cameraProgress = travel * travel * travel * (travel * (travel * 6 - 15) + 10);
  return {
    coffee: easeBetween(t, cue.coffeeStart, cue.coffeeEnd),
    cameraProgress,
    cameraX: 12 * cameraProgress * cameraProgress - 12 * cameraProgress,
    cameraY: 6 * cameraProgress * cameraProgress,
    top,
    macro: easeBetween(t, cue.macroStart, cue.macroFull) * (1 - top),
    cameraPush: easeBetween(t, cue.macroStart, cue.macroFull),
    macroOpacity: easeBetween(easeBetween(t, cue.macroStart, cue.macroFull), .76, 1) * (1 - easeBetween(top, 0, .35)),
    // Retained timeline weight for the macro; the video supplies its motion.
    macroDrift: easeBetween(t, cue.macroFull, cue.overheadStart) * (1 - top),
    overheadSettle: easeBetween(t, cue.overheadFull, cue.end),
    stage: [...FILM_STAGES].reverse().find(stage => t >= stage.at)!.name,
  };
}

type PhotoBounds = { x: number; y: number; width: number; height: number };
/** Match the close-up's focal point before dissolving, then physically pull back. */
export function macroCamera(push: number, pull: number, settle: number, width: number, height: number, front: PhotoBounds, overhead: PhotoBounds) {
  const mix = (a: number, b: number, t: number) => a + (b - a) * clamp01(t);
  const focalX = front.width * .5, focalY = front.height * .44;
  const zoom = Math.max(width / (front.width * .46), height / (front.height * .46)) * 1.12;
  const frontScale = Math.exp(Math.log(Math.max(1, zoom)) * clamp01(push));
  const finalScale = 1.14 - .02 * clamp01(settle);
  const topZoom = Math.max(finalScale, Math.hypot(width, height) / (overhead.width * .92) * 1.07);
  const topScale = Math.exp(mix(Math.log(topZoom), Math.log(finalScale), pull));
  const topFocalX = overhead.width * .50125, topFocalY = overhead.height * .49167;
  const settledX = overhead.x + overhead.width / 2 + (topFocalX - overhead.width / 2) * finalScale;
  const settledY = overhead.y + overhead.height / 2 + (topFocalY - overhead.height / 2) * finalScale;
  return {
    frontScale,
    frontX: mix(front.x + focalX, width / 2, push) - front.x - focalX * frontScale,
    frontY: mix(front.y + focalY, height / 2, push) - front.y - focalY * frontScale,
    topScale,
    topX: mix(width / 2, settledX, pull) - overhead.x - topFocalX * topScale,
    topY: mix(height / 2, settledY, pull) - overhead.y - topFocalY * topScale,
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
