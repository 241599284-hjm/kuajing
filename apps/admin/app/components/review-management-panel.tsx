"use client";

import { localizedErrorMessage } from "@commerce/error-codes";
import { useEffect, useMemo, useState } from "react";
import {
  AdminActionRow,
  AdminCheckbox,
  AdminField,
  AdminHelpText,
  AdminInlineStatus,
  AdminListCard,
  AdminPanel,
  AdminPrimaryButton,
  AdminSecondaryButton,
  AdminSelect,
  AdminTextarea
} from "./admin-ui.js";

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

  async function loadReviews() {
    setIsLoading(true);
    setStatus("正在读取评论");

    try {
      const response = await fetch(`${adminGatewayUrl}/reviews`, {
        headers: { "x-correlation-id": crypto.randomUUID() }
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
          "x-correlation-id": crypto.randomUUID()
        },
        body: JSON.stringify(draft)
      });
      const payload = (await response.json().catch(() => ({}))) as { review?: ProductReview; message?: string };

      if (!response.ok || !payload.review) {
        throw new Error(localizedErrorMessage(payload, response.status, "zh"));
      }

      setReviews((current) => current.map((item) => (item.id === payload.review?.id ? payload.review : item)));
      setStatus("评论已保存");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "评论保存失败");
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
  }, []);

  const totals = useMemo(() => ({
    pending: reviews.filter((review) => review.status === "pending").length,
    approved: reviews.filter((review) => review.status === "approved").length
  }), [reviews]);

  return (
    <AdminPanel eyebrow="用户内容" id="review-management-title" status={status} title="商品评论">
      <AdminHelpText>
        新评论默认待审核，审核通过后才会展示在前台。后台可回复、隐藏、删除和置顶评论；图片上传由 media-service 负责，评论服务只保存已上传 URL。
      </AdminHelpText>
      <AdminActionRow className="mt-5">
        <AdminSecondaryButton disabled={isLoading} onClick={loadReviews} type="button">
          {isLoading ? "刷新中" : "刷新评论"}
        </AdminSecondaryButton>
        <AdminInlineStatus>待审核 {totals.pending}，已展示 {totals.approved}</AdminInlineStatus>
      </AdminActionRow>

      <div className="mt-5 grid gap-4">
        {reviews.length === 0 ? (
          <div className="rounded-md border border-dashed border-[var(--line)] bg-[var(--bg)] p-5 text-sm text-[var(--ink-soft)]">
            暂无评论，或 review-service 未连接。本页不展示假评论。
          </div>
        ) : (
          reviews.map((review) => {
            const draft = drafts[review.id] ?? { status: review.status, merchantReply: review.merchantReply ?? "", pinned: review.pinned };

            return (
              <AdminListCard
                key={review.id}
                eyebrow={`${statusLabel(review.status)} · ${review.productSlug}`}
                title={`${"★".repeat(review.rating)}${"☆".repeat(5 - review.rating)} · ${review.nickname}`}
                description={`${review.customerEmail} · ${review.orderId ?? "无订单号"} · ${formatDate(review.createdAt)}`}
                action={
                  <AdminPrimaryButton onClick={() => void saveReview(review)} type="button">
                    保存处理
                  </AdminPrimaryButton>
                }
              >
                <p className="mt-4 text-sm leading-6">{review.content}</p>
                {review.imageUrls.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {review.imageUrls.map((url) => (
                      <img key={url} alt="评论图片" className="size-16 border border-[var(--line)] object-cover" src={url} />
                    ))}
                  </div>
                ) : null}
                <div className="mt-4 grid gap-4 md:grid-cols-[12rem_minmax(0,1fr)_10rem]">
                  <AdminField label="审核状态">
                    <AdminSelect value={draft.status} onChange={(event) => updateDraft(review.id, { status: event.target.value as ReviewStatus })}>
                      <option value="pending">待审核</option>
                      <option value="approved">通过展示</option>
                      <option value="hidden">隐藏</option>
                      <option value="deleted">删除</option>
                    </AdminSelect>
                  </AdminField>
                  <AdminField label="商家回复">
                    <AdminTextarea value={draft.merchantReply} onChange={(event) => updateDraft(review.id, { merchantReply: event.target.value })} />
                  </AdminField>
                  <AdminCheckbox
                    checked={draft.pinned}
                    label="置顶评论"
                    onChange={(event) => updateDraft(review.id, { pinned: event.target.checked })}
                  />
                </div>
              </AdminListCard>
            );
          })
        )}
      </div>
    </AdminPanel>
  );
}
