"use client";

import { localizedErrorMessage } from "@commerce/error-codes";
import { useEffect, useMemo, useState } from "react";
import {
  AdminActionRow,
  AdminField,
  AdminHelpText,
  AdminInlineStatus,
  AdminListCard,
  AdminPanel,
  AdminPrimaryButton,
  AdminSecondaryButton,
  AdminTextInput
} from "./admin-ui.js";

const adminGatewayUrl = process.env.NEXT_PUBLIC_ADMIN_GATEWAY_URL ?? "http://localhost:4001";

type AdminOrderSummary = {
  orderId: string;
  orderNumber: string;
  customerEmail: string;
  status: string;
  paymentStatus: string;
  inventoryStatus: string;
  isException?: boolean;
  failureCount?: number;
  lastFailureReason?: string;
  totalMinor: number;
  currency: string;
  storageMode: "postgres" | "memory";
  createdAt: string;
};

type AdminOrderLine = {
  skuId: string;
  skuCode: string;
  title: string;
  hsCode: string;
  material: string;
  inventoryVersion: number;
  inventoryReservationKey: string;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
  currency: string;
};

type ShippingAddressSnapshot = {
  country: string;
  province: string;
  city: string;
  postalCode: string;
  street: string;
};

type AdminOrderDetail = AdminOrderSummary & {
  idempotencyKey: string;
  shippingAddress?: ShippingAddressSnapshot;
  lines: AdminOrderLine[];
  auditTrail: AdminOrderAuditEvent[];
};

type AdminOrderAuditEvent = {
  eventId: string;
  action: string;
  actorId: string;
  reason: string;
  oldValue: Record<string, string | number | boolean | null>;
  newValue: Record<string, string | number | boolean | null>;
  correlationId: string;
  storageMode: "postgres" | "memory";
  createdAt: string;
};

type PaymentTransitionResult = {
  orderId: string;
  status: string;
  paymentStatus: string;
  inventoryStatus: string;
  compensationQueued: boolean;
  storageMode: "postgres" | "memory";
};

function formatMoney(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2
  }).format(amountMinor / 100);
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

function statusLabel(value: string) {
  const labels: Record<string, string> = {
    pending_payment: "待支付",
    mock_created: "模拟支付已创建",
    reserved: "库存已预留",
    paid: "已支付",
    cancelled: "已取消",
    compensating: "补偿处理中",
    compensation_pending: "补偿待处理"
  };

  return labels[value] ?? value;
}

function isExceptionOrder(order: AdminOrderSummary) {
  return order.isException || order.status === "compensating" || order.inventoryStatus === "compensation_pending";
}

function auditActionLabel(value: string) {
  const labels: Record<string, string> = {
    manual_inventory_confirm_compensation: "人工重排确认扣减",
    manual_inventory_cancel_compensation: "人工重排释放库存"
  };

  return labels[value] ?? value;
}

export function OrderManagementPanel() {
  const [orders, setOrders] = useState<AdminOrderSummary[]>([]);
  const [status, setStatus] = useState("等待加载");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [orderDetail, setOrderDetail] = useState<AdminOrderDetail | null>(null);
  const [detailStatus, setDetailStatus] = useState("未选择订单");
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [manualCompensationReason, setManualCompensationReason] = useState("");
  const [manualCompensationAction, setManualCompensationAction] = useState<"confirm" | "cancel" | null>(null);

  async function loadOrders() {
    setIsLoading(true);
    setStatus("正在读取订单");

    try {
      const response = await fetch(`${adminGatewayUrl}/orders`, {
        headers: {
          "x-correlation-id": crypto.randomUUID()
        }
      });
      const payload = (await response.json().catch(() => [])) as AdminOrderSummary[] | { message?: string };

      if (!response.ok || !Array.isArray(payload)) {
        throw new Error(localizedErrorMessage(payload, response.status, "zh"));
      }

      setOrders(payload);
      if (selectedOrderId && !payload.some((order) => order.orderId === selectedOrderId)) {
        setSelectedOrderId(null);
        setOrderDetail(null);
        setDetailStatus("未选择订单");
      }
      setStatus(payload.length > 0 ? "已读取订单" : "暂无订单");
    } catch (error) {
      setOrders([]);
      setStatus(error instanceof Error && !(error instanceof TypeError) ? error.message : "订单 API 未连接");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadOrderDetail(orderId: string) {
    setSelectedOrderId(orderId);
    setIsDetailLoading(true);
    setDetailStatus("正在读取订单详情");

    try {
      const response = await fetch(`${adminGatewayUrl}/orders/${orderId}`, {
        headers: {
          "x-correlation-id": crypto.randomUUID()
        }
      });
      const payload = (await response.json().catch(() => ({}))) as AdminOrderDetail | { message?: string };

      if (!response.ok || !("orderId" in payload)) {
        throw new Error(localizedErrorMessage(payload, response.status, "zh"));
      }

      setOrderDetail(payload);
      setDetailStatus("已读取订单详情");
    } catch (error) {
      setOrderDetail(null);
      setDetailStatus(error instanceof Error && !(error instanceof TypeError) ? error.message : "订单详情 API 未连接");
    } finally {
      setIsDetailLoading(false);
    }
  }

  async function transitionPayment(action: "confirm" | "cancel") {
    if (!orderDetail) {
      setDetailStatus("请先选择订单");
      return;
    }

    setDetailStatus(action === "confirm" ? "正在确认支付" : "正在取消支付");

    try {
      const response = await fetch(`${adminGatewayUrl}/payments/${action === "confirm" ? "mock-confirm" : "mock-cancel"}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-correlation-id": crypto.randomUUID()
        },
        body: JSON.stringify({ orderId: orderDetail.orderId })
      });
      const payload = (await response.json().catch(() => ({}))) as PaymentTransitionResult | { message?: string };

      if (!response.ok || !("orderId" in payload)) {
        throw new Error(localizedErrorMessage(payload, response.status, "zh"));
      }

      setDetailStatus(payload.compensationQueued ? "操作已提交，库存补偿进入队列" : action === "confirm" ? "已确认支付" : "已取消支付");
      await loadOrders();
      await loadOrderDetail(orderDetail.orderId);
    } catch (error) {
      setDetailStatus(
        error instanceof Error && !(error instanceof TypeError)
          ? error.message
          : action === "confirm"
            ? "确认支付失败，未伪造成功"
            : "取消支付失败，未伪造成功"
      );
    }
  }

  async function manualCompensation(action: "confirm" | "cancel") {
    if (!orderDetail) {
      setDetailStatus("请先选择订单");
      return;
    }

    if (!manualCompensationReason.trim()) {
      setDetailStatus("人工补偿必须填写原因");
      return;
    }

    setManualCompensationAction(action);
    setDetailStatus(action === "confirm" ? "正在重排确认扣减补偿" : "正在重排释放库存补偿");

    try {
      const response = await fetch(`${adminGatewayUrl}/orders/${orderDetail.orderId}/manual-compensation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "idempotency-key": crypto.randomUUID(),
          "x-admin-actor": "local-admin",
          "x-correlation-id": crypto.randomUUID()
        },
        body: JSON.stringify({
          action,
          reason: manualCompensationReason.trim()
        })
      });
      const payload = (await response.json().catch(() => ({}))) as PaymentTransitionResult | { message?: string };

      if (!response.ok || !("orderId" in payload)) {
        throw new Error(localizedErrorMessage(payload, response.status, "zh"));
      }

      setManualCompensationReason("");
      setDetailStatus("人工补偿已重新入队，等待 worker 处理");
      await loadOrders();
      await loadOrderDetail(orderDetail.orderId);
    } catch (error) {
      setDetailStatus(error instanceof Error ? error.message : "人工补偿失败，未伪造成功");
    } finally {
      setManualCompensationAction(null);
    }
  }

  useEffect(() => {
    void loadOrders();
  }, []);

  const summary = useMemo(() => {
    const totalMinor = orders.reduce((total, order) => total + order.totalMinor, 0);
    const memoryCount = orders.filter((order) => order.storageMode === "memory").length;
    return { totalMinor, memoryCount };
  }, [orders]);

  return (
    <AdminPanel eyebrow="履约运营" id="orders-title" status={status} title="订单管理">
      <AdminHelpText>
        这里读取 order-service 的真实订单边界。当前 Mock 订单会显示库存预留、支付意向和存储模式；API 未连接时不会展示假订单。
      </AdminHelpText>

      <AdminActionRow className="mt-5">
        <AdminSecondaryButton disabled={isLoading} onClick={loadOrders} type="button">
          {isLoading ? "刷新中" : "刷新订单"}
        </AdminSecondaryButton>
        <AdminInlineStatus>
          订单数 {orders.length}，当前合计 {formatMoney(summary.totalMinor, "USD")}，内存模式 {summary.memoryCount}
        </AdminInlineStatus>
      </AdminActionRow>

      <div className="mt-5 grid gap-4">
        {orders.length === 0 ? (
          <div className="rounded-md border border-dashed border-[var(--line)] bg-[var(--bg)] p-5 text-sm text-[var(--ink-soft)]">
            {status === "订单 API 未连接" ? "订单服务或管理网关未连接，本页没有伪造订单数据。" : "暂无订单。"}
          </div>
        ) : (
          orders.map((order) => {
            const exceptionOrder = isExceptionOrder(order);
            const failureReason = order.lastFailureReason || "库存或支付补偿任务待人工确认";

            return (
              <AdminListCard
                key={order.orderId}
                eyebrow={order.storageMode === "postgres" ? "PostgreSQL" : "本地内存"}
                title={order.orderNumber}
                description={`${order.customerEmail} · ${formatDate(order.createdAt)}`}
                action={
                  exceptionOrder ? (
                    <span
                      className="w-fit rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700"
                      title={failureReason}
                    >
                      异常订单
                    </span>
                  ) : null
                }
              >
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <dt className="text-[var(--ink-soft)]">订单状态</dt>
                    <dd className="mt-1 font-semibold">{statusLabel(order.status)}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--ink-soft)]">支付状态</dt>
                    <dd className="mt-1 font-semibold">{statusLabel(order.paymentStatus)}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--ink-soft)]">库存状态</dt>
                    <dd className="mt-1 font-semibold">{statusLabel(order.inventoryStatus)}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--ink-soft)]">订单金额</dt>
                    <dd className="mt-1 font-semibold">{formatMoney(order.totalMinor, order.currency)}</dd>
                  </div>
                </dl>

                {exceptionOrder ? (
                  <div
                    className="mt-4 rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-800"
                    title={failureReason}
                  >
                    失败次数 {order.failureCount ?? 0} · 最近原因：{failureReason}
                  </div>
                ) : null}

                <AdminActionRow className="mt-4">
                  <AdminSecondaryButton
                    disabled={isDetailLoading && selectedOrderId === order.orderId}
                    onClick={() => void loadOrderDetail(order.orderId)}
                    type="button"
                  >
                    {isDetailLoading && selectedOrderId === order.orderId ? "读取中" : "查看详情"}
                  </AdminSecondaryButton>
                </AdminActionRow>
              </AdminListCard>
            );
          })
        )}
      </div>

      <div className="mt-5 rounded-md border border-[var(--line)] p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-soft)]">Order Detail</p>
            <h3 className="mt-1 text-lg font-semibold">订单详情与支付操作</h3>
            <p className="text-sm text-[var(--ink-soft)]">{detailStatus}</p>
          </div>
          {orderDetail ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <AdminPrimaryButton
                disabled={orderDetail.status !== "pending_payment" && orderDetail.status !== "compensating"}
                onClick={() => void transitionPayment("confirm")}
                type="button"
              >
                确认支付
              </AdminPrimaryButton>
              <AdminSecondaryButton
                disabled={orderDetail.status !== "pending_payment" && orderDetail.status !== "compensating"}
                onClick={() => void transitionPayment("cancel")}
                type="button"
              >
                取消支付
              </AdminSecondaryButton>
            </div>
          ) : null}
        </div>

        {orderDetail ? (
          <div className="mt-4 grid gap-4">
            <dl className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <dt className="text-[var(--ink-soft)]">订单号</dt>
                <dd className="mt-1 font-semibold">{orderDetail.orderNumber}</dd>
              </div>
              <div>
                <dt className="text-[var(--ink-soft)]">买家邮箱</dt>
                <dd className="mt-1 font-semibold">{orderDetail.customerEmail}</dd>
              </div>
              <div>
                <dt className="text-[var(--ink-soft)]">幂等 Key</dt>
                <dd className="mt-1 break-all font-semibold">{orderDetail.idempotencyKey}</dd>
              </div>
              <div>
                <dt className="text-[var(--ink-soft)]">存储模式</dt>
                <dd className="mt-1 font-semibold">{orderDetail.storageMode}</dd>
              </div>
              <div>
                <dt className="text-[var(--ink-soft)]">订单状态</dt>
                <dd className="mt-1 font-semibold">{statusLabel(orderDetail.status)}</dd>
              </div>
              <div>
                <dt className="text-[var(--ink-soft)]">支付状态</dt>
                <dd className="mt-1 font-semibold">{statusLabel(orderDetail.paymentStatus)}</dd>
              </div>
              <div>
                <dt className="text-[var(--ink-soft)]">库存状态</dt>
                <dd className="mt-1 font-semibold">{statusLabel(orderDetail.inventoryStatus)}</dd>
              </div>
              <div>
                <dt className="text-[var(--ink-soft)]">订单金额</dt>
                <dd className="mt-1 font-semibold">{formatMoney(orderDetail.totalMinor, orderDetail.currency)}</dd>
              </div>
            </dl>

            <div className="rounded-md border border-[var(--line)] p-4 text-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-soft)]">Shipping Snapshot</p>
              <h4 className="mt-1 text-base font-semibold">收货地址快照</h4>
              {orderDetail.shippingAddress ? (
                <dl className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  <div>
                    <dt className="text-[var(--ink-soft)]">国家</dt>
                    <dd className="mt-1 font-semibold">{orderDetail.shippingAddress.country}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--ink-soft)]">省 / 州</dt>
                    <dd className="mt-1 font-semibold">{orderDetail.shippingAddress.province}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--ink-soft)]">城市</dt>
                    <dd className="mt-1 font-semibold">{orderDetail.shippingAddress.city}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--ink-soft)]">邮编</dt>
                    <dd className="mt-1 font-semibold">{orderDetail.shippingAddress.postalCode}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--ink-soft)]">详细地址</dt>
                    <dd className="mt-1 font-semibold">{orderDetail.shippingAddress.street}</dd>
                  </div>
                </dl>
              ) : (
                <p className="mt-3 text-[var(--ink-soft)]">旧订单暂无收货地址快照。</p>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead className="border-b border-[var(--line)] text-[var(--ink-soft)]">
                  <tr>
                    <th className="py-2 pr-3 font-medium">商品</th>
                    <th className="py-2 pr-3 font-medium">SKU</th>
                    <th className="py-2 pr-3 font-medium">HS Code</th>
                    <th className="py-2 pr-3 font-medium">材质</th>
                    <th className="py-2 pr-3 font-medium">库存版本</th>
                    <th className="py-2 pr-3 font-medium">数量</th>
                    <th className="py-2 pr-3 font-medium">小计</th>
                  </tr>
                </thead>
                <tbody>
                  {orderDetail.lines.map((line) => (
                    <tr className="border-b border-[var(--line)] last:border-b-0" key={`${line.inventoryReservationKey}-${line.skuId}`}>
                      <td className="py-3 pr-3">
                        <div className="font-semibold">{line.title}</div>
                        <div className="mt-1 break-all text-xs text-[var(--ink-soft)]">{line.inventoryReservationKey}</div>
                      </td>
                      <td className="py-3 pr-3">{line.skuCode}</td>
                      <td className="py-3 pr-3">{line.hsCode}</td>
                      <td className="py-3 pr-3">{line.material}</td>
                      <td className="py-3 pr-3">{line.inventoryVersion}</td>
                      <td className="py-3 pr-3">{line.quantity}</td>
                      <td className="py-3 pr-3">{formatMoney(line.lineTotalMinor, line.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {isExceptionOrder(orderDetail) ? (
              <div className="grid gap-4 rounded-md border border-red-100 bg-red-50 p-4 text-sm text-red-800">
                <p>异常原因：{orderDetail.lastFailureReason || "库存或支付补偿任务待人工确认"}</p>
                <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
                  <AdminField className="text-red-900" label="人工补偿原因">
                    <AdminTextInput
                      onChange={(event) => setManualCompensationReason(event.target.value)}
                      placeholder="例如：库存服务恢复后人工重排补偿"
                      value={manualCompensationReason}
                    />
                  </AdminField>
                  <div className="flex items-end">
                    <AdminPrimaryButton
                      disabled={manualCompensationAction !== null}
                      onClick={() => void manualCompensation("confirm")}
                      type="button"
                    >
                      {manualCompensationAction === "confirm" ? "入队中" : "重排确认扣减"}
                    </AdminPrimaryButton>
                  </div>
                  <div className="flex items-end">
                    <AdminSecondaryButton
                      disabled={manualCompensationAction !== null}
                      onClick={() => void manualCompensation("cancel")}
                      type="button"
                    >
                      {manualCompensationAction === "cancel" ? "入队中" : "重排释放库存"}
                    </AdminSecondaryButton>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="rounded-md border border-[var(--line)] p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-soft)]">Audit</p>
                <h4 className="mt-1 text-base font-semibold">订单操作审计</h4>
              </div>
              {orderDetail.auditTrail.length === 0 ? (
                <p className="mt-3 text-sm text-[var(--ink-soft)]">暂无订单审计记录。</p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                    <thead className="border-b border-[var(--line)] text-[var(--ink-soft)]">
                      <tr>
                        <th className="py-2 pr-3 font-medium">时间</th>
                        <th className="py-2 pr-3 font-medium">动作</th>
                        <th className="py-2 pr-3 font-medium">操作人</th>
                        <th className="py-2 pr-3 font-medium">原因</th>
                        <th className="py-2 pr-3 font-medium">旧状态</th>
                        <th className="py-2 pr-3 font-medium">新状态</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orderDetail.auditTrail.map((event) => (
                        <tr className="border-b border-[var(--line)] last:border-b-0" key={event.eventId}>
                          <td className="py-3 pr-3">{formatDate(event.createdAt)}</td>
                          <td className="py-3 pr-3 font-semibold">{auditActionLabel(event.action)}</td>
                          <td className="py-3 pr-3">{event.actorId}</td>
                          <td className="py-3 pr-3">{event.reason}</td>
                          <td className="py-3 pr-3 text-xs text-[var(--ink-soft)]">
                            {statusLabel(String(event.oldValue.status))} / {statusLabel(String(event.oldValue.inventoryStatus))}
                          </td>
                          <td className="py-3 pr-3 text-xs text-[var(--ink-soft)]">
                            {statusLabel(String(event.newValue.status))} / {statusLabel(String(event.newValue.inventoryStatus))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-md border border-dashed border-[var(--line)] bg-[var(--bg)] p-5 text-sm text-[var(--ink-soft)]">
            从上方订单列表选择一笔订单后查看详情和 Mock 支付操作。
          </div>
        )}
      </div>
    </AdminPanel>
  );
}
