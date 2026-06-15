"use client";

import Link from "next/link";
import type { Route } from "next";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { RegistrationDialog } from "./registration-dialog.js";
import { PremiumStorefrontHeader } from "./premium-storefront-header.js";
import { StorefrontFooter } from "./storefront-footer.js";
import { useStorefrontLocale } from "./use-storefront-locale.js";
import { storefrontCopy } from "../lib/storefront-content.js";

type PaymentState = "success" | "pending" | "failed";

const resultCopy = {
  en: {
    success: {
      title: "Payment received",
      body: "Your order has been confirmed. A payment confirmation email will be sent if the email service is configured."
    },
    pending: {
      title: "Payment processing",
      body: "We are waiting for the payment provider to confirm this order. You can check the order again shortly."
    },
    failed: {
      title: "Payment was not completed",
      body: "The order was not paid. You can return to checkout and try again."
    },
    order: "Order",
    continueShopping: "Continue shopping",
    account: "Go to account"
  },
  zh: {
    success: {
      title: "付款成功",
      body: "订单已确认。如邮件服务已配置，系统会发送付款成功邮件。"
    },
    pending: {
      title: "付款处理中",
      body: "系统正在等待支付服务商确认订单，请稍后查看订单状态。"
    },
    failed: {
      title: "付款未完成",
      body: "订单尚未支付，可返回结账页重新尝试。"
    },
    order: "订单",
    continueShopping: "继续购物",
    account: "进入个人中心"
  }
};

function parsePaymentState(value: string | null): PaymentState {
  if (value === "success" || value === "paid") return "success";
  if (value === "failed" || value === "cancelled" || value === "canceled") return "failed";
  return "pending";
}

export function PaymentResultShell() {
  const [locale, setLocale] = useStorefrontLocale();
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [state, setState] = useState<PaymentState>("pending");
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const copy = storefrontCopy[locale];
  const result = resultCopy[locale][state];

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setState(parsePaymentState(params.get("status")));
    setOrderNumber(params.get("order") || params.get("orderNumber"));
  }, []);

  const Icon = state === "success" ? CheckCircle2 : state === "failed" ? XCircle : Clock;

  return (
    <main className="premium-shell min-h-screen text-[var(--ink)]">
      <PremiumStorefrontHeader
        copy={copy}
        locale={locale}
        onLocaleChange={setLocale}
        onRegisterClick={() => setRegistrationOpen(true)}
        productsHref="/#products"
        supportHref="/contact-us"
      />
      <section className="premium-container flex min-h-[calc(100vh-5rem)] items-center py-16">
        <div className="mx-auto w-full max-w-2xl border border-[var(--line)] bg-white p-8 text-center md:p-12">
          <Icon className="mx-auto text-black" size={44} strokeWidth={1.4} />
          <p className="mt-7 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ink-soft)]">
            {orderNumber ? `${resultCopy[locale].order} ${orderNumber}` : resultCopy[locale].order}
          </p>
          <h1 className="premium-display mt-3 text-4xl leading-tight md:text-5xl">{result.title}</h1>
          <p className="mx-auto mt-5 max-w-lg text-sm leading-7 text-[var(--ink-soft)]">{result.body}</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link className="premium-btn" href={"/#products" as Route}>{resultCopy[locale].continueShopping}</Link>
            <Link className="premium-btn-outline" href={"/account" as Route}>{resultCopy[locale].account}</Link>
          </div>
        </div>
      </section>
      <RegistrationDialog
        copy={copy.registration}
        isOpen={registrationOpen}
        onClose={() => setRegistrationOpen(false)}
      />
      <StorefrontFooter locale={locale} />
    </main>
  );
}
