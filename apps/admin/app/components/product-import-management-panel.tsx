"use client";

import { createRequestId } from "../lib/request-id.js";

import { localizedErrorMessage } from "@commerce/error-codes";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AdminCheckbox,
  AdminField,
  AdminHelpText,
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

const adminGatewayUrl = process.env.NEXT_PUBLIC_ADMIN_GATEWAY_URL ?? "http://localhost:4001";

type AiMode = "disabled" | "api";

type ProductImportConfig = {
  copywriting: {
    mode: AiMode;
    apiUrl: string;
    templateName: string;
    defaultPrompt: string;
    titleMaxLength: number;
    detailMaxLength: number;
  };
  image: {
    mode: AiMode;
    apiUrl: string;
    defaultPrompt: string;
    mainImageCount: number;
    galleryImageCount: number;
    detailImageCount: number;
    fallbackToSourceImages: boolean;
  };
  queue: {
    maxImportUrls: number;
    concurrency: number;
    timeoutSeconds: number;
  };
};

type ImportDraft = {
  sku: string;
  nameZh: string;
  nameEn: string;
  shortTitleEn: string;
  keywords: string;
  subtitleEn: string;
  category: string;
  region: string;
  priceMinor: number;
  originalPriceMinor: number;
  currency: string;
  materialZh: string;
  materialEn: string;
  originZh: string;
  originEn: string;
  originCountry: string;
  capacityZh: string;
  capacityEn: string;
  hsCode: string;
  packageLengthMm: number;
  packageWidthMm: number;
  packageHeightMm: number;
  weightGrams: number;
  customsDeclarationZh: string;
  customsDeclarationEn: string;
  detailZh: string;
  detailEn: string;
  afterSalesEn: string;
  usageNotesEn: string;
  tags: string[];
  mainImageUrl: string;
  galleryImageUrls: string[];
  detailImageUrls: string[];
};

type ImportTask = {
  id: string;
  sourceUrl: string;
  sourceTitle: string;
  status: "pending" | "blocked_missing_provider" | "editing" | "published" | "failed";
  copyStatus: string;
  imageStatus: string;
  failureReason: string | null;
  draft: ImportDraft;
  createdBy: string;
  publishedProductId: string | null;
  createdAt: string;
  updatedAt: string;
};

type ImportListPayload = {
  items: ImportTask[];
  total: number;
  storageMode: "postgres" | "memory";
};

const defaultConfig: ProductImportConfig = {
  copywriting: {
    mode: "disabled",
    apiUrl: "",
    templateName: "premium-minimal-teaware",
    defaultPrompt: "Rewrite imported teaware product copy in a premium minimal cross-border ecommerce tone.",
    titleMaxLength: 90,
    detailMaxLength: 2200
  },
  image: {
    mode: "disabled",
    apiUrl: "",
    defaultPrompt: "Premium minimal teaware product photography, white background, natural light.",
    mainImageCount: 1,
    galleryImageCount: 4,
    detailImageCount: 6,
    fallbackToSourceImages: true
  },
  queue: {
    maxImportUrls: 500,
    concurrency: 2,
    timeoutSeconds: 45
  }
};

function formatMoney(minor: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(minor / 100);
}

function statusLabel(status: ImportTask["status"]) {
  const labels: Record<ImportTask["status"], string> = {
    pending: "待处理",
    blocked_missing_provider: "缺少 Provider",
    editing: "编辑中",
    published: "已发布",
    failed: "失败"
  };
  return labels[status];
}

export function ProductImportManagementPanel() {
  const [config, setConfig] = useState<ProductImportConfig>(defaultConfig);
  const [tasks, setTasks] = useState<ImportTask[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [importText, setImportText] = useState("");
  const [status, setStatus] = useState("正在读取商品导入配置...");
  const [storageMode, setStorageMode] = useState<"postgres" | "memory" | "unknown">("unknown");

  const selectedTask = useMemo(() => tasks.find((task) => task.id === selectedId) ?? tasks[0], [selectedId, tasks]);

  async function load() {
    try {
      const [configResponse, tasksResponse] = await Promise.all([
        fetch(`${adminGatewayUrl}/product-import/config`, { headers: { "x-correlation-id": createRequestId() } }),
        fetch(`${adminGatewayUrl}/product-import/imports`, { headers: { "x-correlation-id": createRequestId() } })
      ]);
      const configPayload = await configResponse.json();
      const tasksPayload = (await tasksResponse.json()) as ImportListPayload;

      if (!configResponse.ok) {
        throw new Error(localizedErrorMessage(configPayload, configResponse.status, "zh"));
      }
      if (!tasksResponse.ok) {
        throw new Error(localizedErrorMessage(tasksPayload, tasksResponse.status, "zh"));
      }

      setConfig(configPayload.config ?? defaultConfig);
      setStorageMode(configPayload.storageMode ?? tasksPayload.storageMode ?? "unknown");
      setTasks(Array.isArray(tasksPayload.items) ? tasksPayload.items : []);
      setStatus(configPayload.storageMode === "postgres" ? "已连接商品导入服务" : "商品导入服务使用内存降级，未伪造生产持久化");
    } catch (error) {
      setConfig(defaultConfig);
      setTasks([]);
      setStorageMode("unknown");
      setStatus(error instanceof TypeError ? "商品导入 API 未连接。" : error instanceof Error ? error.message : "读取商品导入配置失败。");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function saveConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("正在保存 AI 导入配置...");
    try {
      const response = await fetch(`${adminGatewayUrl}/product-import/config`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-admin-actor": "local-admin",
          "x-correlation-id": createRequestId()
        },
        body: JSON.stringify(config)
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(localizedErrorMessage(payload, response.status, "zh"));
      }
      setConfig(payload.config);
      setStorageMode(payload.storageMode ?? "unknown");
      setStatus(payload.storageMode === "postgres" ? "AI 导入配置已保存" : "配置仅保存到内存降级层。");
    } catch (error) {
      setStatus(error instanceof TypeError ? "商品导入 API 未连接，配置未保存。" : error instanceof Error ? error.message : "AI 导入配置保存失败，未假装成功。");
    }
  }

  async function importLinks(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("正在导入链接...");
    try {
      const response = await fetch(`${adminGatewayUrl}/product-import/imports`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-actor": "local-admin",
          "x-correlation-id": createRequestId()
        },
        body: JSON.stringify({ text: importText })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(localizedErrorMessage(payload, response.status, "zh"));
      }
      setImportText("");
      setStatus(`已导入 ${Array.isArray(payload.tasks) ? payload.tasks.length : 0} 条，缺少 AI Provider 时会显性阻塞。`);
      await load();
    } catch (error) {
      setStatus(error instanceof TypeError ? "商品导入 API 未连接。" : error instanceof Error ? error.message : "导入失败，请检查 URL 格式。");
    }
  }

  async function updateDraft(task: ImportTask, draft: ImportDraft) {
    setStatus("正在保存导入草稿...");
    try {
      const response = await fetch(`${adminGatewayUrl}/product-import/imports/${task.id}/draft`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-admin-actor": "local-admin",
          "x-correlation-id": createRequestId()
        },
        body: JSON.stringify(draft)
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(localizedErrorMessage(payload, response.status, "zh"));
      }
      setTasks((items) => items.map((item) => (item.id === task.id ? payload.task : item)));
      setStatus("导入草稿已保存");
    } catch (error) {
      setStatus(error instanceof TypeError ? "商品导入 API 未连接，草稿未保存。" : error instanceof Error ? error.message : "导入草稿保存失败，未假装成功。");
    }
  }

  async function runTaskAction(task: ImportTask, action: "generate" | "publish") {
    setStatus(action === "generate" ? "正在请求 AI 生成..." : "正在执行发布校验...");
    try {
      const response = await fetch(`${adminGatewayUrl}/product-import/imports/${task.id}/${action}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-actor": "local-admin",
          "x-correlation-id": createRequestId()
        },
        body: "{}"
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(localizedErrorMessage(payload, response.status, "zh"));
      }
      setStatus(action === "generate" ? "AI 生成请求已记录" : "商品已写入正式商品库");
      await load();
    } catch (error) {
      setStatus(
        error instanceof TypeError
          ? "商品导入 API 未连接。"
          : error instanceof Error
            ? error.message
            : action === "generate"
              ? "AI 生成不可用，未假装成功。"
              : "发布失败，请补齐必填字段。"
      );
    }
  }

  function patchSelectedDraft(patch: Partial<ImportDraft>) {
    if (!selectedTask) return;
    setTasks((items) => items.map((item) => (item.id === selectedTask.id ? { ...item, draft: { ...item.draft, ...patch } } : item)));
  }

  return (
    <AdminPanel id="product-import-management" eyebrow="自动化上架" title="商品批量导入与 AI 工作流" status={`存储：${storageMode}`}>
      <AdminHelpText>
        支持链接批量导入、AI 文案/图片 Provider 配置、导入草稿编辑和发布校验。未配置真实 Provider 时只显示阻塞状态，不生成假文案或假图片。
      </AdminHelpText>

      <form className="mt-6 grid gap-5" onSubmit={saveConfig}>
        <AdminListCard eyebrow="AI Config" title="文案与图片生成配置" description="API 地址为空时，任务会进入缺少 Provider 状态。">
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <AdminField label="文案模式">
              <AdminSelect value={config.copywriting.mode} onChange={(event) => setConfig({ ...config, copywriting: { ...config.copywriting, mode: event.target.value as AiMode } })}>
                <option value="disabled">禁用</option>
                <option value="api">API Provider</option>
              </AdminSelect>
            </AdminField>
            <AdminField label="文案 API 地址">
              <AdminTextInput value={config.copywriting.apiUrl} onChange={(event) => setConfig({ ...config, copywriting: { ...config.copywriting, apiUrl: event.target.value } })} />
            </AdminField>
            <AdminField label="提示词模板名称">
              <AdminTextInput value={config.copywriting.templateName} onChange={(event) => setConfig({ ...config, copywriting: { ...config.copywriting, templateName: event.target.value } })} />
            </AdminField>
            <AdminField label="标题最大长度">
              <AdminNumberInput value={config.copywriting.titleMaxLength} onChange={(event) => setConfig({ ...config, copywriting: { ...config.copywriting, titleMaxLength: Number(event.target.value) } })} />
            </AdminField>
            <AdminField className="lg:col-span-2" label="全局文案提示词">
              <AdminTextarea value={config.copywriting.defaultPrompt} onChange={(event) => setConfig({ ...config, copywriting: { ...config.copywriting, defaultPrompt: event.target.value } })} />
            </AdminField>
            <AdminField label="图片模式">
              <AdminSelect value={config.image.mode} onChange={(event) => setConfig({ ...config, image: { ...config.image, mode: event.target.value as AiMode } })}>
                <option value="disabled">禁用</option>
                <option value="api">API Provider</option>
              </AdminSelect>
            </AdminField>
            <AdminField label="图片 API 地址">
              <AdminTextInput value={config.image.apiUrl} onChange={(event) => setConfig({ ...config, image: { ...config.image, apiUrl: event.target.value } })} />
            </AdminField>
            <AdminField className="lg:col-span-2" label="全局绘图提示词">
              <AdminTextarea value={config.image.defaultPrompt} onChange={(event) => setConfig({ ...config, image: { ...config.image, defaultPrompt: event.target.value } })} />
            </AdminField>
            <AdminField label="队列并发数">
              <AdminNumberInput value={config.queue.concurrency} onChange={(event) => setConfig({ ...config, queue: { ...config.queue, concurrency: Number(event.target.value) } })} />
            </AdminField>
            <AdminCheckbox label="生图失败允许沿用源图" checked={config.image.fallbackToSourceImages} onChange={(event) => setConfig({ ...config, image: { ...config.image, fallbackToSourceImages: event.target.checked } })} />
          </div>
          <div className="mt-4">
            <AdminPrimaryButton type="submit">保存 AI 配置</AdminPrimaryButton>
          </div>
        </AdminListCard>
      </form>

      <form className="mt-6" onSubmit={importLinks}>
        <AdminListCard eyebrow="Import" title="链接批量导入" description="每行一个外部商品链接，重复链接会被覆盖为最新草稿。">
          <div className="mt-4 grid gap-3">
            <AdminTextarea value={importText} onChange={(event) => setImportText(event.target.value)} placeholder="https://example.com/product/teaware-set" />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <AdminPrimaryButton type="submit">导入链接</AdminPrimaryButton>
              <AdminInlineStatus>{status}</AdminInlineStatus>
            </div>
          </div>
        </AdminListCard>
      </form>

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <AdminListCard eyebrow="Tasks" title="导入任务" description={`共 ${tasks.length} 条任务`}>
          <div className="mt-4 grid gap-3">
            {tasks.length === 0 ? <p className="text-sm text-[var(--ink-soft)]">暂无导入任务。</p> : null}
            {tasks.map((task) => (
              <button
                key={task.id}
                className={[
                  "rounded-md border p-3 text-left text-sm",
                  selectedTask?.id === task.id ? "border-black bg-[var(--bg)]" : "border-[var(--line)]"
                ].join(" ")}
                onClick={() => setSelectedId(task.id)}
                type="button"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{task.draft.nameEn || task.sourceTitle || task.sourceUrl}</p>
                    <p className="mt-1 truncate text-xs text-[var(--ink-soft)]">{task.sourceUrl}</p>
                  </div>
                  <span className="shrink-0 rounded-full border border-[var(--line)] px-2 py-1 text-xs">{statusLabel(task.status)}</span>
                </div>
                <p className="mt-2 text-xs text-[var(--ink-soft)]">文案：{task.copyStatus} · 图片：{task.imageStatus}</p>
                {task.failureReason ? <p className="mt-2 text-xs text-red-700">{task.failureReason}</p> : null}
              </button>
            ))}
          </div>
        </AdminListCard>

        {selectedTask ? (
          <AdminListCard
            eyebrow={selectedTask.draft.sku}
            title="草稿编辑与预览"
            description="所有金额按最小货币单位保存，发布前会校验跨境必填字段。"
            action={
              <div className="flex flex-wrap gap-2">
                <AdminSecondaryButton type="button" onClick={() => runTaskAction(selectedTask, "generate")}>AI生成</AdminSecondaryButton>
                <AdminPrimaryButton type="button" onClick={() => runTaskAction(selectedTask, "publish")}>发布校验</AdminPrimaryButton>
              </div>
            }
          >
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <AdminField label="SKU">
                <AdminTextInput value={selectedTask.draft.sku} onChange={(event) => patchSelectedDraft({ sku: event.target.value })} />
              </AdminField>
              <AdminField label="价格（最小单位）">
                <AdminNumberInput value={selectedTask.draft.priceMinor} onChange={(event) => patchSelectedDraft({ priceMinor: Number(event.target.value) })} />
              </AdminField>
              <AdminField label="中文名称">
                <AdminTextInput value={selectedTask.draft.nameZh} onChange={(event) => patchSelectedDraft({ nameZh: event.target.value })} />
              </AdminField>
              <AdminField label="英文名称">
                <AdminTextInput value={selectedTask.draft.nameEn} onChange={(event) => patchSelectedDraft({ nameEn: event.target.value })} />
              </AdminField>
              <AdminField label="分类">
                <AdminTextInput value={selectedTask.draft.category} onChange={(event) => patchSelectedDraft({ category: event.target.value })} />
              </AdminField>
              <AdminField label="地域">
                <AdminTextInput value={selectedTask.draft.region} onChange={(event) => patchSelectedDraft({ region: event.target.value })} />
              </AdminField>
              <AdminField label="HS Code">
                <AdminTextInput value={selectedTask.draft.hsCode} onChange={(event) => patchSelectedDraft({ hsCode: event.target.value })} />
              </AdminField>
              <AdminField label="重量（克）">
                <AdminNumberInput value={selectedTask.draft.weightGrams} onChange={(event) => patchSelectedDraft({ weightGrams: Number(event.target.value) })} />
              </AdminField>
              <AdminField label="中文材质">
                <AdminTextInput value={selectedTask.draft.materialZh} onChange={(event) => patchSelectedDraft({ materialZh: event.target.value })} />
              </AdminField>
              <AdminField label="英文材质">
                <AdminTextInput value={selectedTask.draft.materialEn} onChange={(event) => patchSelectedDraft({ materialEn: event.target.value })} />
              </AdminField>
              <AdminField label="主图 URL">
                <AdminTextInput value={selectedTask.draft.mainImageUrl} onChange={(event) => patchSelectedDraft({ mainImageUrl: event.target.value })} />
              </AdminField>
              <AdminField label="展示金额">
                <AdminTextInput readOnly value={formatMoney(selectedTask.draft.priceMinor, selectedTask.draft.currency)} />
              </AdminField>
              <AdminField className="lg:col-span-2" label="中文海关说明">
                <AdminTextarea value={selectedTask.draft.customsDeclarationZh} onChange={(event) => patchSelectedDraft({ customsDeclarationZh: event.target.value })} />
              </AdminField>
              <AdminField className="lg:col-span-2" label="英文海关说明">
                <AdminTextarea value={selectedTask.draft.customsDeclarationEn} onChange={(event) => patchSelectedDraft({ customsDeclarationEn: event.target.value })} />
              </AdminField>
              <AdminField className="lg:col-span-2" label="英文详情">
                <AdminTextarea value={selectedTask.draft.detailEn} onChange={(event) => patchSelectedDraft({ detailEn: event.target.value })} />
              </AdminField>
            </div>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <AdminSecondaryButton type="button" onClick={() => updateDraft(selectedTask, selectedTask.draft)}>保存草稿</AdminSecondaryButton>
              <AdminInlineStatus>{status}</AdminInlineStatus>
            </div>
          </AdminListCard>
        ) : null}
      </div>
    </AdminPanel>
  );
}
