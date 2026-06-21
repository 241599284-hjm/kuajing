"use client";

import { ChevronLeft, ChevronRight, PackageOpen, RefreshCw } from "lucide-react";
import { useEffect, useReducer, useRef, useState } from "react";
import { createRequestId } from "../lib/request-id.js";
import { detailDialogReducer, initialDetailDialogState } from "../lib/detail-dialog-state.js";
import { Badge } from "./ui/badge.js";
import { Button } from "./ui/button.js";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card.js";
import { DetailDialog } from "./ui/dialog.js";
import { Table, TableWrap, Td, Th } from "./ui/table.js";

const adminGatewayUrl = process.env.NEXT_PUBLIC_ADMIN_GATEWAY_URL ?? "http://localhost:4001";

type ProductSummary = {
  sku: string;
  nameZh: string;
  nameEn: string;
  category: string;
  region: string;
  price: number;
  imageUrl: string;
  status: "active" | "inactive";
};

type ProductListResponse = { items: ProductSummary[]; page: number; size: number; total: number };

function formatPrice(value: number) {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(value);
}

export function ProductListPanel() {
  const [data, setData] = useState<ProductListResponse>({ items: [], page: 1, size: 20, total: 0 });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("正在读取商品");
  const [detailState, dispatchDetail] = useReducer(detailDialogReducer<Record<string, unknown>>, initialDetailDialogState);
  const requestRef = useRef<AbortController | null>(null);

  async function load(page = data.page) {
    setLoading(true);
    try {
      const response = await fetch(`${adminGatewayUrl}/catalog/admin-products?page=${page}&size=${data.size}`, { headers: { "x-correlation-id": createRequestId() } });
      const payload = await response.json().catch(() => ({})) as Partial<ProductListResponse>;
      if (!response.ok || !Array.isArray(payload.items)) throw new Error();
      setData({ items: payload.items, page: payload.page ?? page, size: payload.size ?? data.size, total: payload.total ?? payload.items.length });
      setStatus("商品数据已同步");
    } catch {
      setData((current) => ({ ...current, items: [], total: 0 }));
      setStatus("商品接口暂不可用");
    } finally {
      setLoading(false);
    }
  }

  function closeDetail() {
    requestRef.current?.abort();
    requestRef.current = null;
    dispatchDetail({ type: "close" });
  }

  async function openDetail(sku: string) {
    if (detailState.loading) return;
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    dispatchDetail({ type: "open", id: sku });
    try {
      const response = await fetch(`${adminGatewayUrl}/catalog/admin-products/${encodeURIComponent(sku)}`, {
        cache: "no-store",
        headers: { "x-correlation-id": createRequestId() },
        signal: controller.signal
      });
      const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (!response.ok || Object.keys(payload).length === 0) throw new Error(response.status === 403 ? "当前账号无权查看商品" : "商品不存在或已删除");
      dispatchDetail({ type: "loaded", id: sku, detail: payload });
    } catch (error) {
      if (!controller.signal.aborted) dispatchDetail({ type: "failed", id: sku, error: error instanceof Error ? error.message : "商品详情接口暂不可用" });
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }
  }

  useEffect(() => { void load(1); return () => requestRef.current?.abort(); }, []);
  const totalPages = Math.ceil(data.total / data.size);
  const detailFields = detailState.detail ? Object.entries(detailState.detail).filter(([key]) => !["mediaAssets", "imageUrl"].includes(key)) : [];

  return <>
    <Card>
      <CardHeader><div><CardTitle>商品列表</CardTitle><p className="mt-1 text-xs text-[var(--muted-foreground)]">单行摘要 · {status}</p></div><Button size="sm" variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw className={loading ? "animate-spin" : ""} size={14}/>刷新</Button></CardHeader>
      {data.items.length ? <TableWrap><Table className="table-fixed min-w-[960px]"><thead><tr><Th className="w-20">图片</Th><Th>SKU</Th><Th>中文名称</Th><Th>英文名称</Th><Th>分类</Th><Th>价格</Th><Th>状态</Th><Th className="sticky right-0 w-24 border-l text-right">操作</Th></tr></thead><tbody>{data.items.map((product) => <tr className="h-14 hover:bg-[#fafbfc]" key={product.sku}><Td><img alt={product.nameZh} className="size-10 rounded object-cover" height="40" loading="lazy" onError={(event) => { event.currentTarget.style.visibility = "hidden"; }} src={product.imageUrl} width="40"/></Td><Td className="truncate font-medium" title={product.sku}>{product.sku}</Td><Td className="truncate" title={product.nameZh}>{product.nameZh}</Td><Td className="truncate" title={product.nameEn}>{product.nameEn}</Td><Td className="truncate">{product.category}</Td><Td>{formatPrice(product.price)}</Td><Td><Badge tone={product.status === "active" ? "success" : "neutral"}>{product.status === "active" ? "已上架" : "未上架"}</Badge></Td><Td className="sticky right-0 border-l bg-white text-right"><Button size="sm" variant="outline" disabled={detailState.loading} onClick={() => void openDetail(product.sku)}>{detailState.loading && detailState.selectedId === product.sku ? "读取中" : "详情"}</Button></Td></tr>)}</tbody></Table></TableWrap> : <CardContent className="grid min-h-72 place-items-center text-sm text-[var(--muted-foreground)]"><span className="flex items-center gap-2"><PackageOpen size={18}/>{status}</span></CardContent>}
      <CardContent className="flex items-center justify-between border-t pt-4"><span className="text-xs text-[var(--muted-foreground)]">第 {data.total ? data.page : 0} / {totalPages} 页，共 {data.total} 件</span><div className="flex gap-2"><Button aria-label="上一页" size="icon" variant="outline" disabled={data.page <= 1 || loading} onClick={() => void load(data.page - 1)}><ChevronLeft size={16}/></Button><Button aria-label="下一页" size="icon" variant="outline" disabled={data.page >= totalPages || loading} onClick={() => void load(data.page + 1)}><ChevronRight size={16}/></Button></div></CardContent>
    </Card>
    <DetailDialog open={detailState.selectedId !== null} onOpenChange={(open) => { if (!open) closeDetail(); }} title="商品详情" description={detailState.loading ? "正在读取完整商品数据" : detailState.error ?? "已读取完整商品数据"} loading={detailState.loading}>
      {detailState.loading ? <div className="grid min-h-48 place-items-center text-sm text-[var(--muted-foreground)]">正在加载完整商品详情，请稍候。</div> : detailState.detail ? <div className="space-y-5">{typeof detailState.detail.imageUrl === "string" ? <img alt={String(detailState.detail.nameZh ?? "商品图片")} className="h-52 w-full rounded-lg object-cover" height="400" loading="lazy" src={detailState.detail.imageUrl} width="900"/> : null}<dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{detailFields.map(([key, value]) => <div className="min-w-0" key={key}><dt className="text-xs text-[var(--muted-foreground)]">{key}</dt><dd className="mt-1 break-words text-sm font-medium">{value === null || value === undefined ? "-" : typeof value === "object" ? JSON.stringify(value) : String(value)}</dd></div>)}</dl></div> : <div className="grid min-h-48 place-items-center text-sm text-[var(--muted-foreground)]">{detailState.error ?? "商品不存在、已删除，或当前账号无权查看。"}</div>}
    </DetailDialog>
  </>;
}
