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

export function heroFrame(progress: number, reducedMotion = false) {
  const p = reducedMotion ? 1 : clamp01(progress);
  // Short dissolves separated by clean holds keep each camera angle readable.
  const sideIn = easeBetween(p, .60, .64);
  const macroIn = easeBetween(p, .74, .82);
  const closingTop = easeBetween(p, .90, .96);
  return {
    fill: easeBetween(p, 0, .48),
    coffee: easeBetween(p, .48, .57),
    side: reducedMotion ? 0 : sideIn * (1 - macroIn),
    top: reducedMotion ? 0 : closingTop,
    macro: reducedMotion ? 0 : macroIn * (1 - closingTop),
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
