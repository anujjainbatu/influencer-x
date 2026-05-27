"use client";

import { useEffect, useRef } from "react";

interface WatermarkOverlayProps {
  brandLabel: string;
  creatorHandle: string;
  tokenSuffix: string;
}

/**
 * A canvas overlay that draws a semi-transparent watermark on top of the video.
 * The watermark slowly drifts so a static mask can't crop it out, and its host
 * <div> is re-mounted by a MutationObserver if anything tries to remove it.
 */
export function WatermarkOverlay({ brandLabel, creatorHandle, tokenSuffix }: WatermarkOverlayProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    let width = canvas.clientWidth;
    let height = canvas.clientHeight;
    const resize = () => {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.scale(dpr, dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const now = new Date();
      const stamp = now.toLocaleString();
      const text = `${brandLabel} • @${creatorHandle} • ${tokenSuffix} • ${stamp}`;

      // Drift across the visible region in a slow Lissajous pattern.
      const t = performance.now() / 1000;
      const padding = 60;
      const x = padding + (Math.sin(t * 0.13) * 0.5 + 0.5) * (width - 2 * padding);
      const y = padding + (Math.sin(t * 0.07 + 1.2) * 0.5 + 0.5) * (height - 2 * padding);

      ctx.font = `600 ${Math.max(14, Math.min(24, Math.floor(width / 40)))}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // Soft shadow then bright text — readable on any background.
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillText(text, x + 1, y + 1);
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.fillText(text, x, y);

      // Corner tag — always visible even if drift hides the center one.
      ctx.font = "600 11px ui-monospace, monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillText(`PREVIEW • ${brandLabel} • ${tokenSuffix}`, 12 + 1, 12 + 1);
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillText(`PREVIEW • ${brandLabel} • ${tokenSuffix}`, 12, 12);

      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [brandLabel, creatorHandle, tokenSuffix]);

  // Self-healing: if someone removes the watermark node, re-insert it.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const parent = root.parentElement;
    if (!parent) return;

    const observer = new MutationObserver(() => {
      if (!parent.contains(root)) {
        parent.appendChild(root);
      }
    });
    observer.observe(parent, { childList: true, subtree: false });
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={rootRef}
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        userSelect: "none",
        zIndex: 30,
      }}
      data-watermark="1"
    >
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
