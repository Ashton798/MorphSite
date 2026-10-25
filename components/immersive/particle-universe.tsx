"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { SceneHandle, SceneInput } from "./particle-scene";

export function ParticleUniverse({ input, onReady, onFallback }: {
  input: RefObject<SceneInput>; onReady: () => void; onFallback: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<SceneHandle | null>(null);
  const callbacks = useRef({ onReady, onFallback });
  callbacks.current = { onReady, onFallback };

  useEffect(() => {
    const ripple = (event: Event) => {
      const { clientX, clientY } = (event as CustomEvent<{ clientX: number; clientY: number }>).detail;
      const bounds = root.current?.getBoundingClientRect();
      if (!bounds) return;
      const x = (clientX / bounds.width - .5) * 2;
      const y = (.5 - clientY / bounds.height) * 2;
      scene.current?.ripple(x * 9.3, y * 5.6, 1.45);
      if (!input.current.reduced) void import("@/lib/sound-manager").then(({ soundManager }) => soundManager.play("ripple", true));
    };
    window.addEventListener("morph-ripple", ripple);
    return () => window.removeEventListener("morph-ripple", ripple);
  }, [input]);

  useEffect(() => {
    const container = root.current, element = canvas.current;
    if (!container || !element) return;
    let disposed = false;
    // Lazy module: Three is not in Studio's route, nor in the initial homepage bundle.
    import("./particle-scene").then(async ({ createParticleScene }) => {
      if (disposed) return;
      try {
        scene.current = createParticleScene(element, container, input, () => callbacks.current.onFallback());
        callbacks.current.onReady();
        await document.fonts.ready;
        if (!disposed) scene.current?.addTypography();
      } catch {
        scene.current?.dispose();
        if (!disposed) callbacks.current.onFallback();
      }
    }).catch(() => { if (!disposed) callbacks.current.onFallback(); });
    return () => {
      disposed = true;
      scene.current?.dispose();
      scene.current = null;
    };
  }, [input]);

  return <div ref={root} className="particle-universe" aria-hidden="true" onPointerDown={(event) => {
    if (event.button !== 0) return;
    const bounds = root.current?.getBoundingClientRect();
    if (!bounds) return;
    const x = (event.clientX / bounds.width - .5) * 2;
    const y = (.5 - event.clientY / bounds.height) * 2;
    scene.current?.ripple(x * 9.3, y * 5.6, 1.45);
    root.current!.style.setProperty("--ripple-x", `${event.clientX}px`);
    root.current!.style.setProperty("--ripple-y", `${event.clientY}px`);
    root.current!.dataset.ripple = "true";
    if (!input.current.reduced) void import("@/lib/sound-manager").then(({ soundManager }) => soundManager.play("ripple", true));
  }}>
    <canvas ref={canvas} className="particle-canvas" data-testid="particle-canvas" />
    <span className="liquid-ripple" />
  </div>;
}
