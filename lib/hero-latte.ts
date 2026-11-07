/** Native scroll distances, independent of the introductory film's clock. */
export const HERO_FILL_VIEWPORTS = .55;
export const LATTE_VIEWPORTS = 1.25;
/** Keep the final reveal before fractional native-scroll rounding unpins the panel. */
export const HERO_RUNWAY_TAIL_PX = 2;
const clamp = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));
const between = (n: number, from: number, to: number) => {
  const t = clamp((n - from) / (to - from));
  return t * t * (3 - 2 * t);
};
export function latteProgress(distance: number, fillDistance: number, revealDistance: number) {
  return clamp((distance - fillDistance) / Math.max(1, revealDistance));
}
/** Spatial mask strokes, not image opacity. Pure/reversible; no elapsed-time input. */
export function latteFrame(progress: number) {
  const p = clamp(progress);
  return {
    crema: between(p, .15, .35),
    heart: between(p, .32, .55),
    name: between(p, .55, .75),
    farms: between(p, .75, .88),
    smallHeart: between(p, .77, .90),
    settle: between(p, .88, .90),
  };
}
