"use client";

import { useEffect, useState } from "react";
import { storefrontCopy } from "../lib/storefront-content.js";
import { PremiumStorefrontHeader } from "./premium-storefront-header.js";
import { RegistrationDialog } from "./registration-dialog.js";
import { StorefrontCatalogProvider } from "./storefront-catalog-provider.js";
import { useStorefrontLocale } from "./use-storefront-locale.js";

const apiGatewayUrl = process.env.NEXT_PUBLIC_API_GATEWAY_URL ?? "http://localhost:4000";

type TrackingEvent = {
  occurredAt: string;
  status: string;
  location: string;
  descriptionEn: string;
  descriptionZh: string;
};

type TrackingRecord = {
  trackingNumber: string;
  carrier: string;
  status: string;
  statusLabel: {
    en: string;
    zh: string;
  };
  events: TrackingEvent[];
  provider: string;
  providerMode: "mock" | "external";
  cachedAt: string;
  expiresAt: string | null;
  terminal: boolean;
  storageMode: "postgres" | "memory";
  source: "cache" | "provider";
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function initialTrackingNumber() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("trackingNumber") ?? "";
}

function trackingUnavailableMessage(locale: "en" | "zh") {
  return locale === "zh" ? "暂时无法查询物流轨迹" : "Tracking is temporarily unavailable";
}

export function TrackOrderShell() {
  return (
    <StorefrontCatalogProvider>
      <TrackOrderContent />
    </StorefrontCatalogProvider>
  );
}

function TrackOrderContent() {
  const [locale, setLocale] = useStorefrontLocale();
  const copy = storefrontCopy[locale];
  const [isRegistrationOpen, setIsRegistrationOpen] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState("");
  const [tracking, setTracking] = useState<TrackingRecord | null>(null);
  const [status, setStatus] = useState(locale === "zh" ? "输入物流单号查询轨迹" : "Enter your tracking number");
  const [isLoading, setIsLoading] = useState(false);

  async function queryTracking(number = trackingNumber) {
    const normalized = number.trim();

    if (!normalized) {
      setStatus(locale === "zh" ? "请先输入物流单号" : "Please enter a tracking number");
      return;
    }

    setIsLoading(true);
    setStatus(locale === "zh" ? "正在查询物流轨迹" : "Checking tracking details");

    try {
      const response = await fetch(`${apiGatewayUrl}/logistics/tracking/${encodeURIComponent(normalized)}`, {
        headers: {
          "accept-language": locale === "zh" ? "zh-CN" : "en-US",
          "x-client-type": "storefront",
          "x-correlation-id": crypto.randomUUID()
        }
      });
      const payload = (await response.json().catch(() => ({}))) as TrackingRecord | { message?: string };

      if (!response.ok || !("trackingNumber" in payload)) {
        const message = "message" in payload ? payload.message : "";
        throw new Error(message && message !== "Internal server error" ? message : trackingUnavailableMessage(locale));
      }

      setTracking(payload);
      setStatus(payload.providerMode === "mock"
        ? locale === "zh" ? "本地测试轨迹，尚未接真实物流 Provider" : "Local mock tracking, real provider not connected"
        : locale === "zh" ? "已读取物流轨迹" : "Tracking details loaded");
    } catch (error) {
      setTracking(null);
      setStatus(error instanceof Error && error.message !== "Internal server error" ? error.message : trackingUnavailableMessage(locale));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const number = initialTrackingNumber();
    if (number) {
      setTrackingNumber(number);
      void queryTracking(number);
    }
  }, []);

  return (
    <main className="premium-shell min-h-screen text-[var(--ink)]">
      <PremiumStorefrontHeader
        copy={copy}
        locale={locale}
        onLocaleChange={setLocale}
        onRegisterClick={() => setIsRegistrationOpen(true)}
        productsHref="/#products"
        supportHref="/#support"
      />
      <RegistrationDialog
        copy={copy.registration}
        isOpen={isRegistrationOpen}
        onClose={() => setIsRegistrationOpen(false)}
      />

      <section className="premium-container py-14 sm:py-20">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ink-soft)]">
            {locale === "zh" ? "Order tracking" : "Order tracking"}
          </p>
          <h1 className="premium-display mt-3 text-5xl leading-tight sm:text-6xl">
            {locale === "zh" ? "查询物流轨迹" : "Track your parcel"}
          </h1>
          <p className="mt-5 max-w-xl text-sm leading-7 text-[var(--ink-soft)]">
            {locale === "zh"
              ? "输入物流单号后，系统会优先读取本地缓存；缓存失效时再通过物流 Provider 获取标准化轨迹。"
              : "Enter your tracking number. The site checks local cache first, then refreshes from the logistics provider when needed."}
          </p>
        </div>

        <div className="mt-10 grid gap-4 border-y border-[var(--line)] py-6 md:grid-cols-[minmax(0,1fr)_auto]">
          <label className="grid gap-2 text-sm font-semibold">
            {locale === "zh" ? "物流单号" : "Tracking number"}
            <input
              className="h-12 border border-[var(--line)] bg-white px-4 text-base font-normal outline-none focus:border-black"
              value={trackingNumber}
              onChange={(event) => setTrackingNumber(event.target.value)}
              placeholder={locale === "zh" ? "例如 YT202606150001" : "e.g. YT202606150001"}
            />
          </label>
          <button
            className="h-12 self-end bg-black px-8 text-sm font-semibold uppercase tracking-[0.08em] text-white disabled:opacity-50"
            disabled={isLoading}
            onClick={() => void queryTracking()}
            type="button"
          >
            {isLoading ? (locale === "zh" ? "查询中" : "Checking") : (locale === "zh" ? "查询" : "Track")}
          </button>
        </div>

        <p className="mt-4 text-sm text-[var(--ink-soft)]" role="status">{status}</p>

        {tracking ? (
          <section className="mt-10 grid gap-8 lg:grid-cols-[22rem_minmax(0,1fr)]">
            <aside className="border border-[var(--line)] bg-white p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                {tracking.providerMode}
              </p>
              <h2 className="premium-display mt-2 text-3xl">{tracking.statusLabel[locale]}</h2>
              <dl className="mt-6 grid gap-4 text-sm">
                <div>
                  <dt className="text-[var(--ink-soft)]">{locale === "zh" ? "物流单号" : "Tracking number"}</dt>
                  <dd className="mt-1 font-semibold">{tracking.trackingNumber}</dd>
                </div>
                <div>
                  <dt className="text-[var(--ink-soft)]">{locale === "zh" ? "承运商" : "Carrier"}</dt>
                  <dd className="mt-1 font-semibold">{tracking.carrier}</dd>
                </div>
                <div>
                  <dt className="text-[var(--ink-soft)]">{locale === "zh" ? "数据来源" : "Source"}</dt>
                  <dd className="mt-1 font-semibold">{tracking.source} · {tracking.storageMode}</dd>
                </div>
              </dl>
            </aside>

            <div className="grid gap-5">
              {tracking.events.map((event) => (
                <article key={`${event.occurredAt}-${event.status}`} className="border-l border-black pl-5">
                  <p className="text-base font-semibold">
                    {locale === "zh" ? event.descriptionZh : event.descriptionEn}
                  </p>
                  <p className="mt-2 text-sm text-[var(--ink-soft)]">
                    {formatDate(event.occurredAt)} · {event.location}
                  </p>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}
