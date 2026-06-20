import { normalizeResourceReference } from "@commerce/contracts";

export function normalizeReviewImages(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").slice(0, 6).map((item) =>
    normalizeResourceReference(item)
  );
}
