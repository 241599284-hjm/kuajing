import { describe, expect, it } from "vitest";
import { cpuUsagePercent, parseCpuStat, parseMemInfo, usagePercent } from "./server-status.js";

describe("server status metrics", () => {
  it("parses Linux memory values into bytes", () => {
    const memory = parseMemInfo("MemTotal: 4096000 kB\nMemAvailable: 1024000 kB\nSwapTotal: 2048000 kB\nSwapFree: 512000 kB\n");

    expect(memory).toEqual({
      totalBytes: 4_194_304_000,
      availableBytes: 1_048_576_000,
      swapTotalBytes: 2_097_152_000,
      swapFreeBytes: 524_288_000
    });
  });

  it("calculates bounded utilization", () => {
    expect(usagePercent(75, 100)).toBe(75);
    expect(usagePercent(110, 100)).toBe(100);
    expect(usagePercent(1, 0)).toBe(0);
  });

  it("calculates CPU utilization between two proc samples", () => {
    const previous = parseCpuStat("cpu  100 20 30 850 0 0 0 0\n");
    const current = parseCpuStat("cpu  130 20 50 900 0 0 0 0\n");

    expect(cpuUsagePercent(previous, current)).toBe(50);
  });
});
