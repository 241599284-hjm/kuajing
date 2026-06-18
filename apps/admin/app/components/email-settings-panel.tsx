"use client";

import { localizedErrorMessage } from "@commerce/error-codes";
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
  AdminSelect,
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
  verificationTokenTtlMinutes: number;
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
  providerTemplateId?: string;
  enabled: boolean;
  storageMode?: "postgres" | "memory";
};

type NotificationEmailLog = {
  id: string;
  recipientEmail: string;
  subject: string;
  templateKey?: string;
  provider: string;
  status: "sent" | "failed" | "rate_limited" | "duplicate";
  errorSummary?: string;
  correlationId: string;
  createdAt: string;
};

type EmailAccountRecord = {
  id: string;
  provider: string;
  label: string;
  fromEmailAddress: string;
  dailyLimit: number;
  usedCount: number;
  status: "active" | "quota_exhausted" | "disabled";
  failureCount: number;
  secretIdRef: string;
  secretKeyRef: string;
  usageDate: string;
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
  enabled: true,
  verificationTokenTtlMinutes: 30
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
  const [emailLogs, setEmailLogs] = useState<NotificationEmailLog[]>([]);
  const [emailAccounts, setEmailAccounts] = useState<EmailAccountRecord[]>([]);
  const [accountsStatus, setAccountsStatus] = useState("加载中");
  const [isSavingAccounts, setIsSavingAccounts] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadSettings() {
      try {
        const response = await fetch(`${authServiceUrl}/admin/email-settings`);
        const data = (await response.json().catch(() => ({}))) as EmailSettings;

        if (!response.ok) {
          throw new Error(localizedErrorMessage(data, response.status, "zh"));
        }

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
        const data = (await response.json().catch(() => ({}))) as NotificationEmailTemplate[] | { message?: string };
        if (!response.ok || !Array.isArray(data)) throw new Error(localizedErrorMessage(data, response.status, "zh"));
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

    async function loadEmailLogs() {
      try {
        const response = await fetch(`${adminGatewayUrl}/notification/email-logs`);
        const data = (await response.json().catch(() => ({}))) as NotificationEmailLog[] | { message?: string };
        if (!response.ok || !Array.isArray(data)) throw new Error(localizedErrorMessage(data, response.status, "zh"));
        if (isMounted) {
          setEmailLogs(data);
        }
      } catch {
        if (isMounted) {
          setEmailLogs([]);
        }
      }
    }

    async function loadEmailAccounts() {
      try {
        const response = await fetch(`${adminGatewayUrl}/notification/email-accounts`);
        const data = (await response.json().catch(() => ({}))) as EmailAccountRecord[] | { message?: string };
        if (!response.ok || !Array.isArray(data)) throw new Error(localizedErrorMessage(data, response.status, "zh"));
        if (isMounted) {
          setEmailAccounts(data);
          setAccountsStatus("已加载");
        }
      } catch (error) {
        if (isMounted) {
          setEmailAccounts([]);
          setAccountsStatus(error instanceof Error ? error.message : "notification-service API 未连接");
        }
      }
    }

    void loadSettings();
    void loadTemplates();
    void loadEmailLogs();
    void loadEmailAccounts();

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
          enabled: settings.enabled,
          verificationTokenTtlMinutes: settings.verificationTokenTtlMinutes
        })
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(localizedErrorMessage(body, response.status, "zh"));
      }

      const data = (await response.json()) as EmailSettings;
      setSettings(data);
      setSmtpPassword("");
      setClearSmtpPassword(false);
      setStatus("已保存");
    } catch (error) {
      setStatus(error instanceof TypeError ? "API 未连接，本地已保留修改" : error instanceof Error ? error.message : "保存失败");
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
        throw new Error(localizedErrorMessage(body, response.status, "zh"));
      }

      const saved = (await response.json()) as NotificationEmailTemplate;
      setTemplates((items) => items.map((item) => (item.key === saved.key ? saved : item)));
      setTemplateDraft(saved);
      setTemplateStatus(saved.storageMode === "memory" ? "已保存到内存，数据库未连接" : "已保存");
    } catch (error) {
      setTemplateStatus(error instanceof TypeError ? "API 未连接，本地已保留修改" : error instanceof Error ? error.message : "保存失败");
    } finally {
      setIsSavingTemplate(false);
    }
  }

  function downloadTemplateHtml(template: NotificationEmailTemplate) {
    const safeName = template.key.replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
    const blob = new Blob([template.htmlEn], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `hl-artisan-${safeName}.html`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function updateAccount(index: number, patch: Partial<EmailAccountRecord>) {
    setEmailAccounts((accounts) => accounts.map((account, currentIndex) => (currentIndex === index ? { ...account, ...patch } : account)));
  }

  function addAccount() {
    setEmailAccounts((accounts) => [
      ...accounts,
      {
        id: crypto.randomUUID(),
        provider: "tencent_ses",
        label: "Tencent SES",
        fromEmailAddress: settings.fromEmail,
        dailyLimit: 40,
        usedCount: 0,
        status: "active",
        failureCount: 0,
        secretIdRef: "env:TENCENT_SES_SECRET_ID",
        secretKeyRef: "env:TENCENT_SES_SECRET_KEY",
        usageDate: new Date().toISOString().slice(0, 10),
        storageMode: "memory"
      }
    ]);
  }

  async function saveAccounts() {
    setIsSavingAccounts(true);
    setAccountsStatus("保存中");

    try {
      const response = await fetch(`${adminGatewayUrl}/notification/email-accounts`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "idempotency-key": `email-accounts:${Date.now()}`
        },
        body: JSON.stringify({ accounts: emailAccounts })
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(localizedErrorMessage(body, response.status, "zh"));
      }

      const saved = (await response.json()) as EmailAccountRecord[];
      setEmailAccounts(saved);
      setAccountsStatus(saved.some((account) => account.storageMode === "memory") ? "已保存到内存，数据库未连接" : "已保存");
    } catch (error) {
      setAccountsStatus(error instanceof Error ? error.message : "保存失败");
    } finally {
      setIsSavingAccounts(false);
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

          <AdminField label="注册验证链接有效期（分钟）">
            <AdminNumberInput
              name="verificationTokenTtlMinutes"
              min={5}
              max={1440}
              value={settings.verificationTokenTtlMinutes}
              onChange={(event) => setSettings({ ...settings, verificationTokenTtlMinutes: Number(event.target.value) })}
              required
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
        eyebrow="Provider Pool"
        id="transactional-email-accounts-title"
        status={accountsStatus}
        title="邮件 API 账号池"
      >
        <div className="mt-5 grid gap-4">
          {emailAccounts.length === 0 ? (
            <AdminListCard eyebrow="账号池" title="暂无账号" description="notification-service 未连接时不会展示假账号。">
              <p className="mt-3 text-xs text-[var(--ink-soft)]">可新增腾讯云 SES、Mock 或其他事务邮件 Provider 账号，密钥只填写环境变量引用，不在后台明文保存真实密钥。</p>
            </AdminListCard>
          ) : null}

          {emailAccounts.map((account, index) => (
            <AdminListCard
              key={account.id}
              eyebrow={`${account.provider} · ${account.status}`}
              title={account.label}
              description={`今日额度 ${account.usedCount}/${account.dailyLimit} · ${account.usageDate}`}
            >
              <div className="mt-4 grid gap-4 lg:grid-cols-3">
                <AdminField label="Provider">
                  <AdminSelect value={account.provider} onChange={(event) => updateAccount(index, { provider: event.target.value })}>
                    <option value="mock">Mock</option>
                    <option value="tencent_ses">腾讯云 SES</option>
                    <option value="sendgrid">SendGrid</option>
                    <option value="amazon_ses">Amazon SES</option>
                  </AdminSelect>
                </AdminField>
                <AdminField label="账号名称">
                  <AdminTextInput value={account.label} onChange={(event) => updateAccount(index, { label: event.target.value })} />
                </AdminField>
                <AdminField label="状态">
                  <AdminSelect value={account.status} onChange={(event) => updateAccount(index, { status: event.target.value as EmailAccountRecord["status"] })}>
                    <option value="active">启用</option>
                    <option value="quota_exhausted">额度耗尽</option>
                    <option value="disabled">禁用</option>
                  </AdminSelect>
                </AdminField>
                <AdminField label="发件人">
                  <AdminTextInput value={account.fromEmailAddress} onChange={(event) => updateAccount(index, { fromEmailAddress: event.target.value })} />
                </AdminField>
                <AdminField label="每日额度">
                  <AdminNumberInput min={1} value={account.dailyLimit} onChange={(event) => updateAccount(index, { dailyLimit: Number(event.target.value) })} />
                </AdminField>
                <AdminField label="今日已用">
                  <AdminNumberInput min={0} value={account.usedCount} onChange={(event) => updateAccount(index, { usedCount: Number(event.target.value) })} />
                </AdminField>
                <AdminField label="SecretId 引用">
                  <AdminTextInput value={account.secretIdRef} onChange={(event) => updateAccount(index, { secretIdRef: event.target.value })} />
                </AdminField>
                <AdminField label="SecretKey 引用">
                  <AdminTextInput value={account.secretKeyRef} onChange={(event) => updateAccount(index, { secretKeyRef: event.target.value })} />
                </AdminField>
                <AdminField label="失败次数">
                  <AdminNumberInput min={0} value={account.failureCount} onChange={(event) => updateAccount(index, { failureCount: Number(event.target.value) })} />
                </AdminField>
              </div>
              <AdminActionRow className="mt-4">
                <AdminSecondaryButton
                  type="button"
                  onClick={() => setEmailAccounts((accounts) => accounts.filter((_, currentIndex) => currentIndex !== index))}
                >
                  删除账号
                </AdminSecondaryButton>
              </AdminActionRow>
            </AdminListCard>
          ))}

          <AdminActionRow>
            <AdminSecondaryButton type="button" onClick={addAccount}>
              新增账号
            </AdminSecondaryButton>
            <AdminPrimaryButton disabled={isSavingAccounts || emailAccounts.length === 0} type="button" onClick={() => void saveAccounts()}>
              {isSavingAccounts ? "保存中" : "保存账号池"}
            </AdminPrimaryButton>
            <AdminInlineStatus>{accountsStatus}</AdminInlineStatus>
          </AdminActionRow>
        </div>
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

              <AdminField label="腾讯云 TemplateID">
                <AdminTextInput
                  value={templateDraft.providerTemplateId ?? ""}
                  onChange={(event) => setTemplateDraft({ ...templateDraft, providerTemplateId: event.target.value || undefined })}
                  placeholder="审核通过后填写，例如 186539"
                />
              </AdminField>

              <div className="grid gap-4 lg:grid-cols-2">
                <AdminField label="中文 HTML">
                  <AdminTextarea rows={8} value={templateDraft.htmlZh} onChange={(event) => setTemplateDraft({ ...templateDraft, htmlZh: event.target.value })} />
                </AdminField>
                <AdminField label="英文 HTML">
                  <AdminTextarea rows={8} value={templateDraft.htmlEn} onChange={(event) => setTemplateDraft({ ...templateDraft, htmlEn: event.target.value })} />
                </AdminField>
              </div>

              <AdminListCard eyebrow="Preview" title="英文邮件预览" description={templateDraft.subjectEn}>
                <iframe
                  className="mt-3 h-48 w-full border border-[var(--line)] bg-white"
                  sandbox=""
                  srcDoc={templateDraft.htmlEn}
                  title="英文邮件 HTML 预览"
                />
              </AdminListCard>

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
                可用变量示例：{"{{brandName}}"}、{"{{orderNumber}}"}、{"{{trackingNumber}}"}、{"{{expiresInMinutes}}"}、{"{{reviewLinksText}}"}。HTML 内部链接使用 {"{{{reviewLinksHtml}}}"}，其他变量由服务端自动转义。
              </p>

              <AdminActionRow>
                <AdminPrimaryButton disabled={isSavingTemplate} type="button" onClick={saveTemplate}>
                  {isSavingTemplate ? "保存中" : "保存模板"}
                </AdminPrimaryButton>
                <AdminSecondaryButton type="button" onClick={() => downloadTemplateHtml(templateDraft)}>
                  下载英文 HTML
                </AdminSecondaryButton>
                <AdminSecondaryButton type="button" onClick={() => selectTemplate(selectedTemplateKey)}>
                  放弃修改
                </AdminSecondaryButton>
                <AdminInlineStatus>{templateStatus}</AdminInlineStatus>
              </AdminActionRow>
            </div>
          </div>
        )}
      </AdminPanel>

      <AdminPanel
        eyebrow="Notification Logs"
        id="transactional-email-logs-title"
        status={`${emailLogs.length} 条`}
        title="邮件发送日志"
      >
        <div className="mt-5 grid gap-3">
          {emailLogs.length === 0 ? (
            <AdminListCard eyebrow="日志" title="暂无发送记录" description="没有读取到真实邮件发送日志；不会生成示例日志。">
              <p className="mt-3 text-xs text-[var(--ink-soft)]">触发注册、订单、物流或评价邮件后，这里会显示真实发送结果。</p>
            </AdminListCard>
          ) : null}
          {emailLogs.map((log) => (
            <AdminListCard
              key={log.id}
              eyebrow={log.status === "sent" ? "已发送" : log.status === "duplicate" ? "重复请求" : log.status === "rate_limited" ? "限流" : "失败"}
              title={log.subject}
              description={`${log.templateKey ?? "自定义邮件"} · ${log.recipientEmail}`}
            >
              <div className="mt-3 grid gap-2 text-xs text-[var(--ink-soft)] md:grid-cols-2">
                <p>服务商：{log.provider}</p>
                <p>时间：{new Date(log.createdAt).toLocaleString()}</p>
                <p className="break-all">Trace：{log.correlationId}</p>
                <p>{log.errorSummary ? `失败原因：${log.errorSummary}` : "失败原因：无"}</p>
              </div>
            </AdminListCard>
          ))}
        </div>
      </AdminPanel>
    </>
  );
}
