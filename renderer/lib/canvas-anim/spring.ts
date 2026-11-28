/**
 * Springs — the soul stolen from Motion (motion.dev, ex-Framer Motion):
 * a value follows its target under real stiffness / damping / mass, it
 * CARRIES VELOCITY, and when the target moves mid-flight the motion
 * stays fluid because nothing resets. Semi-implicit Euler integration,
 * substepped so stiff springs stay stable at any frame rate.
 */

export interface SpringConfig {
  // One physics, two vocabularies: Motion calls these stiffness/damping,
  // react-spring calls them tension/friction. Same numbers, same feel.
  stiffness: number; // k, spring constant / tension (default 170)
  damping: number; // c, damping / friction (default 26 — near critically damped)
  mass: number; // m (default 1)
  restDelta?: number; // distance at which the spring is "at rest"
  restSpeed?: number; // speed at which the spring is "at rest"
}

const DEFAULTS: Required<SpringConfig> = {
  stiffness: 170,
  damping: 26,
  mass: 1,
  restDelta: 0.01,
  restSpeed: 0.01,
};

/** One pure integration step. Returns [value, velocity]. */
export function springStep(
  value: number,
  velocity: number,
  target: number,
  dt: number,
  cfg: SpringConfig,
): [number, number] {
  const { stiffness: k, damping: c, mass: m } = { ...DEFAULTS, ...cfg };
  const force = -k * (value - target) - c * velocity;
  const accel = force / m;
  const v = velocity + accel * dt;
  const x = value + v * dt;
  return [x, v];
}

export class Spring {
  value: number;
  velocity = 0;
  target: number;
  private readonly cfg: Required<SpringConfig>;

  constructor(initial: number, cfg: SpringConfig = { stiffness: 170, damping: 26, mass: 1 }) {
    this.value = initial;
    this.target = initial;
    this.cfg = { ...DEFAULTS, ...cfg };
  }

  /** Retarget mid-flight: velocity is preserved, so the turn is fluid. */
  setTarget(target: number): void {
    this.target = target;
  }

  /** Hard-set the value (teleport); velocity zeroed unless given. */
  jump(value: number, velocity = 0): void {
    this.value = value;
    this.velocity = velocity;
  }

  get atRest(): boolean {
    return (
      Math.abs(this.value - this.target) <= this.cfg.restDelta &&
      Math.abs(this.velocity) <= this.cfg.restSpeed
    );
  }

  /** Advance by dt seconds (substepped at 240 Hz for stability). */
  step(dt: number): number {
    let remaining = dt;
    while (remaining > 0) {
      const h = Math.min(remaining, 1 / 240);
      [this.value, this.velocity] = springStep(
        this.value,
        this.velocity,
        this.target,
        h,
        this.cfg,
      );
      remaining -= h;
    }
    if (this.atRest) {
      this.value = this.target;
      this.velocity = 0;
    }
    return this.value;
  }
}

/**
 * Stagger — Motion's other signature: per-index delay so a group moves
 * as a wave, not a block. `from` mirrors Motion's stagger origin.
 */
export function staggerDelay(
  index: number,
  each: number,
  from: 'first' | 'last' | 'center' = 'first',
  total = 0,
): number {
  if (from === 'last') return Math.max(0, (total - 1 - index) * each);
  if (from === 'center') return Math.abs(index - (total - 1) / 2) * each;
  return index * each;
}

/**
 * Momentum throw — Motion's drag release: project where a flick lands
 * (exponential-decay projection, the same family iOS uses), so a thrown
 * value glides to a stop instead of freezing at release.
 */
export function projectMomentum(value: number, velocity: number, power = 0.8): number {
  const decelerationRate = 0.998; // per ms, iOS normal-scroll rate
  const projected =
    (velocity / 1000) * (decelerationRate / (1 - decelerationRate)) * power;
  return value + projected;
}
