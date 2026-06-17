"use client";

import { localizedErrorMessage } from "@commerce/error-codes";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { clearCustomerSession, readCustomerSession, writeCustomerSession } from "../lib/customer-session.js";
import type { CustomerSession } from "../lib/customer-session.js";
import { storefrontCopy } from "../lib/storefront-content.js";
import { PremiumStorefrontHeader } from "./premium-storefront-header.js";
import { RegistrationDialog } from "./registration-dialog.js";
import { useStorefrontLocale } from "./use-storefront-locale.js";

const authServiceUrl = process.env.NEXT_PUBLIC_AUTH_SERVICE_URL ?? "http://localhost:4102";
const apiGatewayUrl = process.env.NEXT_PUBLIC_API_GATEWAY_URL ?? "http://localhost:4000";

type AccountSection = "profile" | "addresses" | "payments" | "orders" | "security";
type CustomerOrderSummary = {
  orderId: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  inventoryStatus: string;
  totalMinor: number;
  currency: string;
  storageMode: "postgres" | "memory";
  createdAt: string;
};

const countries = ["United States", "United Kingdom", "Germany", "France", "Canada", "Australia", "China", "Japan", "Singapore"];
const provinces = ["California", "New York", "Texas", "Ontario", "British Columbia", "England", "Bavaria", "Ile-de-France", "Beijing", "Shanghai", "Jiangxi"];
const cardBrands = ["Visa", "Mastercard", "American Express", "UnionPay", "JCB"];

export function AccountShell() {
  const [locale, setLocale] = useStorefrontLocale();
  const isZh = locale === "zh";
  const copy = storefrontCopy[locale];
  const [customer, setCustomer] = useState<CustomerSession | null>(null);
  const [activeSection, setActiveSection] = useState<AccountSection>("profile");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [addressCountry, setAddressCountry] = useState(countries[0]);
  const [addressProvince, setAddressProvince] = useState(provinces[0]);
  const [addressCity, setAddressCity] = useState("");
  const [addressPostalCode, setAddressPostalCode] = useState("");
  const [cardBrand, setCardBrand] = useState(cardBrands[0]);
  const [cardLast4, setCardLast4] = useState("");
  const [message, setMessage] = useState("");
  const [isRegistrationOpen, setIsRegistrationOpen] = useState(false);
  const [orders, setOrders] = useState<CustomerOrderSummary[]>([]);
  const [ordersStatus, setOrdersStatus] = useState("");

  const sections: Array<{ key: AccountSection; label: string }> = [
    { key: "profile", label: isZh ? "账户资料" : "Profile" },
    { key: "addresses", label: isZh ? "地址管理" : "Addresses" },
    { key: "payments", label: isZh ? "支付方式" : "Payment methods" },
    { key: "orders", label: isZh ? "历史订单" : "Order history" },
    { key: "security", label: isZh ? "安全与密码" : "Security" }
  ];

  useEffect(() => {
    setCustomer(readCustomerSession());
  }, []);

  useEffect(() => {
    if (!customer) {
      setOrders([]);
      setOrdersStatus("");
      return;
    }

    const controller = new AbortController();
    setOrdersStatus(isZh ? "正在读取历史订单..." : "Loading order history...");

    fetch(`${apiGatewayUrl}/orders/customer-history?email=${encodeURIComponent(customer.email)}`, {
      headers: { "x-correlation-id": crypto.randomUUID() },
      signal: controller.signal
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => []);
        if (!response.ok) throw new Error(localizedErrorMessage(payload, response.status, locale));
        return Array.isArray(payload) ? payload as CustomerOrderSummary[] : [];
      })
      .then((nextOrders) => {
        setOrders(nextOrders);
        setOrdersStatus(nextOrders.length === 0
          ? (isZh ? "暂无该邮箱关联的订单。" : "No orders are linked to this email yet.")
          : "");
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setOrders([]);
        const unavailableMessage = isZh
          ? "订单 API 未连接，未展示假订单。"
          : "Order API is unavailable. No fake orders are shown.";
        setOrdersStatus(error instanceof Error && !(error instanceof TypeError) ? error.message : unavailableMessage);
      });

    return () => controller.abort();
  }, [customer, isZh]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const response = await fetch(`${authServiceUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      setMessage(localizedErrorMessage(payload, response.status, locale, isZh ? "登录失败" : "Login failed"));
      return;
    }

    setCustomer(payload as CustomerSession);
    writeCustomerSession(payload as CustomerSession);
    setMessage(isZh ? "已登录" : "Signed in");
  }

  async function handleForgotPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const response = await fetch(`${authServiceUrl}/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: forgotEmail })
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setMessage(localizedErrorMessage(payload, response.status, locale, isZh ? "发送失败" : "Send failed"));
      return;
    }

    setMessage(isZh ? "如果账户存在，重置密码邮件已发送。" : "If the account exists, a password reset email has been sent.");
  }

  async function handleChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const response = await fetch(`${authServiceUrl}/change-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: customer?.email, currentPassword, newPassword })
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setMessage(localizedErrorMessage(payload, response.status, locale, isZh ? "修改失败" : "Change failed"));
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setMessage(isZh ? "密码已修改" : "Password changed");
  }

  function handleLogout() {
    clearCustomerSession();
    setCustomer(null);
    setActiveSection("profile");
    setMessage(isZh ? "已退出登录" : "Signed out");
  }

  function renderAccountSection() {
    if (!customer) return null;

    if (activeSection === "profile") {
      return (
        <section className="rounded-md border border-[var(--line)] p-5">
          <h2 className="text-xl font-semibold">{isZh ? "账户资料" : "Profile"}</h2>
          <div className="mt-4 grid gap-3 text-sm">
            <p>
              <span className="text-[var(--ink-soft)]">{isZh ? "用户名：" : "Username: "}</span>
              <span className="font-medium">{customer.username}</span>
            </p>
            <p>
              <span className="text-[var(--ink-soft)]">{isZh ? "邮箱：" : "Email: "}</span>
              <span className="font-medium">{customer.email}</span>
            </p>
            <p className="text-[var(--ink-soft)]">
              {isZh ? "账户用于购买商品、查看订单、管理地址和发起售后。" : "Use this account for checkout, order history, saved addresses, and after-sales requests."}
            </p>
          </div>
        </section>
      );
    }

    if (activeSection === "addresses") {
      return (
        <section className="rounded-md border border-[var(--line)] p-5">
          <h2 className="text-xl font-semibold">{isZh ? "地址管理" : "Addresses"}</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
            {isZh ? "国家和省州使用下拉选择，城市、街道和邮编由买家手写填写。" : "Country and province/state are selected, while city, street, and postal code are entered manually."}
          </p>
          <form className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium">
              {isZh ? "国家" : "Country"}
              <select className="h-11 rounded-md border border-[var(--line)] px-3" onChange={(event) => setAddressCountry(event.target.value)} value={addressCountry}>
                {countries.map((country) => <option key={country}>{country}</option>)}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium">
              {isZh ? "省 / 州" : "Province / State"}
              <select className="h-11 rounded-md border border-[var(--line)] px-3" onChange={(event) => setAddressProvince(event.target.value)} value={addressProvince}>
                {provinces.map((province) => <option key={province}>{province}</option>)}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium">
              {isZh ? "城市" : "City"}
              <input className="h-11 rounded-md border border-[var(--line)] px-3" onChange={(event) => setAddressCity(event.target.value)} placeholder={isZh ? "手写城市" : "Enter city"} value={addressCity} />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              {isZh ? "邮编" : "Postal code"}
              <input className="h-11 rounded-md border border-[var(--line)] px-3" onChange={(event) => setAddressPostalCode(event.target.value)} placeholder="10001" value={addressPostalCode} />
            </label>
            <label className="grid gap-2 text-sm font-medium md:col-span-2">
              {isZh ? "街道地址" : "Street address"}
              <input className="h-11 rounded-md border border-[var(--line)] px-3" placeholder={isZh ? "门牌号、街道、公寓号" : "House number, street, apartment"} />
            </label>
            <button className="h-11 rounded-full bg-black px-5 text-sm font-semibold text-white md:w-fit" type="button">
              {isZh ? "保存地址" : "Save address"}
            </button>
          </form>
        </section>
      );
    }

    if (activeSection === "payments") {
      return (
        <section className="rounded-md border border-[var(--line)] p-5">
          <h2 className="text-xl font-semibold">{isZh ? "支付方式" : "Payment methods"}</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
            {isZh ? "这里不保存完整卡号或 CVV，只保存 Stripe、PayPal、空中云汇等支付通道返回的 token、卡品牌和尾号。" : "Full card numbers and CVV are not stored here. Only provider tokens, card brand, and last four digits are retained."}
          </p>
          <form className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium">
              {isZh ? "卡品牌" : "Card brand"}
              <select className="h-11 rounded-md border border-[var(--line)] px-3" onChange={(event) => setCardBrand(event.target.value)} value={cardBrand}>
                {cardBrands.map((brand) => <option key={brand}>{brand}</option>)}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium">
              {isZh ? "卡尾号" : "Last four digits"}
              <input className="h-11 rounded-md border border-[var(--line)] px-3" inputMode="numeric" maxLength={4} onChange={(event) => setCardLast4(event.target.value.replace(/\D/g, ""))} placeholder="4242" value={cardLast4} />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              {isZh ? "有效月份" : "Expiry month"}
              <input className="h-11 rounded-md border border-[var(--line)] px-3" inputMode="numeric" placeholder="12" />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              {isZh ? "有效年份" : "Expiry year"}
              <input className="h-11 rounded-md border border-[var(--line)] px-3" inputMode="numeric" placeholder="2030" />
            </label>
            <button className="h-11 rounded-full bg-black px-5 text-sm font-semibold text-white md:w-fit" type="button">
              {isZh ? "保存支付方式" : "Save payment method"}
            </button>
          </form>
        </section>
      );
    }

    if (activeSection === "orders") {
      return (
        <section className="rounded-md border border-[var(--line)] p-5">
          <h2 className="text-xl font-semibold">{isZh ? "历史订单" : "Order history"}</h2>
          {ordersStatus ? <p className="mt-3 text-sm text-[var(--ink-soft)]" role="status">{ordersStatus}</p> : null}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead className="border-b border-[var(--line)] text-[var(--ink-soft)]">
                <tr>
                  <th className="py-3 font-medium">{isZh ? "订单号" : "Order"}</th>
                  <th className="py-3 font-medium">{isZh ? "状态" : "Status"}</th>
                  <th className="py-3 font-medium">{isZh ? "金额" : "Amount"}</th>
                  <th className="py-3 font-medium">{isZh ? "库存" : "Inventory"}</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr className="border-b border-[var(--line)]" key={order.orderId}>
                    <td className="py-3">{order.orderNumber}</td>
                    <td className="py-3">{order.status} / {order.paymentStatus}</td>
                    <td className="py-3">{order.currency} {(order.totalMinor / 100).toFixed(2)}</td>
                    <td className="py-3">{order.inventoryStatus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      );
    }

    return (
      <form className="rounded-md border border-[var(--line)] p-5" onSubmit={handleChangePassword}>
        <h2 className="text-xl font-semibold">{isZh ? "修改密码" : "Change password"}</h2>
        <div className="mt-4 grid gap-4">
          <label className="grid gap-2 text-sm font-medium">
            {isZh ? "当前密码" : "Current password"}
            <input className="h-11 rounded-md border border-[var(--line)] px-3" minLength={8} onChange={(event) => setCurrentPassword(event.target.value)} required type="password" value={currentPassword} />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            {isZh ? "新密码" : "New password"}
            <input className="h-11 rounded-md border border-[var(--line)] px-3" minLength={8} onChange={(event) => setNewPassword(event.target.value)} required type="password" value={newPassword} />
          </label>
          <button className="h-11 rounded-full bg-black px-5 text-sm font-semibold text-white" type="submit">
            {isZh ? "保存新密码" : "Save new password"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <main className="premium-shell min-h-screen text-[var(--ink)]">
      <PremiumStorefrontHeader
        copy={copy}
        locale={locale}
        onLocaleChange={setLocale}
        onRegisterClick={() => setIsRegistrationOpen(true)}
      />
      <section className="premium-container max-w-5xl py-8 md:py-12">
        <Link className="text-sm font-semibold underline" href="/">
          {isZh ? "返回商城" : "Back to store"}
        </Link>
        <h1 className="premium-display mt-5 text-5xl leading-tight sm:text-7xl">{isZh ? "个人主页" : "Account home"}</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
          {isZh ? "登录后可查看账户资料、地址、支付方式、历史订单，并修改密码。" : "Sign in to view profile, addresses, payment methods, orders, and password settings."}
        </p>

        {customer ? (
          <div className="mt-6 grid gap-5 lg:grid-cols-[14rem_minmax(0,1fr)]">
            <aside className="rounded-md border border-[var(--line)] p-3">
              <nav className="grid gap-2" aria-label={isZh ? "账户中心菜单" : "Account menu"}>
                {sections.map((section) => (
                  <button
                    key={section.key}
                    className={[
                      "rounded-md px-3 py-3 text-left text-sm font-semibold",
                      activeSection === section.key ? "bg-black text-white" : "bg-white text-[var(--ink)]"
                    ].join(" ")}
                    onClick={() => setActiveSection(section.key)}
                    type="button"
                  >
                    {section.label}
                  </button>
                ))}
              </nav>
              <button className="mt-3 w-full rounded-md border border-[var(--line)] px-3 py-3 text-left text-sm font-semibold" onClick={handleLogout} type="button">
                {isZh ? "退出登录" : "Sign out"}
              </button>
            </aside>
            <div>{renderAccountSection()}</div>
          </div>
        ) : (
          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <form className="rounded-md border border-[var(--line)] p-5" onSubmit={handleLogin}>
              <h2 className="text-xl font-semibold">{isZh ? "登录" : "Sign in"}</h2>
              <div className="mt-4 grid gap-4">
                <label className="grid gap-2 text-sm font-medium">
                  {isZh ? "邮箱" : "Email"}
                  <input className="h-11 rounded-md border border-[var(--line)] px-3" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
                </label>
                <label className="grid gap-2 text-sm font-medium">
                  {isZh ? "密码" : "Password"}
                  <input className="h-11 rounded-md border border-[var(--line)] px-3" minLength={8} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
                </label>
                <button className="h-11 rounded-full bg-black px-5 text-sm font-semibold text-white" type="submit">
                  {isZh ? "登录" : "Sign in"}
                </button>
              </div>
            </form>

            <form className="rounded-md border border-[var(--line)] p-5" onSubmit={handleForgotPassword}>
              <h2 className="text-xl font-semibold">{isZh ? "忘记密码？" : "Forgot password?"}</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
                {isZh ? "输入邮箱后，系统会发送重置密码链接。" : "Enter your email and we will send a reset link."}
              </p>
              <label className="mt-4 grid gap-2 text-sm font-medium">
                {isZh ? "账户邮箱" : "Account email"}
                <input className="h-11 rounded-md border border-[var(--line)] px-3" onChange={(event) => setForgotEmail(event.target.value)} required type="email" value={forgotEmail} />
              </label>
              <button className="mt-4 h-11 rounded-full border border-black px-5 text-sm font-semibold" type="submit">
                {isZh ? "发送重置邮件" : "Send reset email"}
              </button>
            </form>
          </div>
        )}

        {message ? <p className="mt-5 rounded-md border border-[var(--line)] p-3 text-sm text-[var(--ink-soft)]" role="status">{message}</p> : null}
      </section>
      <RegistrationDialog copy={copy.registration} isOpen={isRegistrationOpen} locale={locale} onClose={() => setIsRegistrationOpen(false)} />
    </main>
  );
}
