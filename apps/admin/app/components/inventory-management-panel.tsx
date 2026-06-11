"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AdminActionRow,
  AdminHelpText,
  AdminInlineStatus,
  AdminListCard,
  AdminPanel,
  AdminSecondaryButton
} from "./admin-ui.js";

const adminGatewayUrl = process.env.NEXT_PUBLIC_ADMIN_GATEWAY_URL ?? "http://localhost:4001";

type AdminInventoryItem = {
  itemId: string;
  skuId: string;
  warehouseId: string;
  availableQty: number;
  reservedQty: number;
  lockedQty: number;
  safetyQty: number;
  sellableQty: number;
  inventoryVersion: number;
  storageMode: "postgres" | "memory";
};

type AdminInventoryReservation = {
  reservationId: string;
  orderId: string | null;
  skuId: string;
  warehouseId: string;
  qty: number;
  status: "reserved" | "confirmed" | "cancelled";
  idempotencyKey: string;
  storageMode: "postgres" | "memory";
  createdAt: string;
};

function shortId(value: string) {
  return value.length > 13 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC"
  }).format(date);
}

function reservationStatusLabel(value: AdminInventoryReservation["status"]) {
  const labels: Record<AdminInventoryReservation["status"], string> = {
    reserved: "已预留",
    confirmed: "已确认扣减",
    cancelled: "已释放"
  };

  return labels[value];
}

export function InventoryManagementPanel() {
  const [items, setItems] = useState<AdminInventoryItem[]>([]);
  const [reservations, setReservations] = useState<AdminInventoryReservation[]>([]);
  const [status, setStatus] = useState("等待加载");
  const [reservationStatus, setReservationStatus] = useState("等待加载");
  const [isLoading, setIsLoading] = useState(false);
  const [isReservationLoading, setIsReservationLoading] = useState(false);
  const [releasingId, setReleasingId] = useState<string | null>(null);

  async function loadItems() {
    setIsLoading(true);
    setStatus("正在读取库存");

    try {
      const response = await fetch(`${adminGatewayUrl}/inventory/items`, {
        headers: {
          "x-correlation-id": crypto.randomUUID()
        }
      });
      const payload = (await response.json().catch(() => [])) as AdminInventoryItem[] | { message?: string };

      if (!response.ok || !Array.isArray(payload)) {
        throw new Error(Array.isArray(payload) ? `HTTP ${response.status}` : payload.message ?? `HTTP ${response.status}`);
      }

      setItems(payload);
      setStatus(payload.length > 0 ? "已读取库存" : "暂无库存");
    } catch {
      setItems([]);
      setStatus("库存 API 未连接");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadReservations() {
    setIsReservationLoading(true);
    setReservationStatus("正在读取预留流水");

    try {
      const response = await fetch(`${adminGatewayUrl}/inventory/reservations`, {
        headers: {
          "x-correlation-id": crypto.randomUUID()
        }
      });
      const payload = (await response.json().catch(() => [])) as AdminInventoryReservation[] | { message?: string };

      if (!response.ok || !Array.isArray(payload)) {
        throw new Error(Array.isArray(payload) ? `HTTP ${response.status}` : payload.message ?? `HTTP ${response.status}`);
      }

      setReservations(payload);
      setReservationStatus(payload.length > 0 ? `已读取 ${payload.length} 条预留流水` : "暂无预留流水");
    } catch {
      setReservations([]);
      setReservationStatus("预留流水 API 未连接");
    } finally {
      setIsReservationLoading(false);
    }
  }

  async function releaseReservation(reservation: AdminInventoryReservation) {
    setReleasingId(reservation.reservationId);
    setReservationStatus("正在人工释放预留库存");

    try {
      const response = await fetch(`${adminGatewayUrl}/inventory/reservations/${reservation.reservationId}/release`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-correlation-id": crypto.randomUUID()
        },
        body: JSON.stringify({ reason: "manual release from admin UI" })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      setReservationStatus("已人工释放预留库存");
      await Promise.all([loadItems(), loadReservations()]);
    } catch {
      setReservationStatus("人工释放失败，未伪造成功");
    } finally {
      setReleasingId(null);
    }
  }

  useEffect(() => {
    void loadItems();
    void loadReservations();
  }, []);

  const totals = useMemo(() => {
    return items.reduce(
      (current, item) => ({
        availableQty: current.availableQty + item.availableQty,
        reservedQty: current.reservedQty + item.reservedQty,
        lockedQty: current.lockedQty + (item.lockedQty ?? 0),
        sellableQty: current.sellableQty + item.sellableQty,
        memoryCount: current.memoryCount + (item.storageMode === "memory" ? 1 : 0)
      }),
      { availableQty: 0, reservedQty: 0, lockedQty: 0, sellableQty: 0, memoryCount: 0 }
    );
  }, [items]);

  return (
    <AdminPanel eyebrow="库存运营" id="inventory-title" status={status} title="库存管理">
      <AdminHelpText>
        这里读取 inventory-service 的库存快照。可用、预留、锁定、可售使用运营口径展示；API 未连接时不会展示假库存。
      </AdminHelpText>

      <AdminActionRow className="mt-5">
        <AdminSecondaryButton disabled={isLoading} onClick={loadItems} type="button">
          {isLoading ? "刷新中" : "刷新库存"}
        </AdminSecondaryButton>
        <AdminInlineStatus>
          SKU {items.length}，可用 {totals.availableQty}，预留 {totals.reservedQty}，锁定 {totals.lockedQty}，可售{" "}
          {totals.sellableQty}，内存模式 {totals.memoryCount}
        </AdminInlineStatus>
      </AdminActionRow>

      <div className="mt-5 grid gap-4">
        {items.length === 0 ? (
          <div className="rounded-md border border-dashed border-[var(--line)] bg-[var(--bg)] p-5 text-sm text-[var(--ink-soft)]">
            {status === "库存 API 未连接" ? "库存服务或管理网关未连接，本页没有伪造库存数据。" : "暂无库存。"}
          </div>
        ) : (
          items.map((item) => (
            <AdminListCard
              key={item.itemId}
              eyebrow={item.storageMode === "postgres" ? "PostgreSQL" : "本地内存"}
              title={`SKU ${shortId(item.skuId)}`}
              description={`仓库 ${shortId(item.warehouseId)} · 库存版本 ${item.inventoryVersion}`}
            >
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-5">
                <div>
                  <dt className="text-[var(--ink-soft)]">可用库存</dt>
                  <dd className="mt-1 font-semibold">{item.availableQty}</dd>
                  <dd className="mt-1 text-xs text-[var(--ink-soft)]">可卖给客户的总池</dd>
                </div>
                <div>
                  <dt className="text-[var(--ink-soft)]">预留库存</dt>
                  <dd className="mt-1 font-semibold">{item.reservedQty}</dd>
                  <dd className="mt-1 text-xs text-[var(--ink-soft)]">已下单未支付</dd>
                </div>
                <div>
                  <dt className="text-[var(--ink-soft)]">锁定库存</dt>
                  <dd className="mt-1 font-semibold">{item.lockedQty ?? 0}</dd>
                  <dd className="mt-1 text-xs text-[var(--ink-soft)]">售后 / 盘点占用</dd>
                </div>
                <div>
                  <dt className="text-[var(--ink-soft)]">安全库存</dt>
                  <dd className="mt-1 font-semibold">{item.safetyQty}</dd>
                  <dd className="mt-1 text-xs text-[var(--ink-soft)]">低于阈值不卖</dd>
                </div>
                <div>
                  <dt className="text-[var(--ink-soft)]">可售库存</dt>
                  <dd className="mt-1 font-semibold">{item.sellableQty}</dd>
                  <dd className="mt-1 text-xs text-[var(--ink-soft)]">前端实际展示</dd>
                </div>
              </dl>
            </AdminListCard>
          ))
        )}
      </div>

      <div className="mt-5 rounded-md border border-[var(--line)] p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-soft)]">Reservations</p>
            <h3 className="mt-1 text-lg font-semibold">库存预留流水</h3>
            <p className="text-sm text-[var(--ink-soft)]">{reservationStatus}</p>
          </div>
          <AdminSecondaryButton disabled={isReservationLoading} onClick={loadReservations} type="button">
            {isReservationLoading ? "刷新预留中" : "刷新预留流水"}
          </AdminSecondaryButton>
        </div>

        {reservations.length === 0 ? (
          <div className="mt-4 rounded-md border border-dashed border-[var(--line)] bg-[var(--bg)] p-5 text-sm text-[var(--ink-soft)]">
            {reservationStatus === "预留流水 API 未连接" ? "库存服务或管理网关未连接，本页没有伪造预留流水。" : "暂无预留流水。"}
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-left text-sm">
              <thead className="border-b border-[var(--line)] text-[var(--ink-soft)]">
                <tr>
                  <th className="py-2 pr-3 font-medium">时间</th>
                  <th className="py-2 pr-3 font-medium">状态</th>
                  <th className="py-2 pr-3 font-medium">SKU</th>
                  <th className="py-2 pr-3 font-medium">仓库</th>
                  <th className="py-2 pr-3 font-medium">订单</th>
                  <th className="py-2 pr-3 font-medium">数量</th>
                  <th className="py-2 pr-3 font-medium">幂等 Key</th>
                  <th className="py-2 pr-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {reservations.map((reservation) => (
                  <tr className="border-b border-[var(--line)] last:border-b-0" key={reservation.reservationId}>
                    <td className="py-3 pr-3">{formatDate(reservation.createdAt)}</td>
                    <td className="py-3 pr-3 font-semibold">{reservationStatusLabel(reservation.status)}</td>
                    <td className="py-3 pr-3">{shortId(reservation.skuId)}</td>
                    <td className="py-3 pr-3">{shortId(reservation.warehouseId)}</td>
                    <td className="py-3 pr-3">{reservation.orderId ? shortId(reservation.orderId) : "-"}</td>
                    <td className="py-3 pr-3">{reservation.qty}</td>
                    <td className="py-3 pr-3">
                      <span className="break-all text-xs text-[var(--ink-soft)]">{reservation.idempotencyKey}</span>
                    </td>
                    <td className="py-3 pr-3">
                      <AdminSecondaryButton
                        disabled={reservation.status !== "reserved" || releasingId === reservation.reservationId}
                        onClick={() => void releaseReservation(reservation)}
                        type="button"
                      >
                        {releasingId === reservation.reservationId ? "释放中" : "人工释放"}
                      </AdminSecondaryButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminPanel>
  );
}
