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
  return {
    fill: easeBetween(p, 0, 0.56),
    // The complete coffee photograph only appears after the liquid reaches its level.
    coffee: easeBetween(p, 0.56, 0.67),
    angle: reducedMotion ? 0 : easeBetween(p, 0.68, 0.77) * (1 - easeBetween(p, 0.9, 0.98)),
    detail: reducedMotion ? 0 : easeBetween(p, 0.78, 0.85) * (1 - easeBetween(p, 0.88, 0.95)),
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
