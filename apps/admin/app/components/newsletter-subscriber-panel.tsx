"use client";

import {
  ChevronLeft,
  ChevronRight,
  Download,
  RefreshCw,
  Search,
  UserMinus,
  UserPlus
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { createRequestId } from "../lib/request-id.js";
import { Badge } from "./ui/badge.js";
import { Button } from "./ui/button.js";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card.js";
import { ConfirmDialog } from "./ui/dialog.js";
import { Input } from "./ui/input.js";
import { Table, TableWrap, Td, Th } from "./ui/table.js";

const adminGatewayUrl = process.env.NEXT_PUBLIC_ADMIN_GATEWAY_URL ?? "http://localhost:4001";

type SubscriberStatus = "active" | "unsubscribed";

type Subscriber = {
  email: string;
  locale: string;
  status: SubscriberStatus;
  consentAt: string;
  unsubscribedAt: string | null;
  statusUpdatedAt: string;
  statusUpdatedBy: string;
};

type SubscriberPage = {
  page: number;
  size: number;
  total: number;
  totalPages: number;
  items: Subscriber[];
};

type PendingStatusChange = {
  subscriber: Subscriber;
  status: SubscriberStatus;
} | null;

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function csvCell(value: string) {
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

export function NewsletterSubscriberPanel({
  onCountChange
}: {
  onCountChange?: (count: number) => void;
}) {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<"all" | SubscriberStatus>("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [data, setData] = useState<SubscriberPage>({
    page: 1,
    size: 20,
    total: 0,
    totalPages: 1,
    items: []
  });
  const [message, setMessage] = useState("正在读取订阅数据");
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pendingStatusChange, setPendingStatusChange] = useState<PendingStatusChange>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setMessage("正在读取订阅数据");
    const query = new URLSearchParams({
      page: String(page),
      size: "20",
      status: statusFilter
    });
    if (search) query.set("search", search);
    try {
      const [listResponse, countResponse] = await Promise.all([
        fetch(`${adminGatewayUrl}/storefront/newsletter-subscriptions?${query}`, {
          headers: { "x-correlation-id": createRequestId() }
        }),
        fetch(`${adminGatewayUrl}/storefront/newsletter-subscriptions?page=1&size=1&status=active`, {
          headers: { "x-correlation-id": createRequestId() }
        })
      ]);
      if (!listResponse.ok || !countResponse.ok) throw new Error("订阅接口返回错误");
      const [payload, activePayload] = await Promise.all([
        listResponse.json() as Promise<SubscriberPage>,
        countResponse.json() as Promise<SubscriberPage>
      ]);
      setData(payload);
      onCountChange?.(activePayload.total);
      setMessage(`共 ${payload.total} 条符合条件的订阅记录`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "订阅数据读取失败");
    } finally {
      setBusy(false);
    }
  }, [onCountChange, page, search, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function updateStatus() {
    if (!pendingStatusChange) return;
    setBusy(true);
    setMessage(pendingStatusChange.status === "active" ? "正在恢复订阅" : "正在退订");
    try {
      const response = await fetch(
        `${adminGatewayUrl}/storefront/newsletter-subscriptions/${encodeURIComponent(pendingStatusChange.subscriber.email)}`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "x-admin-actor": "homepage-admin",
            "x-correlation-id": createRequestId()
          },
          body: JSON.stringify({ status: pendingStatusChange.status })
        }
      );
      const payload = await response.json().catch(() => ({})) as { message?: string };
      if (!response.ok) throw new Error(payload.message ?? "状态更新失败");
      setPendingStatusChange(null);
      await load();
      setMessage(pendingStatusChange.status === "active" ? "订阅已恢复" : "订阅已取消");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "状态更新失败");
    } finally {
      setBusy(false);
    }
  }

  async function exportCsv() {
    setExporting(true);
    setMessage("正在整理导出数据");
    try {
      const allItems: Subscriber[] = [];
      let exportPage = 1;
      let totalPages = 1;
      do {
        const query = new URLSearchParams({
          page: String(exportPage),
          size: "100",
          status: statusFilter
        });
        if (search) query.set("search", search);
        const response = await fetch(`${adminGatewayUrl}/storefront/newsletter-subscriptions?${query}`, {
          headers: { "x-correlation-id": createRequestId() }
        });
        if (!response.ok) throw new Error("导出数据读取失败");
        const payload = await response.json() as SubscriberPage;
        allItems.push(...payload.items);
        totalPages = payload.totalPages;
        exportPage += 1;
      } while (exportPage <= totalPages);

      const rows = [
        ["Email", "Locale", "Status", "Consent At", "Status Updated At", "Status Updated By"],
        ...allItems.map((item) => [
          item.email,
          item.locale,
          item.status,
          item.consentAt,
          item.statusUpdatedAt,
          item.statusUpdatedBy
        ])
      ];
      const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
      const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `newsletter-subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage(`已导出 ${allItems.length} 条订阅记录`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "导出失败");
    } finally {
      setExporting(false);
    }
  }

  function applySearch() {
    setPage(1);
    setSearch(searchInput.trim().toLowerCase());
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>邮件订阅管理</CardTitle>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">查询、导出并管理首页收集的订阅意向</p>
          </div>
          <Badge tone="info">{data.total} 条</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex w-full min-w-0 flex-1 gap-2">
              <Input
                className="min-w-0 flex-1"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") applySearch(); }}
                placeholder="搜索买家邮箱"
              />
              <Button size="sm" variant="outline" onClick={applySearch}>
                <Search size={15}/>搜索
              </Button>
            </div>
            <select
              className="h-8 rounded-md border border-[var(--border)] bg-white px-3 text-xs"
              value={statusFilter}
              onChange={(event) => {
                setPage(1);
                setStatusFilter(event.target.value as "all" | SubscriberStatus);
              }}
              aria-label="订阅状态"
            >
              <option value="all">全部状态</option>
              <option value="active">订阅中</option>
              <option value="unsubscribed">已退订</option>
            </select>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void load()}>
              <RefreshCw size={15}/>刷新
            </Button>
            <Button size="sm" variant="outline" disabled={exporting} onClick={() => void exportCsv()}>
              <Download size={15}/>{exporting ? "导出中" : "导出 CSV"}
            </Button>
          </div>

          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>买家邮箱</Th>
                  <Th>语言</Th>
                  <Th>状态</Th>
                  <Th>订阅时间</Th>
                  <Th>最后操作</Th>
                  <Th>操作</Th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((subscriber) => (
                  <tr className="hover:bg-[var(--muted)]" key={subscriber.email}>
                    <Td className="font-medium">{subscriber.email}</Td>
                    <Td>{subscriber.locale.toUpperCase()}</Td>
                    <Td>
                      <Badge tone={subscriber.status === "active" ? "success" : "neutral"}>
                        {subscriber.status === "active" ? "订阅中" : "已退订"}
                      </Badge>
                    </Td>
                    <Td>{formatDate(subscriber.consentAt)}</Td>
                    <Td>
                      <span className="block text-xs">{subscriber.statusUpdatedBy}</span>
                      <span className="block text-xs text-[var(--muted-foreground)]">{formatDate(subscriber.statusUpdatedAt)}</span>
                    </Td>
                    <Td>
                      <Button
                        size="sm"
                        variant={subscriber.status === "active" ? "outline" : "default"}
                        onClick={() => setPendingStatusChange({
                          subscriber,
                          status: subscriber.status === "active" ? "unsubscribed" : "active"
                        })}
                      >
                        {subscriber.status === "active" ? <UserMinus size={15}/> : <UserPlus size={15}/>}
                        {subscriber.status === "active" ? "退订" : "恢复"}
                      </Button>
                    </Td>
                  </tr>
                ))}
                {data.items.length === 0 ? (
                  <tr>
                    <Td className="h-24 text-center text-[var(--muted-foreground)]" colSpan={6}>
                      没有符合条件的订阅记录
                    </Td>
                  </tr>
                ) : null}
              </tbody>
            </Table>
          </TableWrap>

          <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs text-[var(--muted-foreground)]">{message}</span>
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="outline"
                disabled={busy || page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                aria-label="上一页"
              >
                <ChevronLeft size={16}/>
              </Button>
              <span className="min-w-20 text-center text-xs">第 {data.page} / {data.totalPages} 页</span>
              <Button
                size="icon"
                variant="outline"
                disabled={busy || page >= data.totalPages}
                onClick={() => setPage((current) => current + 1)}
                aria-label="下一页"
              >
                <ChevronRight size={16}/>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={pendingStatusChange !== null}
        onOpenChange={(open) => { if (!open) setPendingStatusChange(null); }}
        title={pendingStatusChange?.status === "active" ? "确认恢复订阅" : "确认退订"}
        description={pendingStatusChange?.status === "active"
          ? `恢复后 ${pendingStatusChange?.subscriber.email ?? ""} 将重新进入有效订阅名单。`
          : `退订后 ${pendingStatusChange?.subscriber.email ?? ""} 将不再进入有效订阅名单。`}
        confirmLabel={pendingStatusChange?.status === "active" ? "确认恢复" : "确认退订"}
        danger={pendingStatusChange?.status === "unsubscribed"}
        onConfirm={() => void updateStatus()}
      />
    </>
  );
}
