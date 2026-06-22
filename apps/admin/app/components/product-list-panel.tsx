"use client";

import { ChevronLeft, ChevronRight, Package, PackageOpen, Pencil, Plus, RefreshCw, Search, X } from "lucide-react";
import { useEffect, useReducer, useRef, useState } from "react";
import { createRequestId } from "../lib/request-id.js";
import { adminPreviewUrl } from "../lib/catalog-editor.js";
import { detailDialogReducer, initialDetailDialogState } from "../lib/detail-dialog-state.js";
import { Badge } from "./ui/badge.js";
import { Button } from "./ui/button.js";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card.js";
import { DetailDialog } from "./ui/dialog.js";
import { Input } from "./ui/input.js";
import { Table, TableWrap, Td, Th } from "./ui/table.js";
import { ProductEditorDialog } from "./product-editor-dialog.js";

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

export function ProductListPanel({ initialSearch = "", searchToken = 0 }: { initialSearch?: string; searchToken?: number }) {
  const [data, setData] = useState<ProductListResponse>({ items: [], page: 1, size: 20, total: 0 });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("正在读取商品");
  const [detailState, dispatchDetail] = useReducer(detailDialogReducer<Record<string, unknown>>, initialDetailDialogState);
  const requestRef = useRef<AbortController | null>(null);
  const [editor, setEditor] = useState<{ mode: "create" | "edit"; sku: string | null } | null>(null);
  const [draftSearch, setDraftSearch] = useState(initialSearch);
  const [activeSearch, setActiveSearch] = useState(initialSearch);

  async function load(page = data.page, search = activeSearch) {
    setLoading(true);
    try {
      const query = new URLSearchParams({ page: String(page), size: String(data.size) });
      if (search.trim()) query.set("search", search.trim());
      const response = await fetch(`${adminGatewayUrl}/catalog/admin-products?${query}`, { headers: { "x-correlation-id": createRequestId() } });
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

  useEffect(() => {
    setDraftSearch(initialSearch);
    setActiveSearch(initialSearch);
    void load(1, initialSearch);
    return () => requestRef.current?.abort();
  }, [initialSearch, searchToken]);
  const totalPages = Math.ceil(data.total / data.size);
  const detailFields = detailState.detail ? Object.entries(detailState.detail).filter(([key]) => !["mediaAssets", "imageUrl"].includes(key)) : [];

  return <>
    <Card>
      <CardHeader><div><CardTitle>商品列表</CardTitle><p className="mt-1 text-xs text-[var(--muted-foreground)]">单行摘要 · {status}</p></div><div className="flex flex-wrap gap-2"><div className="relative min-w-56"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--placeholder)]" size={14}/><Input aria-label="搜索商品" className="h-11 pl-8 pr-8 text-xs sm:h-8" value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { setActiveSearch(draftSearch); void load(1, draftSearch); } }} placeholder="SKU、名称、分类、地域"/>{draftSearch ? <button aria-label="清空商品搜索" className="absolute right-0 top-1/2 grid size-11 -translate-y-1/2 place-items-center text-[var(--muted-foreground)] sm:size-8" onClick={() => { setDraftSearch(""); setActiveSearch(""); void load(1, ""); }}><X size={14}/></button> : null}</div><Button className="min-h-11 sm:min-h-8" size="sm" variant="outline" disabled={loading} onClick={() => { setActiveSearch(draftSearch); void load(1, draftSearch); }}><Search size={14}/>搜索</Button><Button className="min-h-11 sm:min-h-8" size="sm" variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw className={loading ? "animate-spin" : ""} size={14}/>刷新</Button><Button className="min-h-11 sm:min-h-8" size="sm" onClick={() => setEditor({ mode: "create", sku: null })}><Plus size={14}/>新增商品</Button></div></CardHeader>
      {data.items.length ? <TableWrap><Table className="table-fixed min-w-[1040px]"><thead><tr><Th className="w-20">图片</Th><Th>SKU</Th><Th>中文名称</Th><Th>英文名称</Th><Th>分类</Th><Th>价格</Th><Th>状态</Th><Th className="sticky right-0 w-44 border-l text-right">操作</Th></tr></thead><tbody>{data.items.map((product) => { const previewUrl = adminPreviewUrl(product.imageUrl); return <tr className="h-14 hover:bg-[#fafbfc]" key={product.sku}><Td>{previewUrl ? <img alt={product.nameZh} className="size-10 rounded object-cover" height="40" loading="lazy" src={previewUrl} width="40"/> : <span className="grid size-10 place-items-center rounded bg-[var(--muted)] text-[var(--muted-foreground)]"><Package size={17}/></span>}</Td><Td className="truncate font-medium" title={product.sku}>{product.sku}</Td><Td className="truncate" title={product.nameZh}>{product.nameZh}</Td><Td className="truncate" title={product.nameEn}>{product.nameEn}</Td><Td className="truncate">{product.category}</Td><Td>{formatPrice(product.price)}</Td><Td><Badge tone={product.status === "active" ? "success" : "neutral"}>{product.status === "active" ? "已上架" : "未上架"}</Badge></Td><Td className="sticky right-0 border-l bg-white text-right"><div className="flex justify-end gap-2"><Button size="sm" variant="outline" disabled={detailState.loading} onClick={() => void openDetail(product.sku)}>{detailState.loading && detailState.selectedId === product.sku ? "读取中" : "详情"}</Button><Button size="sm" variant="outline" onClick={() => setEditor({ mode: "edit", sku: product.sku })}><Pencil size={14}/>修改</Button></div></Td></tr>; })}</tbody></Table></TableWrap> : <CardContent className="grid min-h-72 place-items-center text-sm text-[var(--muted-foreground)]"><span className="flex items-center gap-2"><PackageOpen size={18}/>{status}</span></CardContent>}
      <CardContent className="flex items-center justify-between border-t pt-4"><span className="text-xs text-[var(--muted-foreground)]">第 {data.total ? data.page : 0} / {totalPages} 页，共 {data.total} 件</span><div className="flex gap-2"><Button aria-label="上一页" size="icon" variant="outline" disabled={data.page <= 1 || loading} onClick={() => void load(data.page - 1)}><ChevronLeft size={16}/></Button><Button aria-label="下一页" size="icon" variant="outline" disabled={data.page >= totalPages || loading} onClick={() => void load(data.page + 1)}><ChevronRight size={16}/></Button></div></CardContent>
    </Card>
    <DetailDialog open={detailState.selectedId !== null} onOpenChange={(open) => { if (!open) closeDetail(); }} title="商品详情" description={detailState.loading ? "正在读取完整商品数据" : detailState.error ?? "已读取完整商品数据"} loading={detailState.loading}>
      {detailState.loading ? <div className="grid min-h-48 place-items-center text-sm text-[var(--muted-foreground)]">正在加载完整商品详情，请稍候。</div> : detailState.detail ? <div className="space-y-5">{adminPreviewUrl(typeof detailState.detail.imageUrl === "string" ? detailState.detail.imageUrl : null) ? <img alt={String(detailState.detail.nameZh ?? "商品图片")} className="h-52 w-full rounded-lg object-cover" height="400" loading="lazy" src={adminPreviewUrl(String(detailState.detail.imageUrl)) ?? ""} width="900"/> : null}<dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{detailFields.map(([key, value]) => <div className="min-w-0" key={key}><dt className="text-xs text-[var(--muted-foreground)]">{key}</dt><dd className="mt-1 break-words text-sm font-medium">{value === null || value === undefined ? "-" : typeof value === "object" ? JSON.stringify(value) : String(value)}</dd></div>)}</dl></div> : <div className="grid min-h-48 place-items-center text-sm text-[var(--muted-foreground)]">{detailState.error ?? "商品不存在、已删除，或当前账号无权查看。"}</div>}
    </DetailDialog>
    <ProductEditorDialog open={editor !== null} mode={editor?.mode ?? "create"} sku={editor?.sku ?? null} onOpenChange={(open) => { if (!open) setEditor(null); }} onSaved={() => void load(data.page)}/>
  </>;
}
