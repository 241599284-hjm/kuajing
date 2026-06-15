"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  AdminActionRow,
  AdminCheckbox,
  AdminField,
  AdminInlineStatus,
  AdminListCard,
  AdminNumberInput,
  AdminPanel,
  AdminPrimaryButton,
  AdminSecondaryButton,
  AdminTextInput,
  AdminTextarea
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

type NotificationEmailTemplate = {
  key: string;
  nameZh: string;
  nameEn: string;
  subjectZh: string;
  subjectEn: string;
  htmlZh: string;
  htmlEn: string;
  textZh: string;
  textEn: string;
  enabled: boolean;
  storageMode?: "postgres" | "memory";
};

const authServiceUrl = process.env.NEXT_PUBLIC_AUTH_SERVICE_URL ?? "http://localhost:4102";
const adminGatewayUrl = process.env.NEXT_PUBLIC_ADMIN_GATEWAY_URL ?? "http://localhost:4001";

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
  const [templates, setTemplates] = useState<NotificationEmailTemplate[]>([]);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState("");
  const [templateDraft, setTemplateDraft] = useState<NotificationEmailTemplate | null>(null);
  const [templateStatus, setTemplateStatus] = useState("加载中");
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);

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

    async function loadTemplates() {
      try {
        const response = await fetch(`${adminGatewayUrl}/notification/templates`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as NotificationEmailTemplate[];
        if (isMounted) {
          setTemplates(data);
          setSelectedTemplateKey(data[0]?.key ?? "");
          setTemplateDraft(data[0] ?? null);
          setTemplateStatus("已加载");
        }
      } catch (error) {
        if (isMounted) {
          setTemplateStatus(error instanceof Error ? error.message : "notification-service API 未连接");
        }
      }
    }

    void loadSettings();
    void loadTemplates();

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
      setStatus(
        message === "Failed to fetch" || message === "Internal server error" || message.startsWith("HTTP 5")
          ? "API 未连接，本地已保留修改"
          : message
      );
    } finally {
      setIsSaving(false);
    }
  }

  function selectTemplate(key: string) {
    const next = templates.find((template) => template.key === key) ?? null;
    setSelectedTemplateKey(key);
    setTemplateDraft(next);
  }

  async function saveTemplate() {
    if (!templateDraft) return;
    setIsSavingTemplate(true);
    setTemplateStatus("保存中");

    try {
      const response = await fetch(`${adminGatewayUrl}/notification/templates/${encodeURIComponent(templateDraft.key)}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "idempotency-key": `email-template:${templateDraft.key}:${Date.now()}`
        },
        body: JSON.stringify(templateDraft)
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? `HTTP ${response.status}`);
      }

      const saved = (await response.json()) as NotificationEmailTemplate;
      setTemplates((items) => items.map((item) => (item.key === saved.key ? saved : item)));
      setTemplateDraft(saved);
      setTemplateStatus(saved.storageMode === "memory" ? "已保存到内存，数据库未连接" : "已保存");
    } catch (error) {
      const message = error instanceof Error ? error.message : "保存失败";
      setTemplateStatus(message === "Internal server error" || message.startsWith("HTTP 5") ? "API 未连接，本地已保留修改" : message);
    } finally {
      setIsSavingTemplate(false);
    }
  }

  return (
    <>
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

      <AdminPanel
        eyebrow="Notification Templates"
        id="transactional-email-templates-title"
        status={templateStatus}
        title="事务邮件模板"
      >
        {templates.length === 0 || !templateDraft ? (
          <AdminListCard eyebrow="模板" title="暂无模板" description="notification-service 未连接时不会展示假模板。">
            <p className="mt-3 text-xs text-[var(--ink-soft)]">启动 notification-service 后会显示注册、付款成功、物流、评价等事务模板。</p>
          </AdminListCard>
        ) : (
          <div className="mt-5 grid gap-5 lg:grid-cols-[260px_1fr]">
            <div className="grid content-start gap-2">
              {templates.map((template) => (
                <button
                  key={template.key}
                  className={`border px-3 py-3 text-left text-sm ${
                    selectedTemplateKey === template.key ? "border-[var(--ink)] bg-[var(--paper-muted)]" : "border-[var(--line)] bg-white"
                  }`}
                  type="button"
                  onClick={() => selectTemplate(template.key)}
                >
                  <span className="block font-semibold">{template.nameZh}</span>
                  <span className="block text-xs text-[var(--ink-soft)]">{template.key}</span>
                </button>
              ))}
            </div>

            <div className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <AdminField label="中文模板名">
                  <AdminTextInput value={templateDraft.nameZh} onChange={(event) => setTemplateDraft({ ...templateDraft, nameZh: event.target.value })} />
                </AdminField>
                <AdminField label="英文模板名">
                  <AdminTextInput value={templateDraft.nameEn} onChange={(event) => setTemplateDraft({ ...templateDraft, nameEn: event.target.value })} />
                </AdminField>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <AdminField label="中文标题">
                  <AdminTextInput value={templateDraft.subjectZh} onChange={(event) => setTemplateDraft({ ...templateDraft, subjectZh: event.target.value })} />
                </AdminField>
                <AdminField label="英文标题">
                  <AdminTextInput value={templateDraft.subjectEn} onChange={(event) => setTemplateDraft({ ...templateDraft, subjectEn: event.target.value })} />
                </AdminField>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <AdminField label="中文 HTML">
                  <AdminTextarea rows={8} value={templateDraft.htmlZh} onChange={(event) => setTemplateDraft({ ...templateDraft, htmlZh: event.target.value })} />
                </AdminField>
                <AdminField label="英文 HTML">
                  <AdminTextarea rows={8} value={templateDraft.htmlEn} onChange={(event) => setTemplateDraft({ ...templateDraft, htmlEn: event.target.value })} />
                </AdminField>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <AdminField label="中文纯文本">
                  <AdminTextarea rows={5} value={templateDraft.textZh} onChange={(event) => setTemplateDraft({ ...templateDraft, textZh: event.target.value })} />
                </AdminField>
                <AdminField label="英文纯文本">
                  <AdminTextarea rows={5} value={templateDraft.textEn} onChange={(event) => setTemplateDraft({ ...templateDraft, textEn: event.target.value })} />
                </AdminField>
              </div>

              <AdminCheckbox
                checked={templateDraft.enabled}
                label="启用这个发送点模板"
                onChange={(event) => setTemplateDraft({ ...templateDraft, enabled: event.target.checked })}
              />
              <p className="text-xs text-[var(--ink-soft)]">
                可用变量示例：{"{{brandName}}"}、{"{{orderNumber}}"}、{"{{trackingNumber}}"}、{"{{reviewLinksText}}"}。HTML 内部链接使用 {"{{{reviewLinksHtml}}}"}，其他变量由服务端自动转义。
              </p>

              <AdminActionRow>
                <AdminPrimaryButton disabled={isSavingTemplate} type="button" onClick={saveTemplate}>
                  {isSavingTemplate ? "保存中" : "保存模板"}
                </AdminPrimaryButton>
                <AdminSecondaryButton type="button" onClick={() => selectTemplate(selectedTemplateKey)}>
                  放弃修改
                </AdminSecondaryButton>
                <AdminInlineStatus>{templateStatus}</AdminInlineStatus>
              </AdminActionRow>
            </div>
          </div>
        )}
      </AdminPanel>
    </>
  );
}
