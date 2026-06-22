"use client";

import { Activity, Cpu, Database, HardDrive, MemoryStick, RefreshCw, RotateCcw, Server } from "lucide-react";
import { useEffect, useState } from "react";
import { createRequestId } from "../lib/request-id.js";
import { Badge } from "./ui/badge.js";
import { Button } from "./ui/button.js";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card.js";
import { ConfirmDialog } from "./ui/dialog.js";

const adminGatewayUrl = process.env.NEXT_PUBLIC_ADMIN_GATEWAY_URL ?? "http://localhost:4001";

type Metric = { totalBytes: number; usedBytes: number; usagePercent: number };
type ServerStatus = {
  checkedAt: string;
  hostname: string;
  platform: string;
  uptimeSeconds: number;
  cpuPercent: number;
  loadAverage: number[];
  memory: Metric & { availableBytes: number };
  swap: Metric & { freeBytes: number };
  disk: Metric & { availableBytes: number };
  containerMemory: null | { usedBytes: number; limitBytes: number | null; usagePercent: number | null };
  process: { pid: number; uptimeSeconds: number; memory: { rss: number; heapUsed: number } };
};

function bytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  return `${(value / 1024 ** index).toFixed(index < 2 ? 0 : 1)} ${units[index]}`;
}

function duration(seconds: number) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return `${days} 天 ${hours} 小时`;
}

function tone(value: number): "success" | "warning" | "danger" {
  if (value >= 90) return "danger";
  if (value >= 75) return "warning";
  return "success";
}

function UsageCard({ title, icon: Icon, metric, detail }: { title: string; icon: typeof MemoryStick; metric: Metric; detail: string }) {
  return <Card><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-sm text-[var(--muted-foreground)]">{title}</p><p className="mt-2 text-2xl font-semibold">{metric.usagePercent.toFixed(1)}%</p></div><span className="grid size-10 place-items-center rounded-lg bg-[var(--info-bg)] text-[var(--info)]"><Icon size={19}/></span></div><div className="mt-4 h-2 overflow-hidden rounded bg-[var(--muted)]"><div className={`h-full ${metric.usagePercent >= 90 ? "bg-[var(--danger)]" : metric.usagePercent >= 75 ? "bg-[var(--warning)]" : "bg-[var(--success)]"}`} style={{ width: `${metric.usagePercent}%` }}/></div><div className="mt-3 flex items-center justify-between gap-3 text-xs text-[var(--muted-foreground)]"><span>{detail}</span><Badge tone={tone(metric.usagePercent)}>{metric.usagePercent >= 90 ? "高负载" : metric.usagePercent >= 75 ? "需关注" : "正常"}</Badge></div></CardContent></Card>;
}

export function ServerStatusDashboard({ role }: { role?: string }) {
  const [data, setData] = useState<ServerStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [confirmRelease, setConfirmRelease] = useState(false);
  const [message, setMessage] = useState("正在读取服务器指标");

  async function load() {
    setLoading(true);
    try {
      const response = await fetch(`${adminGatewayUrl}/ops/server-status`, {
        cache: "no-store",
        headers: { "x-correlation-id": createRequestId() }
      });
      const payload = await response.json().catch(() => ({})) as ServerStatus;
      if (!response.ok || !payload.memory) throw new Error("服务器状态接口暂不可用");
      setData(payload);
      setMessage(`采集时间 ${new Date(payload.checkedAt).toLocaleString()}`);
    } catch (error) {
      setData(null);
      setMessage(error instanceof Error ? error.message : "服务器状态读取失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(timer);
  }, []);

  async function releaseFrontendMemory() {
    setReleasing(true);
    setMessage("正在顺序重启买家前台和管理后台");
    try {
      const response = await fetch(`${adminGatewayUrl}/ops/release-frontend-memory`, {
        method: "POST",
        credentials: "include",
        headers: { "x-correlation-id": createRequestId() }
      });
      const payload = await response.json().catch(() => ({})) as { message?: string };
      if (!response.ok) throw new Error(payload.message ?? "内存释放操作失败");
      setMessage(payload.message ?? "前端进程已顺序重启，正在等待指标稳定");
      window.setTimeout(() => void load(), 10000);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "内存释放操作失败");
    } finally {
      setReleasing(false);
    }
  }

  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-xl font-semibold">服务器状态仪表盘</h1><p className="mt-1 text-xs text-[var(--muted-foreground)]">{message} · 每 30 秒自动刷新</p></div><div className="flex flex-wrap gap-2">{role === "owner" ? <Button className="min-h-11 sm:min-h-8" size="sm" variant="outline" disabled={releasing || loading} onClick={() => setConfirmRelease(true)}><RotateCcw className={releasing ? "animate-spin" : ""} size={14}/>{releasing ? "释放中" : "释放前端内存"}</Button> : null}<Button className="min-h-11 sm:min-h-8" size="sm" variant="outline" disabled={loading || releasing} onClick={() => void load()}><RefreshCw className={loading ? "animate-spin" : ""} size={14}/>立即刷新</Button></div></div>
    {data ? <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <UsageCard title="物理内存" icon={MemoryStick} metric={data.memory} detail={`${bytes(data.memory.usedBytes)} / ${bytes(data.memory.totalBytes)}`}/>
        <UsageCard title="Swap" icon={Database} metric={data.swap} detail={`${bytes(data.swap.usedBytes)} / ${bytes(data.swap.totalBytes)}`}/>
        <UsageCard title="根磁盘" icon={HardDrive} metric={data.disk} detail={`${bytes(data.disk.usedBytes)} / ${bytes(data.disk.totalBytes)}`}/>
        <UsageCard title="CPU" icon={Cpu} metric={{ totalBytes: 100, usedBytes: data.cpuPercent, usagePercent: data.cpuPercent }} detail={`当前采样 ${data.cpuPercent.toFixed(1)}%`}/>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card><CardHeader><CardTitle>主机信息</CardTitle><Badge tone="success">在线</Badge></CardHeader><CardContent><dl className="grid gap-4 text-sm sm:grid-cols-2"><div><dt className="text-xs text-[var(--muted-foreground)]">主机名</dt><dd className="mt-1 font-medium">{data.hostname}</dd></div><div><dt className="text-xs text-[var(--muted-foreground)]">平台</dt><dd className="mt-1 font-medium">{data.platform}</dd></div><div><dt className="text-xs text-[var(--muted-foreground)]">服务器运行时间</dt><dd className="mt-1 font-medium">{duration(data.uptimeSeconds)}</dd></div><div><dt className="text-xs text-[var(--muted-foreground)]">监控进程 PID</dt><dd className="mt-1 font-medium">{data.process.pid}</dd></div><div><dt className="text-xs text-[var(--muted-foreground)]">Ops 进程 RSS</dt><dd className="mt-1 font-medium">{bytes(data.process.memory.rss)}</dd></div><div><dt className="text-xs text-[var(--muted-foreground)]">Ops 容器内存</dt><dd className="mt-1 font-medium">{data.containerMemory ? `${bytes(data.containerMemory.usedBytes)}${data.containerMemory.limitBytes ? ` / ${bytes(data.containerMemory.limitBytes)}` : ""}` : "未暴露"}</dd></div></dl></CardContent></Card>
        <Card><CardHeader><CardTitle>系统负载</CardTitle><Activity size={18} className="text-[var(--info)]"/></CardHeader><CardContent><div className="grid grid-cols-3 gap-3">{data.loadAverage.slice(0, 3).map((value, index) => <div className="rounded-lg border border-[var(--border)] p-4 text-center" key={index}><p className="text-xs text-[var(--muted-foreground)]">{[1, 5, 15][index]} 分钟</p><p className="mt-2 text-xl font-semibold">{value.toFixed(2)}</p></div>)}</div><p className="mt-4 flex items-center gap-2 text-xs text-[var(--muted-foreground)]"><Server size={14}/>负载值来自服务器 `/proc`，不是浏览器估算。</p></CardContent></Card>
      </div>
    </> : <Card><CardContent className="grid min-h-72 place-items-center text-sm text-[var(--muted-foreground)]"><span className="flex items-center gap-2"><Server size={18}/>{message}</span></CardContent></Card>}
    <ConfirmDialog open={confirmRelease} onOpenChange={setConfirmRelease} title="确认释放前端内存？" description="系统会先重启买家前台，确认恢复后再重启管理后台。页面可能短暂不可访问数秒；不会执行 swapoff、清空系统缓存或重启数据库。" confirmLabel="确认释放" onConfirm={() => void releaseFrontendMemory()}/>
  </div>;
}
