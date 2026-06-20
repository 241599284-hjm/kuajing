import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { generateResponsiveImageVariants } from "./image-variants.js";

describe("generateResponsiveImageVariants", () => {
  it("creates ordered WebP variants without upscaling", async () => {
    const source = await sharp({
      create: { width: 1200, height: 800, channels: 3, background: "#efe7dc" }
    }).png().toBuffer();

    const variants = await generateResponsiveImageVariants(source);
    expect(variants.map((variant) => variant.width)).toEqual([480, 960, 1200]);
    expect(variants.every((variant) => variant.mimeType === "image/webp" && variant.byteSize > 0)).toBe(true);
  });
});
