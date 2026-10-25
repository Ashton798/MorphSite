"use client";

import { useEffect, useRef } from "react";

/** Small shared canvas: scroll sections get atmosphere without another WebGL scene. */
export function AmbientParticles() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0, height = 0, frame = 0, visible = true, time = 0;
    const pointer = { x: -1000, y: -1000 };
    const points = Array.from({ length: 64 }, (_, i) => ({
      x: ((i * 137.508) % 997) / 997, y: ((i * 83.17) % 991) / 991,
      radius: .5 + (i % 4) * .35, speed: .12 + (i % 5) * .06,
    }));
    const resize = () => {
      width = window.innerWidth; height = window.innerHeight;
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      element.width = width * ratio; element.height = height * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const paint = () => {
      context.clearRect(0, 0, width, height);
      for (const [index, point] of points.entries()) {
        const x = point.x * width + Math.sin(time * .003 + index) * 18;
        const y = (point.y * height - time * point.speed * .15 + height) % height;
        const distance = Math.hypot(x - pointer.x, y - pointer.y);
        const glow = Math.max(0, 1 - distance / 180);
        context.beginPath();
        context.fillStyle = index % 3 === 0 ? `rgba(208,184,246,${.24 + glow * .5})` : `rgba(200,223,214,${.16 + glow * .5})`;
        context.arc(x, y, point.radius + glow, 0, Math.PI * 2); context.fill();
        if (glow > .25) {
          context.beginPath(); context.strokeStyle = `rgba(208,184,246,${glow * .13})`;
          context.moveTo(x,y); context.lineTo(pointer.x,pointer.y); context.stroke();
        }
      }
    };
    const tick = () => { if (visible) { time++; paint(); } frame = requestAnimationFrame(tick); };
    const start = () => { cancelAnimationFrame(frame); paint(); if (!reduced.matches) frame = requestAnimationFrame(tick); };
    const move = (event: PointerEvent) => { pointer.x = event.clientX; pointer.y = event.clientY; };
    const leave = () => { pointer.x = pointer.y = -1000; };
    const visibility = () => { visible = !document.hidden; };
    resize(); start();
    window.addEventListener("resize", resize); window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", leave); document.addEventListener("visibilitychange", visibility);
    reduced.addEventListener("change", start);
    return () => {
      cancelAnimationFrame(frame); window.removeEventListener("resize", resize); window.removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", leave); document.removeEventListener("visibilitychange", visibility); reduced.removeEventListener("change", start);
    };
  }, []);
  return <canvas ref={canvas} className="ambient-particles" aria-hidden="true" />;
}
