"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  AdminField,
  AdminHelpText,
  AdminInlineStatus,
  AdminListCard,
  AdminPanel,
  AdminPrimaryButton,
  AdminSecondaryButton,
  AdminTextInput,
  AdminTextarea,
  AdminCheckbox
} from "./admin-ui.js";

const adminGatewayUrl = process.env.NEXT_PUBLIC_ADMIN_GATEWAY_URL ?? "http://localhost:4001";

type OpsSettings = {
  ssl: {
    domain: string;
    issuer: "lets_encrypt";
    forceHttps: boolean;
    expiresAt: string | null;
    autoRenew: boolean;
    lastCheckAt: string | null;
  };
  cdn: {
    provider: "cloudflare_free";
    enabled: boolean;
    cacheHitRate: number;
    realIpHeaderEnabled: boolean;
    attackProtectionEnabled: boolean;
    noCachePaths: string[];
  };
  analytics: {
    ga4MeasurementId: string;
    gscVerificationCode: string;
    enabled: boolean;
    anonymizeIp: boolean;
    ecommerceEventsEnabled: boolean;
  };
};

type AuditEvent = {
  id: string;
  action: string;
  actor: string;
  summary: string;
  correlationId: string;
  createdAt: string;
};

const defaultSettings: OpsSettings = {
  ssl: {
    domain: "[WEBSITE_DOMAIN]",
    issuer: "lets_encrypt",
    forceHttps: true,
    expiresAt: "",
    autoRenew: true,
    lastCheckAt: ""
  },
  cdn: {
    provider: "cloudflare_free",
    enabled: false,
    cacheHitRate: 0,
    realIpHeaderEnabled: true,
    attackProtectionEnabled: true,
    noCachePaths: ["/api/*", "/admin/*", "/checkout", "/payment-result", "/track-order", "/products/*/reviews"]
  },
  analytics: {
    ga4MeasurementId: "",
    gscVerificationCode: "",
    enabled: false,
    anonymizeIp: true,
    ecommerceEventsEnabled: true
  }
};

export function OpsManagementPanel() {
  const [settings, setSettings] = useState<OpsSettings>(defaultSettings);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [status, setStatus] = useState("正在读取运维配置...");
  const [storageMode, setStorageMode] = useState<"postgres" | "memory" | "unknown">("unknown");

  async function load() {
    try {
      const [settingsResponse, auditResponse] = await Promise.all([
        fetch(`${adminGatewayUrl}/ops/settings`, { headers: { "x-correlation-id": crypto.randomUUID() } }),
        fetch(`${adminGatewayUrl}/ops/audit-events`, { headers: { "x-correlation-id": crypto.randomUUID() } })
      ]);
      const settingsPayload = await settingsResponse.json();
      const auditPayload = await auditResponse.json();

      if (!settingsResponse.ok) throw new Error(settingsPayload.message ?? "ops settings unavailable");

      setSettings(settingsPayload.settings ?? defaultSettings);
      setStorageMode(settingsPayload.storageMode ?? "unknown");
      setAuditEvents(Array.isArray(auditPayload.events) ? auditPayload.events : []);
      setStatus(settingsPayload.storageMode === "postgres" ? "已读取真实运维配置" : "运维服务使用内存降级，未伪造生产持久化");
    } catch {
      setSettings(defaultSettings);
      setAuditEvents([]);
      setStorageMode("unknown");
      setStatus("运维 API 未连接，当前仅显示默认配置。");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("正在保存运维配置...");

    try {
      const response = await fetch(`${adminGatewayUrl}/ops/settings`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-correlation-id": crypto.randomUUID(),
          "x-admin-actor": "local-admin"
        },
        body: JSON.stringify(settings)
      });
      const payload = await response.json();

      if (!response.ok) throw new Error(payload.message ?? "save failed");

      setSettings(payload.settings);
      setStorageMode(payload.storageMode ?? "unknown");
      setStatus(payload.storageMode === "postgres" ? "运维配置已保存" : "配置仅保存到内存降级层，请连接 PostgreSQL 后再交付。");
      await load();
    } catch {
      setStatus("保存失败，未假装成功。");
    }
  }

  async function runAction(action: string) {
    setStatus(`正在记录 ${action} 操作...`);
    try {
      const response = await fetch(`${adminGatewayUrl}/ops/actions/${action}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-correlation-id": crypto.randomUUID(),
          "x-admin-actor": "local-admin"
        },
        body: JSON.stringify({ requestedAt: new Date().toISOString() })
      });
      const payload = await response.json();

      if (!response.ok) throw new Error(payload.message ?? "action failed");

      setStatus(payload.message ?? "运维动作已记录。真实云 API 执行器待接入。");
      await load();
    } catch {
      setStatus("运维动作失败，未假装执行成功。");
    }
  }

  return (
    <AdminPanel id="ops-management" eyebrow="免费服务" title="SSL / CDN / 统计配置" status={`存储：${storageMode}`}>
      <AdminHelpText>
        管理 Let's Encrypt、Cloudflare 免费 CDN、GA4/GSC 免费统计的配置入口。当前版本记录配置和操作审计，不伪装真实云端执行。
      </AdminHelpText>

      <form className="mt-6 grid gap-5" onSubmit={save}>
        <AdminListCard eyebrow="SSL" title="HTTPS 证书" description="仅允许 Let's Encrypt 官方可信证书。">
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <AdminField label="证书域名">
              <AdminTextInput value={settings.ssl.domain} onChange={(event) => setSettings({ ...settings, ssl: { ...settings.ssl, domain: event.target.value } })} />
            </AdminField>
            <AdminField label="到期时间">
              <AdminTextInput value={settings.ssl.expiresAt ?? ""} onChange={(event) => setSettings({ ...settings, ssl: { ...settings.ssl, expiresAt: event.target.value } })} placeholder="2026-12-31T00:00:00Z" />
            </AdminField>
            <AdminCheckbox label="强制 HTTPS 301 跳转" checked={settings.ssl.forceHttps} onChange={(event) => setSettings({ ...settings, ssl: { ...settings.ssl, forceHttps: event.target.checked } })} />
            <AdminCheckbox label="自动续期" checked={settings.ssl.autoRenew} onChange={(event) => setSettings({ ...settings, ssl: { ...settings.ssl, autoRenew: event.target.checked } })} />
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <AdminSecondaryButton type="button" onClick={() => runAction("ssl-renew")}>手动续签</AdminSecondaryButton>
            <AdminSecondaryButton type="button" onClick={() => runAction("http-scan")}>检测 HTTP 资源</AdminSecondaryButton>
          </div>
        </AdminListCard>

        <AdminListCard eyebrow="CDN" title="Cloudflare 免费 CDN" description="动态接口不缓存规则必须保留。">
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <AdminCheckbox label="启用 Cloudflare 免费 CDN" checked={settings.cdn.enabled} onChange={(event) => setSettings({ ...settings, cdn: { ...settings.cdn, enabled: event.target.checked } })} />
            <AdminCheckbox label="启用真实 IP 回传" checked={settings.cdn.realIpHeaderEnabled} onChange={(event) => setSettings({ ...settings, cdn: { ...settings.cdn, realIpHeaderEnabled: event.target.checked } })} />
            <AdminCheckbox label="启用基础攻击防护" checked={settings.cdn.attackProtectionEnabled} onChange={(event) => setSettings({ ...settings, cdn: { ...settings.cdn, attackProtectionEnabled: event.target.checked } })} />
            <AdminField label="当前缓存命中率">
              <AdminTextInput value={`${settings.cdn.cacheHitRate}%`} readOnly />
            </AdminField>
            <AdminField label="动态接口不缓存白名单" className="md:col-span-2">
              <AdminTextarea
                value={settings.cdn.noCachePaths.join("\n")}
                onChange={(event) => setSettings({ ...settings, cdn: { ...settings.cdn, noCachePaths: event.target.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean) } })}
              />
            </AdminField>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <AdminSecondaryButton type="button" onClick={() => runAction("cdn-purge-all")}>刷新全站缓存</AdminSecondaryButton>
            <AdminSecondaryButton type="button" onClick={() => runAction("cdn-purge-path")}>刷新指定路径</AdminSecondaryButton>
          </div>
        </AdminListCard>

        <AdminListCard eyebrow="Analytics" title="GA4 + GSC 免费统计" description="统计代码失败不得阻塞前台页面。">
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <AdminField label="GA4 Measurement ID">
              <AdminTextInput value={settings.analytics.ga4MeasurementId} onChange={(event) => setSettings({ ...settings, analytics: { ...settings.analytics, ga4MeasurementId: event.target.value } })} />
            </AdminField>
            <AdminField label="GSC 验证代码">
              <AdminTextInput value={settings.analytics.gscVerificationCode} onChange={(event) => setSettings({ ...settings, analytics: { ...settings.analytics, gscVerificationCode: event.target.value } })} />
            </AdminField>
            <AdminCheckbox label="启用统计" checked={settings.analytics.enabled} onChange={(event) => setSettings({ ...settings, analytics: { ...settings.analytics, enabled: event.target.checked } })} />
            <AdminCheckbox label="IP 匿名化" checked={settings.analytics.anonymizeIp} onChange={(event) => setSettings({ ...settings, analytics: { ...settings.analytics, anonymizeIp: event.target.checked } })} />
            <AdminCheckbox label="启用电商事件" checked={settings.analytics.ecommerceEventsEnabled} onChange={(event) => setSettings({ ...settings, analytics: { ...settings.analytics, ecommerceEventsEnabled: event.target.checked } })} />
          </div>
          <div className="mt-4">
            <AdminSecondaryButton type="button" onClick={() => runAction("analytics-test")}>记录统计检测</AdminSecondaryButton>
          </div>
        </AdminListCard>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <AdminPrimaryButton type="submit">保存运维配置</AdminPrimaryButton>
          <AdminInlineStatus>{status}</AdminInlineStatus>
        </div>
      </form>

      <div className="mt-8">
        <h3 className="text-lg font-semibold">最近运维审计</h3>
        <div className="mt-3 grid gap-3">
          {auditEvents.length === 0 ? <p className="text-sm text-[var(--ink-soft)]">暂无审计记录。</p> : null}
          {auditEvents.slice(0, 8).map((event) => (
            <div key={event.id} className="rounded-md border border-[var(--line)] p-3 text-sm">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <p className="font-semibold">{event.summary}</p>
                <span className="text-xs text-[var(--ink-soft)]">{new Date(event.createdAt).toLocaleString()}</span>
              </div>
              <p className="mt-1 text-xs text-[var(--ink-soft)]">{event.action} · {event.actor} · {event.correlationId}</p>
            </div>
          ))}
        </div>
      </div>
    </AdminPanel>
  );
}
