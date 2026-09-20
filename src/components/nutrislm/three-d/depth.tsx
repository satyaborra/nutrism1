"use client";

/**
 * 3D depth utilities shared by every three-d component.
 *
 * Philosophy: CSS does the heavy lifting (shadows, sheens, float loops — see
 * the 3D layer in globals.css). JS here only adds what CSS cannot express:
 *  - device tiering (desktop full / tablet reduced / phone simplified)
 *  - pointer-tilt with rAF throttling, gated on fine pointers + reduced motion
 *
 * Nothing here touches business logic; everything is presentational.
 */
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

export type DepthTier = "full" | "reduced" | "flat";

/**
 * Device tier for 3D intensity:
 *  - "full"    fine pointer + wide viewport (desktop) → tilt, float, particles
 *  - "reduced" touch/tablet → float only, CSS already softens amplitude
 *  - "flat"    prefers-reduced-motion → no motion at all (shadows remain)
 */
export function useDepthTier(): DepthTier {
  const reduced = useReducedMotion();
  const [full, setFull] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(pointer: fine) and (min-width: 1024px)");
    const update = () => setFull(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  if (reduced) return "flat";
  return full ? "full" : "reduced";
}

export interface TiltOptions {
  /** Max rotation in degrees (kept small — premium, not gimmicky). */
  max?: number;
  /** Extra lift in px applied while the pointer is over the element. */
  lift?: number;
}

/**
 * Pointer-tilt wiring for a `.tilt-body` element. Returns a stable setter to
 * use as `ref`. Listeners attach only on the "full" tier (fine pointer,
 * desktop, motion allowed), re-wire automatically when the tier flips, and
 * detach on unmount. rAF-throttled, mouse-only, transform resets on leave.
 */
export function useTilt<T extends HTMLElement = HTMLDivElement>(
  options: TiltOptions = {},
): (node: T | null) => void {
  const tier = useDepthTier();
  const [node, setNode] = useState<T | null>(null);
  const { max = 5, lift = 2 } = options;

  useEffect(() => {
    const el = node;
    if (!el || tier !== "full") return;

    let raf = 0;

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const rect = el.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width - 0.5;
      const py = (e.clientY - rect.top) / rect.height - 0.5;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.transform = `rotateX(${(-py * max).toFixed(2)}deg) rotateY(${(px * max).toFixed(2)}deg) translateY(-${lift}px)`;
      });
    };
    const onLeave = () => {
      cancelAnimationFrame(raf);
      el.style.transform = "";
    };

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(raf);
      el.style.transform = "";
    };
  }, [node, tier, max, lift]);

  return setNode;
}

/** True when the environment should skip ALL 3D motion (SSR-safe-ish). */
export function useStatic3D(): boolean {
  const tier = useDepthTier();
  return tier === "flat";
}
