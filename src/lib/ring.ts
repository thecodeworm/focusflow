export interface RingGeometry {
  size: number;
  stroke: number;
  radius: number;
  circumference: number;
}

export function ringGeometry(size: number, stroke: number): RingGeometry {
  const radius = (size - stroke) / 2;
  return { size, stroke, radius, circumference: 2 * Math.PI * radius };
}

/** Fraction of the session still remaining, clamped to [0, 1]. */
export function remainingFraction(remainingMs: number, durationMs: number): number {
  if (durationMs <= 0) return 0;
  return Math.min(1, Math.max(0, remainingMs / durationMs));
}

/** stroke-dashoffset that draws `fraction` of the ring. */
export function dashOffset(fraction: number, circumference: number): number {
  return circumference * (1 - Math.min(1, Math.max(0, fraction)));
}

export const strokeFor = { thin: 0.022, regular: 0.04, bold: 0.065 } as const;
