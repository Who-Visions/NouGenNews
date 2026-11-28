/** Easing functions: t in [0,1] -> eased progress in [0,1]. Pure, tested. */

export type Easing = (t: number) => number;

export const linear: Easing = (t) => t;

export const easeInCubic: Easing = (t) => t * t * t;

export const easeOutCubic: Easing = (t) => 1 - Math.pow(1 - t, 3);

export const easeInOutCubic: Easing = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export const easeOutBack: Easing = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

export const easeOutElastic: Easing = (t) => {
  const c4 = (2 * Math.PI) / 3;
  if (t === 0) return 0;
  if (t === 1) return 1;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
};

/** Clamp a number into [min, max]. */
export const clamp = (v: number, min: number, max: number): number =>
  v < min ? min : v > max ? max : v;

/** Linear interpolation. */
export const lerp = (a: number, b: number, t: number): number =>
  a + (b - a) * t;
