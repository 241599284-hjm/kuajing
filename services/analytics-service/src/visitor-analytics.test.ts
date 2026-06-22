import { describe, expect, it } from "vitest";
import {
  clampDurationSeconds,
  normalizeCountry,
  normalizePath,
  shouldRecordServerPath,
  resolveBusinessDayRange
} from "./visitor-analytics.js";

describe("visitor analytics normalization", () => {
  it("keeps durations within one page-session day", () => {
    expect(clampDurationSeconds(-4)).toBe(0);
    expect(clampDurationSeconds(18.8)).toBe(19);
    expect(clampDurationSeconds(90_000)).toBe(86_400);
  });

  it("accepts only safe same-site paths", () => {
    expect(normalizePath("/products?sort=new")).toBe("/products?sort=new");
    expect(normalizePath("https://attacker.example/collect")).toBe("/");
    expect(normalizePath("//attacker.example")).toBe("/");
    expect(normalizePath("")).toBe("/");
  });

  it("normalizes trusted two-letter country codes", () => {
    expect(normalizeCountry("us")).toEqual({ code: "US", name: "United States" });
    expect(normalizeCountry("XX")).toEqual({ code: null, name: "Unknown" });
    expect(normalizeCountry(undefined)).toEqual({ code: null, name: "Unknown" });
  });

  it("resolves today in the configured business timezone", () => {
    const range = resolveBusinessDayRange("2026-06-22", "Asia/Hong_Kong");
    expect(range.start.toISOString()).toBe("2026-06-21T16:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-06-22T16:00:00.000Z");
  });

  it("records storefront documents but excludes assets and internal routes", () => {
    expect(shouldRecordServerPath("/products")).toBe(true);
    expect(shouldRecordServerPath("/categories/teapot?sort=new")).toBe(true);
    expect(shouldRecordServerPath("/_next/static/chunk.js")).toBe(false);
    expect(shouldRecordServerPath("/static/hero.webp")).toBe(false);
    expect(shouldRecordServerPath("/favicon.ico")).toBe(false);
    expect(shouldRecordServerPath("/api/health")).toBe(false);
  });
});
