"use client";

/**
 * FloatingFood — levitating food photo with a soft ground shadow that scales
 * against the bob (classic "product float" depth cue). Purely decorative:
 * the caller owns semantics (pass alt="" / aria-hidden via the image being
 * decorative by default).
 */
import { cn } from "@/lib/utils";
import { useDepthTier } from "./depth";

export function FloatingFood({
  src,
  className,
  imgClassName,
  alt = "",
  shadowWidth = "72%",
}: {
  src: string;
  className?: string;
  imgClassName?: string;
  alt?: string;
  /** Ground-shadow width relative to the container. */
  shadowWidth?: string;
}) {
  const tier = useDepthTier();
  const animated = tier !== "flat";
  return (
    <span aria-hidden className={cn("relative block", className)}>
      <img
        src={src}
        alt={alt}
        className={cn("relative z-10 object-cover", animated && "float-food", imgClassName)}
      />
      <span
        className={cn("absolute inset-x-0 bottom-[-9%] mx-auto h-[14%] rounded-[50%]", animated && "float-food-shadow")}
        style={{ width: shadowWidth }}
      />
    </span>
  );
}
