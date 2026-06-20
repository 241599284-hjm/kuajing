import { describe, expect, it } from "vitest";
import { normalizeReviewImages } from "./review-images.js";

describe("normalizeReviewImages", () => {
  it("stores same-origin media paths and explicit HTTPS URLs", () => {
    expect(normalizeReviewImages(["/media/public/store/review/photo.webp", "//cdn.example.com/photo.webp"]))
      .toEqual(["/media/public/store/review/photo.webp", "https://cdn.example.com/photo.webp"]);
  });

  it("rejects HTTP image URLs", () => {
    expect(() => normalizeReviewImages(["http://127.0.0.1/photo.webp"]))
      .toThrow("insecure HTTP");
  });
});
