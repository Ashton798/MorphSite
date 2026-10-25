"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

export function Reveal({ children, className = "", delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const reduced = useReducedMotion();
  return <motion.div className={className} initial={false}
    whileInView={{ opacity: [0.65, 1], y: reduced ? 0 : [12, 0] }}
    viewport={{ once: true, amount: 0.08 }} transition={{ duration: reduced ? 0 : 0.6, delay, ease: [0.16, 1, 0.3, 1] }}>
    {children}
  </motion.div>;
}

export function MetalSculpture() {
  const reduced = useReducedMotion();
  return <div className="metal-scene" aria-hidden="true">
    <div className="metal-grid" />
    <motion.div className="metal-form" initial={false}
      whileInView={reduced ? {} : { rotate: [-20, 18, -12], y: [10, -6, 0] }}
      viewport={{ once: true }} transition={{ duration: 6, ease: [0.16, 1, 0.3, 1] }}>
      <div className="metal-core" /><div className="metal-ring metal-ring-one" /><div className="metal-ring metal-ring-two" />
    </motion.div>
    <span className="metal-caption">ONE IDEA. MANY FORMS.</span>
  </div>;
}
