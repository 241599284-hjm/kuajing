"use client";

import { createContext, type FormEvent, type ReactNode, useContext, useEffect, useState } from "react";
import { AdminField, AdminInlineStatus, AdminPanel, AdminPrimaryButton, AdminTextInput } from "./admin-ui.js";

const authServiceUrl = process.env.NEXT_PUBLIC_AUTH_SERVICE_URL ?? "/auth";
type AdminSession = { email: string; role: string };
const AdminSessionContext = createContext<{ session: AdminSession; logout: () => Promise<void> } | null>(null);

export function useAdminSession() {
  return useContext(AdminSessionContext);
}

export function AdminAuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("请输入管理员凭据");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      controller.abort();
      setChecking(false);
    }, 3000);
    void fetch(`${authServiceUrl}/admin/session`, { credentials: "include", signal: controller.signal })
      .then(async (response) => response.ok ? setSession(await response.json()) : undefined)
      .catch(() => undefined)
      .finally(() => {
        window.clearTimeout(timeout);
        setChecking(false);
      });
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  async function login(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setStatus("正在验证");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(`${authServiceUrl}/admin/login`, {
        method: "POST",
        credentials: "include",
        signal: controller.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const payload = await response.json().catch(() => ({})) as { email?: string; role?: string; message?: string };
      if (!response.ok || !payload.email || !payload.role) throw new Error(payload.message ?? "登录失败");
      setSession({ email: payload.email, role: payload.role });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "登录失败");
    } finally {
      window.clearTimeout(timeout);
      setSubmitting(false);
    }
  }

  async function logout() {
    await fetch(`${authServiceUrl}/admin/logout`, { method: "POST", credentials: "include" }).catch(() => undefined);
    setSession(null);
    setPassword("");
    setStatus("已退出登录");
  }

  if (checking) return <main className="mx-auto max-w-md px-4 py-16"><AdminInlineStatus>正在检查管理员会话</AdminInlineStatus></main>;
  if (session) return <AdminSessionContext.Provider value={{ session, logout }}>{children}</AdminSessionContext.Provider>;

  return (
    <main className="mx-auto max-w-md px-4 py-12 sm:py-20">
      <AdminPanel id="admin-login-title" eyebrow="Commerce Admin" title="管理员登录" status="受保护">
        <form className="mt-5 space-y-4" onSubmit={login}>
          <AdminField label="管理员邮箱">
            <AdminTextInput autoComplete="username" onChange={(event) => setEmail(event.target.value)} type="email" value={email} />
          </AdminField>
          <AdminField label="密码">
            <AdminTextInput autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} type="password" value={password} />
          </AdminField>
          <AdminPrimaryButton className="w-full" disabled={submitting || password.length < 8} type="submit">
            {submitting ? "验证中" : "登录"}
          </AdminPrimaryButton>
          <AdminInlineStatus>{status}</AdminInlineStatus>
        </form>
      </AdminPanel>
    </main>
  );
}
