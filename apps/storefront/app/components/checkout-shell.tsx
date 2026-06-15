"use client";

import { ArrowLeft, CreditCard, Mail, MapPin, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { useSearchParams } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { clearCart, useCart } from "../lib/cart.js";
import { products, storefrontCopy } from "../lib/storefront-content.js";
import { PremiumStorefrontHeader } from "./premium-storefront-header.js";
import { InternationalPhoneField } from "./international-phone-field.js";
import { RegistrationDialog } from "./registration-dialog.js";
import { TeawareLoadingOverlay } from "./teaware-loading-overlay.js";
import { useStorefrontLocale } from "./use-storefront-locale.js";

const apiGatewayUrl = process.env.NEXT_PUBLIC_API_GATEWAY_URL ?? "http://localhost:4000";
const authServiceUrl = process.env.NEXT_PUBLIC_AUTH_SERVICE_URL ?? "http://localhost:4102";

function formatMoney(value: number) {
  return `$${value.toFixed(0)}`;
}

export function CheckoutShell() {
  const [locale, setLocale] = useStorefrontLocale();
  const copy = storefrontCopy[locale];
  const isZh = locale === "zh";
  const searchParams = useSearchParams();
  const buyNowSlug = searchParams.get("buyNow");
  const cart = useCart();
  const [paymentMethod, setPaymentMethod] = useState("stripe");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRegistrationOpen, setIsRegistrationOpen] = useState(false);
  const [guestOrder, setGuestOrder] = useState<{ orderNumber: string; email: string } | null>(null);
  const [guestUsername, setGuestUsername] = useState("");
  const [guestPassword, setGuestPassword] = useState("");
  const [guestRegistrationMessage, setGuestRegistrationMessage] = useState("");
  const [isGuestRegistering, setIsGuestRegistering] = useState(false);

  const checkoutItems = useMemo(() => {
    if (!buyNowSlug) return cart.items;

    const product = products.find((item) => item.slug === buyNowSlug);
    return product ? [{ product, quantity: 1 }] : [];
  }, [buyNowSlug, cart.items]);

  const subtotal = checkoutItems.reduce((total, item) => total + item.product.priceValue * item.quantity, 0);
  const originalSubtotal = checkoutItems.reduce((total, item) => total + item.product.originalPriceValue * item.quantity, 0);
  const discount = Math.max(0, originalSubtotal - subtotal);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(isZh ? "正在创建模拟订单..." : "Creating mock order...");

    const form = new FormData(event.currentTarget);
    const customerEmail = String(form.get("email") ?? "").trim().toLowerCase();
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 2500);

    try {
      const response = await fetch(`${apiGatewayUrl}/checkout/mock-order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-idempotency-key": crypto.randomUUID()
        },
        body: JSON.stringify({
          customerEmail,
          customerPhone: `${String(form.get("phoneDialCode") ?? "")} ${String(form.get("phoneNumber") ?? "")}`.trim(),
          paymentMethod,
          shippingAddress: {
            country: String(form.get("country") ?? ""),
            province: String(form.get("province") ?? ""),
            city: String(form.get("city") ?? ""),
            postalCode: String(form.get("postalCode") ?? ""),
            street: String(form.get("street") ?? "")
          },
          lines: checkoutItems.map(({ product, quantity }) => ({
            slug: product.slug,
            skuId: product.skuId,
            skuCode: product.sku,
            title: product.copy.en.name,
            quantity,
            unitPriceMinor: Math.round(product.priceValue * 100),
            currency: "USD"
          }))
        }),
        signal: controller.signal
      });

      const payload = (await response.json().catch(() => ({}))) as {
        orderNumber?: string;
        paymentRedirectUrl?: string;
        storageMode?: "postgres" | "memory";
        inventoryMode?: "postgres" | "memory";
        paymentMode?: "provider" | "local-fallback";
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? `HTTP ${response.status}`);
      }

      if (!buyNowSlug) clearCart();
      setGuestOrder({ orderNumber: payload.orderNumber ?? "", email: customerEmail });
      setGuestUsername(customerEmail.split("@")[0] ?? "");
      setGuestPassword("");
      setGuestRegistrationMessage("");
      setMessage(
        isZh
          ? `模拟订单 ${payload.orderNumber ?? ""} 已创建，库存模式：${payload.inventoryMode ?? "unknown"}，存储模式：${payload.storageMode ?? "unknown"}，支付模式：${payload.paymentMode ?? "unknown"}。`
          : `Mock order ${payload.orderNumber ?? ""} created with ${payload.inventoryMode ?? "unknown"} inventory, ${payload.storageMode ?? "unknown"} storage, and ${payload.paymentMode ?? "unknown"} payment.`
      );
    } catch {
      setMessage(
        isZh
          ? "订单 API 未连接，购物车已保留，未假装下单成功。"
          : "Order API is unavailable. Cart is kept, and no fake success was shown."
      );
      setGuestOrder(null);
    } finally {
      window.clearTimeout(timeoutId);
      setIsSubmitting(false);
    }
  }

  async function handleGuestRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!guestOrder) return;

    setIsGuestRegistering(true);
    setGuestRegistrationMessage(isZh ? "正在发送验证邮件..." : "Sending verification email...");

    try {
      const response = await fetch(`${authServiceUrl}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: guestUsername,
          email: guestOrder.email,
          password: guestPassword
        })
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.message ?? (isZh ? "补注册失败" : "Registration failed"));
      }

      setGuestRegistrationMessage(
        isZh
          ? "验证邮件已发送。请打开邮箱完成激活，激活后可在个人主页查看该邮箱下的订单。"
          : "Verification email sent. Activate your account, then sign in to see orders placed with this email."
      );
    } catch (error) {
      setGuestRegistrationMessage(error instanceof Error ? error.message : (isZh ? "补注册失败" : "Registration failed"));
    } finally {
      setIsGuestRegistering(false);
    }
  }

  return (
    <main className="premium-shell min-h-screen text-[var(--ink)]">
      <PremiumStorefrontHeader
        copy={copy}
        locale={locale}
        onLocaleChange={setLocale}
        onRegisterClick={() => setIsRegistrationOpen(true)}
      />
      <section className="premium-container py-8 md:py-12">
        <Link className="inline-flex items-center gap-2 text-sm font-semibold" href={(buyNowSlug ? `/products/${buyNowSlug}` : "/cart") as Route}>
          <ArrowLeft size={16} />
          {buyNowSlug ? copy.detail.back : (isZh ? "返回购物车" : "Back to cart")}
        </Link>

        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ink-soft)]">
            {isZh ? "跨境结算" : "Cross-border checkout"}
          </p>
          <h1 className="premium-display mt-2 text-5xl leading-tight sm:text-7xl">{isZh ? "结算" : "Checkout"}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--ink-soft)]">
            {isZh ? "这里预留邮箱、国际地址、支付通道、税费和物流计算入口。" : "Email, international address, payment provider, tax, and shipping hooks are reserved here."}
          </p>
        </div>

        {checkoutItems.length === 0 ? (
          <div className="mt-8 border border-dashed border-[var(--line)] px-4 py-14 text-center">
            <h2 className="text-xl font-semibold">{isZh ? "没有可结算商品" : "No items to checkout"}</h2>
            {message ? <p className="mx-auto mt-3 max-w-md text-sm text-[var(--ink-soft)]" role="status">{message}</p> : null}
            <Link className="premium-btn mt-5" href={"/#products" as Route}>
              {isZh ? "去选商品" : "Shop products"}
            </Link>
          </div>
        ) : (
          <form className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]" onSubmit={handleSubmit}>
            <div className="grid gap-5">
              <section className="border border-[var(--line)] bg-white/70 p-5">
                <h2 className="flex items-center gap-2 text-xl font-semibold">
                  <Mail size={19} />
                  {isZh ? "联系信息" : "Contact"}
                </h2>
                <label className="mt-4 grid gap-2 text-sm font-medium">
                  {isZh ? "邮箱" : "Email"}
                  <input className="h-11 border border-[var(--line)] bg-white px-3" name="email" placeholder="customer@example.com" required type="email" />
                </label>
                <div className="mt-4">
                  <InternationalPhoneField locale={locale} label={isZh ? "手机号" : "Mobile phone"} />
                </div>
              </section>

              <section className="border border-[var(--line)] bg-white/70 p-5">
                <h2 className="flex items-center gap-2 text-xl font-semibold">
                  <MapPin size={19} />
                  {isZh ? "收货地址" : "Shipping address"}
                </h2>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2 text-sm font-medium">
                    {isZh ? "国家" : "Country"}
                    <select className="h-11 border border-[var(--line)] bg-white px-3" name="country" required>
                      <option>United States</option>
                      <option>United Kingdom</option>
                      <option>Germany</option>
                      <option>France</option>
                      <option>Singapore</option>
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm font-medium">
                    {isZh ? "省 / 州" : "Province / State"}
                    <select className="h-11 border border-[var(--line)] bg-white px-3" name="province" required>
                      <option>California</option>
                      <option>New York</option>
                      <option>England</option>
                      <option>Bavaria</option>
                      <option>Singapore</option>
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm font-medium">
                    {isZh ? "城市" : "City"}
                    <input className="h-11 border border-[var(--line)] bg-white px-3" name="city" required />
                  </label>
                  <label className="grid gap-2 text-sm font-medium">
                    {isZh ? "邮编" : "Postal code"}
                    <input className="h-11 border border-[var(--line)] bg-white px-3" name="postalCode" required />
                  </label>
                  <label className="grid gap-2 text-sm font-medium md:col-span-2">
                    {isZh ? "详细地址" : "Street address"}
                    <input className="h-11 border border-[var(--line)] bg-white px-3" name="street" required />
                  </label>
                </div>
              </section>

              <section className="border border-[var(--line)] bg-white/70 p-5">
                <h2 className="flex items-center gap-2 text-xl font-semibold">
                  <CreditCard size={19} />
                  {isZh ? "支付方式" : "Payment method"}
                </h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {[
                    { id: "stripe", label: "Stripe" },
                    { id: "paypal", label: "PayPal" },
                    { id: "airwallex", label: isZh ? "空中云汇" : "Airwallex" }
                  ].map((method) => (
                    <label key={method.id} className="flex cursor-pointer items-center gap-2 border border-[var(--line)] bg-white p-3 text-sm font-semibold">
                      <input checked={paymentMethod === method.id} name="paymentMethod" onChange={() => setPaymentMethod(method.id)} type="radio" />
                      {method.label}
                    </label>
                  ))}
                </div>
                <p className="mt-3 flex items-start gap-2 text-sm leading-6 text-[var(--ink-soft)]">
                  <ShieldCheck className="mt-0.5 shrink-0" size={16} />
                  <span>{isZh ? "当前是模拟结算，真实支付会由 payment-service 调用支付通道。" : "This is mock checkout. Real payments will be created by payment-service."}</span>
                </p>
              </section>
            </div>

            <aside className="h-fit border border-[var(--line)] bg-white/70 p-5">
              <h2 className="text-xl font-semibold">{isZh ? "订单摘要" : "Order summary"}</h2>
              <div className="mt-4 grid gap-4">
                {checkoutItems.map(({ product, quantity }) => {
                  const productCopy = product.copy[locale];

                  return (
                    <div key={product.slug} className="grid grid-cols-[4rem_minmax(0,1fr)] gap-3">
                      <img alt={productCopy.name} className="aspect-square bg-[var(--surface)] object-cover" src={product.image} />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{productCopy.name}</p>
                        <p className="text-xs text-[var(--ink-soft)]">{isZh ? "数量" : "Qty"} {quantity}</p>
                        <p className="mt-1 text-sm font-semibold">{formatMoney(product.priceValue * quantity)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-5 grid gap-3 border-t border-[var(--line)] pt-4 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-[var(--ink-soft)]">{isZh ? "原价小计" : "Original subtotal"}</span>
                  <span className="line-through">{formatMoney(originalSubtotal)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[var(--ink-soft)]">{isZh ? "折扣" : "Discount"}</span>
                  <span>-{formatMoney(discount)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[var(--ink-soft)]">{isZh ? "运费 / 税费" : "Shipping / tax"}</span>
                  <span>{isZh ? "待计算" : "TBD"}</span>
                </div>
                <div className="flex justify-between gap-4 border-t border-[var(--line)] pt-3 text-base font-semibold">
                  <span>{isZh ? "当前小计" : "Subtotal"}</span>
                  <span>{formatMoney(subtotal)}</span>
                </div>
              </div>
              <button className="premium-btn mt-5 w-full disabled:cursor-not-allowed disabled:opacity-50" disabled={isSubmitting} type="submit">
                {isSubmitting ? (isZh ? "提交中" : "Submitting") : (isZh ? "提交模拟订单" : "Place mock order")}
              </button>
              {message ? <p className="mt-3 text-sm text-[var(--ink-soft)]" role="status">{message}</p> : null}
            </aside>
          </form>
        )}

        {guestOrder ? (
          <section className="mt-6 border border-[var(--line)] bg-white/70 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ink-soft)]">
              {isZh ? "未注册下单补注册" : "Guest checkout registration"}
            </p>
            <h2 className="mt-2 text-2xl font-semibold">
              {isZh ? "为此订单创建账户" : "Create an account for this order"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
              {isZh
                ? `订单 ${guestOrder.orderNumber} 已使用 ${guestOrder.email} 下单。补注册会发送邮箱验证邮件，激活后按邮箱关联历史订单。`
                : `Order ${guestOrder.orderNumber} was placed with ${guestOrder.email}. We will send a verification email and link past orders by email after activation.`}
            </p>
            <form className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]" onSubmit={handleGuestRegistration}>
              <label className="grid gap-2 text-sm font-medium">
                {isZh ? "用户名" : "Username"}
                <input
                  className="h-11 border border-[var(--line)] bg-white px-3"
                  minLength={3}
                  onChange={(event) => setGuestUsername(event.target.value)}
                  required
                  value={guestUsername}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                {isZh ? "设置密码" : "Create password"}
                <input
                  className="h-11 border border-[var(--line)] bg-white px-3"
                  minLength={8}
                  onChange={(event) => setGuestPassword(event.target.value)}
                  required
                  type="password"
                  value={guestPassword}
                />
              </label>
              <button className="premium-btn self-end disabled:cursor-not-allowed disabled:opacity-50" disabled={isGuestRegistering} type="submit">
                {isGuestRegistering ? (isZh ? "发送中" : "Sending") : (isZh ? "发送验证邮件" : "Send verification")}
              </button>
            </form>
            {guestRegistrationMessage ? <p className="mt-3 text-sm text-[var(--ink-soft)]" role="status">{guestRegistrationMessage}</p> : null}
          </section>
        ) : null}
      </section>
      <RegistrationDialog copy={copy.registration} isOpen={isRegistrationOpen} onClose={() => setIsRegistrationOpen(false)} />
      <TeawareLoadingOverlay isOpen={isSubmitting} locale={locale} />
    </main>
  );
}
