import "reflect-metadata";
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { HomepageLayout } from "@commerce/contracts";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { HomepageLayoutService, PgHomepageLayoutRepository } from "./homepage-layout-service.js";
import {
  newsletterEventAction,
  normalizeNewsletterEmail,
  normalizeNewsletterListQuery,
  normalizeNewsletterStatusUpdate,
  type NewsletterStatus
} from "./newsletter-subscription.js";

const defaultStoreId = process.env.DEFAULT_STORE_ID ?? "00000000-0000-4000-8000-000000000001";
const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://commerce:commerce@localhost:5432/app_db" });
const homepageLayouts = new HomepageLayoutService(new PgHomepageLayoutRepository(pool, defaultStoreId));

@Controller()
class StoreController {
  @Get("/health")
  health() {
    return { service: "store-service", status: "ok" };
  }

  @Get("/ready")
  async ready() {
    await pool.query("SELECT 1");
    return { service: "store-service", status: "ready", database: "connected" };
  }

  @Get("/default-store")
  defaultStore() {
    return {
      storeId: defaultStoreId,
      slug: process.env.DEFAULT_STORE_SLUG ?? "demo-teaware",
      region: process.env.DEFAULT_STORE_REGION ?? "local",
      timezone: process.env.DEFAULT_STORE_TIMEZONE ?? "Asia/Hong_Kong"
    };
  }


  @Get("/homepage-layout")
  homepageLayout() {
    return homepageLayouts.get();
  }

  @Put("/homepage-layout")
  saveHomepageLayout(
    @Headers("x-admin-actor") actor: string | undefined,
    @Body() body: { layout: HomepageLayout; publish?: boolean }
  ) {
    return homepageLayouts.save(body.layout, actor?.trim() || "unknown-admin", body.publish === true);
  }

  @Post("/newsletter-subscriptions")
  async subscribe(@Body() body: { email?: string; locale?: string; consent?: boolean }) {
    if (body.consent !== true) throw new BadRequestException("newsletter consent is required");
    let email: string;
    try {
      email = normalizeNewsletterEmail(body.email);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "invalid email");
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const previous = await client.query<{ status: NewsletterStatus }>(
        `SELECT status
         FROM newsletter_subscriptions
         WHERE store_id = $1 AND email = $2
         FOR UPDATE`,
        [defaultStoreId, email]
      );
      const previousStatus = previous.rows[0]?.status ?? null;
      await client.query(
        `INSERT INTO newsletter_subscriptions (
           store_id, email, locale, consent_at, status, unsubscribed_at,
           status_updated_at, status_updated_by
         )
         VALUES ($1, $2, $3, now(), 'active', NULL, now(), 'storefront')
         ON CONFLICT (store_id, email) DO UPDATE
         SET locale = EXCLUDED.locale,
             consent_at = now(),
             status = 'active',
             unsubscribed_at = NULL,
             status_updated_at = now(),
             status_updated_by = 'storefront'`,
        [defaultStoreId, email, body.locale === "zh" ? "zh" : "en"]
      );
      await client.query(
        `INSERT INTO newsletter_subscription_events (id, store_id, email, action, actor)
         VALUES ($1, $2, $3, $4, 'storefront')`,
        [randomUUID(), defaultStoreId, email, newsletterEventAction(previousStatus, "active")]
      );
      await client.query("COMMIT");
      return { email, status: "active" };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  @Get("/newsletter-subscriptions")
  async subscriptions(
    @Query("page") pageValue?: string,
    @Query("size") sizeValue?: string,
    @Query("status") statusValue?: string,
    @Query("search") searchValue?: string
  ) {
    let query: ReturnType<typeof normalizeNewsletterListQuery>;
    try {
      query = normalizeNewsletterListQuery({
        page: pageValue,
        size: sizeValue,
        status: statusValue,
        search: searchValue
      });
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "invalid query");
    }

    const values: unknown[] = [defaultStoreId];
    const conditions = ["store_id = $1"];
    if (query.status !== "all") {
      values.push(query.status);
      conditions.push(`status = $${values.length}`);
    }
    if (query.search) {
      values.push(`%${query.search}%`);
      conditions.push(`email ILIKE $${values.length}`);
    }
    const where = conditions.join(" AND ");
    const pageValues = [...values, query.size, query.offset];
    const [countResult, result] = await Promise.all([
      pool.query<{ total: string }>(
        `SELECT count(*)::text AS total FROM newsletter_subscriptions WHERE ${where}`,
        values
      ),
      pool.query<{
        email: string;
        locale: string;
        status: NewsletterStatus;
        consent_at: Date;
        unsubscribed_at: Date | null;
        status_updated_at: Date;
        status_updated_by: string;
      }>(
        `SELECT email, locale, status, consent_at, unsubscribed_at, status_updated_at, status_updated_by
         FROM newsletter_subscriptions
         WHERE ${where}
         ORDER BY consent_at DESC
         LIMIT $${pageValues.length - 1} OFFSET $${pageValues.length}`,
        pageValues
      )
    ]);
    const total = Number(countResult.rows[0]?.total ?? 0);
    return {
      page: query.page,
      size: query.size,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.size)),
      items: result.rows.map((row) => ({
        email: row.email,
        locale: row.locale,
        status: row.status,
        consentAt: row.consent_at.toISOString(),
        unsubscribedAt: row.unsubscribed_at?.toISOString() ?? null,
        statusUpdatedAt: row.status_updated_at.toISOString(),
        statusUpdatedBy: row.status_updated_by
      }))
    };
  }

  @Patch("/newsletter-subscriptions/:email")
  async updateSubscriptionStatus(
    @Param("email") emailValue: string,
    @Headers("x-admin-actor") actorValue: string | undefined,
    @Body() body: { status?: string }
  ) {
    let update: ReturnType<typeof normalizeNewsletterStatusUpdate>;
    try {
      update = normalizeNewsletterStatusUpdate(emailValue, body.status);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "invalid status update");
    }

    const actor = actorValue?.trim() || "unknown-admin";
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const previous = await client.query<{ status: NewsletterStatus }>(
        `SELECT status
         FROM newsletter_subscriptions
         WHERE store_id = $1 AND email = $2
         FOR UPDATE`,
        [defaultStoreId, update.email]
      );
      const previousStatus = previous.rows[0]?.status;
      if (!previousStatus) throw new NotFoundException("newsletter subscription not found");

      const result = await client.query<{
        email: string;
        locale: string;
        status: NewsletterStatus;
        consent_at: Date;
        unsubscribed_at: Date | null;
        status_updated_at: Date;
        status_updated_by: string;
      }>(
        `UPDATE newsletter_subscriptions
         SET status = $3,
             unsubscribed_at = CASE WHEN $3 = 'unsubscribed' THEN now() ELSE NULL END,
             status_updated_at = now(),
             status_updated_by = $4
         WHERE store_id = $1 AND email = $2
         RETURNING email, locale, status, consent_at, unsubscribed_at, status_updated_at, status_updated_by`,
        [defaultStoreId, update.email, update.status, actor]
      );
      await client.query(
        `INSERT INTO newsletter_subscription_events (id, store_id, email, action, actor)
         VALUES ($1, $2, $3, $4, $5)`,
        [randomUUID(), defaultStoreId, update.email, newsletterEventAction(previousStatus, update.status), actor]
      );
      await client.query("COMMIT");
      const row = result.rows[0];
      return {
        email: row.email,
        locale: row.locale,
        status: row.status,
        consentAt: row.consent_at.toISOString(),
        unsubscribedAt: row.unsubscribed_at?.toISOString() ?? null,
        statusUpdatedAt: row.status_updated_at.toISOString(),
        statusUpdatedBy: row.status_updated_by
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

@Module({ controllers: [StoreController] })
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true });
  await app.listen(Number(process.env.PORT ?? 4101), "0.0.0.0");
}

void bootstrap();
