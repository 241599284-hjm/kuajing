import "reflect-metadata";
import { BadRequestException, Body, Controller, Get, Headers, HttpException, Injectable, Module, Param, Post, Put, Query } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { assertStoreContext } from "@commerce/store-context";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";

const { Pool } = pg;

type HeaderBag = Record<string, string | string[] | undefined>;
type ReviewStatus = "pending" | "approved" | "hidden" | "deleted";
type StorageMode = "postgres" | "memory";

type ProductReview = {
  id: string;
  productSlug: string;
  orderId: string | null;
  customerEmail: string;
  nickname: string;
  rating: number;
  content: string;
  imageUrls: string[];
  status: ReviewStatus;
  merchantReply: string | null;
  pinned: boolean;
  likeCount: number;
  createdAt: string;
  updatedAt: string;
};

type OrderDetailForReview = {
  orderId: string;
  customerEmail: string;
  status: string;
  paymentStatus: string;
  lines: Array<{ productSlug: string }>;
};

const databaseUrl = process.env.REVIEW_DATABASE_URL;
const notificationServiceUrl = process.env.NOTIFICATION_SERVICE_URL ?? "http://localhost:4111";
const orderServiceUrl = process.env.ORDER_SERVICE_URL ?? "http://localhost:4105";
const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null;
const memoryReviews = new Map<string, ProductReview>();

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
    correlationId: headerValue(headers, "x-correlation-id") ?? "local-review-correlation"
  });
}

function sanitizeText(value: unknown, field: string, min = 1, max = 2000) {
  if (typeof value !== "string") throw new BadRequestException(`${field} is required`);
  const text = value.trim();
  if (text.length < min || text.length > max) throw new BadRequestException(`${field} length is invalid`);
  return text;
}

function normalizeRating(value: unknown) {
  const rating = Number(value);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new BadRequestException("rating must be an integer from 1 to 5");
  }
  return rating;
}

function normalizeImages(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && /^https?:\/\//.test(item)).slice(0, 6);
}

function normalizeEmail(value: unknown) {
  const email = sanitizeText(value, "customerEmail", 5, 180).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new BadRequestException("valid customerEmail is required");
  }
  return email;
}

function toReview(row: {
  id: string;
  product_slug: string;
  order_id: string | null;
  customer_email: string;
  nickname: string;
  rating: number;
  content: string;
  image_urls: string[] | string;
  status: ReviewStatus;
  merchant_reply: string | null;
  pinned: boolean;
  like_count: number;
  created_at: Date;
  updated_at: Date;
}): ProductReview {
  const images = Array.isArray(row.image_urls) ? row.image_urls : JSON.parse(row.image_urls || "[]") as string[];

  return {
    id: row.id,
    productSlug: row.product_slug,
    orderId: row.order_id,
    customerEmail: row.customer_email,
    nickname: row.nickname,
    rating: row.rating,
    content: row.content,
    imageUrls: images,
    status: row.status,
    merchantReply: row.merchant_reply,
    pinned: row.pinned,
    likeCount: row.like_count,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

@Injectable()
class ReviewRepository {
  async storageMode(): Promise<StorageMode> {
    if (!pool) return "memory";
    try {
      await pool.query("SELECT 1");
      return "postgres";
    } catch {
      return "memory";
    }
  }

  async listPublic(productSlug: string) {
    if (!pool) {
      return [...memoryReviews.values()]
        .filter((review) => review.productSlug === productSlug && review.status === "approved")
        .sort((a, b) => Number(b.pinned) - Number(a.pinned) || Date.parse(b.createdAt) - Date.parse(a.createdAt));
    }

    try {
      const result = await pool.query(
        `
          SELECT *
          FROM product_reviews
          WHERE product_slug = $1 AND status = 'approved'
          ORDER BY pinned DESC, created_at DESC
          LIMIT 50
        `,
        [productSlug]
      );
      return result.rows.map(toReview);
    } catch {
      return [];
    }
  }

  async listAdmin() {
    if (!pool) {
      return { reviews: [...memoryReviews.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)), storageMode: "memory" as StorageMode };
    }

    try {
      const result = await pool.query("SELECT * FROM product_reviews ORDER BY created_at DESC LIMIT 200");
      return { reviews: result.rows.map(toReview), storageMode: "postgres" as StorageMode };
    } catch {
      return { reviews: [...memoryReviews.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)), storageMode: "memory" as StorageMode };
    }
  }

  async create(headers: HeaderBag, productSlug: string, body: Record<string, unknown>) {
    const now = new Date().toISOString();
    const email = normalizeEmail(body.customerEmail);
    const review: ProductReview = {
      id: randomUUID(),
      productSlug,
      orderId: sanitizeText(body.orderId, "orderId", 1, 120),
      customerEmail: email,
      nickname: sanitizeText(body.nickname, "nickname", 1, 80),
      rating: normalizeRating(body.rating),
      content: sanitizeText(body.content, "content", 8, 2000),
      imageUrls: normalizeImages(body.imageUrls),
      status: "pending",
      merchantReply: null,
      pinned: false,
      likeCount: 0,
      createdAt: now,
      updatedAt: now
    };
    const ipHash = createHash("sha256").update(headerValue(headers, "x-forwarded-for") ?? "local").digest("hex");

    if (!pool) {
      const duplicate = [...memoryReviews.values()].find((item) => item.productSlug === review.productSlug && item.orderId === review.orderId && item.customerEmail === review.customerEmail);
      if (duplicate) throw new BadRequestException("review already exists for this order and product");
      memoryReviews.set(review.id, review);
      return { review, storageMode: "memory" as StorageMode };
    }

    try {
      const result = await pool.query(
        `
          INSERT INTO product_reviews (
            id, product_slug, order_id, customer_email, nickname, rating, content, image_urls, status, ip_hash, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, 'pending', $9, $10, $10)
          RETURNING *
        `,
        [review.id, review.productSlug, review.orderId, review.customerEmail, review.nickname, review.rating, review.content, JSON.stringify(review.imageUrls), ipHash, now]
      );
      return { review: toReview(result.rows[0]), storageMode: "postgres" as StorageMode };
    } catch (error) {
      if (error instanceof Error && error.message.includes("duplicate")) {
        throw new BadRequestException("review already exists for this order and product");
      }
      throw error;
    }
  }

  async update(id: string, body: Record<string, unknown>) {
    const status = typeof body.status === "string" ? body.status as ReviewStatus : undefined;
    const merchantReply = typeof body.merchantReply === "string" ? body.merchantReply.trim() : null;
    const pinned = typeof body.pinned === "boolean" ? body.pinned : false;

    if (status && !["pending", "approved", "hidden", "deleted"].includes(status)) {
      throw new BadRequestException("review status is invalid");
    }

    if (!pool) {
      const current = memoryReviews.get(id);
      if (!current) throw new BadRequestException("review not found");
      const next = { ...current, status: status ?? current.status, merchantReply, pinned, updatedAt: new Date().toISOString() };
      memoryReviews.set(id, next);
      return { review: next, storageMode: "memory" as StorageMode };
    }

    const result = await pool.query(
      `
        UPDATE product_reviews
        SET status = COALESCE($2, status),
            merchant_reply = $3,
            pinned = $4,
            updated_at = now()
        WHERE id = $1
        RETURNING *
      `,
      [id, status ?? null, merchantReply, pinned]
    );

    if (!result.rows[0]) throw new BadRequestException("review not found");
    return { review: toReview(result.rows[0]), storageMode: "postgres" as StorageMode };
  }
}

@Injectable()
class OrderPurchaseVerifier {
  async assertCanReview(headers: HeaderBag, productSlug: string, body: Record<string, unknown>) {
    const ctx = createContext(headers);
    const customerEmail = normalizeEmail(body.customerEmail);
    const orderId = sanitizeText(body.orderId, "orderId", 1, 120);

    let detail: OrderDetailForReview;

    try {
      const response = await fetch(`${orderServiceUrl}/orders/${encodeURIComponent(orderId)}`, {
        headers: {
          "x-correlation-id": ctx.correlationId
        }
      });

      if (!response.ok) {
        throw new Error(`order-service returned ${response.status}`);
      }

      detail = (await response.json()) as OrderDetailForReview;
    } catch {
      throw new BadRequestException("order verification is unavailable; review was not accepted");
    }

    if (detail.customerEmail.toLowerCase() !== customerEmail) {
      throw new BadRequestException("review email does not match the order");
    }

    if (detail.paymentStatus !== "paid") {
      throw new BadRequestException("only paid orders can be reviewed");
    }

    if (!Array.isArray(detail.lines) || !detail.lines.some((line) => line.productSlug === productSlug)) {
      throw new BadRequestException("this order does not contain the reviewed product");
    }
  }
}

@Injectable()
class ReviewNotificationService {
  async notifyPending(headers: HeaderBag, review: ProductReview) {
    const ctx = createContext(headers);

    await fetch(`${notificationServiceUrl}/emails/transactional`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-correlation-id": ctx.correlationId
      },
      body: JSON.stringify({
        to: process.env.REVIEW_ADMIN_EMAIL ?? "admin@demo-teaware.local",
        templateKey: "review_pending_admin",
        idempotencyKey: `review-pending-${review.id}`,
        variables: {
          brandName: process.env.STOREFRONT_BRAND_NAME ?? "Demo Teaware",
          productName: review.productSlug,
          reviewerName: review.nickname,
          rating: review.rating,
          reviewText: review.content,
          adminUrl: process.env.ADMIN_PUBLIC_URL ?? "http://localhost:3001",
          locale: "zh"
        }
      })
    }).catch(() => undefined);
  }
}

@Controller()
class ReviewController {
  constructor(
    private readonly repository: ReviewRepository,
    private readonly orderPurchaseVerifier: OrderPurchaseVerifier,
    private readonly notifications: ReviewNotificationService
  ) {}

  @Get("/health")
  health() {
    return { service: "review-service", status: "ok" };
  }

  @Get("/ready")
  async ready() {
    const storageMode = await this.repository.storageMode();
    return { service: "review-service", status: storageMode === "postgres" ? "ready" : "degraded", storageMode };
  }

  @Get("/products/:slug/reviews")
  async publicReviews(@Param("slug") slug: string) {
    const reviews = await this.repository.listPublic(slug);
    const averageRating = reviews.length > 0 ? Math.round((reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length) * 10) / 10 : 0;
    return { reviews, total: reviews.length, averageRating };
  }

  @Post("/products/:slug/reviews")
  async createReview(@Headers() headers: HeaderBag, @Param("slug") slug: string, @Body() body: Record<string, unknown>) {
    await this.orderPurchaseVerifier.assertCanReview(headers, slug, body);
    const result = await this.repository.create(headers, slug, body);
    await this.notifications.notifyPending(headers, result.review);
    return result;
  }

  @Get("/admin/reviews")
  adminReviews(@Query("status") _status?: string) {
    return this.repository.listAdmin();
  }

  @Put("/admin/reviews/:id")
  updateReview(@Param("id") id: string, @Body() body: Record<string, unknown>) {
    return this.repository.update(id, body);
  }
}

@Module({
  controllers: [ReviewController],
  providers: [ReviewRepository, OrderPurchaseVerifier, ReviewNotificationService]
})
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true });
  await app.listen(Number(process.env.PORT ?? 4112), "0.0.0.0");
}

void bootstrap();
