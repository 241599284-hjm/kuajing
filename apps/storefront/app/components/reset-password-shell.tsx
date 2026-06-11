"use client";

import Link from "next/link";
import type { Route } from "next";
import { FormEvent, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useStorefrontLocale } from "./use-storefront-locale.js";

const authServiceUrl = process.env.NEXT_PUBLIC_AUTH_SERVICE_URL ?? "http://localhost:4102";

export function ResetPasswordShell() {
  const [locale] = useStorefrontLocale();
  const isZh = locale === "zh";
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  async function handleReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    const response = await fetch(`${authServiceUrl}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password })
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setMessage(payload.message ?? (isZh ? "重置失败" : "Reset failed"));
      return;
    }

    setPassword("");
    setMessage(isZh ? "密码已重置，请返回账户页登录。" : "Password reset. Return to the account page to sign in.");
  }

  return (
    <main className="min-h-screen bg-white px-4 py-8 text-[var(--ink)] sm:px-6 lg:px-8">
      <section className="mx-auto max-w-xl">
        <Link className="text-sm font-semibold underline" href={"/account" as Route}>
          {isZh ? "返回账户页" : "Back to account"}
        </Link>
        <h1 className="mt-5 text-3xl font-semibold">{isZh ? "重置密码" : "Reset password"}</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
          {isZh ? "输入新密码完成邮箱链接重置流程。" : "Enter a new password to finish the email reset flow."}
        </p>
        <form className="mt-6 rounded-md border border-[var(--line)] p-5" onSubmit={handleReset}>
          <label className="grid gap-2 text-sm font-medium">
            {isZh ? "新密码" : "New password"}
            <input className="h-11 rounded-md border border-[var(--line)] px-3" minLength={8} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
          </label>
          <button className="mt-4 h-11 rounded-full bg-black px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-black/40" disabled={!token} type="submit">
            {isZh ? "提交新密码" : "Submit new password"}
          </button>
          {!token ? (
            <p className="mt-3 text-sm text-[var(--ink-soft)]">
              {isZh ? "重置链接缺少 token，请重新发送忘记密码邮件。" : "The reset token is missing. Send a new forgot-password email."}
            </p>
          ) : null}
        </form>
        {message ? <p className="mt-5 rounded-md border border-[var(--line)] p-3 text-sm text-[var(--ink-soft)]" role="status">{message}</p> : null}
      </section>
    </main>
  );
}
