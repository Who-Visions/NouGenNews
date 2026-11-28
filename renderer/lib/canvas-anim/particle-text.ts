/**
 * ParticleText — a string formed by particles that fly home on springs
 * and scatter when the pointer passes through them.
 *
 * Pattern from the canvas-animation-demos repo (MIT, "Candy Text"):
 * rasterize text to an offscreen canvas, sample filled pixels as
 * particle targets, repel on hover, pause off-canvas. Elevated: the
 * homing is a real physics spring per particle (Motion's soul —
 * stiffness/damping/mass, velocity carried, mid-flight retargets stay
 * fluid), and the scatter is an impulse, so recovery overshoots and
 * settles like a physical thing instead of lerping home.
 */

import type { Scene, CanvasStage } from './stage.js';
import { Spring } from './spring.js';

export interface ParticleTextConfig {
  text: string;
  font?: string; // CSS font shorthand; size auto-fits width
  gap?: number; // px between sampled target points (lower = denser)
  colors?: string[];
  repelRadius?: number; // px
  repelForce?: number; // px/s impulse scale
  stiffness?: number;
  damping?: number;
}

interface Dot {
  sx: Spring;
  sy: Spring;
  color: string;
}

export class ParticleText implements Scene {
  private dots: Dot[] = [];
  private readonly cfg: Required<ParticleTextConfig>;

  constructor(cfg: ParticleTextConfig) {
    this.cfg = {
      text: cfg.text,
      font: cfg.font ?? '700 120px Syne, sans-serif',
      gap: cfg.gap ?? 5,
      colors: cfg.colors ?? ['#F4F1EA', '#CFAF5A', '#2F8F79'],
      repelRadius: cfg.repelRadius ?? 90,
      repelForce: cfg.repelForce ?? 260,
      stiffness: cfg.stiffness ?? 90,
      damping: cfg.damping ?? 13,
    };
  }

  resize(width: number, height: number): void {
    const { text, font, gap, colors, stiffness, damping } = this.cfg;
    const off = document.createElement('canvas');
    off.width = width;
    off.height = height;
    const octx = off.getContext('2d');
    if (!octx) return;
    octx.font = font;
    octx.textAlign = 'center';
    octx.textBaseline = 'middle';
    // Shrink the font until the string fits the width.
    let size = parseInt(/(\d+)px/.exec(font)?.[1] ?? '120', 10);
    while (octx.measureText(text).width > width * 0.92 && size > 12) {
      size -= 6;
      octx.font = font.replace(/(\d+)px/, `${size}px`);
    }
    octx.fillStyle = '#fff';
    octx.fillText(text, width / 2, height / 2);
    const data = octx.getImageData(0, 0, width, height).data;
    const targets: Array<{ x: number; y: number }> = [];
    for (let y = 0; y < height; y += gap) {
      for (let x = 0; x < width; x += gap) {
        if (data[(y * width + x) * 4 + 3] > 128) targets.push({ x, y });
      }
    }
    this.dots = targets.map((t, i) => {
      const sx = new Spring(Math.random() * width, { stiffness, damping, mass: 1 });
      const sy = new Spring(Math.random() * height, { stiffness, damping, mass: 1 });
      sx.setTarget(t.x);
      sy.setTarget(t.y);
      return { sx, sy, color: colors[i % colors.length] };
    });
  }

  update(dt: number, stage: CanvasStage): void {
    const { repelRadius, repelForce } = this.cfg;
    const p = stage.pointer;
    for (const d of this.dots) {
      if (p.inside) {
        const dx = d.sx.value - p.x;
        const dy = d.sy.value - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0.01 && dist < repelRadius) {
          const f = (1 - dist / repelRadius) * repelForce;
          d.sx.velocity += (dx / dist) * f;
          d.sy.velocity += (dy / dist) * f;
        }
      }
      d.sx.step(dt);
      d.sy.step(dt);
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    let current = '';
    for (const d of this.dots) {
      if (d.color !== current) {
        ctx.fillStyle = d.color;
        current = d.color;
      }
      ctx.fillRect(d.sx.value, d.sy.value, 2.4, 2.4);
    }
  }
}
