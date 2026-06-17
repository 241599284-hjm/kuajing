"use client";

import { localizedErrorMessage } from "@commerce/error-codes";
import { useEffect, useMemo, useState } from "react";
import type { Locale } from "../lib/storefront-content.js";

const apiGatewayUrl = process.env.NEXT_PUBLIC_API_GATEWAY_URL ?? "http://localhost:4000";

type ProductReview = {
  id: string;
  productSlug: string;
  orderId: string | null;
  customerEmail: string;
  nickname: string;
  rating: number;
  content: string;
  imageUrls: string[];
  status: string;
  merchantReply: string | null;
  pinned: boolean;
  likeCount: number;
  createdAt: string;
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function initialQueryValue(name: string) {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(name) ?? "";
}

export function ProductReviews({ locale, productSlug }: { locale: Locale; productSlug: string }) {
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [averageRating, setAverageRating] = useState(0);
  const [rating, setRating] = useState(5);
  const [nickname, setNickname] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [orderId, setOrderId] = useState("");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState(locale === "zh" ? "评价会先进入后台审核" : "Reviews are moderated before publishing");
  const [isLoading, setIsLoading] = useState(false);

  async function loadReviews() {
    try {
      const response = await fetch(`${apiGatewayUrl}/products/${encodeURIComponent(productSlug)}/reviews`, {
        headers: {
          "accept-language": locale === "zh" ? "zh-CN" : "en-US",
          "x-client-type": "storefront",
          "x-correlation-id": crypto.randomUUID()
        }
      });
      const payload = (await response.json().catch(() => ({}))) as { reviews?: ProductReview[]; averageRating?: number };
      setReviews(payload.reviews ?? []);
      setAverageRating(payload.averageRating ?? 0);
    } catch {
      setReviews([]);
      setAverageRating(0);
    }
  }

  async function submitReview() {
    setIsLoading(true);
    setStatus(locale === "zh" ? "正在提交评价" : "Submitting review");

    try {
      const response = await fetch(`${apiGatewayUrl}/products/${encodeURIComponent(productSlug)}/reviews`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "accept-language": locale === "zh" ? "zh-CN" : "en-US",
          "x-client-type": "storefront",
          "x-correlation-id": crypto.randomUUID()
        },
        body: JSON.stringify({
          orderId,
          customerEmail,
          nickname,
          rating,
          content,
          imageUrls: []
        })
      });
      const payload = (await response.json().catch(() => ({}))) as { message?: string };

      if (!response.ok) {
        throw new Error(localizedErrorMessage(payload, response.status, locale));
      }

      setContent("");
      setStatus(locale === "zh" ? "评价已提交，审核通过后会展示" : "Review submitted. It will appear after moderation.");
      await loadReviews();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : locale === "zh" ? "评价提交失败" : "Review submission failed");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    setOrderId(initialQueryValue("orderId"));
    setCustomerEmail(initialQueryValue("email"));
    void loadReviews();
  }, [productSlug]);

  const summary = useMemo(() => {
    if (reviews.length === 0) return locale === "zh" ? "暂无公开评价" : "No published reviews yet";
    return locale === "zh" ? `${averageRating}/5 · ${reviews.length} 条评价` : `${averageRating}/5 · ${reviews.length} reviews`;
  }, [averageRating, locale, reviews.length]);

  return (
    <section id="reviews" className="mt-10 border-t border-[var(--line)] pt-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ink-soft)]">
            {locale === "zh" ? "Reviews" : "Reviews"}
          </p>
          <h2 className="mt-2 text-2xl font-semibold">{locale === "zh" ? "商品评价" : "Customer reviews"}</h2>
        </div>
        <p className="text-sm text-[var(--ink-soft)]">{summary}</p>
      </div>

      <div className="mt-6 grid gap-4">
        {reviews.length === 0 ? (
          <div className="border border-dashed border-[var(--line)] bg-[var(--bg)] p-5 text-sm text-[var(--ink-soft)]">
            {locale === "zh" ? "暂无已审核展示的评价。" : "There are no approved reviews yet."}
          </div>
        ) : (
          reviews.map((review) => (
            <article key={review.id} className="border border-[var(--line)] p-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <p className="font-semibold">{review.nickname} · {"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</p>
                <p className="text-xs text-[var(--ink-soft)]">{formatDate(review.createdAt)}</p>
              </div>
              <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">{review.content}</p>
              {review.merchantReply ? (
                <p className="mt-3 border-l border-black pl-3 text-sm leading-6">
                  {locale === "zh" ? "商家回复：" : "Merchant reply: "}{review.merchantReply}
                </p>
              ) : null}
            </article>
          ))
        )}
      </div>

      <div className="mt-8 border border-[var(--line)] bg-white p-5">
        <h3 className="text-lg font-semibold">{locale === "zh" ? "提交评价" : "Write a review"}</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-semibold">
            {locale === "zh" ? "昵称" : "Name"}
            <input className="h-11 border border-[var(--line)] px-3 font-normal outline-none focus:border-black" value={nickname} onChange={(event) => setNickname(event.target.value)} />
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            {locale === "zh" ? "邮箱" : "Email"}
            <input className="h-11 border border-[var(--line)] px-3 font-normal outline-none focus:border-black" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} />
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            {locale === "zh" ? "订单号" : "Order ID"}
            <input className="h-11 border border-[var(--line)] px-3 font-normal outline-none focus:border-black" value={orderId} onChange={(event) => setOrderId(event.target.value)} />
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            {locale === "zh" ? "评分" : "Rating"}
            <select className="h-11 border border-[var(--line)] bg-white px-3 font-normal outline-none focus:border-black" value={rating} onChange={(event) => setRating(Number(event.target.value))}>
              {[5, 4, 3, 2, 1].map((value) => (
                <option key={value} value={value}>{value} / 5</option>
              ))}
            </select>
          </label>
        </div>
        <label className="mt-4 grid gap-2 text-sm font-semibold">
          {locale === "zh" ? "评价内容" : "Review"}
          <textarea className="min-h-28 border border-[var(--line)] px-3 py-2 font-normal outline-none focus:border-black" value={content} onChange={(event) => setContent(event.target.value)} />
        </label>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <button className="h-11 bg-black px-6 text-sm font-semibold text-white disabled:opacity-50" disabled={isLoading} onClick={submitReview} type="button">
            {isLoading ? (locale === "zh" ? "提交中" : "Submitting") : (locale === "zh" ? "提交评价" : "Submit review")}
          </button>
          <p className="text-sm text-[var(--ink-soft)]" role="status">{status}</p>
        </div>
      </div>
    </section>
  );
}
