"use client";

/**
 * NutriSLM 3D visual system — premium, subtle depth primitives.
 * CSS-first (see the 3D layer in globals.css); these components add device
 * tiering, pointer tilt and composed objects. Decorative only: they never
 * carry business logic, never distort numbers, and respect reduced motion.
 */
export { useDepthTier, useTilt, useStatic3D, type DepthTier } from "./depth";
export { TiltCard } from "./tilt-card";
export { NutritionOrb } from "./nutrition-orb";
export { FloatingFood } from "./floating-food";
export { FoodScanner } from "./food-scanner";
export { AchievementBadge3D } from "./achievement-badge-3d";
export { WaterDrop3D } from "./water-drop-3d";
export { HealthCondition3D } from "./health-condition-3d";
export { FloatingParticles } from "./floating-particles";
