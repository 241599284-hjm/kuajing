"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  AdminActionRow,
  AdminCheckbox,
  AdminField,
  AdminInlineStatus,
  AdminNumberInput,
  AdminPanel,
  AdminPrimaryButton,
  AdminTextInput
} from "./admin-ui.js";

type EmailSettings = {
  provider: "smtp";
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUsername: string | null;
  smtpPasswordConfigured: boolean;
  fromEmail: string;
  fromName: string;
  replyToEmail: string | null;
  enabled: boolean;
};

const authServiceUrl = process.env.NEXT_PUBLIC_AUTH_SERVICE_URL ?? "http://localhost:4102";

const initialSettings: EmailSettings = {
  provider: "smtp",
  smtpHost: "localhost",
  smtpPort: 1025,
  smtpSecure: false,
  smtpUsername: null,
  smtpPasswordConfigured: false,
  fromEmail: "no-reply@demo-teaware.local",
  fromName: "Demo Teaware",
  replyToEmail: null,
  enabled: true
};

export function EmailSettingsPanel() {
  const [settings, setSettings] = useState<EmailSettings>(initialSettings);
  const [smtpPassword, setSmtpPassword] = useState("");
  const [clearSmtpPassword, setClearSmtpPassword] = useState(false);
  const [status, setStatus] = useState("加载中");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadSettings() {
      try {
        const response = await fetch(`${authServiceUrl}/admin/email-settings`);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = (await response.json()) as EmailSettings;

        if (isMounted) {
          setSettings(data);
          setStatus("已加载");
        }
      } catch (error) {
        if (isMounted) {
          setStatus(error instanceof Error ? error.message : "加载失败");
        }
      }
    }

    void loadSettings();

    return () => {
      isMounted = false;
    };
  }, []);

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setStatus("保存中");

    try {
      const response = await fetch(`${authServiceUrl}/admin/email-settings`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          provider: settings.provider,
          smtpHost: settings.smtpHost,
          smtpPort: settings.smtpPort,
          smtpSecure: settings.smtpSecure,
          smtpUsername: settings.smtpUsername,
          smtpPassword: smtpPassword || undefined,
          clearSmtpPassword,
          fromEmail: settings.fromEmail,
          fromName: settings.fromName,
          replyToEmail: settings.replyToEmail,
          enabled: settings.enabled
        })
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? `HTTP ${response.status}`);
      }

      const data = (await response.json()) as EmailSettings;
      setSettings(data);
      setSmtpPassword("");
      setClearSmtpPassword(false);
      setStatus("已保存");
    } catch (error) {
      const message = error instanceof Error ? error.message : "保存失败";
      setStatus(message === "Internal server error" || message.startsWith("HTTP 5") ? "API 未连接，本地已保留修改" : message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AdminPanel
      eyebrow="店铺邮件"
      id="email-settings-title"
      status={`${settings.enabled ? "已启用" : "已停用"} / ${status}`}
      title="邮箱设置"
    >
      <form className="mt-5 grid gap-5 lg:grid-cols-[1fr_1fr]" onSubmit={saveSettings}>
        <div className="grid gap-4">
          <AdminField label="SMTP 主机">
            <AdminTextInput
              name="smtpHost"
              value={settings.smtpHost}
              onChange={(event) => setSettings({ ...settings, smtpHost: event.target.value })}
              required
            />
          </AdminField>

          <div className="grid gap-4 sm:grid-cols-2">
            <AdminField label="SMTP 端口">
              <AdminNumberInput
                name="smtpPort"
                min={1}
                max={65535}
                value={settings.smtpPort}
                onChange={(event) => setSettings({ ...settings, smtpPort: Number(event.target.value) })}
                required
              />
            </AdminField>

            <AdminCheckbox
              checked={settings.smtpSecure}
              containerClassName="sm:mt-7"
              label="TLS / SSL"
              name="smtpSecure"
              onChange={(event) => setSettings({ ...settings, smtpSecure: event.target.checked })}
            />
          </div>

          <AdminField label="SMTP 用户名">
            <AdminTextInput
              name="smtpUsername"
              value={settings.smtpUsername ?? ""}
              onChange={(event) => setSettings({ ...settings, smtpUsername: event.target.value || null })}
              autoComplete="username"
            />
          </AdminField>

          <AdminField label="SMTP 密码">
            <AdminTextInput
              name="smtpPassword"
              type="password"
              value={smtpPassword}
              onChange={(event) => setSmtpPassword(event.target.value)}
              placeholder={settings.smtpPasswordConfigured ? "已配置" : ""}
              autoComplete="new-password"
            />
          </AdminField>

          <AdminCheckbox
            checked={clearSmtpPassword}
            label="清除已保存密码"
            name="clearSmtpPassword"
            onChange={(event) => setClearSmtpPassword(event.target.checked)}
          />
        </div>

        <div className="grid gap-4">
          <AdminField label="发件人名称">
            <AdminTextInput
              name="fromName"
              value={settings.fromName}
              onChange={(event) => setSettings({ ...settings, fromName: event.target.value })}
              required
            />
          </AdminField>

          <AdminField label="发件邮箱">
            <AdminTextInput
              name="fromEmail"
              type="email"
              value={settings.fromEmail}
              onChange={(event) => setSettings({ ...settings, fromEmail: event.target.value })}
              required
            />
          </AdminField>

          <AdminField label="Reply-To 邮箱">
            <AdminTextInput
              name="replyToEmail"
              type="email"
              value={settings.replyToEmail ?? ""}
              onChange={(event) => setSettings({ ...settings, replyToEmail: event.target.value || null })}
            />
          </AdminField>

          <AdminCheckbox
            checked={settings.enabled}
            label="启用注册邮件"
            name="enabled"
            onChange={(event) => setSettings({ ...settings, enabled: event.target.checked })}
          />

          <AdminActionRow>
            <AdminPrimaryButton disabled={isSaving} type="submit">
              {isSaving ? "保存中" : "保存邮箱设置"}
            </AdminPrimaryButton>
            <AdminInlineStatus>{status}</AdminInlineStatus>
          </AdminActionRow>
        </div>
      </form>
    </AdminPanel>
  );
}
