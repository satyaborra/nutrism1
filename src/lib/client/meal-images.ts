/**
 * Meal imagery: maps food/meal names to the curated generated photos in
 * /public/images. Deterministic keyword matching with a graceful fallback —
 * purely presentational, never used for nutrition (numbers always come from
 * the API).
 */

const IMAGE_MAP: { keywords: string[]; src: string }[] = [
  { keywords: ["idli", "sambar", "sambhar"], src: "/images/meal-idli.png" },
  { keywords: ["dosa", "uttapam", "vada"], src: "/images/dish-dosa.png" },
  { keywords: ["banana"], src: "/images/meal-banana.png" },
  {
    keywords: ["rice", "dal", "dhal", "khichdi", "biryani", "pulao", "sabzi", "sabji", "curry", "roti", "chapati", "chapathi", "paratha", "chole", "rajma", "poha", "upma"],
    src: "/images/meal-rice-dal.png",
  },
  { keywords: ["buttermilk", "chaas", "lassi", "coffee", "chai", "tea", "water", "coconut"], src: "/images/meal-buttermilk.png" },
  { keywords: ["curd", "yogurt", "paneer", "milk"], src: "/images/meal-buttermilk.png" },
  {
    keywords: ["salad", "bowl", "avocado", "chickpea", "channa", "sprout", "quinoa", "buddha"],
    src: "/images/hero-bowl.png",
  },
];

const FALLBACK = "/images/meal-generic.png";

/** Best-match image for a free-text meal/food label. */
export function mealImageFor(...labels: (string | undefined | null)[]): string {
  const text = labels.filter(Boolean).join(" ").toLowerCase();
  if (!text) return FALLBACK;
  let best: { src: string; hits: number } | null = null;
  for (const entry of IMAGE_MAP) {
    const hits = entry.keywords.filter((k) => text.includes(k)).length;
    if (hits > 0 && (!best || hits > best.hits)) best = { src: entry.src, hits };
  }
  return best?.src ?? FALLBACK;
}

/** Hero image used by the recommendation card. */
export function recommendationImageFor(mealName: string): string {
  return mealImageFor(mealName);
}
