"use client";

import { createRequestId } from "../lib/request-id.js";

import { localizedErrorMessage } from "@commerce/error-codes";
import { useEffect, useMemo, useState } from "react";
import {
  AdminActionRow,
  AdminField,
  AdminHelpText,
  AdminInlineStatus,
  AdminListCard,
  AdminPanel,
  AdminPrimaryButton,
  AdminSecondaryButton,
  AdminSelect,
  AdminTextInput
} from "./admin-ui.js";

const adminGatewayUrl = process.env.NEXT_PUBLIC_ADMIN_GATEWAY_URL ?? "http://localhost:4001";

type LogisticsAccount = {
  id: string;
  provider: string;
  accountName: string;
  apiEndpoint: string | null;
  apiKeyMasked: string | null;
  monthlyLimit: number;
  usedCount: number;
  status: "active" | "quota_exhausted" | "disabled";
  sortOrder: number;
  resetAt: string | null;
};

type LogisticsLog = {
  id: string;
  trackingNumber: string;
  provider: string;
  accountName: string;
  status: string;
  errorSummary: string | null;
  consumedQuota: boolean;
  correlationId: string;
  createdAt: string;
};

type TrackingEvent = {
  occurredAt: string;
  status: string;
  location: string;
  descriptionEn: string;
  descriptionZh: string;
};

type TrackingRecord = {
  trackingNumber: string;
  carrier: string;
  status: string;
  statusLabel: {
    en: string;
    zh: string;
  };
  events: TrackingEvent[];
  provider: string;
  providerMode: "mock" | "external";
  cachedAt: string;
  expiresAt: string | null;
  terminal: boolean;
  storageMode: "postgres" | "memory";
  source: "cache" | "provider";
};

function formatDate(value: string | null) {
  if (!value) return "永久缓存";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC"
  }).format(date);
}

function shortId(value: string) {
  return value.length > 14 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}

function createMockAccount(): LogisticsAccount {
  return {
    id: createRequestId(),
    provider: "mock",
    accountName: "Local Mock Logistics",
    apiEndpoint: null,
    apiKeyMasked: null,
    monthlyLimit: 999999,
    usedCount: 0,
    status: "active",
    sortOrder: 0,
    resetAt: null
  };
}

export function LogisticsManagementPanel() {
  const [accounts, setAccounts] = useState<LogisticsAccount[]>([]);
  const [logs, setLogs] = useState<LogisticsLog[]>([]);
  const [trackingNumber, setTrackingNumber] = useState("YT202606150001");
  const [tracking, setTracking] = useState<TrackingRecord | null>(null);
  const [status, setStatus] = useState("等待加载");
  const [isLoading, setIsLoading] = useState(false);

  async function loadLogistics() {
    setIsLoading(true);
    setStatus("正在读取物流配置");

    try {
      const [accountsResponse, logsResponse] = await Promise.all([
        fetch(`${adminGatewayUrl}/logistics/api-accounts`, {
          headers: { "x-correlation-id": createRequestId() }
        }),
        fetch(`${adminGatewayUrl}/logistics/api-call-logs`, {
          headers: { "x-correlation-id": createRequestId() }
        })
      ]);
      const accountsPayload = (await accountsResponse.json().catch(() => ({}))) as { accounts?: LogisticsAccount[]; storageMode?: string; message?: string };
      const logsPayload = (await logsResponse.json().catch(() => ({}))) as { logs?: LogisticsLog[]; storageMode?: string; message?: string };

      if (!accountsResponse.ok) {
        throw new Error(localizedErrorMessage(accountsPayload, accountsResponse.status, "zh"));
      }

      setAccounts(accountsPayload.accounts ?? []);
      setLogs(logsPayload.logs ?? []);
      setStatus(`已读取物流配置（${accountsPayload.storageMode ?? "unknown"}）`);
    } catch (error) {
      setAccounts([]);
      setLogs([]);
      setStatus(error instanceof Error ? error.message : "物流 API 未连接");
    } finally {
      setIsLoading(false);
    }
  }

  async function saveAccounts(nextAccounts: LogisticsAccount[]) {
    setStatus("正在保存物流 API 账号池");

    try {
      const response = await fetch(`${adminGatewayUrl}/logistics/api-accounts`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "x-correlation-id": createRequestId()
        },
        body: JSON.stringify({ accounts: nextAccounts })
      });
      const payload = (await response.json().catch(() => ({}))) as { accounts?: LogisticsAccount[]; storageMode?: string; message?: string };

      if (!response.ok) {
        throw new Error(localizedErrorMessage(payload, response.status, "zh"));
      }

      setAccounts(payload.accounts ?? nextAccounts);
      setStatus(`已保存物流配置（${payload.storageMode ?? "unknown"}）`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "物流配置保存失败");
    }
  }

  async function queryTracking(forceRefresh = false) {
    setStatus(forceRefresh ? "正在强制刷新轨迹" : "正在查询轨迹");

    try {
      const response = await fetch(
        forceRefresh ? `${adminGatewayUrl}/logistics/tracking/refresh` : `${adminGatewayUrl}/logistics/tracking/${encodeURIComponent(trackingNumber)}`,
        {
          method: forceRefresh ? "POST" : "GET",
          headers: {
            "content-type": "application/json",
            "x-correlation-id": createRequestId()
          },
          body: forceRefresh ? JSON.stringify({ trackingNumber }) : undefined
        }
      );
      const payload = (await response.json().catch(() => ({}))) as TrackingRecord | { message?: string };

      if (!response.ok || !("trackingNumber" in payload)) {
        throw new Error(localizedErrorMessage(payload, response.status, "zh"));
      }

      setTracking(payload);
      setStatus(payload.providerMode === "mock" ? "已读取本地 Mock 轨迹" : "已读取真实 Provider 轨迹");
      await loadLogistics();
    } catch (error) {
      setTracking(null);
      setStatus(error instanceof Error ? error.message : "物流轨迹查询失败");
    }
  }

  function updateAccount(index: number, patch: Partial<LogisticsAccount>) {
    setAccounts((current) => current.map((account, accountIndex) => (accountIndex === index ? { ...account, ...patch } : account)));
  }

  useEffect(() => {
    void loadLogistics();
  }, []);

  const totals = useMemo(() => {
    return {
      active: accounts.filter((account) => account.status === "active").length,
      logs: logs.length
    };
  }, [accounts, logs]);

  return (
    <div className="grid gap-6">
      <AdminPanel eyebrow="跨境物流" id="logistics-query-title" status={status} title="物流轨迹查询">
        <AdminHelpText>
          物流查询通过 logistics-service 输出标准化 JSON，自研前台页面只展示本地数据结构，不嵌入第三方 iframe。当前未配置真实 Provider 时会明确使用 Mock 轨迹，不伪装生产查询。
        </AdminHelpText>
        <AdminActionRow className="mt-5">
          <AdminField className="w-full max-w-md" label="物流单号">
            <AdminTextInput value={trackingNumber} onChange={(event) => setTrackingNumber(event.target.value)} />
          </AdminField>
          <AdminPrimaryButton disabled={isLoading} onClick={() => void queryTracking(false)} type="button">
            查询轨迹
          </AdminPrimaryButton>
          <AdminSecondaryButton disabled={isLoading} onClick={() => void queryTracking(true)} type="button">
            刷新 Provider
          </AdminSecondaryButton>
        </AdminActionRow>

        {tracking ? (
          <AdminListCard
            eyebrow={`${tracking.providerMode.toUpperCase()} · ${tracking.source}`}
            title={`${tracking.trackingNumber} · ${tracking.statusLabel.zh}`}
            description={`${tracking.carrier} · 缓存到期：${formatDate(tracking.expiresAt)} · ${tracking.storageMode}`}
          >
            <div className="mt-4 grid gap-3">
              {tracking.events.map((event) => (
                <div key={`${event.occurredAt}-${event.status}`} className="border-l border-black pl-4">
                  <p className="text-sm font-semibold">{event.descriptionZh}</p>
                  <p className="mt-1 text-xs text-[var(--ink-soft)]">{formatDate(event.occurredAt)} · {event.location}</p>
                </div>
              ))}
            </div>
          </AdminListCard>
        ) : null}
      </AdminPanel>

      <AdminPanel eyebrow="Provider" id="logistics-provider-title" status={`可用 ${totals.active} 个`} title="物流 API 账号池">
        <AdminHelpText>
          这里维护 17TRACK、TrackingMore、Ship24 或 Mock 账号的轮询顺序、额度和状态。密钥保存后只返回脱敏值，前端不展示明文。
        </AdminHelpText>
        <AdminActionRow className="mt-5">
          <AdminSecondaryButton
            onClick={() => setAccounts((current) => [...current, { ...createMockAccount(), sortOrder: current.length }])}
            type="button"
          >
            新增账号
          </AdminSecondaryButton>
          <AdminPrimaryButton onClick={() => void saveAccounts(accounts)} type="button">
            保存账号池
          </AdminPrimaryButton>
          <AdminInlineStatus>调用日志 {totals.logs} 条</AdminInlineStatus>
        </AdminActionRow>

        <div className="mt-5 grid gap-4">
          {accounts.length === 0 ? (
            <div className="rounded-md border border-dashed border-[var(--line)] bg-[var(--bg)] p-5 text-sm text-[var(--ink-soft)]">
              暂无账号。未配置账号时，服务只使用明确标识的本地 Mock Provider。
            </div>
          ) : (
            accounts.map((account, index) => (
              <AdminListCard
                key={account.id}
                eyebrow={account.provider}
                title={account.accountName}
                description={`已用 ${account.usedCount}/${account.monthlyLimit} · ${account.apiKeyMasked ?? "未配置密钥"}`}
                action={
                  <AdminSecondaryButton
                    onClick={() => setAccounts((current) => current.filter((item) => item.id !== account.id))}
                    type="button"
                  >
                    删除
                  </AdminSecondaryButton>
                }
              >
                <div className="mt-4 grid gap-4 md:grid-cols-5">
                  <AdminField label="Provider">
                    <AdminSelect value={account.provider} onChange={(event) => updateAccount(index, { provider: event.target.value })}>
                      <option value="mock">mock</option>
                      <option value="17track">17TRACK</option>
                      <option value="trackingmore">TrackingMore</option>
                      <option value="ship24">Ship24</option>
                    </AdminSelect>
                  </AdminField>
                  <AdminField label="账号名称">
                    <AdminTextInput value={account.accountName} onChange={(event) => updateAccount(index, { accountName: event.target.value })} />
                  </AdminField>
                  <AdminField label="月度额度">
                    <AdminTextInput
                      inputMode="numeric"
                      value={account.monthlyLimit}
                      onChange={(event) => updateAccount(index, { monthlyLimit: Number(event.target.value) || 0 })}
                    />
                  </AdminField>
                  <AdminField label="状态">
                    <AdminSelect value={account.status} onChange={(event) => updateAccount(index, { status: event.target.value as LogisticsAccount["status"] })}>
                      <option value="active">正常</option>
                      <option value="quota_exhausted">额度耗尽</option>
                      <option value="disabled">禁用</option>
                    </AdminSelect>
                  </AdminField>
                  <AdminField label="排序">
                    <AdminTextInput
                      inputMode="numeric"
                      value={account.sortOrder}
                      onChange={(event) => updateAccount(index, { sortOrder: Number(event.target.value) || 0 })}
                    />
                  </AdminField>
                </div>
              </AdminListCard>
            ))
          )}
        </div>
      </AdminPanel>

      <AdminPanel eyebrow="日志" id="logistics-logs-title" status={`${logs.length} 条`} title="物流 API 调用日志">
        <div className="mt-5 grid gap-3">
          {logs.length === 0 ? (
            <div className="rounded-md border border-dashed border-[var(--line)] bg-[var(--bg)] p-5 text-sm text-[var(--ink-soft)]">
              暂无调用日志。
            </div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="rounded-md border border-[var(--line)] p-4 text-sm">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <p className="font-semibold">{log.trackingNumber} · {log.status}</p>
                  <p className="text-xs text-[var(--ink-soft)]">{formatDate(log.createdAt)}</p>
                </div>
                <p className="mt-2 text-[var(--ink-soft)]">
                  {log.provider}/{log.accountName} · trace {shortId(log.correlationId)} · {log.consumedQuota ? "已消耗额度" : "未消耗额度"}
                </p>
                {log.errorSummary ? <p className="mt-2 text-red-700">{log.errorSummary}</p> : null}
              </div>
            ))
          )}
        </div>
      </AdminPanel>
    </div>
  );
}
