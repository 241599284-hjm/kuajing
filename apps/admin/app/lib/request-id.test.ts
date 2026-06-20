import { describe, expect, it } from "vitest";
import { createRequestId, formatUuidV4 } from "./request-id.js";

describe("request IDs", () => {
  it("formats random bytes as an RFC 4122 version 4 UUID", () => {
    expect(formatUuidV4(new Uint8Array(16))).toBe("00000000-0000-4000-8000-000000000000");
  });

  it("creates a UUID-shaped request ID", () => {
    expect(createRequestId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
});
