import { describe, expect, it, vi } from "vitest";
import { assertMaintenanceToken, scheduleProcessRestart } from "./index.js";

describe("operations maintenance restart", () => {
  it("rejects missing configuration and mismatched tokens", () => {
    expect(() => assertMaintenanceToken("token", "")).toThrow("not configured");
    expect(() => assertMaintenanceToken("wrong", "expected")).toThrow("invalid");
  });

  it("accepts the configured token and schedules a delayed clean exit", () => {
    const schedule = vi.fn((callback: () => void) => callback());
    const exit = vi.fn();

    expect(assertMaintenanceToken("expected", "expected")).toBeUndefined();
    scheduleProcessRestart(schedule, exit);

    expect(schedule).toHaveBeenCalledWith(expect.any(Function), 750);
    expect(exit).toHaveBeenCalledWith(0);
  });
});
