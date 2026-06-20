import "reflect-metadata";
import { publicMediaPath } from "@commerce/contracts";
import {
  BadRequestException,
  Body,
  Controller,
  ConflictException,
  Delete,
  Get,
  Headers,
  Inject,
  Injectable,
  Module,
  NotFoundException,
  OnApplicationShutdown,
  OnModuleInit,
  Param,
  Post,
  Res,
  ServiceUnavailableException,
  StreamableFile,
  UploadedFile,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { NestFactory } from "@nestjs/core";
import { ERROR_CODES } from "@commerce/error-codes";
import { assertStoreContext, type StoreContext } from "@commerce/store-context";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import { Client as MinioClient } from "minio";
import { Pool } from "pg";
import { generateResponsiveImageVariants } from "./image-variants.js";
import {
  nextReconciliationStep,
  normalizeReconciliationAction,
  normalizeReconciliationRequest,
  reconciliationRetryDelayMs
} from "./media-reconciliation.js";
import {
  MediaReconciliationRepository,
  MediaReconciliationTaskConflictError,
  MediaReconciliationTaskNotFoundError,
  type MediaReconciliationTask
} from "./media-reconciliation-repository.js";
import { processVideoMedia } from "./video-processing.js";

type MediaKind = "image" | "gif" | "video";
type StorageProvider = "local" | "minio";
type StorageMode = "postgres" | "memory";
type MediaAuditAction =
  | "upload_accepted"
  | "upload_rejected"
  | "object_deleted"
  | "object_delete_missing"
  | "object_delete_failed"
  | "reconciliation_enqueued"
  | "reconciliation_bound"
  | "reconciliation_unbound_observed"
  | "reconciliation_cleaned"
  | "reconciliation_retry"
  | "reconciliation_failed"
  | "reconciliation_manual_retry"
  | "reconciliation_manual_discard";

type UploadedMediaFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

type MediaUploadResult = {
  assetId: string;
  storeId: string;
  provider: StorageProvider;
  kind: MediaKind;
  objectKey: string;
  url: string;
  originalName: string;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  variants: Record<string, string>;
  responsiveSources: Array<{
    url: string;
    objectKey: string;
    width: number;
    height: number;
    mimeType: string;
    byteSize: number;
  }>;
  posterUrl: string | null;
  durationSeconds: number | null;
};

type HeaderResponse = {
  setHeader: (name: string, value: string) => void;
};

type HeaderBag = Record<string, string | string[] | undefined>;
type MediaAuditEvent = {
  id: string;
  storeId: string;
  action: MediaAuditAction;
  actorId: string;
  objectKey: string | null;
  assetId: string | null;
  summary: string;
  oldValue: unknown;
  newValue: unknown;
  correlationId: string;
  createdAt: string;
};
type DeleteMediaRequest = {
  objectKey?: string;
  assetId?: string;
  reason?: string;
};

const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4"]);
const maxUploadBytes = Number(process.env.MEDIA_MAX_UPLOAD_BYTES ?? 8 * 1024 * 1024);
const localStorageRoot = process.env.MEDIA_LOCAL_STORAGE_ROOT ?? path.resolve("storage", "media");
const objectStorageProvider = (process.env.OBJECT_STORAGE_PROVIDER ?? "local").toLowerCase() as StorageProvider;
const mediaDatabaseUrl = process.env.MEDIA_DATABASE_URL;
const catalogServiceUrl = process.env.CATALOG_SERVICE_URL ?? "http://localhost:4103";
const reconciliationPollIntervalMs = Number(process.env.MEDIA_RECONCILIATION_POLL_INTERVAL_MS ?? 5_000);
const reconciliationInitialDelayMs = Number(process.env.MEDIA_RECONCILIATION_INITIAL_DELAY_MS ?? 30_000);
const reconciliationConfirmDelayMs = Number(process.env.MEDIA_RECONCILIATION_CONFIRM_DELAY_MS ?? 30_000);
const reconciliationBatchSize = Number(process.env.MEDIA_RECONCILIATION_BATCH_SIZE ?? 10);
const reconciliationMaxAttempts = Number(process.env.MEDIA_RECONCILIATION_MAX_ATTEMPTS ?? 8);
const memoryAuditEvents: MediaAuditEvent[] = [];

function headerValue(headers: HeaderBag, name: string): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}

function createStoreContext(correlationId: string | undefined, storeId?: string): StoreContext {
  return assertStoreContext({
    storeId: storeId ?? process.env.DEFAULT_STORE_ID ?? "00000000-0000-4000-8000-000000000001",
    region: process.env.DEFAULT_STORE_REGION ?? "local",
    timezone: process.env.DEFAULT_STORE_TIMEZONE ?? "Asia/Hong_Kong",
    correlationId: correlationId ?? randomUUID()
  });
}

function sanitizeFilename(value: string): string {
  const parsed = path.parse(value);
  const baseName = parsed.name.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return baseName || "media";
}

function validationFailed(message: string, details?: unknown): BadRequestException {
  return new BadRequestException({
    code: ERROR_CODES.VALIDATION_FAILED,
    message,
    ...(details === undefined ? {} : { details })
  });
}

function uploadRejected(message: string, details?: unknown): BadRequestException {
  return new BadRequestException({
    code: ERROR_CODES.UPLOAD_REJECTED,
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

function dependencyUnavailable(message: string, details?: unknown): ServiceUnavailableException {
  return new ServiceUnavailableException({
    code: ERROR_CODES.DEPENDENCY_UNAVAILABLE,
    message,
    ...(details === undefined ? {} : { details })
  });
}

function conflict(message: string, details?: unknown): ConflictException {
  return new ConflictException({
    code: ERROR_CODES.CONFLICT,
    message,
    ...(details === undefined ? {} : { details })
  });
}

function sniffMime(buffer: Buffer): string | null {
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }

  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  if (buffer.length >= 6 && ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii"))) {
    return "image/gif";
  }

  if (buffer.length >= 12 && buffer.subarray(4, 8).toString("ascii") === "ftyp") {
    return "video/mp4";
  }

  return null;
}

function extensionForMime(mimeType: string): string {
  const extensions: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4"
  };

  return extensions[mimeType] ?? "bin";
}

function kindForMime(mimeType: string): MediaKind {
  if (mimeType === "image/gif") return "gif";
  if (mimeType === "video/mp4") return "video";
  return "image";
}

function readDimensions(mimeType: string, buffer: Buffer): { width: number; height: number } | null {
  if (mimeType === "image/png" && buffer.length >= 24) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }

  if (mimeType === "image/gif" && buffer.length >= 10) {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  }

  if (mimeType === "image/webp" && buffer.length >= 30) {
    const chunk = buffer.subarray(12, 16).toString("ascii");

    if (chunk === "VP8X" && buffer.length >= 30) {
      return {
        width: 1 + buffer.readUIntLE(24, 3),
        height: 1 + buffer.readUIntLE(27, 3)
      };
    }

    if (chunk === "VP8 " && buffer.length >= 30) {
      return {
        width: buffer.readUInt16LE(26) & 0x3fff,
        height: buffer.readUInt16LE(28) & 0x3fff
      };
    }

    if (chunk === "VP8L" && buffer.length >= 25) {
      const bits = buffer.readUInt32LE(21);
      return {
        width: 1 + (bits & 0x3fff),
        height: 1 + ((bits >> 14) & 0x3fff)
      };
    }
  }

  if (mimeType === "image/jpeg") {
    let offset = 2;

    while (offset < buffer.length) {
      if (buffer[offset] !== 0xff) return null;

      const marker = buffer[offset + 1];
      const size = buffer.readUInt16BE(offset + 2);

      if (marker >= 0xc0 && marker <= 0xc3 && buffer.length >= offset + 9) {
        return {
          height: buffer.readUInt16BE(offset + 5),
          width: buffer.readUInt16BE(offset + 7)
        };
      }

      offset += 2 + size;
    }
  }

  return null;
}

function validateUpload(file: UploadedMediaFile): { mimeType: string; kind: MediaKind; width: number | null; height: number | null } {
  if (!file?.buffer?.length) {
    throw uploadRejected("media file is required", { reason: "MEDIA_FILE_REQUIRED" });
  }

  if (file.size > maxUploadBytes) {
    throw uploadRejected("media file exceeds the configured size limit", {
      reason: "MEDIA_FILE_TOO_LARGE",
      byteSize: file.size,
      maxUploadBytes
    });
  }

  const sniffedMime = sniffMime(file.buffer);

  if (!sniffedMime || !allowedMimeTypes.has(sniffedMime)) {
    throw uploadRejected("media file type is not allowed", {
      reason: "MEDIA_TYPE_NOT_ALLOWED",
      declaredMimeType: file.mimetype || null,
      detectedMimeType: sniffedMime
    });
  }

  if (file.mimetype && file.mimetype !== "application/octet-stream" && file.mimetype !== sniffedMime) {
    throw uploadRejected("media MIME type does not match the file signature", {
      reason: "MEDIA_MIME_MISMATCH",
      declaredMimeType: file.mimetype,
      detectedMimeType: sniffedMime
    });
  }

  const dimensions = readDimensions(sniffedMime, file.buffer);

  return {
    mimeType: sniffedMime,
    kind: kindForMime(sniffedMime),
    width: dimensions?.width ?? null,
    height: dimensions?.height ?? null
  };
}

function objectKey(ctx: StoreContext, kind: MediaKind, file: UploadedMediaFile, mimeType: string) {
  const yyyyMm = new Date().toISOString().slice(0, 7);
  return [
    ctx.storeId,
    "product-media",
    kind,
    yyyyMm,
    `${randomUUID()}-${sanitizeFilename(file.originalname)}.${extensionForMime(mimeType)}`
  ].join("/");
}

function responsiveObjectKey(sourceKey: string, width: number): string {
  return sourceKey.replace(/\.[^.]+$/, `-w${width}.webp`);
}

function posterObjectKey(sourceKey: string): string {
  return sourceKey.replace(/\.[^.]+$/, "-poster.webp");
}

function assertOwnedObjectKey(ctx: StoreContext, key: string) {
  const normalized = key.trim();

  if (!normalized || path.isAbsolute(normalized) || normalized.includes("..") || normalized.includes("\\")) {
    throw validationFailed("media object key is invalid", { field: "objectKey", reason: "MEDIA_OBJECT_KEY_INVALID" });
  }

  if (!normalized.startsWith(`${ctx.storeId}/product-media/`)) {
    throw validationFailed("media object key does not belong to this store", {
      field: "objectKey",
      reason: "MEDIA_OBJECT_KEY_STORE_MISMATCH"
    });
  }

  return normalized;
}

@Injectable()
class MediaAuditRepository {
  private readonly pool = mediaDatabaseUrl ? new Pool({ connectionString: mediaDatabaseUrl }) : null;

  async record(event: Omit<MediaAuditEvent, "id" | "createdAt">): Promise<StorageMode> {
    const nextEvent: MediaAuditEvent = {
      ...event,
      id: randomUUID(),
      createdAt: new Date().toISOString()
    };

    if (!this.pool) {
      memoryAuditEvents.unshift(nextEvent);
      return "memory";
    }

    try {
      await this.pool.query(
        `INSERT INTO media_audit_events (
          id, store_id, action, actor_id, object_key, asset_id, summary,
          old_value, new_value, correlation_id, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11)`,
        [
          nextEvent.id,
          nextEvent.storeId,
          nextEvent.action,
          nextEvent.actorId,
          nextEvent.objectKey,
          nextEvent.assetId,
          nextEvent.summary,
          JSON.stringify(nextEvent.oldValue ?? null),
          JSON.stringify(nextEvent.newValue ?? null),
          nextEvent.correlationId,
          nextEvent.createdAt
        ]
      );
      return "postgres";
    } catch {
      memoryAuditEvents.unshift(nextEvent);
      return "memory";
    }
  }

  async list(ctx: StoreContext): Promise<{ events: MediaAuditEvent[]; storageMode: StorageMode }> {
    if (!this.pool) {
      return { events: memoryAuditEvents.filter((event) => event.storeId === ctx.storeId).slice(0, 100), storageMode: "memory" };
    }

    try {
      const result = await this.pool.query<{
        id: string;
        store_id: string;
        action: MediaAuditAction;
        actor_id: string;
        object_key: string | null;
        asset_id: string | null;
        summary: string;
        old_value: unknown;
        new_value: unknown;
        correlation_id: string;
        created_at: Date;
      }>(
        `SELECT id, store_id, action, actor_id, object_key, asset_id, summary,
                old_value, new_value, correlation_id, created_at
         FROM media_audit_events
         WHERE store_id = $1
         ORDER BY created_at DESC
         LIMIT 100`,
        [ctx.storeId]
      );

      return {
        storageMode: "postgres",
        events: result.rows.map((row) => ({
          id: row.id,
          storeId: row.store_id,
          action: row.action,
          actorId: row.actor_id,
          objectKey: row.object_key,
          assetId: row.asset_id,
          summary: row.summary,
          oldValue: row.old_value,
          newValue: row.new_value,
          correlationId: row.correlation_id,
          createdAt: row.created_at.toISOString()
        }))
      };
    } catch {
      return { events: memoryAuditEvents.filter((event) => event.storeId === ctx.storeId).slice(0, 100), storageMode: "memory" };
    }
  }

  async ready(): Promise<{ databaseConfigured: boolean; storageMode: StorageMode }> {
    if (!this.pool) {
      return { databaseConfigured: false, storageMode: "memory" };
    }

    try {
      await this.pool.query("SELECT 1");
      return { databaseConfigured: true, storageMode: "postgres" };
    } catch {
      return { databaseConfigured: true, storageMode: "memory" };
    }
  }
}

@Injectable()
class MediaStorage {
  private readonly provider = objectStorageProvider === "minio" ? "minio" : "local";
  private readonly bucket = process.env.OBJECT_STORAGE_BUCKET ?? "demo-teaware-media";
  private minioClient: MinioClient | null = null;

  async save(ctx: StoreContext, file: UploadedMediaFile): Promise<MediaUploadResult> {
    const validation = validateUpload(file);
    let processedVideo: Awaited<ReturnType<typeof processVideoMedia>> | null = null;
    if (validation.kind !== "image") {
      try {
        processedVideo = await processVideoMedia(file.buffer, validation.mimeType as "image/gif" | "video/mp4");
      } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
          throw dependencyUnavailable("media processing dependency is unavailable", { dependency: "ffmpeg" });
        }
        throw uploadRejected("media file could not be processed", {
          reason: "MEDIA_PROCESSING_FAILED",
          detectedMimeType: validation.mimeType
        });
      }
    }
    const storedKind: MediaKind = processedVideo ? "video" : validation.kind;
    const storedMimeType = processedVideo?.mimeType ?? validation.mimeType;
    const storedBuffer = processedVideo?.buffer ?? file.buffer;
    const key = objectKey(ctx, storedKind, file, storedMimeType);
    const assetId = randomUUID();
    const savedKeys: string[] = [];

    try {
      const url = await this.saveBuffer(key, storedBuffer, storedMimeType);
      savedKeys.push(key);
      const generatedVariants = validation.kind === "image"
        ? await generateResponsiveImageVariants(file.buffer)
        : [];
      const responsiveSources: MediaUploadResult["responsiveSources"] = [];

      for (const variant of generatedVariants) {
        const variantKey = responsiveObjectKey(key, variant.width);
        const variantUrl = await this.saveBuffer(variantKey, variant.buffer, variant.mimeType);
        savedKeys.push(variantKey);
        responsiveSources.push({
          url: variantUrl,
          objectKey: variantKey,
          width: variant.width,
          height: variant.height,
          mimeType: variant.mimeType,
          byteSize: variant.byteSize
        });
      }

      let posterUrl: string | null = null;
      if (processedVideo) {
        const posterKey = posterObjectKey(key);
        posterUrl = await this.saveBuffer(posterKey, processedVideo.poster.buffer, processedVideo.poster.mimeType);
        savedKeys.push(posterKey);
        responsiveSources.push({
          url: posterUrl,
          objectKey: posterKey,
          width: processedVideo.poster.width,
          height: processedVideo.poster.height,
          mimeType: processedVideo.poster.mimeType,
          byteSize: processedVideo.poster.buffer.byteLength
        });
      }

      return {
        assetId,
        storeId: ctx.storeId,
        provider: this.provider,
        kind: storedKind,
        objectKey: key,
        url,
        originalName: file.originalname,
        mimeType: storedMimeType,
        byteSize: storedBuffer.byteLength,
        width: processedVideo?.width ?? validation.width,
        height: processedVideo?.height ?? validation.height,
        variants: processedVideo && posterUrl
          ? { poster: posterUrl }
          : Object.fromEntries(responsiveSources.map((variant) => [`w${variant.width}`, variant.url])),
        responsiveSources,
        posterUrl,
        durationSeconds: processedVideo?.durationSeconds ?? null
      };
    } catch (error) {
      await Promise.allSettled(savedKeys.map((savedKey) => this.delete(ctx, savedKey)));
      throw error;
    }
  }

  async delete(ctx: StoreContext, key: string): Promise<{ objectKey: string; deleted: boolean; provider: StorageProvider }> {
    const normalizedKey = assertOwnedObjectKey(ctx, key);

    if (this.provider === "minio") {
      await this.getMinioClient().removeObject(this.bucket, normalizedKey);
      return { objectKey: normalizedKey, deleted: true, provider: this.provider };
    }

    const targetPath = path.resolve(localStorageRoot, normalizedKey);

    if (!targetPath.startsWith(path.resolve(localStorageRoot))) {
      throw validationFailed("media path is invalid", { field: "objectKey", reason: "MEDIA_PATH_INVALID" });
    }

    try {
      await unlink(targetPath);
      return { objectKey: normalizedKey, deleted: true, provider: this.provider };
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
        return { objectKey: normalizedKey, deleted: false, provider: this.provider };
      }

      throw error;
    }
  }

  async read(ctx: StoreContext, key: string): Promise<{ stream: Readable; byteSize: number; contentType: string }> {
    const normalizedKey = assertOwnedObjectKey(ctx, key);

    if (this.provider === "minio") {
      const client = this.getMinioClient();
      const metadata = await client.statObject(this.bucket, normalizedKey);
      return {
        stream: await client.getObject(this.bucket, normalizedKey),
        byteSize: metadata.size,
        contentType: metadata.metaData?.["content-type"] ?? "application/octet-stream"
      };
    }

    const targetPath = path.resolve(localStorageRoot, normalizedKey);
    if (!targetPath.startsWith(path.resolve(localStorageRoot))) {
      throw validationFailed("media path is invalid", { reason: "MEDIA_PATH_INVALID" });
    }
    const metadata = await stat(targetPath);
    const extension = path.extname(targetPath).toLowerCase();
    const contentType = ({ ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif", ".mp4": "video/mp4" } as Record<string, string>)[extension]
      ?? "application/octet-stream";
    return { stream: createReadStream(targetPath), byteSize: metadata.size, contentType };
  }

  private async saveToLocal(key: string, buffer: Buffer): Promise<void> {
    const targetPath = path.join(localStorageRoot, key);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, buffer);
  }

  private async saveBuffer(key: string, buffer: Buffer, mimeType: string): Promise<string> {
    if (this.provider === "minio") await this.saveToMinio(key, buffer, mimeType);
    else await this.saveToLocal(key, buffer);
    return publicMediaPath(key);
  }

  private async saveToMinio(key: string, buffer: Buffer, mimeType: string): Promise<void> {
    const client = this.getMinioClient();
    const exists = await client.bucketExists(this.bucket).catch(() => false);

    if (!exists) {
      await client.makeBucket(this.bucket);
    }

    await client.putObject(this.bucket, key, buffer, buffer.length, {
      "Content-Type": mimeType,
      "Cache-Control": "public, max-age=31536000, immutable"
    });
  }

  private getMinioClient(): MinioClient {
    if (this.minioClient) {
      return this.minioClient;
    }

    const endpoint = process.env.MINIO_ENDPOINT?.trim();
    const accessKey = process.env.MINIO_ACCESS_KEY?.trim();
    const secretKey = process.env.MINIO_SECRET_KEY?.trim();

    if (!endpoint || !accessKey || !secretKey || !this.bucket) {
      throw dependencyUnavailable("object storage configuration is incomplete", {
        dependency: "object-storage",
        reason: "OBJECT_STORAGE_CONFIG_INCOMPLETE"
      });
    }

    const parsedEndpoint = new URL(endpoint);
    this.minioClient = new MinioClient({
      endPoint: parsedEndpoint.hostname,
      port: parsedEndpoint.port ? Number(parsedEndpoint.port) : parsedEndpoint.protocol === "https:" ? 443 : 80,
      useSSL: parsedEndpoint.protocol === "https:",
      accessKey,
      secretKey
    });
    return this.minioClient;
  }
}

@Injectable()
class MediaReconciliationWorker implements OnModuleInit, OnApplicationShutdown {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    @Inject(MediaReconciliationRepository) private readonly reconciliation: MediaReconciliationRepository,
    @Inject(MediaStorage) private readonly storage: MediaStorage,
    @Inject(MediaAuditRepository) private readonly audit: MediaAuditRepository
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.runOnce(), Math.max(reconciliationPollIntervalMs, 1_000));
    this.timer.unref?.();
    void this.runOnce();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async runOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const tasks = await this.reconciliation.claimDue(Math.max(1, reconciliationBatchSize));
      for (const task of tasks) await this.process(task);
    } catch {
      // Readiness exposes an unavailable reconciliation store. The next poll retries.
    } finally {
      this.running = false;
    }
  }

  private async process(task: MediaReconciliationTask): Promise<void> {
    const ctx = createStoreContext(task.correlationId, task.storeId);
    try {
      const response = await fetch(`${catalogServiceUrl}/media-bindings/${encodeURIComponent(task.assetId)}`, {
        headers: { "x-correlation-id": task.correlationId }
      });
      const payload = await response.json().catch(() => ({})) as { bound?: unknown; message?: unknown };
      if (!response.ok || typeof payload.bound !== "boolean") {
        throw new Error(typeof payload.message === "string" ? payload.message : `Catalog binding query failed with ${response.status}`);
      }

      const step = nextReconciliationStep({ bound: payload.bound, unboundObservations: task.unboundObservations });
      if (step === "resolved_bound") {
        await this.reconciliation.markResolvedBound(task.id);
        await this.record(task, ctx, "reconciliation_bound", "Catalog binding confirmed; media objects retained");
        return;
      }
      if (step === "confirm_unbound") {
        await this.reconciliation.confirmUnbound(task.id, reconciliationConfirmDelayMs);
        await this.record(task, ctx, "reconciliation_unbound_observed", "First unbound observation; confirmation scheduled");
        return;
      }

      for (const objectKey of task.objectKeys) await this.storage.delete(ctx, objectKey);
      await this.reconciliation.markCleaned(task.id);
      await this.record(task, ctx, "reconciliation_cleaned", "Catalog remained unbound; media objects deleted");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Media reconciliation failed";
      const nextAttempt = task.attemptCount + 1;
      const status = await this.reconciliation.markFailure(task, message, reconciliationRetryDelayMs(nextAttempt));
      await this.record(
        task,
        ctx,
        status === "failed" ? "reconciliation_failed" : "reconciliation_retry",
        status === "failed" ? `Reconciliation failed permanently: ${message}` : `Reconciliation retry scheduled: ${message}`
      );
    }
  }

  private record(
    task: MediaReconciliationTask,
    ctx: StoreContext,
    action: MediaAuditAction,
    summary: string
  ): Promise<StorageMode> {
    return this.audit.record({
      storeId: task.storeId,
      action,
      actorId: "media-reconciliation-worker",
      objectKey: task.objectKeys[0] ?? null,
      assetId: task.assetId,
      summary,
      oldValue: { status: task.status, unboundObservations: task.unboundObservations, attemptCount: task.attemptCount },
      newValue: { objectKeys: task.objectKeys },
      correlationId: ctx.correlationId
    });
  }
}

@Controller()
class MediaController {
  constructor(
    @Inject(MediaStorage) private readonly storage: MediaStorage,
    @Inject(MediaAuditRepository) private readonly audit: MediaAuditRepository,
    @Inject(MediaReconciliationRepository) private readonly reconciliation: MediaReconciliationRepository
  ) {}

  @Get("/health")
  health(@Headers("x-correlation-id") correlationId?: string) {
    const ctx = createStoreContext(correlationId);

    return {
      service: "media-service",
      status: "ok",
      storeId: ctx.storeId,
      provider: objectStorageProvider,
      maxUploadBytes,
      allowedMimeTypes: [...allowedMimeTypes],
      imagePipeline: {
        productImages: "MinIO/R2/S3 compatible",
        privateAttachments: "S3/R2 signed URL compatible",
        variants: ["source-now", "responsive-variants-next"],
        formats: ["webp", "png", "jpg", "gif-source", "mp4"],
        productDetailMedia: ["responsive-images", "gif-source-with-video-preferred", "short-video-poster"]
      }
    };
  }

  @Get("/ready")
  async ready(@Headers("x-correlation-id") correlationId?: string) {
    const ctx = createStoreContext(correlationId);
    const audit = await this.audit.ready();
    const reconciliationReady = await this.reconciliation.ready();

    return {
      service: "media-service",
      status: (audit.storageMode === "postgres" || !mediaDatabaseUrl) && reconciliationReady ? "ready" : "degraded",
      storeId: ctx.storeId,
      storage: {
        provider: objectStorageProvider,
        bucketConfigured: Boolean(process.env.OBJECT_STORAGE_BUCKET),
        cdnConfigured: objectStorageProvider === "local" || Boolean(process.env.OBJECT_STORAGE_CDN_URL)
      },
      audit,
      reconciliation: {
        databaseConfigured: Boolean(mediaDatabaseUrl),
        ready: reconciliationReady,
        pollIntervalMs: reconciliationPollIntervalMs,
        initialDelayMs: reconciliationInitialDelayMs,
        confirmDelayMs: reconciliationConfirmDelayMs
      }
    };
  }

  @Post("/media/product-assets")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: maxUploadBytes } }))
  async uploadProductAsset(
    @Headers() headers: HeaderBag,
    @UploadedFile() file: UploadedMediaFile | undefined
  ) {
    const ctx = createStoreContext(headerValue(headers, "x-correlation-id"));
    const actorId = headerValue(headers, "x-admin-actor") ?? "storefront";

    if (!file) {
      await this.audit.record({
        storeId: ctx.storeId,
        action: "upload_rejected",
        actorId,
        objectKey: null,
        assetId: null,
        summary: "Upload rejected: file is required",
        oldValue: null,
        newValue: null,
        correlationId: ctx.correlationId
      });
      throw uploadRejected("media file is required", { reason: "MEDIA_FILE_REQUIRED" });
    }

    try {
      const result = await this.storage.save(ctx, file);
      await this.audit.record({
        storeId: ctx.storeId,
        action: "upload_accepted",
        actorId,
        objectKey: result.objectKey,
        assetId: result.assetId,
        summary: `Uploaded ${result.originalName}`,
        oldValue: null,
        newValue: result,
        correlationId: ctx.correlationId
      });
      return result;
    } catch (error) {
      await this.audit.record({
        storeId: ctx.storeId,
        action: "upload_rejected",
        actorId,
        objectKey: null,
        assetId: null,
        summary: error instanceof Error ? error.message : "Upload rejected",
        oldValue: null,
        newValue: { originalName: file.originalname, mimeType: file.mimetype, byteSize: file.size },
        correlationId: ctx.correlationId
      });
      throw error;
    }
  }

  @Delete("/media/product-assets")
  async deleteProductAsset(
    @Headers() headers: HeaderBag,
    @Body() body: DeleteMediaRequest
  ) {
    const ctx = createStoreContext(headerValue(headers, "x-correlation-id"));
    const actorId = headerValue(headers, "x-admin-actor") ?? "system";
    const key = typeof body?.objectKey === "string" ? body.objectKey : "";

    try {
      const result = await this.storage.delete(ctx, key);
      await this.audit.record({
        storeId: ctx.storeId,
        action: result.deleted ? "object_deleted" : "object_delete_missing",
        actorId,
        objectKey: result.objectKey,
        assetId: body?.assetId ?? null,
        summary: result.deleted ? (body?.reason ?? "Media object deleted") : "Media object was already missing",
        oldValue: { objectKey: result.objectKey },
        newValue: result,
        correlationId: ctx.correlationId
      });
      return result;
    } catch (error) {
      await this.audit.record({
        storeId: ctx.storeId,
        action: "object_delete_failed",
        actorId,
        objectKey: key || null,
        assetId: body?.assetId ?? null,
        summary: error instanceof Error ? error.message : "Media object delete failed",
        oldValue: { objectKey: key || null },
        newValue: null,
        correlationId: ctx.correlationId
      });
      throw error;
    }
  }

  @Post("/media/reconciliation-tasks")
  async enqueueReconciliation(
    @Headers() headers: HeaderBag,
    @Body() body: unknown
  ) {
    const ctx = createStoreContext(headerValue(headers, "x-correlation-id"));
    const actorId = headerValue(headers, "x-admin-actor") ?? "admin-gateway";
    let input: { assetId: string; objectKeys: string[] };
    try {
      input = normalizeReconciliationRequest(ctx.storeId, body);
    } catch (error) {
      throw validationFailed(error instanceof Error ? error.message : "media reconciliation request is invalid");
    }

    try {
      const task = await this.reconciliation.enqueue({
        storeId: ctx.storeId,
        assetId: input.assetId,
        objectKeys: input.objectKeys,
        correlationId: ctx.correlationId,
        initialDelayMs: Math.max(0, reconciliationInitialDelayMs),
        maxAttempts: Math.max(1, reconciliationMaxAttempts)
      });
      await this.audit.record({
        storeId: ctx.storeId,
        action: "reconciliation_enqueued",
        actorId,
        objectKey: input.objectKeys[0] ?? null,
        assetId: input.assetId,
        summary: "Catalog outcome uncertain; durable media reconciliation queued",
        oldValue: null,
        newValue: task,
        correlationId: ctx.correlationId
      });
      return task;
    } catch (error) {
      throw dependencyUnavailable("media reconciliation task could not be persisted", {
        reason: error instanceof Error ? error.message : "MEDIA_RECONCILIATION_PERSIST_FAILED"
      });
    }
  }

  @Get("/media/reconciliation-tasks")
  async reconciliationTasks(@Headers("x-correlation-id") correlationId?: string) {
    const ctx = createStoreContext(correlationId);
    try {
      const [items, auditEvents] = await Promise.all([
        this.reconciliation.list(ctx.storeId),
        this.reconciliation.listAudit(ctx.storeId)
      ]);
      return {
        items: items.map((task) => ({
          ...task,
          auditTrail: auditEvents.filter((event) => event.taskId === task.id)
        })),
        storageMode: "postgres" as const
      };
    } catch (error) {
      throw dependencyUnavailable("media reconciliation tasks are unavailable", {
        reason: error instanceof Error ? error.message : "MEDIA_RECONCILIATION_LIST_FAILED"
      });
    }
  }

  @Post("/media/reconciliation-tasks/:id/retry")
  retryReconciliation(
    @Headers() headers: HeaderBag,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    return this.handleReconciliation(headers, id, body, "retry");
  }

  @Post("/media/reconciliation-tasks/:id/discard")
  discardReconciliation(
    @Headers() headers: HeaderBag,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    return this.handleReconciliation(headers, id, body, "discard");
  }

  private async handleReconciliation(
    headers: HeaderBag,
    taskId: string,
    body: unknown,
    action: "retry" | "discard"
  ) {
    const ctx = createStoreContext(headerValue(headers, "x-correlation-id"));
    let input: ReturnType<typeof normalizeReconciliationAction>;
    try {
      input = normalizeReconciliationAction({
        taskId,
        actorId: headerValue(headers, "x-admin-actor"),
        decisionNote: typeof body === "object" && body !== null && "decisionNote" in body ? body.decisionNote : undefined,
        idempotencyKey: headerValue(headers, "idempotency-key") ?? headerValue(headers, "x-idempotency-key")
      });
    } catch (error) {
      throw validationFailed(error instanceof Error ? error.message : "media reconciliation action is invalid");
    }

    try {
      const result = await this.reconciliation.handleFailed({
        storeId: ctx.storeId,
        ...input,
        action,
        correlationId: ctx.correlationId,
        clientIp: (headerValue(headers, "x-forwarded-for")?.split(",")[0] ?? headerValue(headers, "x-real-ip") ?? "").trim().slice(0, 100) || null
      });
      if (!result.replayed) {
        await this.audit.record({
          storeId: ctx.storeId,
          action: action === "retry" ? "reconciliation_manual_retry" : "reconciliation_manual_discard",
          actorId: input.actorId,
          objectKey: result.task.objectKeys[0] ?? null,
          assetId: result.task.assetId,
          summary: input.decisionNote,
          oldValue: { status: result.auditEvent.oldStatus },
          newValue: { status: result.auditEvent.newStatus, taskId: result.task.id },
          correlationId: ctx.correlationId
        });
      }
      return result;
    } catch (error) {
      if (error instanceof MediaReconciliationTaskNotFoundError) {
        throw notFound(error.message, { taskId });
      }
      if (error instanceof MediaReconciliationTaskConflictError) {
        throw conflict(error.message, { taskId, action });
      }
      throw dependencyUnavailable("media reconciliation action could not be persisted");
    }
  }

  @Get("/media/audit-events")
  auditEvents(@Headers("x-correlation-id") correlationId?: string) {
    const ctx = createStoreContext(correlationId);
    return this.audit.list(ctx);
  }

  @Get("/files/:storeId/:scope/:kind/:yyyyMm/:fileName")
  async localFile(
    @Param("storeId") storeId: string,
    @Param("scope") scope: string,
    @Param("kind") kind: string,
    @Param("yyyyMm") yyyyMm: string,
    @Param("fileName") fileName: string,
    @Res({ passthrough: true }) response: HeaderResponse
  ) {
    const requestedPath = path.resolve(localStorageRoot, storeId, scope, kind, yyyyMm, fileName);

    if (!requestedPath.startsWith(path.resolve(localStorageRoot))) {
      throw validationFailed("media path is invalid", { reason: "MEDIA_PATH_INVALID" });
    }

    response.setHeader("Cache-Control", "public, max-age=31536000, immutable");

    try {
      await stat(requestedPath);
      return new StreamableFile(createReadStream(requestedPath));
    } catch {
      throw notFound("media file was not found", { reason: "MEDIA_FILE_NOT_FOUND" });
    }
  }

  @Get("/media/public/:storeId/:scope/:kind/:yyyyMm/:fileName")
  async publicMedia(
    @Param("storeId") storeId: string,
    @Param("scope") scope: string,
    @Param("kind") kind: string,
    @Param("yyyyMm") yyyyMm: string,
    @Param("fileName") fileName: string,
    @Res({ passthrough: true }) response: HeaderResponse
  ) {
    const ctx = createStoreContext(undefined, storeId);
    try {
      const media = await this.storage.read(ctx, [storeId, scope, kind, yyyyMm, fileName].join("/"));
      response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      response.setHeader("Content-Length", String(media.byteSize));
      response.setHeader("Content-Type", media.contentType);
      return new StreamableFile(media.stream);
    } catch {
      throw notFound("media file was not found", { reason: "MEDIA_FILE_NOT_FOUND" });
    }
  }
}

@Module({
  controllers: [MediaController],
  providers: [MediaStorage, MediaAuditRepository, MediaReconciliationRepository, MediaReconciliationWorker]
})
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true });
  await app.listen(Number(process.env.PORT ?? 4108), "0.0.0.0");
}

void bootstrap();
