"use client";

import { Activity, AlertTriangle, CheckCircle2, CircleDollarSign, PackageCheck, RefreshCw, RotateCcw, ShoppingBag, Webhook } from "lucide-react";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { createRequestId } from "../lib/request-id.js";
import { detailDialogReducer, initialDetailDialogState } from "../lib/detail-dialog-state.js";
import { recordDetailRequest, type RecordKind } from "../lib/record-detail.js";
import { Badge } from "./ui/badge.js";
import { Button } from "./ui/button.js";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card.js";
import { ConfirmDialog, DetailDialog } from "./ui/dialog.js";
import { Field, Input, Textarea } from "./ui/input.js";
import { Table, TableWrap, Td, Th } from "./ui/table.js";

const adminGatewayUrl = process.env.NEXT_PUBLIC_ADMIN_GATEWAY_URL ?? "http://localhost:4001";

type Order = { orderId?: string; orderNumber?: string; customerEmail?: string; totalMinor?: number; currency?: string; status?: string; paymentStatus?: string; createdAt?: string; providerPaymentId?: string };

function money(minor = 0, currency = "USD") { return new Intl.NumberFormat("zh-CN", { style: "currency", currency }).format(minor / 100); }
function tone(status?: string): "success" | "warning" | "danger" | "neutral" { if (["paid", "captured", "completed"].includes(status ?? "")) return "success"; if (["refunded", "cancelled", "failed"].includes(status ?? "")) return "danger"; if (["pending", "pending_payment", "authorized"].includes(status ?? "")) return "warning"; return "neutral"; }

export function DashboardPage({ onOrders }: { onOrders: () => void }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [status, setStatus] = useState("正在读取订单数据");
  useEffect(() => { void fetch(`${adminGatewayUrl}/orders?size=100`).then(async (response) => { if (!response.ok) throw new Error(); const body = await response.json(); setOrders(Array.isArray(body) ? body : body.items ?? body.orders ?? []); setStatus("数据已同步"); }).catch(() => setStatus("订单服务暂不可用")); }, []);
  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const todayOrders = orders.filter((order) => order.createdAt?.startsWith(today));
    return [
      { label: "今日 PayPal 订单", value: String(todayOrders.length), icon: ShoppingBag },
      { label: "总销售额", value: money(orders.filter((o) => o.paymentStatus === "paid").reduce((sum, o) => sum + (o.totalMinor ?? 0), 0), orders[0]?.currency), icon: CircleDollarSign },
      { label: "待发货订单", value: String(orders.filter((o) => o.status === "paid").length), icon: PackageCheck },
      { label: "退款订单", value: String(orders.filter((o) => o.paymentStatus?.includes("refund")).length), icon: RotateCcw }
    ];
  }, [orders]);
  const chartData = useMemo(() => Array.from({ length: 7 }, (_, offset) => { const date = new Date(); date.setDate(date.getDate() - (6 - offset)); const key = date.toISOString().slice(0, 10); return { day: `${date.getMonth() + 1}/${date.getDate()}`, amount: orders.filter((o) => o.createdAt?.startsWith(key)).reduce((sum, o) => sum + (o.totalMinor ?? 0) / 100, 0) }; }), [orders]);
  return <div className="space-y-6"><div className="flex items-end justify-between gap-4"><div><h1 className="text-xl font-semibold">仪表盘</h1><p className="mt-1 text-xs text-[var(--muted-foreground)]">{status}</p></div><Button size="sm" variant="outline" onClick={() => location.reload()}><RefreshCw size={14}/>刷新数据</Button></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{stats.map(({ label, value, icon: Icon }) => <Card key={label}><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-[var(--muted-foreground)]">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div><span className="grid size-11 place-items-center rounded-full bg-[var(--success-bg)] text-[var(--success)]"><Icon size={21}/></span></CardContent></Card>)}</div><div className="grid gap-6 xl:grid-cols-[1.05fr_1.35fr]"><Card><CardHeader><CardTitle>近 7 日订单金额</CardTitle><Badge tone="neutral">USD</Badge></CardHeader><CardContent className="h-[300px]"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData}><CartesianGrid stroke="#edf0f2" vertical={false}/><XAxis dataKey="day" axisLine={false} tickLine={false} fontSize={12}/><YAxis axisLine={false} tickLine={false} fontSize={12}/><Tooltip/><Area dataKey="amount" type="monotone" stroke="#17825f" fill="#e8f6f0" strokeWidth={2}/></AreaChart></ResponsiveContainer></CardContent></Card><Card><CardHeader><CardTitle>最新 PayPal 订单</CardTitle><Button variant="ghost" size="sm" onClick={onOrders}>查看全部</Button></CardHeader><TableWrap><Table><thead><tr><Th>订单号</Th><Th>买家</Th><Th>金额</Th><Th>状态</Th></tr></thead><tbody>{orders.slice(0,10).map((order, index) => <tr className="hover:bg-[#fafbfc]" key={order.orderId ?? index}><Td className="font-medium text-[var(--info)]">{order.orderNumber ?? order.orderId?.slice(0,8)}</Td><Td>{order.customerEmail ?? "-"}</Td><Td>{money(order.totalMinor, order.currency)}</Td><Td><Badge tone={tone(order.paymentStatus)}>{order.paymentStatus ?? order.status ?? "未知"}</Badge></Td></tr>)}{orders.length === 0 ? <tr><Td colSpan={4} className="h-40 text-center text-[var(--muted-foreground)]">暂无可展示的真实订单</Td></tr> : null}</tbody></Table></TableWrap></Card></div><Card><CardHeader><CardTitle>库存不足商品</CardTitle><Badge tone="warning">等待库存接口</Badge></CardHeader><CardContent className="flex min-h-28 items-center justify-center text-sm text-[var(--muted-foreground)]"><AlertTriangle className="mr-2" size={17}/>库存预警将在库存接口返回低库存记录后展示</CardContent></Card></div>;
}

type PayPalEnvironment = "sandbox" | "live";
type PayPalConfiguration = {
  environment: PayPalEnvironment;
  clientId: string;
  secretConfigured: boolean;
  webhookId: string;
  webhookEvents: string[];
  enabled: boolean;
  updatedBy: string;
  updatedAt: string;
  lastTestedAt: string | null;
  lastTestStatus: "succeeded" | "failed" | null;
  lastTestErrorCode: string | null;
};
const paypalWebhookEvents = ["CHECKOUT.ORDER.APPROVED","PAYMENT.CAPTURE.COMPLETED","PAYMENT.CAPTURE.REFUNDED","PAYMENT.REFUND.PENDING","PAYMENT.REFUND.FAILED"];

async function responseMessage(response: Response) {
  const body = await response.json().catch(() => ({})) as { message?: string };
  return body.message ?? `请求失败（HTTP ${response.status}）`;
}

export function PaypalSettingsPage({ mode }: { mode: "sandbox" | "live" | "webhook" }) {
  const [confirm, setConfirm] = useState(false);
  const [environment, setEnvironment] = useState<PayPalEnvironment>(mode === "live" ? "live" : "sandbox");
  const [configuration, setConfiguration] = useState<PayPalConfiguration | null>(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [webhookId, setWebhookId] = useState("");
  const [webhookEvents, setWebhookEvents] = useState<string[]>(paypalWebhookEvents);
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState("正在读取配置");
  const live = mode === "live";
  const title = mode === "sandbox" ? "PayPal 沙盒配置" : live ? "PayPal 生产环境密钥" : "Webhook 订阅配置";

  useEffect(() => {
    if (mode !== "webhook") setEnvironment(mode);
  }, [mode]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMessage("正在读取配置");
    void fetch(`${adminGatewayUrl}/payments/paypal-configurations/${environment}`, { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error(await responseMessage(response));
        return response.json() as Promise<PayPalConfiguration>;
      })
      .then((config) => {
        if (cancelled) return;
        setConfiguration(config);
        setClientId(config.clientId);
        setClientSecret("");
        setWebhookId(config.webhookId);
        setWebhookEvents(config.webhookEvents);
        setEnabled(config.enabled);
        setMessage(config.updatedAt ? `上次更新：${config.updatedAt.replace("T", " ").slice(0, 16)}` : "尚未保存");
      })
      .catch((error: Error) => {
        if (!cancelled) setMessage(error.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [environment]);

  async function save() {
    setSaving(true);
    setMessage("正在保存");
    try {
      const response = await fetch(`${adminGatewayUrl}/payments/paypal-configurations/${environment}`, {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, clientSecret: clientSecret || undefined, webhookId, webhookEvents, enabled })
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      const config = await response.json() as PayPalConfiguration;
      setConfiguration(config);
      setClientSecret("");
      setMessage("配置已安全保存");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function testConnectivity() {
    setTesting(true);
    setMessage("正在连接 PayPal");
    try {
      const response = await fetch(`${adminGatewayUrl}/payments/paypal-configurations/${environment}/test`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ includeWebhook: mode === "webhook" })
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      setConfiguration((current) => current ? {
        ...current,
        lastTestStatus: "succeeded",
        lastTestedAt: new Date().toISOString(),
        lastTestErrorCode: null
      } : current);
      setMessage(mode === "webhook" ? "PayPal Webhook 配置验证成功" : "PayPal OAuth 连接成功");
    } catch (error) {
      setConfiguration((current) => current ? {
        ...current,
        lastTestStatus: "failed",
        lastTestedAt: new Date().toISOString()
      } : current);
      setMessage(error instanceof Error ? error.message : "连接失败");
    } finally {
      setTesting(false);
    }
  }

  const secretHint = configuration?.secretConfigured
    ? "Secret 已配置；留空保存会保留原值"
    : "首次保存必须输入 Secret，保存后不再回显";
  const activeLive = environment === "live";
  return <div className="space-y-6"><div><h1 className="text-xl font-semibold">{title}</h1><p className="mt-1 text-xs text-[var(--muted-foreground)]">Secret 仅提交到服务端 AES-256-GCM 加密存储，页面不会回显原文。</p></div><Card><CardHeader><CardTitle>{mode === "webhook" ? "Webhook 接收与订阅" : live ? "Live 凭据" : "Sandbox 凭据"}</CardTitle><Badge tone={activeLive ? "danger" : "info"}>{mode === "webhook" ? `${activeLive ? "生产" : "沙盒"}异步通知` : activeLive ? "生产环境" : "测试环境"}</Badge></CardHeader><CardContent className="space-y-5">{mode === "webhook" ? <><Field label="配置环境"><select className="h-9 rounded-lg border border-[var(--border)] bg-white px-3 text-sm" value={environment} onChange={(event) => setEnvironment(event.target.value as PayPalEnvironment)}><option value="sandbox">Sandbox 沙盒</option><option value="live">Live 生产</option></select></Field><Field label="Webhook 接收地址"><Input readOnly value="/webhooks/paypal"/></Field><Field label="Webhook ID"><Input value={webhookId} onChange={(event) => setWebhookId(event.target.value)} placeholder="输入 PayPal 后台生成的 Webhook ID"/></Field><div><p className="text-sm font-medium">订阅事件</p><div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{paypalWebhookEvents.map((event) => <label className="flex min-h-11 items-center gap-2 rounded-lg border border-[var(--border)] p-3 text-xs" key={event}><input checked={webhookEvents.includes(event)} type="checkbox" onChange={(change) => setWebhookEvents(change.target.checked ? [...webhookEvents, event] : webhookEvents.filter((value) => value !== event))}/>{event}</label>)}</div></div></> : <><Field label={`${live ? "正式" : "沙盒"} Client ID`}><Input autoComplete="off" value={clientId} onChange={(event) => setClientId(event.target.value)} placeholder="输入 Client ID"/></Field><Field label={`${live ? "正式" : "沙盒"} Secret`} hint={secretHint}><Input autoComplete="new-password" value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} type="password" placeholder={configuration?.secretConfigured ? "留空保留已配置 Secret" : "输入 Secret"}/></Field></>}<label className="flex min-h-11 items-center gap-3 text-sm"><input checked={enabled} type="checkbox" onChange={(event) => setEnabled(event.target.checked)}/>启用此环境配置</label><div className="flex flex-wrap items-center gap-3"><Button size="sm" variant="outline" onClick={() => void testConnectivity()} disabled={testing || loading || !configuration?.secretConfigured}>{testing ? <RefreshCw className="animate-spin" size={14}/> : <Activity size={14}/>}测试连通性</Button>{configuration?.lastTestStatus === "succeeded" ? <span className="flex items-center gap-1 text-xs text-[var(--success)]"><CheckCircle2 size={14}/>最近测试成功</span> : configuration?.lastTestStatus === "failed" ? <span className="flex items-center gap-1 text-xs text-[var(--danger)]"><AlertTriangle size={14}/>最近测试失败</span> : null}</div><div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-5"><span className="text-xs text-[var(--muted-foreground)]">{message}</span><Button disabled={saving || loading || !clientId.trim()} onClick={() => setConfirm(true)}>{saving ? "保存中" : "保存配置"}</Button></div></CardContent></Card><ConfirmDialog open={confirm} onOpenChange={setConfirm} title={activeLive ? "确认更新生产支付配置？" : "确认保存沙盒配置？"} description={activeLive ? "更新后将影响真实收款和 Webhook 验签。请再次核对 Client ID、Webhook ID 和启用状态。" : "保存后该配置将参与沙盒支付、退款和 Webhook 验签。"} danger={activeLive} confirmLabel="确认保存" onConfirm={() => void save()}/></div>;
}

export function RecordsPage({ kind, initialSearch = "", searchToken = 0 }: { kind: RecordKind; initialSearch?: string; searchToken?: number }) {
  const map = { refunds: { title: "退款记录", icon: RotateCcw, text: "退款记录将从 payment-service 查询" }, webhooks: { title: "Webhook 回调日志", icon: Webhook, text: "验签事件将从 durable inbox 查询" }, customers: { title: "买家列表", icon: ShoppingBag, text: "买家资料将从客户接口查询" } } as const;
  const meta = map[kind];
  const Icon = meta.icon;
  const [records, setRecords] = useState<Array<Record<string, unknown>>>([]);
  const [recordsKind, setRecordsKind] = useState<RecordKind>(kind);
  const [loading, setLoading] = useState(false);
  const [loadState, setLoadState] = useState("尚未刷新");
  const [customerSearch, setCustomerSearch] = useState(initialSearch);
  const [detailState, dispatchDetail] = useReducer(detailDialogReducer<Record<string, unknown>>, initialDetailDialogState);
  const requestRef = useRef<AbortController | null>(null);

  async function load(search = customerSearch) {
    setLoading(true);
    try {
      const endpoint = kind === "refunds" ? "/payments/refunds" : kind === "webhooks" ? "/payments/webhooks" : `/customers${search.trim() ? `?search=${encodeURIComponent(search.trim())}` : ""}`;
      const response = await fetch(`${adminGatewayUrl}${endpoint}`, { credentials: "include", headers: { "x-correlation-id": createRequestId() } });
      if (!response.ok) throw new Error();
      const body = await response.json();
      const nextRecords = (Array.isArray(body) ? body : body.items ?? []) as Array<Record<string, unknown>>;
      setRecords(nextRecords.filter((record) => {
        try { recordDetailRequest(kind, record); return true; } catch { return false; }
      }));
      setRecordsKind(kind);
      setLoadState("数据已同步");
    } catch {
      setRecords([]);
      setRecordsKind(kind);
      setLoadState("接口暂不可用");
    } finally {
      setLoading(false);
    }
  }

  function closeDetail() {
    requestRef.current?.abort();
    requestRef.current = null;
    dispatchDetail({ type: "close" });
  }

  async function openDetail(record: Record<string, unknown>) {
    if (detailState.loading) return;
    const request = recordDetailRequest(kind, record);
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    dispatchDetail({ type: "open", id: request.id });
    try {
      const response = await fetch(`${adminGatewayUrl}${request.path}`, {
        cache: "no-store",
        credentials: "include",
        headers: { "x-correlation-id": createRequestId() },
        signal: controller.signal
      });
      const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (!response.ok || Object.keys(payload).length === 0) throw new Error(response.status === 403 ? "当前账号无权查看此记录" : "记录不存在或已删除");
      dispatchDetail({ type: "loaded", id: request.id, detail: payload });
    } catch (error) {
      if (!controller.signal.aborted) dispatchDetail({ type: "failed", id: request.id, error: error instanceof Error ? error.message : "详情接口暂不可用" });
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }
  }

  useEffect(() => {
    closeDetail();
    setCustomerSearch(initialSearch);
    void load(initialSearch);
    return () => requestRef.current?.abort();
  }, [kind, initialSearch, searchToken]);

  const detailFields = detailState.detail ? Object.entries(detailState.detail).filter(([key]) => key !== "payload") : [];
  const visibleRecords = recordsKind === kind ? records : [];
  return <div className="space-y-6">
    <div><h1 className="text-xl font-semibold">{meta.title}</h1><p className="mt-1 text-xs text-[var(--muted-foreground)]">只展示后端返回的真实记录 · {loadState}</p></div>
    <Card><CardHeader><CardTitle>{meta.title}</CardTitle><div className="flex flex-wrap gap-2">{kind === "customers" ? <><Input aria-label="搜索买家" className="h-11 min-w-56 text-xs sm:h-8" value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void load(); }} placeholder="买家姓名或邮箱"/><Button className="min-h-11 sm:min-h-8" size="sm" variant="outline" disabled={loading} onClick={() => void load()}>搜索</Button></> : null}<Button className="min-h-11 sm:min-h-8" size="sm" variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw className={loading ? "animate-spin" : ""} size={14}/>刷新</Button></div></CardHeader>
      {visibleRecords.length ? <TableWrap><Table className="table-fixed"><thead><tr>{kind === "refunds" ? <><Th>退款 ID</Th><Th>订单 ID</Th><Th>金额</Th><Th>状态</Th><Th>时间</Th></> : kind === "webhooks" ? <><Th>事件 ID</Th><Th>事件类型</Th><Th>关联订单</Th><Th>状态</Th><Th>接收时间</Th></> : <><Th>买家</Th><Th>邮箱</Th><Th>注册时间</Th><Th>状态</Th></>}<Th className="sticky right-0 w-24 border-l text-right">操作</Th></tr></thead><tbody>{visibleRecords.map((record) => {
        const request = recordDetailRequest(kind, record);
        return <tr className="h-12 hover:bg-[#fafbfc]" key={request.id}>{kind === "refunds" ? <><Td className="truncate font-medium" title={String(record.providerRefundId ?? record.refundId ?? "-")}>{String(record.providerRefundId ?? record.refundId ?? "-")}</Td><Td className="truncate" title={String(record.orderId ?? "-")}>{String(record.orderId ?? "-")}</Td><Td>{money(Number(record.amountMinor ?? 0), String(record.currency ?? "USD"))}</Td><Td><Badge tone={tone(String(record.status ?? ""))}>{String(record.status ?? "-")}</Badge></Td><Td className="truncate">{String(record.createdAt ?? "-").replace("T", " ").slice(0, 16)}</Td></> : kind === "webhooks" ? <><Td className="truncate font-medium" title={String(record.eventId ?? "-")}>{String(record.eventId ?? "-")}</Td><Td className="truncate" title={String(record.eventType ?? "-")}>{String(record.eventType ?? "-")}</Td><Td className="truncate">{String(record.orderId ?? "-")}</Td><Td><Badge tone={tone(String(record.status ?? ""))}>{String(record.status ?? "-")}</Badge></Td><Td className="truncate">{String(record.receivedAt ?? "-").replace("T", " ").slice(0, 16)}</Td></> : <><Td className="truncate font-medium" title={String(record.name ?? "-")}>{String(record.name ?? "-")}</Td><Td className="truncate" title={String(record.email ?? "-")}>{String(record.email ?? "-")}</Td><Td className="truncate">{String(record.createdAt ?? "-").replace("T", " ").slice(0, 16)}</Td><Td><Badge>{String(record.status ?? "-")}</Badge></Td></>}<Td className="sticky right-0 border-l bg-white text-right"><Button size="sm" variant="outline" disabled={detailState.loading} onClick={() => void openDetail(record)}>{detailState.loading && detailState.selectedId === request.id ? "读取中" : "详情"}</Button></Td></tr>;
      })}</tbody></Table></TableWrap> : <CardContent className="flex min-h-[320px] flex-col items-center justify-center text-center"><span className="grid size-12 place-items-center rounded-full bg-[var(--muted)] text-[var(--muted-foreground)]"><Icon size={21}/></span><p className="mt-4 text-sm font-medium">暂无记录</p><p className="mt-1 text-xs text-[var(--muted-foreground)]">{meta.text}</p></CardContent>}
    </Card>
    <DetailDialog open={detailState.selectedId !== null} onOpenChange={(open) => { if (!open) closeDetail(); }} title={`${meta.title}详情`} description={detailState.loading ? "正在读取完整详情" : detailState.error ?? "已读取完整详情"} loading={detailState.loading}>
      {detailState.loading ? <div className="grid min-h-48 place-items-center text-sm text-[var(--muted-foreground)]">正在加载完整详情，请稍候。</div> : detailState.detail ? <div className="space-y-5"><dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{detailFields.map(([key, value]) => <div className="min-w-0" key={key}><dt className="text-xs text-[var(--muted-foreground)]">{key}</dt><dd className="mt-1 break-words text-sm font-medium">{value === null || value === undefined ? "-" : typeof value === "object" ? JSON.stringify(value) : String(value)}</dd></div>)}</dl>{"payload" in detailState.detail ? <section><h3 className="text-sm font-semibold">原始回调数据</h3><pre className="mt-2 max-h-80 overflow-auto rounded-lg bg-[#f7f8f9] p-4 text-xs">{JSON.stringify(detailState.detail.payload, null, 2)}</pre></section> : null}</div> : <div className="grid min-h-48 place-items-center text-sm text-[var(--muted-foreground)]">{detailState.error ?? "记录不存在、已删除，或当前账号无权查看。"}</div>}
    </DetailDialog>
  </div>;
}

export function SiteSettingsPage() { const [open,setOpen]=useState(false); return <div className="space-y-6"><h1 className="text-xl font-semibold">网站基础配置</h1><Card><CardHeader><CardTitle>店铺信息</CardTitle></CardHeader><CardContent className="grid gap-5 lg:grid-cols-2"><Field label="后台名称"><Input defaultValue="工艺品跨境管理后台"/></Field><Field label="默认币种"><select className="h-9 rounded-lg border border-[var(--border)] px-3 text-sm"><option>USD</option><option>EUR</option><option>GBP</option></select></Field><Field label="客服联系邮箱"><Input type="email" placeholder="support@example.com"/></Field><Field label="订单时区"><Input defaultValue="Asia/Hong_Kong"/></Field><div className="lg:col-span-2"><Field label="网站备注"><Textarea placeholder="仅供内部运营人员查看"/></Field></div><div className="lg:col-span-2 flex justify-end"><Button onClick={()=>setOpen(true)}>保存设置</Button></div></CardContent></Card><ConfirmDialog open={open} onOpenChange={setOpen} title="确认保存网站配置？" description="基础配置会影响后台显示和订单默认值，请确认后继续。" onConfirm={()=>undefined}/></div>; }
