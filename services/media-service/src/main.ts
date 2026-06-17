import "reflect-metadata";
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Inject,
  Injectable,
  Module,
  NotFoundException,
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
import { Client as MinioClient } from "minio";
import { Pool } from "pg";

type MediaKind = "image" | "gif" | "video";
type StorageProvider = "local" | "minio";
type StorageMode = "postgres" | "memory";
type MediaAuditAction = "upload_accepted" | "upload_rejected" | "object_deleted" | "object_delete_missing" | "object_delete_failed";

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
const memoryAuditEvents: MediaAuditEvent[] = [];

function headerValue(headers: HeaderBag, name: string): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}

function createStoreContext(correlationId: string | undefined): StoreContext {
  return assertStoreContext({
    storeId: process.env.DEFAULT_STORE_ID ?? "00000000-0000-4000-8000-000000000001",
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
  private readonly cdnUrl = process.env.OBJECT_STORAGE_CDN_URL?.replace(/\/$/, "");
  private minioClient: MinioClient | null = null;

  async save(ctx: StoreContext, file: UploadedMediaFile): Promise<MediaUploadResult> {
    const validation = validateUpload(file);
    const key = objectKey(ctx, validation.kind, file, validation.mimeType);
    const assetId = randomUUID();
    const url = this.provider === "minio"
      ? await this.saveToMinio(key, file.buffer, validation.mimeType)
      : await this.saveToLocal(key, file.buffer);

    return {
      assetId,
      storeId: ctx.storeId,
      provider: this.provider,
      kind: validation.kind,
      objectKey: key,
      url,
      originalName: file.originalname,
      mimeType: validation.mimeType,
      byteSize: file.size,
      width: validation.width,
      height: validation.height
    };
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

  private async saveToLocal(key: string, buffer: Buffer): Promise<string> {
    const targetPath = path.join(localStorageRoot, key);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, buffer);
    return `${process.env.MEDIA_PUBLIC_BASE_URL ?? "http://localhost:4108/files"}/${key.split("/").map(encodeURIComponent).join("/")}`;
  }

  private async saveToMinio(key: string, buffer: Buffer, mimeType: string): Promise<string> {
    const client = this.getMinioClient();
    const exists = await client.bucketExists(this.bucket).catch(() => false);

    if (!exists) {
      await client.makeBucket(this.bucket);
    }

    await client.putObject(this.bucket, key, buffer, buffer.length, {
      "Content-Type": mimeType,
      "Cache-Control": "public, max-age=31536000, immutable"
    });

    if (!this.cdnUrl) {
      throw dependencyUnavailable("object storage CDN URL is not configured", {
        dependency: "object-storage",
        reason: "OBJECT_STORAGE_CDN_URL_REQUIRED"
      });
    }

    return `${this.cdnUrl}/${key.split("/").map(encodeURIComponent).join("/")}`;
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

@Controller()
class MediaController {
  constructor(
    @Inject(MediaStorage) private readonly storage: MediaStorage,
    @Inject(MediaAuditRepository) private readonly audit: MediaAuditRepository
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

    return {
      service: "media-service",
      status: audit.storageMode === "postgres" || !mediaDatabaseUrl ? "ready" : "degraded",
      storeId: ctx.storeId,
      storage: {
        provider: objectStorageProvider,
        bucketConfigured: Boolean(process.env.OBJECT_STORAGE_BUCKET),
        cdnConfigured: objectStorageProvider === "local" || Boolean(process.env.OBJECT_STORAGE_CDN_URL)
      },
      audit
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
}

@Module({ controllers: [MediaController], providers: [MediaStorage, MediaAuditRepository] })
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true });
  await app.listen(Number(process.env.PORT ?? 4108), "0.0.0.0");
}

void bootstrap();
