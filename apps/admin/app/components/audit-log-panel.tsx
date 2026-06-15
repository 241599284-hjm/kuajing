"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AdminInlineStatus,
  AdminListCard,
  AdminPanel,
  AdminSecondaryButton,
  AdminSelect
} from "./admin-ui.js";

const adminGatewayUrl = process.env.NEXT_PUBLIC_ADMIN_GATEWAY_URL ?? "http://localhost:4001";

type AuditSource = "all" | "inventory" | "catalog" | "media" | "ops" | "product_import";

type UnifiedAuditEvent = {
  id: string;
  source: Exclude<AuditSource, "all">;
  action: string;
  actor: string;
  summary: string;
  correlationId: string;
  createdAt: string;
};

type InventoryAuditEvent = {
  id: string;
  action: string;
  actorId: string;
  reason: string;
  correlationId: string;
  createdAt: string;
};

type OpsAuditEvent = {
  id: string;
  action: string;
  actor: string;
  summary: string;
  correlationId: string;
  createdAt: string;
};

type MediaAuditEvent = {
  id: string;
  action: string;
  actorId: string;
  summary: string;
  correlationId: string;
  createdAt: string;
};

type ProductImportAuditEvent = {
  id: string;
  action: string;
  actorId: string;
  summary: string;
  correlationId: string;
  createdAt: string;
};

type CatalogAuditEvent = {
  id: string;
  action: string;
  actorId: string;
  summary: string;
  correlationId: string;
  createdAt: string;
};

function normalizeInventory(event: InventoryAuditEvent): UnifiedAuditEvent {
  return {
    id: event.id,
    source: "inventory",
    action: event.action,
    actor: event.actorId,
    summary: event.reason,
    correlationId: event.correlationId,
    createdAt: event.createdAt
  };
}

function normalizeOps(event: OpsAuditEvent): UnifiedAuditEvent {
  return {
    id: event.id,
    source: "ops",
    action: event.action,
    actor: event.actor,
    summary: event.summary,
    correlationId: event.correlationId,
    createdAt: event.createdAt
  };
}

function normalizeMedia(event: MediaAuditEvent): UnifiedAuditEvent {
  return {
    id: event.id,
    source: "media",
    action: event.action,
    actor: event.actorId,
    summary: event.summary,
    correlationId: event.correlationId,
    createdAt: event.createdAt
  };
}

function normalizeProductImport(event: ProductImportAuditEvent): UnifiedAuditEvent {
  return {
    id: event.id,
    source: "product_import",
    action: event.action,
    actor: event.actorId,
    summary: event.summary,
    correlationId: event.correlationId,
    createdAt: event.createdAt
  };
}

function normalizeCatalog(event: CatalogAuditEvent): UnifiedAuditEvent {
  return {
    id: event.id,
    source: "catalog",
    action: event.action,
    actor: event.actorId,
    summary: event.summary,
    correlationId: event.correlationId,
    createdAt: event.createdAt
  };
}

function sourceLabel(source: UnifiedAuditEvent["source"]) {
  const labels: Record<UnifiedAuditEvent["source"], string> = {
    inventory: "库存",
    catalog: "商品资料",
    media: "媒体",
    ops: "运维",
    product_import: "商品导入"
  };
  return labels[source];
}

export function AuditLogPanel() {
  const [events, setEvents] = useState<UnifiedAuditEvent[]>([]);
  const [source, setSource] = useState<AuditSource>("all");
  const [status, setStatus] = useState("正在读取审计日志...");

  async function load() {
    setStatus("正在读取审计日志...");
    const headers = { "x-correlation-id": crypto.randomUUID() };
    const nextEvents: UnifiedAuditEvent[] = [];
    const failures: string[] = [];

    try {
      const response = await fetch(`${adminGatewayUrl}/inventory/audit-events`, { headers });
      const payload = (await response.json().catch(() => [])) as InventoryAuditEvent[];
      if (!response.ok || !Array.isArray(payload)) throw new Error("inventory audit unavailable");
      nextEvents.push(...payload.map(normalizeInventory));
    } catch {
      failures.push("库存");
    }

    try {
      const response = await fetch(`${adminGatewayUrl}/catalog/audit-events`, { headers });
      const payload = (await response.json().catch(() => ({}))) as { events?: CatalogAuditEvent[] };
      if (!response.ok || !Array.isArray(payload.events)) throw new Error("catalog audit unavailable");
      nextEvents.push(...payload.events.map(normalizeCatalog));
    } catch {
      failures.push("商品资料");
    }

    try {
      const response = await fetch(`${adminGatewayUrl}/ops/audit-events`, { headers });
      const payload = (await response.json().catch(() => ({}))) as { events?: OpsAuditEvent[] };
      if (!response.ok || !Array.isArray(payload.events)) throw new Error("ops audit unavailable");
      nextEvents.push(...payload.events.map(normalizeOps));
    } catch {
      failures.push("运维");
    }

    try {
      const response = await fetch(`${adminGatewayUrl}/media/audit-events`, { headers });
      const payload = (await response.json().catch(() => ({}))) as { events?: MediaAuditEvent[] };
      if (!response.ok || !Array.isArray(payload.events)) throw new Error("media audit unavailable");
      nextEvents.push(...payload.events.map(normalizeMedia));
    } catch {
      failures.push("媒体");
    }

    try {
      const response = await fetch(`${adminGatewayUrl}/product-import/audit-events`, { headers });
      const payload = (await response.json().catch(() => ({}))) as { events?: ProductImportAuditEvent[] };
      if (!response.ok || !Array.isArray(payload.events)) throw new Error("product import audit unavailable");
      nextEvents.push(...payload.events.map(normalizeProductImport));
    } catch {
      failures.push("商品导入");
    }

    nextEvents.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setEvents(nextEvents);
    setStatus(
      failures.length === 0
        ? `已读取 ${nextEvents.length} 条审计日志`
        : `部分审计源未连接：${failures.join("、")}。未伪造这些审计数据。`
    );
  }

  useEffect(() => {
    void load();
  }, []);

  const filteredEvents = useMemo(() => {
    return source === "all" ? events : events.filter((event) => event.source === source);
  }, [events, source]);

  return (
    <AdminPanel id="audit-log" eyebrow="安全运营" title="审计日志" status={status}>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid gap-2 sm:w-64">
          <span className="text-sm font-medium">审计来源</span>
          <AdminSelect value={source} onChange={(event) => setSource(event.target.value as AuditSource)}>
            <option value="all">全部</option>
            <option value="inventory">库存</option>
            <option value="catalog">商品资料</option>
            <option value="media">媒体</option>
            <option value="ops">运维</option>
            <option value="product_import">商品导入</option>
          </AdminSelect>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <AdminSecondaryButton type="button" onClick={load}>刷新审计</AdminSecondaryButton>
          <AdminInlineStatus>{filteredEvents.length} 条</AdminInlineStatus>
        </div>
      </div>

      <div className="mt-5 grid gap-3">
        {filteredEvents.length === 0 ? (
          <AdminListCard eyebrow="Empty" title="暂无审计记录" description="当前筛选条件下没有可展示的真实审计数据。">
            <p className="mt-3 text-sm text-[var(--ink-soft)]">审计页不会生成示例记录；请先在库存、运维或商品导入模块执行写操作。</p>
          </AdminListCard>
        ) : null}

        {filteredEvents.map((event) => (
          <AdminListCard
            key={`${event.source}-${event.id}`}
            eyebrow={sourceLabel(event.source)}
            title={event.summary || event.action}
            description={`${event.action} · ${event.actor}`}
          >
            <div className="mt-3 grid gap-2 text-sm text-[var(--ink-soft)] md:grid-cols-2">
              <p>时间：{new Date(event.createdAt).toLocaleString()}</p>
              <p className="break-all">Trace：{event.correlationId}</p>
            </div>
          </AdminListCard>
        ))}
      </div>
    </AdminPanel>
  );
}
