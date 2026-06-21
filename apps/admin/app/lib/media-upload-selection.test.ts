import { describe, expect, it } from "vitest";
import { preferredUploadedImageUrl } from "./media-upload-selection.js";

describe("preferredUploadedImageUrl", () => {
  it("selects the largest generated WebP variant", () => {
    expect(preferredUploadedImageUrl({
      url: "/media/public/source/photo.jpg",
      responsiveSources: [
        { url: "/media/public/source/photo-w480.webp", width: 480, mimeType: "image/webp" },
        { url: "/media/public/source/photo-w1600.webp", width: 1600, mimeType: "image/webp" },
        { url: "/media/public/source/photo-w960.webp", width: 960, mimeType: "image/webp" }
      ]
    })).toBe("/media/public/source/photo-w1600.webp");
  });

  it("falls back to the source URL when no WebP variant exists", () => {
    expect(preferredUploadedImageUrl({ url: "/media/public/source/photo.gif", responsiveSources: [] }))
      .toBe("/media/public/source/photo.gif");
  });
});
