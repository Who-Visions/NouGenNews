/**
 * Constellation — drifting particles with proximity links.
 * Pattern from the canvas-animation-demos repo (MIT): a configurable
 * particle model with simple physics. Elevated: delta-time motion,
 * pointer links, brand palette, density derived from area so it costs
 * the same on a phone and a monitor.
 */

import type { Scene, CanvasStage } from './stage.js';

export interface ConstellationConfig {
  /** Particles per 100k px² of canvas. Default 7 (~100 on a hero). */
  density?: number;
  linkDist?: number; // px, link fade distance
  speed?: number; // px/s drift
  dotColor?: string;
  linkColor?: string; // rgba() prefix without alpha, e.g. "47,143,121"
  pointerLinks?: boolean;
}

interface P {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

export class Constellation implements Scene {
  private particles: P[] = [];
  private readonly cfg: Required<ConstellationConfig>;

  constructor(cfg: ConstellationConfig = {}) {
    this.cfg = {
      density: cfg.density ?? 7,
      linkDist: cfg.linkDist ?? 120,
      speed: cfg.speed ?? 14,
      dotColor: cfg.dotColor ?? '#CFAF5A',
      linkColor: cfg.linkColor ?? '47,143,121',
      pointerLinks: cfg.pointerLinks ?? true,
    };
  }

  resize(width: number, height: number): void {
    const count = Math.round(((width * height) / 100_000) * this.cfg.density);
    this.particles = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * this.cfg.speed,
      vy: (Math.random() - 0.5) * this.cfg.speed,
      r: 0.8 + Math.random() * 1.4,
    }));
  }

  update(dt: number, stage: CanvasStage): void {
    const { width: w, height: h } = stage;
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.x < 0) p.x += w;
      if (p.x > w) p.x -= w;
      if (p.y < 0) p.y += h;
      if (p.y > h) p.y -= h;
    }
  }

  draw(ctx: CanvasRenderingContext2D, stage: CanvasStage): void {
    const { linkDist, linkColor, dotColor, pointerLinks } = this.cfg;
    const pts = this.particles;
    ctx.lineWidth = 1;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      for (let j = i + 1; j < pts.length; j++) {
        const b = pts[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < linkDist * linkDist) {
          const alpha = 0.35 * (1 - Math.sqrt(d2) / linkDist);
          ctx.strokeStyle = `rgba(${linkColor},${alpha.toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
      if (pointerLinks && stage.pointer.inside) {
        const dx = a.x - stage.pointer.x;
        const dy = a.y - stage.pointer.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < linkDist * linkDist) {
          const alpha = 0.5 * (1 - Math.sqrt(d2) / linkDist);
          ctx.strokeStyle = `rgba(${linkColor},${alpha.toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(stage.pointer.x, stage.pointer.y);
          ctx.stroke();
        }
      }
    }
    ctx.fillStyle = dotColor;
    for (const p of pts) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
