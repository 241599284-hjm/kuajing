import { describe, expect, it } from "vitest";
import { assertTemplateContentIsHttpsSafe } from "./template-content.js";

describe("assertTemplateContentIsHttpsSafe", () => {
  it("accepts relative and HTTPS links", () => {
    expect(() => assertTemplateContentIsHttpsSafe({
      htmlZh: '<img src="/media/public/banner.webp"><a href="https://example.com">查看</a>'
    })).not.toThrow();
  });

  it("rejects HTTP links embedded in rich text", () => {
    expect(() => assertTemplateContentIsHttpsSafe({ htmlEn: '<img src="http://127.0.0.1/banner.webp">' }))
      .toThrow("htmlEn must not contain an http:// URL");
  });
});
