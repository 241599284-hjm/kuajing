import { describe, expect, it } from "vitest";
import { containsInsecureHttp, normalizeResourceReference, publicMediaPath } from "./media-reference.js";

describe("media references", () => {
  it("creates an origin-free public path from an object key", () => {
    expect(publicMediaPath("store/product-media/image/2026-06/tea set.webp"))
      .toBe("/media/public/store/product-media/image/2026-06/tea%20set.webp");
  });

  it("keeps relative paths and explicit HTTPS third-party URLs", () => {
    expect(normalizeResourceReference("/assets/tea.png")).toBe("/assets/tea.png");
    expect(normalizeResourceReference("https://cdn.example.com/tea.png")).toBe("https://cdn.example.com/tea.png");
    expect(normalizeResourceReference("//cdn.example.com/tea.png")).toBe("https://cdn.example.com/tea.png");
  });

  it("rejects insecure and ambiguous resource references", () => {
    expect(() => normalizeResourceReference("http://cdn.example.com/tea.png")).toThrow("insecure HTTP");
    expect(() => normalizeResourceReference("images/tea.png")).toThrow("relative path or HTTPS");
    expect(() => publicMediaPath("../secret.png")).toThrow("invalid media object key");
  });

  it("detects HTTP URLs embedded in rich text", () => {
    expect(containsInsecureHttp('<img src="http://cdn.example.com/tea.png">')).toBe(true);
    expect(containsInsecureHttp('<img src="/media/public/tea.png">')).toBe(false);
    expect(containsInsecureHttp('<a href="https://example.com">Link</a>')).toBe(false);
  });
});
