"use client";

import { createRequestId } from "../lib/request-id.js";
import { localizedErrorMessage } from "@commerce/error-codes";
import { useEffect, useMemo, useState } from "react";
import {
  AdminActionRow,
  AdminHelpText,
  AdminInlineStatus,
  AdminListCard,
  AdminPanel,
  AdminSecondaryButton,
  AdminTextarea
} from "./admin-ui.js";

const adminGatewayUrl = process.env.NEXT_PUBLIC_ADMIN_GATEWAY_URL ?? "http://localhost:4001";

type DeadLetterTask = {
  id: string;
  sourceTaskId: string | null;
  taskType: string;
  aggregateType: string;
  aggregateId: string;
  status: string;
  failureCount: number;
  lastErrorSummary: string;
  correlationId: string;
  createdAt: string;
  handledAt: string | null;
  handlerId: string | null;
  decisionNote: string | null;
  auditTrail: DeadLetterAuditEvent[];
};

type DeadLetterAuditEvent = {
  id: string;
  action: string;
  actorId: string;
  decisionNote: string;
  oldStatus: string;
  newStatus: string;
  correlationId: string;
  clientIp: string | null;
  createdAt: string;
};

function formatDate(value: string | null) {
  if (!value) return "未处理";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC"
  }).format(date);
}

function shortId(value: string | null) {
  if (!value) return "无";
  return value.length > 13 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}

function statusLabel(value: string) {
  const labels: Record<string, string> = {
    open: "待处理",
    retrying: "已发起重试",
    discarded: "已作废",
    resolved: "已解决"
  };

  return labels[value] ?? value;
}

function auditActionLabel(value: string) {
  const labels: Record<string, string> = {
    retry: "人工重试",
    discard: "人工作废"
  };

  return labels[value] ?? value;
}

export function DeadLetterManagementPanel() {
  const [tasks, setTasks] = useState<DeadLetterTask[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("等待加载");
  const [isLoading, setIsLoading] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [discardingId, setDiscardingId] = useState<string | null>(null);

  async function loadTasks() {
    setIsLoading(true);
    setStatus("正在读取死信队列");

    try {
      const response = await fetch(`${adminGatewayUrl}/dead-letter-tasks`, {
        headers: {
          "x-correlation-id": createRequestId()
        }
      });
      const payload = (await response.json().catch(() => [])) as DeadLetterTask[] | { message?: string };

      if (!response.ok || !Array.isArray(payload)) {
        throw new Error(localizedErrorMessage(payload, response.status, "zh"));
      }

      setTasks(payload);
      setStatus(payload.length > 0 ? "已读取死信队列" : "暂无死信任务");
    } catch (error) {
      setTasks([]);
      setStatus(error instanceof Error && !(error instanceof TypeError) ? error.message : "DLQ API 未连接");
    } finally {
      setIsLoading(false);
    }
  }

  async function retryTask(task: DeadLetterTask) {
    setRetryingId(task.id);
    setStatus(`正在重试 ${shortId(task.id)}`);

    try {
      const response = await fetch(`${adminGatewayUrl}/dead-letter-tasks/${task.id}/retry`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-correlation-id": createRequestId()
        },
        body: JSON.stringify({
          handlerId: "admin",
          decisionNote: notes[task.id]?.trim() || "manual retry from admin UI"
        })
      });
      const payload = (await response.json().catch(() => ({}))) as { message?: string };

      if (!response.ok) {
        throw new Error(localizedErrorMessage(payload, response.status, "zh"));
      }

      setStatus("已发起人工重试");
      await loadTasks();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "人工重试失败");
    } finally {
      setRetryingId(null);
    }
  }

  async function discardTask(task: DeadLetterTask) {
    setDiscardingId(task.id);
    setStatus(`正在作废 ${shortId(task.id)}`);

    try {
      const response = await fetch(`${adminGatewayUrl}/dead-letter-tasks/${task.id}/discard`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-correlation-id": createRequestId()
        },
        body: JSON.stringify({
          handlerId: "admin",
          decisionNote: notes[task.id]?.trim() || "manual discard from admin UI"
        })
      });
      const payload = (await response.json().catch(() => ({}))) as { message?: string };

      if (!response.ok) {
        throw new Error(localizedErrorMessage(payload, response.status, "zh"));
      }

      setStatus("已作废死信任务");
      await loadTasks();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "人工作废失败");
    } finally {
      setDiscardingId(null);
    }
  }

  useEffect(() => {
    void loadTasks();
  }, []);

  const totals = useMemo(() => {
    return {
      open: tasks.filter((task) => task.status === "open").length,
      retrying: tasks.filter((task) => task.status === "retrying").length
    };
  }, [tasks]);

  return (
    <AdminPanel eyebrow="异步任务" id="dead-letter-title" status={status} title="死信队列">
      <AdminHelpText>
        这里读取 worker-service 的真实死信任务。补偿任务失败后必须能被运营看到、记录处理意见，并由后台发起人工重试。
      </AdminHelpText>

      <AdminActionRow className="mt-5">
        <AdminSecondaryButton disabled={isLoading} onClick={loadTasks} type="button">
          {isLoading ? "刷新中" : "刷新死信"}
        </AdminSecondaryButton>
        <AdminInlineStatus>
          死信数 {tasks.length}，待处理 {totals.open}，重试中 {totals.retrying}
        </AdminInlineStatus>
      </AdminActionRow>

      <div className="mt-5 grid gap-4">
        {tasks.length === 0 ? (
          <div className="rounded-md border border-dashed border-[var(--line)] bg-[var(--bg)] p-5 text-sm text-[var(--ink-soft)]">
            {status === "DLQ API 未连接" ? "worker-service 或管理网关未连接，本页没有伪造死信任务。" : "暂无死信任务。"}
          </div>
        ) : (
          tasks.map((task) => (
            <AdminListCard
              key={task.id}
              eyebrow={task.taskType}
              title={`${statusLabel(task.status)} · ${shortId(task.id)}`}
              description={`关联 ${task.aggregateType} ${shortId(task.aggregateId)} · trace ${shortId(task.correlationId)}`}
              action={
                task.status === "open" ? (
                  <span className="w-fit rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
                    待人工处理
                  </span>
                ) : null
              }
            >
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
                <div>
                  <dt className="text-[var(--ink-soft)]">失败次数</dt>
                  <dd className="mt-1 font-semibold">{task.failureCount}</dd>
                </div>
                <div>
                  <dt className="text-[var(--ink-soft)]">来源任务</dt>
                  <dd className="mt-1 font-semibold">{shortId(task.sourceTaskId)}</dd>
                </div>
                <div>
                  <dt className="text-[var(--ink-soft)]">创建时间</dt>
                  <dd className="mt-1 font-semibold">{formatDate(task.createdAt)}</dd>
                </div>
                <div>
                  <dt className="text-[var(--ink-soft)]">处理时间</dt>
                  <dd className="mt-1 font-semibold">{formatDate(task.handledAt)}</dd>
                </div>
                <div>
                  <dt className="text-[var(--ink-soft)]">处理人</dt>
                  <dd className="mt-1 font-semibold">{task.handlerId ?? "未处理"}</dd>
                </div>
                <div>
                  <dt className="text-[var(--ink-soft)]">处理意见</dt>
                  <dd className="mt-1 font-semibold">{task.decisionNote ?? "未填写"}</dd>
                </div>
              </dl>

              <div className="mt-4 rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-800" title={task.lastErrorSummary}>
                最后错误：{task.lastErrorSummary}
              </div>

              <div className="mt-4 rounded-md border border-[var(--line)] p-3">
                <p className="text-sm font-semibold">审计记录</p>
                {task.auditTrail.length === 0 ? (
                  <p className="mt-2 text-sm text-[var(--ink-soft)]">暂无人工处理审计。</p>
                ) : (
                  <ul className="mt-2 grid gap-2 text-sm">
                    {task.auditTrail.map((event) => (
                      <li className="rounded-md bg-[var(--bg)] p-3" key={event.id}>
                        <div className="font-semibold">
                          {auditActionLabel(event.action)} · {event.actorId} · {formatDate(event.createdAt)}
                        </div>
                        <div className="mt-1 text-[var(--ink-soft)]">
                          {event.oldStatus} → {event.newStatus} · trace {shortId(event.correlationId)}
                          {event.clientIp ? ` · IP ${event.clientIp}` : ""}
                        </div>
                        <div className="mt-1">{event.decisionNote}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {task.status === "open" ? (
                <div className="mt-4 grid gap-3">
                  <AdminTextarea
                    aria-label="人工处理意见"
                    onChange={(event) => setNotes((current) => ({ ...current, [task.id]: event.target.value }))}
                    placeholder="填写人工处理意见，例如：确认库存服务恢复，重新投递补偿任务"
                    value={notes[task.id] ?? ""}
                  />
                  <AdminActionRow>
                    <AdminSecondaryButton disabled={retryingId === task.id} onClick={() => retryTask(task)} type="button">
                      {retryingId === task.id ? "重试中" : "人工重试"}
                    </AdminSecondaryButton>
                    <AdminSecondaryButton disabled={discardingId === task.id} onClick={() => discardTask(task)} type="button">
                      {discardingId === task.id ? "作废中" : "人工作废"}
                    </AdminSecondaryButton>
                    <AdminInlineStatus>重试会重新投递来源任务，作废会保留处理记录。</AdminInlineStatus>
                  </AdminActionRow>
                </div>
              ) : null}
            </AdminListCard>
          ))
        )}
      </div>
    </AdminPanel>
  );
}
