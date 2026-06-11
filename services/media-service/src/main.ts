import "reflect-metadata";
import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Inject,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { NestFactory } from "@nestjs/core";
import { assertStoreContext, type StoreContext } from "@commerce/store-context";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Client as MinioClient } from "minio";

type MediaKind = "image" | "gif" | "video";
type StorageProvider = "local" | "minio";

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

const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4"]);
const maxUploadBytes = Number(process.env.MEDIA_MAX_UPLOAD_BYTES ?? 8 * 1024 * 1024);
const localStorageRoot = process.env.MEDIA_LOCAL_STORAGE_ROOT ?? path.resolve("storage", "media");
const objectStorageProvider = (process.env.OBJECT_STORAGE_PROVIDER ?? "local").toLowerCase() as StorageProvider;

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
    throw new BadRequestException("MEDIA_FILE_REQUIRED");
  }

  if (file.size > maxUploadBytes) {
    throw new BadRequestException("MEDIA_FILE_TOO_LARGE");
  }

  const sniffedMime = sniffMime(file.buffer);

  if (!sniffedMime || !allowedMimeTypes.has(sniffedMime)) {
    throw new BadRequestException("MEDIA_TYPE_NOT_ALLOWED");
  }

  if (file.mimetype && file.mimetype !== "application/octet-stream" && file.mimetype !== sniffedMime) {
    throw new BadRequestException("MEDIA_MIME_MISMATCH");
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
      throw new BadRequestException("OBJECT_STORAGE_CDN_URL_REQUIRED");
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
      throw new BadRequestException("OBJECT_STORAGE_CONFIG_INCOMPLETE");
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
  constructor(@Inject(MediaStorage) private readonly storage: MediaStorage) {}

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

  @Post("/media/product-assets")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: maxUploadBytes } }))
  uploadProductAsset(
    @Headers("x-correlation-id") correlationId: string | undefined,
    @UploadedFile() file: UploadedMediaFile | undefined
  ) {
    const ctx = createStoreContext(correlationId);

    if (!file) {
      throw new BadRequestException("MEDIA_FILE_REQUIRED");
    }

    return this.storage.save(ctx, file);
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
      throw new BadRequestException("MEDIA_PATH_INVALID");
    }

    response.setHeader("Cache-Control", "public, max-age=31536000, immutable");

    try {
      await stat(requestedPath);
      return new StreamableFile(createReadStream(requestedPath));
    } catch {
      throw new NotFoundException("MEDIA_FILE_NOT_FOUND");
    }
  }
}

@Module({ controllers: [MediaController], providers: [MediaStorage] })
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true });
  await app.listen(Number(process.env.PORT ?? 4108), "0.0.0.0");
}

void bootstrap();
