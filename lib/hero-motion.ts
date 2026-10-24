/** Native-scroll choreography, evaluated from absolute progress in either direction. */
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

/** Time-based damping behaves consistently at 30, 60 and 120 Hz. */
export function dampProgress(current: number, target: number, elapsedMs: number): number {
  const next = current + (clamp01(target) - current) * (1 - Math.exp(-Math.max(0, elapsedMs) / 65));
  return Math.abs(next - target) < 0.0001 ? clamp01(target) : clamp01(next);
}

export type HeroCamera = { coffee: number; side: number; top: number; macro: number };
export type CameraTransition = { from: HeroCamera; to: HeroCamera; startedAt: number };
export const CAMERA_TRANSITION_MS = 110;
const cameraKeys = ["coffee", "side", "top", "macro"] as const;

/** Select a clean photograph; a small deadband prevents threshold flicker. */
export function heroFrame(progress: number, reducedMotion = false, previous?: HeroCamera) {
  const p = reducedMotion ? 1 : clamp01(progress);
  const past = (threshold: number, wasPast: boolean) => p >= threshold + (previous ? (wasPast ? -.004 : .004) : 0);
  const top = !reducedMotion && past(.93, previous?.top === 1);
  const macro = !reducedMotion && past(.78, !!previous && previous.macro + previous.top > 0);
  const side = !reducedMotion && past(.62, !!previous && previous.side + previous.macro + previous.top > 0);
  return {
    fill: easeBetween(p, 0, .48),
    coffee: past(.525, previous?.coffee === 1) ? 1 : 0,
    side: side && !macro && !top ? 1 : 0,
    top: top ? 1 : 0,
    macro: macro && !top ? 1 : 0,
  };
}

function cameraAt(state: CameraTransition, now: number): HeroCamera {
  if (now - state.startedAt >= CAMERA_TRANSITION_MS) return state.to;
  const t = easeBetween(now - state.startedAt, 0, CAMERA_TRANSITION_MS);
  const blend = (key: keyof HeroCamera) => state.from[key] + (state.to[key] - state.from[key]) * t;
  return { coffee: blend("coffee"), side: blend("side"), top: blend("top"), macro: blend("macro") };
}

/** A dissolve finishes in clock time even if scrolling stops between photographs. */
export function stepCamera(previous: CameraTransition | undefined, target: HeroCamera, now: number, immediate = false) {
  const clean = { coffee: target.coffee, side: target.side, top: target.top, macro: target.macro };
  const state: CameraTransition = !previous || immediate
    ? { from: clean, to: clean, startedAt: now - CAMERA_TRANSITION_MS }
    : cameraKeys.some(key => previous.to[key] !== clean[key])
      ? { from: cameraAt(previous, now), to: clean, startedAt: now }
      : previous;
  return { state, values: cameraAt(state, now), active: now - state.startedAt < CAMERA_TRANSITION_MS };
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
