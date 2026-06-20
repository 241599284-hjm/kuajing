import { describe, expect, it } from "vitest";
import { safePayPalRedirectUrl } from "./paypal-redirect.js";

describe("safePayPalRedirectUrl", () => {
  it.each([
    "https://www.sandbox.paypal.com/checkoutnow?token=SANDBOX-ORDER",
    "https://www.paypal.com/checkoutnow?token=LIVE-ORDER"
  ])("accepts a PayPal approval URL: %s", (url) => {
    expect(safePayPalRedirectUrl(url)).toBe(url);
  });

  it.each([
    undefined,
    "not-a-url",
    "javascript:alert(1)",
    "http://www.sandbox.paypal.com/checkoutnow?token=ORDER",
    "https://paypal.com.evil.example/checkoutnow?token=ORDER",
    "https://www.paypal.com.evil.example/checkoutnow?token=ORDER",
    "https://evil.example/checkoutnow?next=www.paypal.com"
  ])("rejects an unsafe redirect URL: %s", (url) => {
    expect(safePayPalRedirectUrl(url)).toBeNull();
  });
});
