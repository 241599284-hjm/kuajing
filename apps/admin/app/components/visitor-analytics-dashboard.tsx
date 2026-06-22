"use client";

import { Clock3, Eye, Globe2, RefreshCw, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createRequestId } from "../lib/request-id.js";
import { Badge } from "./ui/badge.js";
import { Button } from "./ui/button.js";
import { Card, CardContent } from "./ui/card.js";
import { DetailDialog } from "./ui/dialog.js";
import { Table, TableWrap, Td, Th } from "./ui/table.js";

const adminGatewayUrl = process.env.NEXT_PUBLIC_ADMIN_GATEWAY_URL ?? "http://localhost:4001";

type VisitorSummary = {
  id: string;
  ipAddress: string;
  countryCode: string | null;
  countryName: string;
  landingPath: string;
  exitPath: string;
  durationSeconds: number;
  pageCount: number;
  startedAt: string;
  lastSeenAt: string;
};
type VisitorList = {
  date: string;
  timezone: string;
  page: number;
  size: number;
  total: number;
  summary: { sessions: number; uniqueVisitors: number; averageDurationSeconds: number; pageViews: number };
  items: VisitorSummary[];
};
type ServerRequest = {
  id: string;
  ipAddress: string;
  countryCode: string | null;
  countryName: string;
  path: string;
  referrer: string;
  userAgent: string;
  requestedAt: string;
};
type ServerRequestList = {
  date: string;
  timezone: string;
  page: number;
  size: number;
  total: number;
  uniqueVisitors: number;
  items: ServerRequest[];
};
type VisitorDetail = VisitorSummary & {
  userAgent: string;
  referrer: string;
  endedAt: string | null;
  pages: Array<{
    id: string;
    path: string;
    title: string;
    durationSeconds: number;
    enteredAt: string;
    exitedAt: string | null;
  }>;
};

function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function duration(seconds: number) {
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} 分 ${seconds % 60} 秒`;
}

function MetricCard({ label, value, icon: Icon }: { label: string; value: string | number; icon: typeof Users }) {
  return <Card><CardContent className="flex items-center justify-between p-5"><div><p className="text-xs text-[var(--muted-foreground)]">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div><span className="grid size-10 place-items-center rounded-lg bg-[var(--info-bg)] text-[var(--info)]"><Icon size={18}/></span></CardContent></Card>;
}

export function VisitorAnalyticsDashboard() {
  const [logType, setLogType] = useState<"all" | "server" | "visit">("all");
  const [date, setDate] = useState(today);
  const [data, setData] = useState<VisitorList | null>(null);
  const [serverData, setServerData] = useState<ServerRequestList | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<VisitorDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [message, setMessage] = useState("正在读取访问会话");
  const selected = useMemo(() => data?.items.find((item) => item.id === selectedId) ?? null, [data, selectedId]);

  async function load() {
    setLoading(true);
    try {
      const request = (endpoint: "server-requests" | "sessions") => fetch(
        `${adminGatewayUrl}/analytics/${endpoint}?date=${encodeURIComponent(date)}&page=1&size=50`,
        { cache: "no-store", credentials: "include", headers: { "x-correlation-id": createRequestId() } }
      );
      const [serverResponse, visitResponse] = await Promise.all([
        logType === "visit" ? null : request("server-requests"),
        logType === "server" ? null : request("sessions")
      ]);
      if (serverResponse) {
        const payload = await serverResponse.json().catch(() => ({})) as ServerRequestList & { message?: string };
        if (!serverResponse.ok || !payload.items) throw new Error(payload.message ?? "服务器日志接口暂不可用");
        setServerData(payload);
      }
      if (visitResponse) {
        const payload = await visitResponse.json().catch(() => ({})) as VisitorList & { message?: string };
        if (!visitResponse.ok || !payload.items) throw new Error(payload.message ?? "访问日志接口暂不可用");
        setData(payload);
      }
      setMessage(logType === "all" ? "全部访问记录" : logType === "server" ? "服务器页面请求" : "已同意统计的访问会话");
    } catch (error) {
      setData(null);
      setMessage(error instanceof Error ? error.message : "访问监控读取失败");
    } finally {
      setLoading(false);
    }
  }

  async function testConnectivity() {
    setLoading(true);
    try {
      const response = await fetch(`${adminGatewayUrl}/analytics/ready`, {
        credentials: "include",
        cache: "no-store",
        headers: { "x-correlation-id": createRequestId() }
      });
      if (!response.ok) throw new Error("连通性检测失败");
      setMessage("admin-gateway、analytics-service 与 PostgreSQL 连通正常");
    } catch {
      setMessage("连通性检测失败，请检查访问分析服务与数据库");
    } finally {
      setLoading(false);
    }
  }

  async function openDetail(id: string) {
    if (detailLoading) return;
    setSelectedId(id);
    setDetail(null);
    setDetailLoading(true);
    try {
      const response = await fetch(`${adminGatewayUrl}/analytics/sessions/${encodeURIComponent(id)}`, {
        credentials: "include",
        cache: "no-store",
        headers: { "x-correlation-id": createRequestId() }
      });
      const payload = await response.json().catch(() => ({})) as VisitorDetail;
      if (!response.ok || !payload.id) throw new Error("访问详情不存在或无权查看");
      setDetail(payload);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetail(open: boolean) {
    if (open) return;
    setSelectedId(null);
    setDetail(null);
    setDetailLoading(false);
  }

  useEffect(() => {
    void load();
  }, [date, logType]);

  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-xl font-semibold">访问监控</h1><p className="mt-1 text-xs text-[var(--muted-foreground)]">{message}。服务器日志记录页面请求；访问日志仅记录明确同意统计的会话。</p></div>
      <div className="flex flex-wrap items-center gap-2">
        <input className="h-9 rounded-lg border border-[var(--border)] bg-white px-3 text-sm" aria-label="统计日期" type="date" value={date} onChange={(event) => setDate(event.target.value)}/>
        <Button size="sm" variant="outline" disabled={loading} onClick={() => void testConnectivity()}>检测连通性</Button>
        <Button size="sm" variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw className={loading ? "animate-spin" : ""} size={14}/>刷新</Button>
      </div>
    </div>

    <div className="inline-flex rounded-lg border border-[var(--border)] bg-white p-1">
      <Button size="sm" variant={logType === "all" ? "default" : "ghost"} onClick={() => setLogType("all")}>全部</Button>
      <Button size="sm" variant={logType === "server" ? "default" : "ghost"} onClick={() => setLogType("server")}>服务器日志</Button>
      <Button size="sm" variant={logType === "visit" ? "default" : "ghost"} onClick={() => setLogType("visit")}>访问日志</Button>
    </div>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="服务器请求" value={logType === "visit" ? "" : (serverData?.total ?? 0)} icon={Users}/>
      <MetricCard label="访问会话" value={logType === "server" ? "" : (data?.summary.sessions ?? 0)} icon={Globe2}/>
      <MetricCard label="页面浏览" value={logType === "server" ? "" : (data?.summary.pageViews ?? 0)} icon={Eye}/>
      <MetricCard label="平均停留" value={logType === "server" ? "" : duration(data?.summary.averageDurationSeconds ?? 0)} icon={Clock3}/>
    </div>

    <Card>
      <TableWrap>
        <Table className="min-w-[1000px]">
          <thead><tr><Th>类型</Th><Th>访问时间</Th><Th>IP 地址</Th><Th>国家/地区</Th><Th>访问页面</Th><Th>停留</Th><Th>退出页面</Th><Th className="sticky right-0 bg-[#fbfcfd] text-right">操作</Th></tr></thead>
          <tbody>
            {[
              ...(logType === "visit" ? [] : (serverData?.items ?? []).map((item) => ({ type: "server" as const, time: item.requestedAt, item }))),
              ...(logType === "server" ? [] : (data?.items ?? []).map((item) => ({ type: "visit" as const, time: item.startedAt, item })))
            ].sort((left, right) => new Date(right.time).getTime() - new Date(left.time).getTime()).map((entry) => entry.type === "visit" ? <tr className="hover:bg-[var(--muted)]" key={`visit-${entry.item.id}`}>
              <Td><Badge tone="success">访问日志</Badge></Td>
              <Td className="whitespace-nowrap">{new Date(entry.item.startedAt).toLocaleString()}</Td>
              <Td className="max-w-48 truncate font-mono text-xs">{entry.item.ipAddress}</Td>
              <Td>{entry.item.countryCode ? <Badge tone="info">{entry.item.countryName}</Badge> : ""}</Td>
              <Td className="max-w-72 truncate" title={entry.item.landingPath}>{entry.item.landingPath}</Td>
              <Td>{duration(entry.item.durationSeconds)}</Td>
              <Td className="max-w-72 truncate" title={entry.item.exitPath}>{entry.item.exitPath}</Td>
              <Td className="sticky right-0 bg-white text-right"><Button size="sm" variant="outline" disabled={detailLoading} onClick={() => void openDetail(entry.item.id)}>详情</Button></Td>
            </tr> : <tr className="hover:bg-[var(--muted)]" key={`server-${entry.item.id}`}>
              <Td><Badge tone="neutral">服务器日志</Badge></Td>
              <Td className="whitespace-nowrap">{new Date(entry.item.requestedAt).toLocaleString()}</Td>
              <Td className="max-w-48 truncate font-mono text-xs">{entry.item.ipAddress}</Td>
              <Td>{entry.item.countryCode ? <Badge tone="info">{entry.item.countryName}</Badge> : ""}</Td>
              <Td className="max-w-72 truncate" title={entry.item.path}>{entry.item.path}</Td>
              <Td />
              <Td />
              <Td className="sticky right-0 bg-white text-right" />
            </tr>)}
            {logType === "visit" && data && data.items.length === 0 ? <tr><Td className="h-40 text-center text-[var(--muted-foreground)]" colSpan={8}>该日期暂无访问日志</Td></tr> : null}
            {logType === "server" && serverData && serverData.items.length === 0 ? <tr><Td className="h-40 text-center text-[var(--muted-foreground)]" colSpan={8}>该日期暂无服务器日志</Td></tr> : null}
            {logType === "all" && data && serverData && data.items.length === 0 && serverData.items.length === 0 ? <tr><Td className="h-40 text-center text-[var(--muted-foreground)]" colSpan={8}>该日期暂无访问记录</Td></tr> : null}
          </tbody>
        </Table>
      </TableWrap>
    </Card>

    <DetailDialog open={selectedId !== null} onOpenChange={closeDetail} loading={detailLoading} title={selected ? `${selected.ipAddress} · ${selected.countryName}` : "访问详情"} description="完整页面轨迹由详情接口独立读取">
      {detailLoading ? <div className="grid min-h-64 place-items-center text-sm text-[var(--muted-foreground)]">正在加载访问详情</div> : detail ? <div className="space-y-6">
        <dl className="grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <div><dt className="text-xs text-[var(--muted-foreground)]">入口页面</dt><dd className="mt-1 break-all">{detail.landingPath}</dd></div>
          <div><dt className="text-xs text-[var(--muted-foreground)]">退出页面</dt><dd className="mt-1 break-all">{detail.exitPath}</dd></div>
          <div><dt className="text-xs text-[var(--muted-foreground)]">总停留</dt><dd className="mt-1">{duration(detail.durationSeconds)}</dd></div>
          <div><dt className="text-xs text-[var(--muted-foreground)]">来源</dt><dd className="mt-1 break-all">{detail.referrer || "直接访问"}</dd></div>
        </dl>
        <div><h3 className="text-sm font-medium">页面轨迹</h3><div className="mt-3 divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">{detail.pages.map((page) => <div className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_9rem_11rem]" key={page.id}><div className="min-w-0"><p className="truncate font-medium">{page.title || page.path}</p><p className="truncate text-xs text-[var(--muted-foreground)]">{page.path}</p></div><span>{duration(page.durationSeconds)}</span><span className="text-xs text-[var(--muted-foreground)]">{new Date(page.enteredAt).toLocaleString()}</span></div>)}</div></div>
        <div><h3 className="text-sm font-medium">设备信息</h3><p className="mt-2 break-all text-xs leading-6 text-[var(--muted-foreground)]">{detail.userAgent || "未提供"}</p></div>
      </div> : <div className="grid min-h-64 place-items-center text-sm text-[var(--muted-foreground)]">访问数据为空、已过期或无权查看</div>}
    </DetailDialog>
  </div>;
}
