"use client";

import { createRequestId } from "../lib/request-id.js";
import { localizedErrorMessage } from "@commerce/error-codes";
import { ChevronLeft, ChevronRight, Filter, Search, X } from "lucide-react";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { detailDialogReducer, initialDetailDialogState } from "../lib/detail-dialog-state.js";
import { parseRefundAmountMinor } from "../lib/payment-refund.js";
import {
  AdminField,
  AdminHelpText,
  AdminInlineStatus,
  AdminPanel,
  AdminPrimaryButton,
  AdminSecondaryButton,
  AdminTextInput
} from "./admin-ui.js";
import { ConfirmDialog, DetailDialog } from "./ui/dialog.js";
import { Badge } from "./ui/badge.js";
import { Button } from "./ui/button.js";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card.js";
import { Field, Input } from "./ui/input.js";

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
  providerPaymentId?: string;
};

type OrderListResponse = {
  items: AdminOrderSummary[];
  page: number;
  size: number;
  total: number;
  totalPages: number;
};

type OrderFilters = {
  search: string;
  status: string;
  paymentStatus: string;
  dateFrom: string;
  dateTo: string;
  amountMin: string;
  amountMax: string;
};

const emptyFilters: OrderFilters = {
  search: "",
  status: "",
  paymentStatus: "",
  dateFrom: "",
  dateTo: "",
  amountMin: "",
  amountMax: ""
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

type PaymentRefund = {
  refundId: string;
  providerRefundId?: string;
  amountMinor: number;
  currency: string;
  status: "processing" | "pending" | "completed" | "failed";
  reason: string;
  actorId: string;
  correlationId: string;
  createdAt: string;
  completedAt?: string;
};

type PaymentRefundSummary = {
  orderId: string;
  paymentStatus: string;
  provider: string;
  amountMinor: number;
  currency: string;
  refundedMinor: number;
  reservedRefundMinor: number;
  refundableMinor: number;
  refunds: PaymentRefund[];
};

type PaymentRefundResult = {
  refundId: string;
  providerRefundId?: string;
  status: "pending" | "completed";
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
    compensation_pending: "补偿待处理",
    partially_refunded: "部分退款",
    refunded: "已全额退款",
    processing: "退款处理中",
    completed: "退款完成",
    pending: "待支付渠道确认",
    failed: "退款失败"
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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [pageInput, setPageInput] = useState("1");
  const [draftFilters, setDraftFilters] = useState<OrderFilters>(emptyFilters);
  const [activeFilters, setActiveFilters] = useState<OrderFilters>(emptyFilters);
  const [status, setStatus] = useState("等待加载");
  const [isLoading, setIsLoading] = useState(false);
  const [detailState, dispatchDetail] = useReducer(detailDialogReducer<AdminOrderDetail>, initialDetailDialogState);
  const detailRequestRef = useRef<AbortController | null>(null);
  const selectedOrderId = detailState.selectedId;
  const orderDetail = detailState.detail;
  const isDetailLoading = detailState.loading;
  const [detailActionStatus, setDetailActionStatus] = useState("");
  const detailStatus = detailActionStatus || (detailState.loading ? "正在读取订单详情" : detailState.error ?? (detailState.detail ? "已读取订单详情" : "未选择订单"));
  const [manualCompensationReason, setManualCompensationReason] = useState("");
  const [manualCompensationAction, setManualCompensationAction] = useState<"confirm" | "cancel" | null>(null);
  const [refundSummary, setRefundSummary] = useState<PaymentRefundSummary | null>(null);
  const [refundStatus, setRefundStatus] = useState("当前订单暂无可退款交易");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [isRefunding, setIsRefunding] = useState(false);
  const [pendingRefundAmount, setPendingRefundAmount] = useState<string | null>(null);

  async function loadOrders() {
    setIsLoading(true);
    setStatus("正在读取订单");

    try {
      const query = new URLSearchParams({ page: String(page), size: String(pageSize) });
      for (const key of ["search", "status", "paymentStatus", "dateFrom", "dateTo"] as const) {
        if (activeFilters[key]) query.set(key, activeFilters[key]);
      }
      if (activeFilters.amountMin) query.set("amountMinMinor", String(Math.round(Number(activeFilters.amountMin) * 100)));
      if (activeFilters.amountMax) query.set("amountMaxMinor", String(Math.round(Number(activeFilters.amountMax) * 100)));
      const response = await fetch(`${adminGatewayUrl}/orders?${query}`, {
        headers: {
          "x-correlation-id": createRequestId()
        }
      });
      const payload = (await response.json().catch(() => ({}))) as OrderListResponse | AdminOrderSummary[] | { message?: string };

      if (!response.ok || (!Array.isArray(payload) && !("items" in payload))) {
        throw new Error(localizedErrorMessage(payload, response.status, "zh"));
      }

      const result = Array.isArray(payload)
        ? { items: payload, page: 1, size: payload.length, total: payload.length, totalPages: payload.length ? 1 : 0 }
        : payload;
      setOrders(result.items);
      setPage(result.page);
      setPageInput(String(result.page));
      setTotal(result.total);
      setTotalPages(result.totalPages);
      setStatus(result.items.length > 0 ? "已读取订单" : "暂无符合条件的订单");
    } catch (error) {
      setOrders([]);
      setStatus(error instanceof Error && !(error instanceof TypeError) ? error.message : "订单 API 未连接");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadOrderDetail(orderId: string) {
    if (isDetailLoading) return;
    detailRequestRef.current?.abort();
    const controller = new AbortController();
    detailRequestRef.current = controller;
    dispatchDetail({ type: "open", id: orderId });
    setDetailActionStatus("");
    setRefundSummary(null);
    setRefundStatus("正在读取退款记录");
    setManualCompensationReason("");
    setManualCompensationAction(null);
    setRefundAmount("");
    setRefundReason("");

    try {
      const [response, refundResponse] = await Promise.all([
        fetch(`${adminGatewayUrl}/orders/${orderId}`, {
          cache: "no-store",
          headers: { "x-correlation-id": createRequestId() },
          signal: controller.signal
        }),
        fetch(`${adminGatewayUrl}/payments/orders/${orderId}/refunds`, {
          cache: "no-store",
          headers: { "x-correlation-id": createRequestId() },
          signal: controller.signal
        })
      ]);
      const payload = (await response.json().catch(() => ({}))) as AdminOrderDetail | { message?: string };

      if (!response.ok || !("orderId" in payload)) {
        throw new Error(localizedErrorMessage(payload, response.status, "zh"));
      }

      dispatchDetail({ type: "loaded", id: orderId, detail: payload });
      const refundPayload = (await refundResponse.json().catch(() => ({}))) as PaymentRefundSummary | { message?: string };
      if (refundResponse.ok && "orderId" in refundPayload && "refunds" in refundPayload) {
        setRefundSummary(refundPayload);
        setRefundStatus(refundPayload.refundableMinor > 0 ? "可提交部分或全额退款" : "该支付已无可退款余额");
      } else {
        setRefundSummary(null);
        setRefundStatus(
          refundResponse.status === 404
            ? "当前订单暂无可退款交易"
            : localizedErrorMessage(refundPayload, refundResponse.status, "zh")
        );
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      setRefundSummary(null);
      dispatchDetail({
        type: "failed",
        id: orderId,
        error: error instanceof Error && !(error instanceof TypeError) ? error.message : "订单详情 API 未连接"
      });
    } finally {
      if (detailRequestRef.current === controller) detailRequestRef.current = null;
    }
  }

  function closeOrderDetail() {
    detailRequestRef.current?.abort();
    detailRequestRef.current = null;
    dispatchDetail({ type: "close" });
    setDetailActionStatus("");
    setRefundSummary(null);
    setRefundStatus("当前订单暂无可退款交易");
    setRefundAmount("");
    setRefundReason("");
    setPendingRefundAmount(null);
    setManualCompensationReason("");
    setManualCompensationAction(null);
  }

  async function submitRefund(amountValue = refundAmount) {
    if (!orderDetail || !refundSummary) {
      setRefundStatus("当前订单暂无可退款交易");
      return;
    }
    if (refundReason.trim().length < 3) {
      setRefundStatus("退款原因至少填写 3 个字符");
      return;
    }
    const parsed = parseRefundAmountMinor(amountValue, refundSummary.refundableMinor);
    if ("error" in parsed) {
      setRefundStatus(parsed.error);
      return;
    }

    setIsRefunding(true);
    setRefundStatus("正在向支付渠道提交退款");
    try {
      const response = await fetch(`${adminGatewayUrl}/payments/refunds`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "idempotency-key": createRequestId(),
          "x-correlation-id": createRequestId()
        },
        body: JSON.stringify({
          orderId: orderDetail.orderId,
          amountMinor: parsed.amountMinor,
          currency: refundSummary.currency,
          reason: refundReason.trim()
        })
      });
      const payload = (await response.json().catch(() => ({}))) as PaymentRefundResult | { message?: string };
      if (!response.ok || !("refundId" in payload)) {
        throw new Error(localizedErrorMessage(payload, response.status, "zh"));
      }

      setRefundAmount("");
      setRefundReason("");
      setRefundStatus(payload.status === "completed" ? "退款已完成" : "退款已提交，等待支付渠道确认");
      await loadOrders();
      await loadOrderDetail(orderDetail.orderId);
    } catch (error) {
      setRefundStatus(error instanceof Error && !(error instanceof TypeError) ? error.message : "退款 API 未连接");
    } finally {
      setIsRefunding(false);
    }
  }

  async function transitionPayment(action: "confirm" | "cancel") {
    if (!orderDetail) {
      setDetailActionStatus("请先选择订单");
      return;
    }

    setDetailActionStatus(action === "confirm" ? "正在确认支付" : "正在取消支付");

    try {
      const response = await fetch(`${adminGatewayUrl}/payments/${action === "confirm" ? "mock-confirm" : "mock-cancel"}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-correlation-id": createRequestId()
        },
        body: JSON.stringify({ orderId: orderDetail.orderId })
      });
      const payload = (await response.json().catch(() => ({}))) as PaymentTransitionResult | { message?: string };

      if (!response.ok || !("orderId" in payload)) {
        throw new Error(localizedErrorMessage(payload, response.status, "zh"));
      }

      setDetailActionStatus(payload.compensationQueued ? "操作已提交，库存补偿进入队列" : action === "confirm" ? "已确认支付" : "已取消支付");
      await loadOrders();
      await loadOrderDetail(orderDetail.orderId);
    } catch (error) {
      setDetailActionStatus(
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
      setDetailActionStatus("请先选择订单");
      return;
    }

    if (!manualCompensationReason.trim()) {
      setDetailActionStatus("人工补偿必须填写原因");
      return;
    }

    setManualCompensationAction(action);
    setDetailActionStatus(action === "confirm" ? "正在重排确认扣减补偿" : "正在重排释放库存补偿");

    try {
      const response = await fetch(`${adminGatewayUrl}/orders/${orderDetail.orderId}/manual-compensation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "idempotency-key": createRequestId(),
          "x-admin-actor": "local-admin",
          "x-correlation-id": createRequestId()
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
      setDetailActionStatus("人工补偿已重新入队，等待 worker 处理");
      await loadOrders();
      await loadOrderDetail(orderDetail.orderId);
    } catch (error) {
      setDetailActionStatus(error instanceof Error ? error.message : "人工补偿失败，未伪造成功");
    } finally {
      setManualCompensationAction(null);
    }
  }

  useEffect(() => {
    void loadOrders();
  }, [page, pageSize, activeFilters]);

  const summary = useMemo(() => {
    const totalMinor = orders.reduce((total, order) => total + order.totalMinor, 0);
    const memoryCount = orders.filter((order) => order.storageMode === "memory").length;
    return { totalMinor, memoryCount };
  }, [orders]);

  return (
    <>
    <AdminPanel eyebrow="履约运营" id="orders-title" status={status} title="订单管理">
      <AdminHelpText>
        这里读取 order-service 的真实订单边界。当前 Mock 订单会显示库存预留、支付意向和存储模式；API 未连接时不会展示假订单。
      </AdminHelpText>

      <Card className="mt-5">
        <CardHeader>
          <div>
            <CardTitle>订单筛选</CardTitle>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">按订单状态、支付状态、日期、金额和全局关键词查询真实订单。</p>
          </div>
          <Badge tone="info"><Filter size={13}/>服务端筛选</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label="订单 / 交易 / 买家搜索">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--placeholder)]" size={15}/>
                <Input className="pl-9" value={draftFilters.search} onChange={(event) => setDraftFilters({ ...draftFilters, search: event.target.value })} placeholder="订单号、PayPal ID、邮箱"/>
              </div>
            </Field>
            <Field label="订单状态">
              <select className="h-9 rounded-lg border border-[var(--border)] bg-white px-3 text-sm" value={draftFilters.status} onChange={(event) => setDraftFilters({ ...draftFilters, status: event.target.value })}>
                <option value="">全部状态</option>
                <option value="pending_payment">待支付</option>
                <option value="paid">已支付</option>
                <option value="cancelled">已取消</option>
                <option value="compensating">补偿处理中</option>
              </select>
            </Field>
            <Field label="支付状态">
              <select className="h-9 rounded-lg border border-[var(--border)] bg-white px-3 text-sm" value={draftFilters.paymentStatus} onChange={(event) => setDraftFilters({ ...draftFilters, paymentStatus: event.target.value })}>
                <option value="">全部支付状态</option>
                <option value="mock_created">待支付</option>
                <option value="paid">已支付</option>
                <option value="partially_refunded">部分退款</option>
                <option value="refunded">已全额退款</option>
                <option value="cancelled">已取消</option>
              </select>
            </Field>
            <Field label="每页条数">
              <select className="h-9 rounded-lg border border-[var(--border)] bg-white px-3 text-sm" value={pageSize} onChange={(event) => { setPage(1); setPageSize(Number(event.target.value)); }}>
                <option value="20">20 条</option>
                <option value="50">50 条</option>
                <option value="100">100 条</option>
              </select>
            </Field>
            <Field label="开始日期"><Input type="date" value={draftFilters.dateFrom} onChange={(event) => setDraftFilters({ ...draftFilters, dateFrom: event.target.value })}/></Field>
            <Field label="结束日期"><Input type="date" value={draftFilters.dateTo} onChange={(event) => setDraftFilters({ ...draftFilters, dateTo: event.target.value })}/></Field>
            <Field label="最低金额（USD）"><Input inputMode="decimal" value={draftFilters.amountMin} onChange={(event) => setDraftFilters({ ...draftFilters, amountMin: event.target.value })} placeholder="0.00"/></Field>
            <Field label="最高金额（USD）"><Input inputMode="decimal" value={draftFilters.amountMax} onChange={(event) => setDraftFilters({ ...draftFilters, amountMax: event.target.value })} placeholder="999.00"/></Field>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
            <AdminInlineStatus>共 {total} 笔，当前页 {orders.length} 笔，合计 {formatMoney(summary.totalMinor, "USD")}，内存模式 {summary.memoryCount}</AdminInlineStatus>
            <div className="flex flex-wrap justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => { setDraftFilters(emptyFilters); setActiveFilters(emptyFilters); setPage(1); }}><X size={14}/>清空</Button>
              <Button size="sm" onClick={() => { setPage(1); setActiveFilters({ ...draftFilters }); }}><Filter size={14}/>应用筛选</Button>
              <Button size="sm" variant="outline" disabled={isLoading} onClick={() => void loadOrders()}>{isLoading ? "刷新中" : "刷新"}</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="mt-5 overflow-x-auto rounded-lg border border-[var(--border)] bg-white">
        {orders.length === 0 ? (
          <div className="rounded-md border border-dashed border-[var(--line)] bg-[var(--bg)] p-5 text-sm text-[var(--ink-soft)]">
            {status === "订单 API 未连接" ? "订单服务或管理网关未连接，本页没有伪造订单数据。" : "暂无订单。"}
          </div>
        ) : (
          <table className="w-full min-w-[1060px] table-fixed border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10 bg-[var(--muted)] text-xs text-[var(--muted-foreground)]">
              <tr className="h-11 border-b border-[var(--border)]">
                <th className="w-[190px] px-4 font-medium">订单编号</th>
                <th className="w-[220px] px-3 font-medium">买家邮箱</th>
                <th className="w-[150px] px-3 font-medium">PayPal 交易 ID</th>
                <th className="w-[120px] px-3 font-medium">订单状态</th>
                <th className="w-[120px] px-3 font-medium">支付状态</th>
                <th className="w-[120px] px-3 font-medium">金额</th>
                <th className="w-[170px] px-3 font-medium">下单时间</th>
                <th className="sticky right-0 w-[112px] border-l border-[var(--border)] bg-[var(--muted)] px-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const exceptionOrder = isExceptionOrder(order);
                const failureReason = order.lastFailureReason || "库存或支付补偿任务待人工确认";
                return <tr className="h-14 border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--muted)]/55" key={order.orderId}>
                  <td className="px-4"><div className="truncate font-semibold" title={order.orderNumber}>{order.orderNumber}</div><div className="mt-0.5 truncate text-xs text-[var(--muted-foreground)]">{order.storageMode === "postgres" ? "PostgreSQL" : "本地内存"}</div></td>
                  <td className="truncate px-3" title={order.customerEmail}>{order.customerEmail}</td>
                  <td className="truncate px-3 text-xs text-[var(--muted-foreground)]" title={order.providerPaymentId ?? "待生成"}>{order.providerPaymentId ?? "待生成"}</td>
                  <td className="px-3"><Badge tone={exceptionOrder ? "danger" : order.status === "paid" ? "success" : "warning"} title={exceptionOrder ? failureReason : undefined}>{exceptionOrder ? "异常订单" : statusLabel(order.status)}</Badge></td>
                  <td className="px-3"><span className="block truncate" title={statusLabel(order.paymentStatus)}>{statusLabel(order.paymentStatus)}</span></td>
                  <td className="truncate px-3 font-medium">{formatMoney(order.totalMinor, order.currency)}</td>
                  <td className="truncate px-3 text-xs text-[var(--muted-foreground)]" title={formatDate(order.createdAt)}>{formatDate(order.createdAt)}</td>
                  <td className="sticky right-0 border-l border-[var(--border)] bg-white px-3 text-right group-hover:bg-[var(--muted)]">
                    <AdminSecondaryButton disabled={isDetailLoading} onClick={() => void loadOrderDetail(order.orderId)} type="button">
                      {isDetailLoading && selectedOrderId === order.orderId ? "读取中" : "详情"}
                    </AdminSecondaryButton>
                  </td>
                </tr>;
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-4">
        <p className="text-xs text-[var(--ink-soft)]">第 {totalPages === 0 ? 0 : page} / {totalPages} 页，共 {total} 笔订单</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button aria-label="上一页" size="icon" variant="outline" disabled={page <= 1 || isLoading} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft size={16}/></Button>
          <Input className="w-20 text-center" aria-label="跳转页码" inputMode="numeric" value={pageInput} onChange={(event) => setPageInput(event.target.value)}/>
          <Button size="sm" variant="outline" disabled={totalPages === 0 || isLoading} onClick={() => {
            const next = Number(pageInput);
            if (Number.isInteger(next) && next >= 1 && next <= totalPages) setPage(next);
            else setPageInput(String(page));
          }}>跳转</Button>
          <Button aria-label="下一页" size="icon" variant="outline" disabled={page >= totalPages || isLoading} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}><ChevronRight size={16}/></Button>
        </div>
      </div>

    </AdminPanel>
    <DetailDialog
      open={selectedOrderId !== null}
      onOpenChange={(open) => { if (!open) closeOrderDetail(); }}
      title={orderDetail ? `订单详情 · ${orderDetail.orderNumber}` : "订单详情"}
      description={detailStatus}
      loading={isDetailLoading}
    >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <AdminInlineStatus>{detailStatus}</AdminInlineStatus>
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

        {isDetailLoading ? (
          <div className="mt-5 grid min-h-48 place-items-center rounded-md border border-dashed border-[var(--line)] bg-[var(--bg)] p-6 text-sm text-[var(--ink-soft)]" role="status">
            正在加载完整订单详情，请稍候。
          </div>
        ) : orderDetail ? (
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

            <section className="border-y border-[var(--line)] py-4" aria-labelledby="payment-refunds-title">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-soft)]">Refunds</p>
                  <h4 className="mt-1 text-base font-semibold" id="payment-refunds-title">支付退款</h4>
                </div>
                <AdminInlineStatus>{refundStatus}</AdminInlineStatus>
              </div>

              {refundSummary ? (
                <>
                  <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
                    <div>
                      <dt className="text-[var(--ink-soft)]">支付金额</dt>
                      <dd className="mt-1 font-semibold">{formatMoney(refundSummary.amountMinor, refundSummary.currency)}</dd>
                    </div>
                    <div>
                      <dt className="text-[var(--ink-soft)]">已完成退款</dt>
                      <dd className="mt-1 font-semibold">{formatMoney(refundSummary.refundedMinor, refundSummary.currency)}</dd>
                    </div>
                    <div>
                      <dt className="text-[var(--ink-soft)]">退款占用金额</dt>
                      <dd className="mt-1 font-semibold">{formatMoney(refundSummary.reservedRefundMinor, refundSummary.currency)}</dd>
                    </div>
                    <div>
                      <dt className="text-[var(--ink-soft)]">当前可退款</dt>
                      <dd className="mt-1 font-semibold">{formatMoney(refundSummary.refundableMinor, refundSummary.currency)}</dd>
                    </div>
                  </dl>

                  {refundSummary.refundableMinor > 0 ? (
                    <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,180px)_minmax(260px,1fr)_auto_auto]">
                      <AdminField label={`退款金额（${refundSummary.currency}）`}>
                        <AdminTextInput
                          inputMode="decimal"
                          onChange={(event) => setRefundAmount(event.target.value)}
                          placeholder="0.00"
                          value={refundAmount}
                        />
                      </AdminField>
                      <AdminField label="退款原因">
                        <AdminTextInput
                          maxLength={500}
                          onChange={(event) => setRefundReason(event.target.value)}
                          placeholder="例如：客户确认退回部分商品"
                          value={refundReason}
                        />
                      </AdminField>
                      <div className="flex items-end">
                        <AdminPrimaryButton disabled={isRefunding} onClick={() => setPendingRefundAmount(refundAmount)} type="button">
                          {isRefunding ? "提交中" : "提交退款"}
                        </AdminPrimaryButton>
                      </div>
                      <div className="flex items-end">
                        <AdminSecondaryButton
                          disabled={isRefunding}
                          onClick={() => setPendingRefundAmount((refundSummary.refundableMinor / 100).toFixed(2))}
                          type="button"
                        >
                          退还全部余额
                        </AdminSecondaryButton>
                      </div>
                    </div>
                  ) : null}

                  {refundSummary.refunds.length === 0 ? (
                    <p className="mt-4 text-sm text-[var(--ink-soft)]">暂无退款记录。</p>
                  ) : (
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                        <thead className="border-b border-[var(--line)] text-[var(--ink-soft)]">
                          <tr>
                            <th className="py-2 pr-3 font-medium">提交时间</th>
                            <th className="py-2 pr-3 font-medium">状态</th>
                            <th className="py-2 pr-3 font-medium">金额</th>
                            <th className="py-2 pr-3 font-medium">操作人</th>
                            <th className="py-2 pr-3 font-medium">原因</th>
                            <th className="py-2 pr-3 font-medium">渠道退款号</th>
                          </tr>
                        </thead>
                        <tbody>
                          {refundSummary.refunds.map((refund) => (
                            <tr className="border-b border-[var(--line)] last:border-b-0" key={refund.refundId}>
                              <td className="py-3 pr-3">{formatDate(refund.createdAt)}</td>
                              <td className="py-3 pr-3 font-semibold">{statusLabel(refund.status)}</td>
                              <td className="py-3 pr-3">{formatMoney(refund.amountMinor, refund.currency)}</td>
                              <td className="py-3 pr-3">{refund.actorId}</td>
                              <td className="py-3 pr-3">{refund.reason}</td>
                              <td className="py-3 pr-3 text-xs text-[var(--ink-soft)]">{refund.providerRefundId ?? "待生成"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              ) : (
                <p className="mt-3 text-sm text-[var(--ink-soft)]">{refundStatus}</p>
              )}
            </section>

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
            {detailStatus || "订单不存在、已删除，或当前账号无权查看。"}
          </div>
        )}
    </DetailDialog>
    <ConfirmDialog
      open={pendingRefundAmount !== null}
      onOpenChange={(open) => { if (!open) setPendingRefundAmount(null); }}
      title="确认发起退款？"
      description={`将向支付渠道提交 ${pendingRefundAmount ?? "0.00"} ${refundSummary?.currency ?? ""} 的退款。该操作会影响可退款余额并写入审计记录。`}
      confirmLabel="确认退款"
      danger
      onConfirm={() => void submitRefund(pendingRefundAmount ?? undefined)}
    />
    </>
  );
}
