import { useEffect, useRef } from "react";
import { CanvasStage, Constellation } from "../lib/canvas-anim/index.ts";

// Restrained NouGenAI constellation field (gold dots, emerald links on obsidian)
// powered by NouGenMuse's canvas-anim-ts engine. Automatically pauses off-screen
// or when the window is hidden, caps DPR at 2, and renders one static frame under
// prefers-reduced-motion.
export function ConstellationBackdrop({
  className = "",
  density = 5,
  linkDist = 110,
  speed = 10,
  dotColor = "#CFAF5A",
  linkColor = "47,143,121",
  pointerLinks = false,
  opacity = 0.42,
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let stage = null;
    try {
      const scene = new Constellation({
        density,
        linkDist,
        speed,
        dotColor,
        linkColor,
        pointerLinks,
      });
      stage = new CanvasStage(canvas, scene, {
        dprCap: 2,
        respectReducedMotion: true,
      });
    } catch {
      // Headless or 2d-context-unavailable environments degrade silently.
    }
    return () => {
      if (stage) stage.destroy();
    };
  }, [density, linkDist, speed, dotColor, linkColor, pointerLinks]);

  return (
    <canvas
      ref={canvasRef}
      className={className ? `nn-constellation ${className}` : "nn-constellation"}
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 0,
        opacity,
      }}
    />
  );
}
