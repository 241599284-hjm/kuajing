import { describe, expect, it, vi } from "vitest";
import { releaseFrontendMemory } from "./frontend-memory-release.js";

describe("releaseFrontendMemory", () => {
  it("restarts storefront first, waits for readiness, then restarts admin", async () => {
    const calls: string[] = [];
    const fetchFn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push(`${init?.method ?? "GET"} ${url}`);
      return new Response(JSON.stringify({ accepted: true }), { status: init?.method === "POST" ? 202 : 200 });
    });

    await expect(releaseFrontendMemory({
      fetchFn,
      token: "maintenance-token",
      storefrontUrl: "http://storefront:3000",
      adminUrl: "http://admin:3001",
      wait: async () => undefined
    })).resolves.toEqual(expect.objectContaining({
      accepted: true,
      restarted: ["storefront", "admin"]
    }));

    expect(calls).toEqual([
      "POST http://storefront:3000/internal/maintenance/restart",
      "GET http://storefront:3000/",
      "POST http://admin:3001/internal/maintenance/restart"
    ]);
  });

  it("rejects missing maintenance configuration", async () => {
    await expect(releaseFrontendMemory({
      fetchFn: vi.fn(),
      token: "",
      storefrontUrl: "http://storefront:3000",
      adminUrl: "http://admin:3001"
    })).rejects.toThrow("not configured");
  });

  it("stops when storefront restart is rejected", async () => {
    const fetchFn = vi.fn(async () => new Response("denied", { status: 401 }));

    await expect(releaseFrontendMemory({
      fetchFn,
      token: "maintenance-token",
      storefrontUrl: "http://storefront:3000",
      adminUrl: "http://admin:3001"
    })).rejects.toThrow("storefront restart failed");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
