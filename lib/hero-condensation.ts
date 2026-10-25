/** Small, deterministic beads for the photographic glass; a visual flow model. */
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (n: number) => { const t = clamp(n); return t * t * (3 - 2 * t); };
export const GLASS_BEADS = [
  { x: 238, y: 290, radius: 7.6, travel: 360, period: 4200, offset: 900 },
  { x: 286, y: 230, radius: 4.8, travel: 290, period: 5100, offset: 2900 },
  { x: 330, y: 390, radius: 9.2, travel: 350, period: 4600, offset: 2100 },
  { x: 373, y: 265, radius: 5.8, travel: 400, period: 5700, offset: 4000 },
  { x: 420, y: 480, radius: 10.5, travel: 310, period: 3900, offset: 800 },
  { x: 466, y: 320, radius: 5.6, travel: 370, period: 4900, offset: 3300 },
  { x: 515, y: 230, radius: 8.4, travel: 410, period: 4400, offset: 1700 },
  { x: 563, y: 410, radius: 6.5, travel: 300, period: 5300, offset: 4600 },
] as const;

export function condensationFrame(elapsedMs: number) {
  const time = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0);
  return GLASS_BEADS.map(seed => {
    const phase = ((time + seed.offset) % seed.period) / seed.period;
    const fall = clamp((phase - .28) / .72);
    const distance = seed.travel * fall * fall; // A pinned bead releases and accelerates.
    const collected = smooth((distance - 48) / 14);
    const growing = seed.radius * (.45 + .55 * smooth(phase / .28));
    const satelliteRadius = seed.radius * .7;
    // Approximate volume addition when the moving bead collects its neighbour.
    const radius = Math.cbrt(growing ** 3 + collected * satelliteRadius ** 3);
    const visible = smooth(phase / .09) * (1 - smooth((phase - .89) / .11));
    return {
      ...seed, phase, distance, radius, satelliteRadius,
      opacity: visible * .86,
      satelliteOpacity: (1 - collected) * visible * .7,
      trailOpacity: smooth(fall / .22) * visible * .16,
    };
  });
}
