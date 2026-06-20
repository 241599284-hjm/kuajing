import { describe, expect, it } from "vitest";
import {
  normalizeNewsletterEmail,
  newsletterEventAction,
  normalizeNewsletterListQuery,
  normalizeNewsletterStatusUpdate
} from "./newsletter-subscription.js";

describe("normalizeNewsletterEmail", () => {
  it("normalizes a valid subscriber address", () => {
    expect(normalizeNewsletterEmail("  Collector@Example.COM ")).toBe("collector@example.com");
  });

  it("rejects malformed and oversized addresses", () => {
    expect(() => normalizeNewsletterEmail("missing-at.example.com")).toThrow("valid email");
    expect(() => normalizeNewsletterEmail(`${"a".repeat(250)}@example.com`)).toThrow("valid email");
  });
});

describe("normalizeNewsletterListQuery", () => {
  it("normalizes pagination, status, and email search", () => {
    expect(normalizeNewsletterListQuery({
      page: "2",
      size: "25",
      status: "unsubscribed",
      search: " Collector@Example.COM "
    })).toEqual({
      page: 2,
      size: 25,
      offset: 25,
      status: "unsubscribed",
      search: "collector@example.com"
    });
  });

  it("uses safe defaults and rejects invalid bounds", () => {
    expect(normalizeNewsletterListQuery({})).toEqual({
      page: 1,
      size: 20,
      offset: 0,
      status: "all",
      search: ""
    });
    expect(() => normalizeNewsletterListQuery({ page: "0" })).toThrow("page");
    expect(() => normalizeNewsletterListQuery({ size: "101" })).toThrow("size");
    expect(() => normalizeNewsletterListQuery({ status: "deleted" })).toThrow("status");
  });
});

describe("normalizeNewsletterStatusUpdate", () => {
  it("normalizes a supported status update", () => {
    expect(normalizeNewsletterStatusUpdate(" Collector@Example.COM ", "unsubscribed")).toEqual({
      email: "collector@example.com",
      status: "unsubscribed"
    });
  });

  it("rejects unsupported status values", () => {
    expect(() => normalizeNewsletterStatusUpdate("collector@example.com", "deleted")).toThrow("status");
  });
});

describe("newsletterEventAction", () => {
  it("distinguishes first subscription, reactivation, and unsubscribe", () => {
    expect(newsletterEventAction(null, "active")).toBe("subscribed");
    expect(newsletterEventAction("unsubscribed", "active")).toBe("reactivated");
    expect(newsletterEventAction("active", "unsubscribed")).toBe("unsubscribed");
  });
});
