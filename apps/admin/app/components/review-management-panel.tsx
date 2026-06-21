"use client";

import { createRequestId } from "../lib/request-id.js";

import { localizedErrorMessage } from "@commerce/error-codes";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { detailDialogReducer, initialDetailDialogState } from "../lib/detail-dialog-state.js";
import {
  AdminActionRow,
  AdminCheckbox,
  AdminField,
  AdminHelpText,
  AdminInlineStatus,
  AdminPanel,
  AdminPrimaryButton,
  AdminSecondaryButton,
  AdminSelect,
  AdminTextarea
} from "./admin-ui.js";
import { Badge } from "./ui/badge.js";
import { Button } from "./ui/button.js";
import { DetailDialog } from "./ui/dialog.js";
import { Table, TableWrap, Td, Th } from "./ui/table.js";

const adminGatewayUrl = process.env.NEXT_PUBLIC_ADMIN_GATEWAY_URL ?? "http://localhost:4001";

type ReviewStatus = "pending" | "approved" | "hidden" | "deleted";

type ProductReview = {
  id: string;
  productSlug: string;
  orderId: string | null;
  customerEmail: string;
  nickname: string;
  rating: number;
  content: string;
  imageUrls: string[];
  status: ReviewStatus;
  merchantReply: string | null;
  pinned: boolean;
  likeCount: number;
  createdAt: string;
  updatedAt: string;
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC"
  }).format(date);
}

function statusLabel(status: ReviewStatus) {
  const labels: Record<ReviewStatus, string> = {
    pending: "待审核",
    approved: "已展示",
    hidden: "已隐藏",
    deleted: "已删除"
  };
  return labels[status];
}

export function ReviewManagementPanel() {
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { status: ReviewStatus; merchantReply: string; pinned: boolean }>>({});
  const [status, setStatus] = useState("等待加载");
  const [isLoading, setIsLoading] = useState(false);
  const [detailState, dispatchDetail] = useReducer(detailDialogReducer<ProductReview>, initialDetailDialogState);
  const detailRequestRef = useRef<AbortController | null>(null);

  async function loadReviews() {
    setIsLoading(true);
    setStatus("正在读取评论");

    try {
      const response = await fetch(`${adminGatewayUrl}/reviews`, {
        headers: { "x-correlation-id": createRequestId() }
      });
      const payload = (await response.json().catch(() => ({}))) as { reviews?: ProductReview[]; storageMode?: string; message?: string };

      if (!response.ok) {
        throw new Error(localizedErrorMessage(payload, response.status, "zh"));
      }

      const nextReviews = payload.reviews ?? [];
      setReviews(nextReviews);
      setDrafts(Object.fromEntries(nextReviews.map((review) => [
        review.id,
        {
          status: review.status,
          merchantReply: review.merchantReply ?? "",
          pinned: review.pinned
        }
      ])));
      setStatus(`已读取评论（${payload.storageMode ?? "unknown"}）`);
    } catch (error) {
      setReviews([]);
      setStatus(error instanceof Error ? error.message : "评论 API 未连接");
    } finally {
      setIsLoading(false);
    }
  }

  async function saveReview(review: ProductReview) {
    const draft = drafts[review.id];
    if (!draft) return;
    setStatus(`正在保存 ${review.nickname} 的评论`);

    try {
      const response = await fetch(`${adminGatewayUrl}/reviews/${review.id}`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "x-correlation-id": createRequestId()
        },
        body: JSON.stringify(draft)
      });
      const payload = (await response.json().catch(() => ({}))) as { review?: ProductReview; message?: string };

      if (!response.ok || !payload.review) {
        throw new Error(localizedErrorMessage(payload, response.status, "zh"));
      }

      setReviews((current) => current.map((item) => (item.id === payload.review?.id ? payload.review : item)));
      dispatchDetail({ type: "loaded", id: review.id, detail: payload.review });
      setStatus("评论已保存");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "评论保存失败");
    }
  }

  function closeDetail() {
    detailRequestRef.current?.abort();
    detailRequestRef.current = null;
    dispatchDetail({ type: "close" });
  }

  async function openDetail(id: string) {
    if (detailState.loading) return;
    const controller = new AbortController();
    detailRequestRef.current?.abort();
    detailRequestRef.current = controller;
    dispatchDetail({ type: "open", id });
    try {
      const response = await fetch(`${adminGatewayUrl}/reviews/${encodeURIComponent(id)}`, {
        cache: "no-store",
        headers: { "x-correlation-id": createRequestId() },
        signal: controller.signal
      });
      const payload = await response.json().catch(() => ({})) as { review?: ProductReview; message?: string };
      if (!response.ok || !payload.review) throw new Error(localizedErrorMessage(payload, response.status, "zh"));
      setDrafts((current) => ({ ...current, [id]: { status: payload.review!.status, merchantReply: payload.review!.merchantReply ?? "", pinned: payload.review!.pinned } }));
      dispatchDetail({ type: "loaded", id, detail: payload.review });
    } catch (error) {
      if (!controller.signal.aborted) dispatchDetail({ type: "failed", id, error: error instanceof Error ? error.message : "评价详情接口暂不可用" });
    } finally {
      if (detailRequestRef.current === controller) detailRequestRef.current = null;
    }
  }

  function updateDraft(id: string, patch: Partial<{ status: ReviewStatus; merchantReply: string; pinned: boolean }>) {
    setDrafts((current) => ({
      ...current,
      [id]: {
        status: current[id]?.status ?? "pending",
        merchantReply: current[id]?.merchantReply ?? "",
        pinned: current[id]?.pinned ?? false,
        ...patch
      }
    }));
  }

  useEffect(() => {
    void loadReviews();
    return () => detailRequestRef.current?.abort();
  }, []);

  const totals = useMemo(() => ({
    pending: reviews.filter((review) => review.status === "pending").length,
    approved: reviews.filter((review) => review.status === "approved").length
  }), [reviews]);

  const review = detailState.detail;
  const draft = review ? drafts[review.id] ?? { status: review.status, merchantReply: review.merchantReply ?? "", pinned: review.pinned } : null;
  return <>
    <AdminPanel eyebrow="用户内容" id="review-management-title" status={status} title="商品评论">
      <AdminHelpText>列表只展示评价摘要；完整内容、图片和审核操作在详情弹窗内按评价 ID 重新读取。</AdminHelpText>
      <AdminActionRow className="mt-5"><AdminSecondaryButton disabled={isLoading} onClick={loadReviews} type="button">{isLoading ? "刷新中" : "刷新评论"}</AdminSecondaryButton><AdminInlineStatus>待审核 {totals.pending}，已展示 {totals.approved}</AdminInlineStatus></AdminActionRow>
      {reviews.length ? <TableWrap className="mt-5 rounded-lg border"><Table className="table-fixed min-w-[980px]"><thead><tr><Th>评价 ID</Th><Th>商品</Th><Th>买家</Th><Th>评分</Th><Th>内容摘要</Th><Th>状态</Th><Th>时间</Th><Th className="sticky right-0 w-24 border-l text-right">操作</Th></tr></thead><tbody>{reviews.map((item) => <tr className="h-14 hover:bg-[#fafbfc]" key={item.id}><Td className="truncate font-medium" title={item.id}>{item.id}</Td><Td className="truncate" title={item.productSlug}>{item.productSlug}</Td><Td className="truncate" title={item.customerEmail}>{item.nickname}</Td><Td>{"★".repeat(item.rating)}</Td><Td className="truncate" title={item.content}>{item.content}</Td><Td><Badge tone={item.status === "approved" ? "success" : item.status === "pending" ? "warning" : "neutral"}>{statusLabel(item.status)}</Badge></Td><Td className="truncate">{formatDate(item.createdAt)}</Td><Td className="sticky right-0 border-l bg-white text-right"><Button size="sm" variant="outline" disabled={detailState.loading} onClick={() => void openDetail(item.id)}>{detailState.loading && detailState.selectedId === item.id ? "读取中" : "详情"}</Button></Td></tr>)}</tbody></Table></TableWrap> : <div className="mt-5 rounded-md border border-dashed border-[var(--line)] bg-[var(--bg)] p-5 text-sm text-[var(--ink-soft)]">暂无评论，或 review-service 未连接。本页不展示假评论。</div>}
    </AdminPanel>
    <DetailDialog open={detailState.selectedId !== null} onOpenChange={(open) => { if (!open) closeDetail(); }} title={review ? `评价详情 · ${review.nickname}` : "评价详情"} description={detailState.loading ? "正在读取完整评价" : detailState.error ?? "已读取完整评价"} loading={detailState.loading}>
      {detailState.loading ? <div className="grid min-h-48 place-items-center text-sm text-[var(--ink-soft)]">正在加载完整评价详情，请稍候。</div> : review && draft ? <div className="space-y-5"><dl className="grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-3"><div><dt className="text-[var(--ink-soft)]">评价 ID</dt><dd className="mt-1 break-all font-medium">{review.id}</dd></div><div><dt className="text-[var(--ink-soft)]">商品</dt><dd className="mt-1 font-medium">{review.productSlug}</dd></div><div><dt className="text-[var(--ink-soft)]">订单</dt><dd className="mt-1 font-medium">{review.orderId ?? "无订单号"}</dd></div><div><dt className="text-[var(--ink-soft)]">买家邮箱</dt><dd className="mt-1 break-all font-medium">{review.customerEmail}</dd></div><div><dt className="text-[var(--ink-soft)]">评分</dt><dd className="mt-1 font-medium">{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</dd></div><div><dt className="text-[var(--ink-soft)]">创建时间</dt><dd className="mt-1 font-medium">{formatDate(review.createdAt)}</dd></div></dl><section><h3 className="text-sm font-semibold">完整评价</h3><p className="mt-2 rounded-lg bg-[var(--bg)] p-4 text-sm leading-6">{review.content}</p></section>{review.imageUrls.length ? <div className="flex flex-wrap gap-3">{review.imageUrls.map((url) => <img key={url} alt="评论图片" className="size-24 rounded-lg border border-[var(--line)] object-cover" loading="lazy" onError={(event) => { event.currentTarget.style.visibility = "hidden"; }} src={url}/>)}</div> : null}<div className="grid gap-4 md:grid-cols-[12rem_minmax(0,1fr)_10rem]"><AdminField label="审核状态"><AdminSelect value={draft.status} onChange={(event) => updateDraft(review.id, { status: event.target.value as ReviewStatus })}><option value="pending">待审核</option><option value="approved">通过展示</option><option value="hidden">隐藏</option><option value="deleted">删除</option></AdminSelect></AdminField><AdminField label="商家回复"><AdminTextarea value={draft.merchantReply} onChange={(event) => updateDraft(review.id, { merchantReply: event.target.value })}/></AdminField><AdminCheckbox checked={draft.pinned} label="置顶评论" onChange={(event) => updateDraft(review.id, { pinned: event.target.checked })}/></div><div className="flex justify-end"><AdminPrimaryButton onClick={() => void saveReview(review)} type="button">保存处理</AdminPrimaryButton></div></div> : <div className="grid min-h-48 place-items-center text-sm text-[var(--ink-soft)]">{detailState.error ?? "评价不存在、已删除，或当前账号无权查看。"}</div>}
    </DetailDialog>
  </>;
}
