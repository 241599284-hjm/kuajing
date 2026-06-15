"use client";

import { MessageCircle } from "lucide-react";
import type { Locale } from "../lib/storefront-content.js";

type CustomerServiceCopy = {
  title: string;
  body: string;
  startChat: string;
  createTicket: string;
};

export function CustomerServiceMenu({
  copy,
  locale
}: {
  copy: CustomerServiceCopy;
  locale: Locale;
}) {
  return (
    <details id="support" className="fixed bottom-24 right-4 z-[60] max-w-[calc(100vw-2rem)] md:bottom-8 md:right-8">
      <summary
        aria-label={copy.title}
        className="flex size-12 list-none items-center justify-center rounded-full bg-black text-white shadow-lg"
      >
        <MessageCircle size={20} />
      </summary>
      <div className="mt-3 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-[var(--line)] bg-white p-4 text-black shadow-xl">
        <p className="text-sm font-semibold">{copy.title}</p>
        <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
          {copy.body}
        </p>
        <div className="mt-4 grid gap-2">
          <button className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm text-white" type="button">
            {copy.startChat}
          </button>
          <a className="rounded-full border border-[var(--line)] px-4 py-2 text-center text-sm" href="/contact-us" role="button">
            {copy.createTicket}
          </a>
        </div>
        <p className="mt-3 text-xs text-[var(--ink-soft)]">
          {locale === "zh" ? "客服入口模板化，后续可接入真实在线聊天或工单系统。" : "Template-ready for live chat or ticket integration."}
        </p>
      </div>
    </details>
  );
}
