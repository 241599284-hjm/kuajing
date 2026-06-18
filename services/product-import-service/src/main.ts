import "reflect-metadata";
import { BadRequestException, Body, Controller, Get, Headers, Injectable, Module, NotFoundException, Param, Post, Put, Query } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ERROR_CODES } from "@commerce/error-codes";
import { assertStoreContext } from "@commerce/store-context";
import { publishDraftToCatalog } from "./catalog-publisher.js";
import { randomUUID } from "node:crypto";
import pg from "pg";

const { Pool } = pg;

type HeaderBag = Record<string, string | string[] | undefined>;
type StorageMode = "postgres" | "memory";
type ImportStatus = "pending" | "blocked_missing_provider" | "editing" | "published" | "failed";
type AiMode = "disabled" | "api";

type ImportConfig = {
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
  storeId: string;
  sourceUrl: string;
  sourceTitle: string;
  status: ImportStatus;
  copyStatus: string;
  imageStatus: string;
  failureReason: string | null;
  draft: ImportDraft;
  createdBy: string;
  publishedProductId: string | null;
  createdAt: string;
  updatedAt: string;
};

type AuditEvent = {
  id: string;
  storeId: string;
  taskId: string | null;
  action: string;
  actorId: string;
  summary: string;
  oldValue: unknown;
  newValue: unknown;
  correlationId: string;
  createdAt: string;
};

const databaseUrl = process.env.PRODUCT_IMPORT_DATABASE_URL;
const catalogServiceUrl = process.env.CATALOG_SERVICE_URL ?? "http://localhost:4103";
const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null;
const memoryTasks: ImportTask[] = [];
const memoryAuditEvents: AuditEvent[] = [];
let memoryConfig = defaultConfig();
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validationFailed(message: string, details?: unknown): BadRequestException {
  return new BadRequestException({
    code: ERROR_CODES.VALIDATION_FAILED,
    message,
    ...(details === undefined ? {} : { details })
  });
}

function notFound(message: string, details?: unknown): NotFoundException {
  return new NotFoundException({
    code: ERROR_CODES.NOT_FOUND,
    message,
    ...(details === undefined ? {} : { details })
  });
}

function normalizeTaskId(value: string): string {
  const taskId = value.trim();

  if (!uuidPattern.test(taskId)) {
    throw validationFailed("product import task id must be a UUID");
  }

  return taskId;
}

function defaultConfig(): ImportConfig {
  return {
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
}

function headerValue(headers: HeaderBag, name: string): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}

function createContext(headers: HeaderBag) {
  return assertStoreContext({
    storeId: process.env.DEFAULT_STORE_ID ?? "00000000-0000-4000-8000-000000000001",
    region: process.env.DEFAULT_STORE_REGION ?? "local",
    timezone: process.env.DEFAULT_STORE_TIMEZONE ?? "Asia/Hong_Kong",
    correlationId: headerValue(headers, "x-correlation-id") ?? randomUUID()
  });
}

function actorFromHeaders(headers: HeaderBag) {
  return headerValue(headers, "x-admin-actor") ?? "local-admin";
}

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function cleanInteger(value: unknown, fallback: number, min: number, max: number) {
  const nextValue = Number(value);
  if (!Number.isInteger(nextValue)) return fallback;
  return Math.max(min, Math.min(max, nextValue));
}

function cleanBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function cleanMode(value: unknown): AiMode {
  return value === "api" ? "api" : "disabled";
}

function normalizeConfig(input: unknown): ImportConfig {
  const current = defaultConfig();
  const value = typeof input === "object" && input !== null ? input as Partial<ImportConfig> : {};
  const copywriting: Partial<ImportConfig["copywriting"]> =
    typeof value.copywriting === "object" && value.copywriting !== null ? value.copywriting : {};
  const image: Partial<ImportConfig["image"]> =
    typeof value.image === "object" && value.image !== null ? value.image : {};
  const queue: Partial<ImportConfig["queue"]> =
    typeof value.queue === "object" && value.queue !== null ? value.queue : {};

  return {
    copywriting: {
      mode: cleanMode(copywriting.mode),
      apiUrl: cleanString(copywriting.apiUrl),
      templateName: cleanString(copywriting.templateName, current.copywriting.templateName),
      defaultPrompt: cleanString(copywriting.defaultPrompt, current.copywriting.defaultPrompt),
      titleMaxLength: cleanInteger(copywriting.titleMaxLength, current.copywriting.titleMaxLength, 20, 160),
      detailMaxLength: cleanInteger(copywriting.detailMaxLength, current.copywriting.detailMaxLength, 200, 8000)
    },
    image: {
      mode: cleanMode(image.mode),
      apiUrl: cleanString(image.apiUrl),
      defaultPrompt: cleanString(image.defaultPrompt, current.image.defaultPrompt),
      mainImageCount: cleanInteger(image.mainImageCount, current.image.mainImageCount, 1, 3),
      galleryImageCount: cleanInteger(image.galleryImageCount, current.image.galleryImageCount, 0, 12),
      detailImageCount: cleanInteger(image.detailImageCount, current.image.detailImageCount, 0, 20),
      fallbackToSourceImages: cleanBoolean(image.fallbackToSourceImages, current.image.fallbackToSourceImages)
    },
    queue: {
      maxImportUrls: cleanInteger(queue.maxImportUrls, current.queue.maxImportUrls, 1, 500),
      concurrency: cleanInteger(queue.concurrency, current.queue.concurrency, 1, 8),
      timeoutSeconds: cleanInteger(queue.timeoutSeconds, current.queue.timeoutSeconds, 5, 180)
    }
  };
}

function sourceTitleFromUrl(sourceUrl: string) {
  try {
    const url = new URL(sourceUrl);
    const lastSegment = url.pathname.split("/").filter(Boolean).at(-1) ?? url.hostname;
    return lastSegment
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim() || url.hostname;
  } catch {
    return "";
  }
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || `import-${randomUUID().slice(0, 8)}`;
}

function validateSourceUrl(value: string) {
  const sourceUrl = value.trim();
  try {
    const url = new URL(sourceUrl);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("invalid protocol");
    return url.toString();
  } catch {
    throw validationFailed("sourceUrl must be a valid http or https URL");
  }
}

function defaultDraft(sourceUrl: string): ImportDraft {
  const title = sourceTitleFromUrl(sourceUrl);
  const slug = slugify(title);
  return {
    sku: `IMPORT-${slug.toUpperCase().replace(/-/g, "-").slice(0, 32)}`,
    nameZh: "",
    nameEn: title,
    shortTitleEn: title,
    keywords: title,
    subtitleEn: "",
    category: "gift",
    region: "jiangxi",
    priceMinor: 0,
    originalPriceMinor: 0,
    currency: "USD",
    materialZh: "",
    materialEn: "",
    originZh: "中国",
    originEn: "China",
    originCountry: "CN",
    capacityZh: "",
    capacityEn: "",
    hsCode: "",
    packageLengthMm: 0,
    packageWidthMm: 0,
    packageHeightMm: 0,
    weightGrams: 0,
    customsDeclarationZh: "",
    customsDeclarationEn: "",
    detailZh: "",
    detailEn: "",
    afterSalesEn: "Standard 30-day return policy applies unless this item is customized.",
    usageNotesEn: "",
    tags: [],
    mainImageUrl: "",
    galleryImageUrls: [],
    detailImageUrls: []
  };
}

function normalizeDraft(input: unknown, fallback: ImportDraft): ImportDraft {
  const value = typeof input === "object" && input !== null ? input as Partial<ImportDraft> : {};
  const tags = Array.isArray(value.tags) ? value.tags.map((item) => String(item).trim()).filter(Boolean).slice(0, 20) : fallback.tags;
  const galleryImageUrls = Array.isArray(value.galleryImageUrls) ? value.galleryImageUrls.map(String).filter(Boolean).slice(0, 20) : fallback.galleryImageUrls;
  const detailImageUrls = Array.isArray(value.detailImageUrls) ? value.detailImageUrls.map(String).filter(Boolean).slice(0, 40) : fallback.detailImageUrls;

  return {
    sku: cleanString(value.sku, fallback.sku).toUpperCase().slice(0, 80),
    nameZh: cleanString(value.nameZh, fallback.nameZh),
    nameEn: cleanString(value.nameEn, fallback.nameEn),
    shortTitleEn: cleanString(value.shortTitleEn, fallback.shortTitleEn),
    keywords: cleanString(value.keywords, fallback.keywords),
    subtitleEn: cleanString(value.subtitleEn, fallback.subtitleEn),
    category: cleanString(value.category, fallback.category),
    region: cleanString(value.region, fallback.region),
    priceMinor: cleanInteger(value.priceMinor, fallback.priceMinor, 0, 999999999),
    originalPriceMinor: cleanInteger(value.originalPriceMinor, fallback.originalPriceMinor, 0, 999999999),
    currency: cleanString(value.currency, fallback.currency).toUpperCase().slice(0, 3),
    materialZh: cleanString(value.materialZh, fallback.materialZh),
    materialEn: cleanString(value.materialEn, fallback.materialEn),
    originZh: cleanString(value.originZh, fallback.originZh),
    originEn: cleanString(value.originEn, fallback.originEn),
    originCountry: cleanString(value.originCountry, fallback.originCountry).toUpperCase().slice(0, 2),
    capacityZh: cleanString(value.capacityZh, fallback.capacityZh),
    capacityEn: cleanString(value.capacityEn, fallback.capacityEn),
    hsCode: cleanString(value.hsCode, fallback.hsCode).slice(0, 32),
    packageLengthMm: cleanInteger(value.packageLengthMm, fallback.packageLengthMm, 0, 999999),
    packageWidthMm: cleanInteger(value.packageWidthMm, fallback.packageWidthMm, 0, 999999),
    packageHeightMm: cleanInteger(value.packageHeightMm, fallback.packageHeightMm, 0, 999999),
    weightGrams: cleanInteger(value.weightGrams, fallback.weightGrams, 0, 999999),
    customsDeclarationZh: cleanString(value.customsDeclarationZh, fallback.customsDeclarationZh),
    customsDeclarationEn: cleanString(value.customsDeclarationEn, fallback.customsDeclarationEn),
    detailZh: cleanString(value.detailZh, fallback.detailZh),
    detailEn: cleanString(value.detailEn, fallback.detailEn),
    afterSalesEn: cleanString(value.afterSalesEn, fallback.afterSalesEn),
    usageNotesEn: cleanString(value.usageNotesEn, fallback.usageNotesEn),
    tags,
    mainImageUrl: cleanString(value.mainImageUrl, fallback.mainImageUrl),
    galleryImageUrls,
    detailImageUrls
  };
}

function validatePublishDraft(draft: ImportDraft) {
  const missing = [
    ["sku", draft.sku],
    ["nameZh", draft.nameZh],
    ["nameEn", draft.nameEn],
    ["category", draft.category],
    ["region", draft.region],
    ["materialZh", draft.materialZh],
    ["materialEn", draft.materialEn],
    ["capacityZh", draft.capacityZh],
    ["capacityEn", draft.capacityEn],
    ["hsCode", draft.hsCode],
    ["customsDeclarationZh", draft.customsDeclarationZh],
    ["customsDeclarationEn", draft.customsDeclarationEn],
    ["mainImageUrl", draft.mainImageUrl]
  ].filter(([, value]) => !value);

  if (missing.length > 0) {
    throw validationFailed(`publish blocked, missing fields: ${missing.map(([field]) => field).join(", ")}`, {
      missingFields: missing.map(([field]) => field)
    });
  }

  if (draft.priceMinor <= 0 || draft.weightGrams <= 0) {
    throw validationFailed("publish blocked, priceMinor and weightGrams must be positive integers");
  }
}

function auditEvent(storeId: string, taskId: string | null, action: string, actorId: string, summary: string, oldValue: unknown, newValue: unknown, correlationId: string): AuditEvent {
  return {
    id: randomUUID(),
    storeId,
    taskId,
    action,
    actorId,
    summary,
    oldValue,
    newValue,
    correlationId,
    createdAt: new Date().toISOString()
  };
}

function taskFromRow(row: {
  id: string;
  store_id: string;
  source_url: string;
  source_title: string;
  status: ImportStatus;
  copy_status: string;
  image_status: string;
  failure_reason: string | null;
  draft: ImportDraft;
  created_by: string;
  published_product_id: string | null;
  created_at: Date;
  updated_at: Date;
}): ImportTask {
  return {
    id: row.id,
    storeId: row.store_id,
    sourceUrl: row.source_url,
    sourceTitle: row.source_title,
    status: row.status,
    copyStatus: row.copy_status,
    imageStatus: row.image_status,
    failureReason: row.failure_reason,
    draft: row.draft,
    createdBy: row.created_by,
    publishedProductId: row.published_product_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

@Injectable()
class ProductImportRepository {
  async config(): Promise<{ config: ImportConfig; storageMode: StorageMode }> {
    if (!pool) return { config: memoryConfig, storageMode: "memory" };
    try {
      const result = await pool.query<{ settings: ImportConfig }>("select settings from product_import_config where id = 'default'");
      if (result.rowCount === 0) {
        const config = defaultConfig();
        await pool.query("insert into product_import_config (id, settings) values ('default', $1)", [config]);
        return { config, storageMode: "postgres" };
      }
      return { config: normalizeConfig(result.rows[0].settings), storageMode: "postgres" };
    } catch {
      return { config: memoryConfig, storageMode: "memory" };
    }
  }

  async saveConfig(config: ImportConfig, event: AuditEvent): Promise<StorageMode> {
    if (!pool) {
      memoryConfig = config;
      memoryAuditEvents.unshift(event);
      return "memory";
    }
    try {
      await pool.query(
        `insert into product_import_config (id, settings, updated_at)
         values ('default', $1, now())
         on conflict (id) do update set settings = excluded.settings, updated_at = now()`,
        [config]
      );
      await this.recordAudit(event);
      return "postgres";
    } catch {
      memoryConfig = config;
      memoryAuditEvents.unshift(event);
      return "memory";
    }
  }

  async createTasks(storeId: string, urls: string[], actor: string, correlationId: string) {
    const cleanUrls = [...new Set(urls.map(validateSourceUrl))];
    const { config } = await this.config();

    if (cleanUrls.length > config.queue.maxImportUrls) {
      throw validationFailed(`single import limit is ${config.queue.maxImportUrls} URLs`, {
        maxImportUrls: config.queue.maxImportUrls
      });
    }

    const tasks = cleanUrls.map((sourceUrl) => {
      const sourceTitle = sourceTitleFromUrl(sourceUrl);
      const draft = defaultDraft(sourceUrl);
      const missingProvider = config.copywriting.mode !== "api" || !config.copywriting.apiUrl || config.image.mode !== "api" || !config.image.apiUrl;
      return {
        id: randomUUID(),
        storeId,
        sourceUrl,
        sourceTitle,
        status: missingProvider ? "blocked_missing_provider" as const : "pending" as const,
        copyStatus: config.copywriting.mode === "api" && config.copywriting.apiUrl ? "queued" : "blocked_missing_provider",
        imageStatus: config.image.mode === "api" && config.image.apiUrl ? "queued" : "blocked_missing_provider",
        failureReason: missingProvider ? "AI copywriting or image provider is not configured. Task is editable but generation is not marked successful." : null,
        draft,
        createdBy: actor,
        publishedProductId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    });

    if (!pool) {
      for (const task of tasks) {
        const existingIndex = memoryTasks.findIndex((item) => item.storeId === storeId && item.sourceUrl === task.sourceUrl);
        if (existingIndex >= 0) memoryTasks[existingIndex] = task;
        else memoryTasks.unshift(task);
        memoryAuditEvents.unshift(auditEvent(storeId, task.id, "product_import.create", actor, "导入商品链接", null, task, correlationId));
      }
      return { tasks, storageMode: "memory" as const };
    }

    try {
      for (const task of tasks) {
        await pool.query(
          `insert into product_import_tasks (
            id, store_id, source_url, source_title, status, copy_status, image_status,
            failure_reason, draft, created_by, published_product_id, created_at, updated_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, null, now(), now())
          on conflict (store_id, source_url) do update set
            source_title = excluded.source_title,
            status = excluded.status,
            copy_status = excluded.copy_status,
            image_status = excluded.image_status,
            failure_reason = excluded.failure_reason,
            draft = excluded.draft,
            created_by = excluded.created_by,
            updated_at = now()`,
          [
            task.id,
            storeId,
            task.sourceUrl,
            task.sourceTitle,
            task.status,
            task.copyStatus,
            task.imageStatus,
            task.failureReason,
            task.draft,
            task.createdBy
          ]
        );
        await this.recordAudit(auditEvent(storeId, task.id, "product_import.create", actor, "导入商品链接", null, task, correlationId));
      }
      return { tasks, storageMode: "postgres" as const };
    } catch {
      for (const task of tasks) memoryTasks.unshift(task);
      return { tasks, storageMode: "memory" as const };
    }
  }

  async listTasks(storeId: string, query: { page: number; size: number; status?: string; search?: string }) {
    if (!pool) {
      const filtered = memoryTasks.filter((task) => {
        const statusMatch = query.status ? task.status === query.status : true;
        const searchMatch = query.search ? `${task.sourceUrl} ${task.sourceTitle} ${task.draft.nameEn}`.toLowerCase().includes(query.search.toLowerCase()) : true;
        return task.storeId === storeId && statusMatch && searchMatch;
      });
      return {
        items: filtered.slice((query.page - 1) * query.size, query.page * query.size),
        page: query.page,
        size: query.size,
        total: filtered.length,
        storageMode: "memory" as const
      };
    }

    try {
      const values: unknown[] = [storeId];
      const clauses = ["store_id = $1"];
      if (query.status) {
        values.push(query.status);
        clauses.push(`status = $${values.length}`);
      }
      if (query.search) {
        values.push(`%${query.search.toLowerCase()}%`);
        clauses.push(`(lower(source_url) like $${values.length} or lower(source_title) like $${values.length})`);
      }
      values.push(query.size, (query.page - 1) * query.size);
      const result = await pool.query(
        `select * from product_import_tasks
         where ${clauses.join(" and ")}
         order by updated_at desc
         limit $${values.length - 1} offset $${values.length}`,
        values
      );
      const countResult = await pool.query<{ count: string }>(
        `select count(*) from product_import_tasks where ${clauses.join(" and ")}`,
        values.slice(0, values.length - 2)
      );
      return {
        items: result.rows.map(taskFromRow),
        page: query.page,
        size: query.size,
        total: Number(countResult.rows[0]?.count ?? 0),
        storageMode: "postgres" as const
      };
    } catch {
      return { items: [], page: query.page, size: query.size, total: 0, storageMode: "memory" as const };
    }
  }

  async updateDraft(storeId: string, taskId: string, actor: string, input: unknown, correlationId: string) {
    const task = await this.findTask(storeId, taskId);
    if (!task) throw notFound("product import task not found");
    const draft = normalizeDraft(input, task.draft);
    const nextTask = { ...task, draft, status: "editing" as const, updatedAt: new Date().toISOString() };

    if (!pool) {
      const index = memoryTasks.findIndex((item) => item.id === taskId && item.storeId === storeId);
      if (index >= 0) memoryTasks[index] = nextTask;
      memoryAuditEvents.unshift(auditEvent(storeId, taskId, "product_import.update_draft", actor, "编辑导入商品草稿", task.draft, draft, correlationId));
      return { task: nextTask, storageMode: "memory" as const };
    }

    await pool.query("update product_import_tasks set draft = $1, status = 'editing', updated_at = now() where store_id = $2 and id = $3", [draft, storeId, taskId]);
    await this.recordAudit(auditEvent(storeId, taskId, "product_import.update_draft", actor, "编辑导入商品草稿", task.draft, draft, correlationId));
    const saved = await this.findTask(storeId, taskId);
    return { task: saved ?? nextTask, storageMode: "postgres" as const };
  }

  async startGeneration(storeId: string, taskId: string, actor: string, correlationId: string) {
    const task = await this.findTask(storeId, taskId);
    if (!task) throw notFound("product import task not found");
    const { config } = await this.config();
    const hasCopyProvider = config.copywriting.mode === "api" && Boolean(config.copywriting.apiUrl);
    const hasImageProvider = config.image.mode === "api" && Boolean(config.image.apiUrl);
    const nextStatus: ImportStatus = hasCopyProvider && hasImageProvider ? "pending" : "blocked_missing_provider";
    const failureReason = nextStatus === "blocked_missing_provider"
      ? "AI provider URLs are not configured. Generation is blocked and no fake copy or images were produced."
      : "AI queue adapter is configured but external execution worker is not implemented in this local recovery block.";

    if (!pool) {
      const index = memoryTasks.findIndex((item) => item.id === taskId && item.storeId === storeId);
      if (index >= 0) {
        memoryTasks[index] = {
          ...memoryTasks[index],
          status: nextStatus,
          copyStatus: hasCopyProvider ? "queued" : "blocked_missing_provider",
          imageStatus: hasImageProvider ? "queued" : "blocked_missing_provider",
          failureReason,
          updatedAt: new Date().toISOString()
        };
      }
      memoryAuditEvents.unshift(auditEvent(storeId, taskId, "product_import.start_generation", actor, "请求 AI 生成", task, { nextStatus, failureReason }, correlationId));
      return { accepted: nextStatus === "pending", status: nextStatus, message: failureReason, storageMode: "memory" as const };
    }

    await pool.query(
      `update product_import_tasks
       set status = $1, copy_status = $2, image_status = $3, failure_reason = $4, updated_at = now()
       where store_id = $5 and id = $6`,
      [nextStatus, hasCopyProvider ? "queued" : "blocked_missing_provider", hasImageProvider ? "queued" : "blocked_missing_provider", failureReason, storeId, taskId]
    );
    await this.recordAudit(auditEvent(storeId, taskId, "product_import.start_generation", actor, "请求 AI 生成", task, { nextStatus, failureReason }, correlationId));
    return { accepted: nextStatus === "pending", status: nextStatus, message: failureReason, storageMode: "postgres" as const };
  }

  async publish(storeId: string, taskId: string, actor: string, correlationId: string) {
    const task = await this.findTask(storeId, taskId);
    if (!task) throw notFound("product import task not found");
    validatePublishDraft(task.draft);

    const publishedProductId = await publishDraftToCatalog({
      catalogServiceUrl,
      taskId: task.id,
      draft: task.draft,
      actor,
      correlationId
    });

    if (!pool) {
      const index = memoryTasks.findIndex((item) => item.id === taskId && item.storeId === storeId);
      if (index >= 0) {
        memoryTasks[index] = { ...memoryTasks[index], status: "published", publishedProductId, updatedAt: new Date().toISOString() };
      }
      memoryAuditEvents.unshift(auditEvent(storeId, taskId, "product_import.publish", actor, "发布导入商品草稿", task.status, "published", correlationId));
      return { published: true, productId: publishedProductId, storageMode: "memory" as const };
    }

    await pool.query(
      "update product_import_tasks set status = 'published', published_product_id = $1, updated_at = now() where store_id = $2 and id = $3",
      [publishedProductId, storeId, taskId]
    );
    await this.recordAudit(auditEvent(storeId, taskId, "product_import.publish", actor, "发布导入商品草稿", task.status, "published", correlationId));
    return {
      published: true,
      productId: publishedProductId,
      storageMode: "postgres" as const
    };
  }

  async auditEvents(storeId: string, limit = 50) {
    if (!pool) return { events: memoryAuditEvents.filter((event) => event.storeId === storeId).slice(0, limit), storageMode: "memory" as const };
    const result = await pool.query(
      `select id, store_id, task_id, action, actor_id, summary, old_value, new_value, correlation_id, created_at
       from product_import_audit_events
       where store_id = $1
       order by created_at desc
       limit $2`,
      [storeId, limit]
    );
    return {
      events: result.rows.map((row) => ({
        id: row.id,
        storeId: row.store_id,
        taskId: row.task_id,
        action: row.action,
        actorId: row.actor_id,
        summary: row.summary,
        oldValue: row.old_value,
        newValue: row.new_value,
        correlationId: row.correlation_id,
        createdAt: row.created_at.toISOString()
      })),
      storageMode: "postgres" as const
    };
  }

  private async findTask(storeId: string, taskId: string): Promise<ImportTask | null> {
    if (!pool) return memoryTasks.find((task) => task.storeId === storeId && task.id === taskId) ?? null;
    const result = await pool.query("select * from product_import_tasks where store_id = $1 and id = $2", [storeId, taskId]);
    return result.rows[0] ? taskFromRow(result.rows[0]) : null;
  }

  private async recordAudit(event: AuditEvent) {
    if (!pool) {
      memoryAuditEvents.unshift(event);
      return;
    }
    await pool.query(
      `insert into product_import_audit_events
       (id, store_id, task_id, action, actor_id, summary, old_value, new_value, correlation_id, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [event.id, event.storeId, event.taskId, event.action, event.actorId, event.summary, event.oldValue, event.newValue, event.correlationId, event.createdAt]
    );
  }
}

function normalizePage(value: string | undefined) {
  const page = Number(value ?? 1);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function normalizeSize(value: string | undefined) {
  const size = Number(value ?? 20);
  return Number.isInteger(size) && size > 0 ? Math.min(size, 100) : 20;
}

@Controller()
class ProductImportController {
  constructor(private readonly repository: ProductImportRepository) {}

  @Get("/health")
  health() {
    return { service: "product-import-service", status: "ok" };
  }

  @Get("/ready")
  async ready() {
    if (!pool) return { service: "product-import-service", status: "degraded", postgres: "not_configured" };
    try {
      await pool.query("select 1");
      return { service: "product-import-service", status: "ready", postgres: "ok" };
    } catch {
      return { service: "product-import-service", status: "degraded", postgres: "unavailable" };
    }
  }

  @Get("/config")
  config() {
    return this.repository.config();
  }

  @Put("/config")
  async saveConfig(@Headers() headers: HeaderBag, @Body() body: unknown) {
    const context = createContext(headers);
    const config = normalizeConfig(body);
    const storageMode = await this.repository.saveConfig(
      config,
      auditEvent(context.storeId, null, "product_import.config.update", actorFromHeaders(headers), "更新商品导入 AI 配置", null, config, context.correlationId)
    );
    return { config, storageMode };
  }

  @Post("/imports")
  async create(@Headers() headers: HeaderBag, @Body() body: { urls?: string[]; text?: string }) {
    const context = createContext(headers);
    const textUrls = typeof body.text === "string" ? body.text.split(/\r?\n/) : [];
    const urls = [...(Array.isArray(body.urls) ? body.urls : []), ...textUrls].map((item) => String(item).trim()).filter(Boolean);
    if (urls.length === 0) throw validationFailed("at least one source URL is required");
    return this.repository.createTasks(context.storeId, urls, actorFromHeaders(headers), context.correlationId);
  }

  @Get("/imports")
  list(
    @Headers() headers: HeaderBag,
    @Query("page") page: string | undefined,
    @Query("size") size: string | undefined,
    @Query("status") status: string | undefined,
    @Query("search") search: string | undefined
  ) {
    const context = createContext(headers);
    return this.repository.listTasks(context.storeId, {
      page: normalizePage(page),
      size: normalizeSize(size),
      status,
      search
    });
  }

  @Put("/imports/:id/draft")
  updateDraft(@Headers() headers: HeaderBag, @Param("id") id: string, @Body() body: unknown) {
    const context = createContext(headers);
    return this.repository.updateDraft(context.storeId, normalizeTaskId(id), actorFromHeaders(headers), body, context.correlationId);
  }

  @Post("/imports/:id/generate")
  startGeneration(@Headers() headers: HeaderBag, @Param("id") id: string) {
    const context = createContext(headers);
    return this.repository.startGeneration(context.storeId, normalizeTaskId(id), actorFromHeaders(headers), context.correlationId);
  }

  @Post("/imports/:id/publish")
  publish(@Headers() headers: HeaderBag, @Param("id") id: string) {
    const context = createContext(headers);
    return this.repository.publish(context.storeId, normalizeTaskId(id), actorFromHeaders(headers), context.correlationId);
  }

  @Get("/audit-events")
  auditEvents(@Headers() headers: HeaderBag) {
    const context = createContext(headers);
    return this.repository.auditEvents(context.storeId);
  }
}

@Module({ controllers: [ProductImportController], providers: [ProductImportRepository] })
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true });
  await app.listen(Number(process.env.PORT ?? 4114), "0.0.0.0");
}

void bootstrap();
