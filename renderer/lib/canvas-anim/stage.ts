/**
 * CanvasStage — the engine. One class owns the canvas, the
 * requestAnimationFrame loop, delta-time, devicePixelRatio scaling,
 * resize, pointer tracking, and pause-when-hidden. A Scene only has to
 * answer two questions per frame: how does the world change (update),
 * and what does it look like now (draw).
 *
 * Method learned from Changhui Xu, "Canvas Animations in TypeScript"
 * (codeburst, 2018): animation is a draw() executed every frame, with
 * state changes computed inside the frame. Elevation over the 2018
 * demos: delta-time integration (frame-rate independent), DPR-aware
 * backing store, ResizeObserver sizing, and automatic pause when the
 * tab is hidden or the canvas scrolls off screen.
 */

export interface Scene {
  update(dt: number, stage: CanvasStage): void;
  draw(ctx: CanvasRenderingContext2D, stage: CanvasStage): void;
  resize?(width: number, height: number): void;
}

export interface Pointer {
  x: number;
  y: number;
  inside: boolean;
}

export interface StageOptions {
  /** Cap the backing-store scale so huge retina canvases stay cheap. */
  dprCap?: number;
  /** Respect prefers-reduced-motion: render one static frame, no loop. */
  respectReducedMotion?: boolean;
}

export class CanvasStage {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly pointer: Pointer = { x: -9999, y: -9999, inside: false };
  width = 0;
  height = 0;

  private readonly scene: Scene;
  private readonly dprCap: number;
  private raf = 0;
  private last = 0;
  private running = false;
  private visible = true;
  private onScreen = true;
  private readonly ro: ResizeObserver;
  private readonly io: IntersectionObserver;

  constructor(canvas: HTMLCanvasElement, scene: Scene, opts: StageOptions = {}) {
    this.canvas = canvas;
    this.scene = scene;
    this.dprCap = opts.dprCap ?? 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('CanvasStage: 2d context unavailable');
    this.ctx = ctx;

    this.ro = new ResizeObserver(() => this.fit());
    this.ro.observe(canvas);
    this.io = new IntersectionObserver(
      (entries) => {
        this.onScreen = entries[0]?.isIntersecting ?? true;
        this.kick();
      },
      { threshold: 0.01 },
    );
    this.io.observe(canvas);

    canvas.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.pointer.x = e.clientX - r.left;
      this.pointer.y = e.clientY - r.top;
      this.pointer.inside = true;
    });
    canvas.addEventListener('pointerleave', () => {
      this.pointer.inside = false;
      this.pointer.x = -9999;
      this.pointer.y = -9999;
    });
    document.addEventListener('visibilitychange', () => {
      this.visible = !document.hidden;
      this.kick();
    });

    this.fit();

    const reduced =
      (opts.respectReducedMotion ?? true) &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      // One honest static frame instead of motion.
      this.scene.update(0, this);
      this.scene.draw(this.ctx, this);
    } else {
      this.start();
    }
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  destroy(): void {
    this.stop();
    this.ro.disconnect();
    this.io.disconnect();
  }

  private kick(): void {
    if (this.visible && this.onScreen && !this.running) this.start();
    if ((!this.visible || !this.onScreen) && this.running) this.stop();
  }

  private fit(): void {
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    if (w === this.width && h === this.height && this.canvas.width > 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, this.dprCap);
    this.width = w;
    this.height = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.scene.resize?.(w, h);
  }

  private frame = (now: number): void => {
    if (!this.running) return;
    // Clamp dt: a backgrounded tab must not teleport the world on return.
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    this.scene.update(dt, this);
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.scene.draw(this.ctx, this);
    this.raf = requestAnimationFrame(this.frame);
  };
}
