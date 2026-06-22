import { readFile } from "node:fs/promises";
import { hostname, loadavg, platform } from "node:os";
import { statfs } from "node:fs/promises";

type MemoryStatus = {
  totalBytes: number;
  availableBytes: number;
  swapTotalBytes: number;
  swapFreeBytes: number;
};

type CpuStat = { total: number; idle: number };

export function parseMemInfo(value: string): MemoryStatus {
  const fields = new Map(
    value.split(/\r?\n/).map((line) => {
      const match = /^([^:]+):\s+(\d+)\s+kB$/.exec(line.trim());
      return match ? [match[1], Number(match[2]) * 1024] as const : ["", 0] as const;
    })
  );

  return {
    totalBytes: fields.get("MemTotal") ?? 0,
    availableBytes: fields.get("MemAvailable") ?? 0,
    swapTotalBytes: fields.get("SwapTotal") ?? 0,
    swapFreeBytes: fields.get("SwapFree") ?? 0
  };
}

export function usagePercent(used: number, total: number) {
  if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((used / total) * 1000) / 10));
}

export function parseCpuStat(value: string): CpuStat {
  const values = value.split(/\r?\n/)[0]?.trim().split(/\s+/).slice(1).map(Number) ?? [];
  return {
    total: values.reduce((sum, current) => sum + (Number.isFinite(current) ? current : 0), 0),
    idle: (values[3] ?? 0) + (values[4] ?? 0)
  };
}

export function cpuUsagePercent(previous: CpuStat, current: CpuStat) {
  const totalDelta = current.total - previous.total;
  const idleDelta = current.idle - previous.idle;
  return usagePercent(totalDelta - idleDelta, totalDelta);
}

async function readNumber(path: string) {
  try {
    const value = (await readFile(path, "utf8")).trim();
    return value === "max" ? null : Number(value);
  } catch {
    return null;
  }
}

export async function serverStatus() {
  const previousCpu = parseCpuStat(await readFile("/proc/stat", "utf8"));
  await new Promise((resolve) => setTimeout(resolve, 120));
  const [memInfoText, uptimeText, cpuText, disk, cgroupCurrent, cgroupMax] = await Promise.all([
    readFile("/proc/meminfo", "utf8"),
    readFile("/proc/uptime", "utf8"),
    readFile("/proc/stat", "utf8"),
    statfs("/"),
    readNumber("/sys/fs/cgroup/memory.current"),
    readNumber("/sys/fs/cgroup/memory.max")
  ]);
  const memory = parseMemInfo(memInfoText);
  const memoryUsedBytes = Math.max(0, memory.totalBytes - memory.availableBytes);
  const swapUsedBytes = Math.max(0, memory.swapTotalBytes - memory.swapFreeBytes);
  const diskTotalBytes = disk.blocks * disk.bsize;
  const diskAvailableBytes = disk.bavail * disk.bsize;
  const diskUsedBytes = Math.max(0, diskTotalBytes - diskAvailableBytes);
  const uptimeSeconds = Number(uptimeText.split(/\s+/)[0] ?? 0);
  const cpuPercent = cpuUsagePercent(previousCpu, parseCpuStat(cpuText));

  return {
    checkedAt: new Date().toISOString(),
    hostname: hostname(),
    platform: platform(),
    uptimeSeconds,
    cpuPercent,
    loadAverage: loadavg(),
    memory: {
      totalBytes: memory.totalBytes,
      usedBytes: memoryUsedBytes,
      availableBytes: memory.availableBytes,
      usagePercent: usagePercent(memoryUsedBytes, memory.totalBytes)
    },
    swap: {
      totalBytes: memory.swapTotalBytes,
      usedBytes: swapUsedBytes,
      freeBytes: memory.swapFreeBytes,
      usagePercent: usagePercent(swapUsedBytes, memory.swapTotalBytes)
    },
    disk: {
      totalBytes: diskTotalBytes,
      usedBytes: diskUsedBytes,
      availableBytes: diskAvailableBytes,
      usagePercent: usagePercent(diskUsedBytes, diskTotalBytes)
    },
    containerMemory: cgroupCurrent === null ? null : {
      usedBytes: cgroupCurrent,
      limitBytes: cgroupMax,
      usagePercent: cgroupMax === null ? null : usagePercent(cgroupCurrent, cgroupMax)
    },
    process: {
      pid: process.pid,
      uptimeSeconds: Math.round(process.uptime()),
      memory: process.memoryUsage()
    }
  };
}
