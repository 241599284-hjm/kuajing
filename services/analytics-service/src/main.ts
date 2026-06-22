import "reflect-metadata";
import { Body, Controller, Get, Headers, HttpException, Injectable, Module, Param, Post, Query } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ERROR_CODES } from "@commerce/error-codes";
import { assertStoreContext } from "@commerce/store-context";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { protectIp, revealIp } from "./ip-protection.js";
import {
  clampDurationSeconds,
  maskIp,
  normalizeCountry,
  normalizePath,
  resolveBusinessDayRange,
  shouldRecordServerPath
} from "./visitor-analytics.js";

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.ANALYTICS_DATABASE_URL ?? "postgresql://commerce:commerce@localhost:5432/app_db"
});
const defaultStoreId = process.env.DEFAULT_STORE_ID ?? "00000000-0000-4000-8000-000000000001";
const defaultTimezone = process.env.DEFAULT_STORE_TIMEZONE ?? "Asia/Hong_Kong";
const retentionDays = Math.max(1, Math.min(365, Number(process.env.VISITOR_ANALYTICS_RETENTION_DAYS ?? 30)));
const serverLogRetentionDays = Math.max(1, Math.min(90, Number(process.env.SERVER_ACCESS_LOG_RETENTION_DAYS ?? 14)));
const ingestToken = process.env.ANALYTICS_INGEST_TOKEN?.trim() ?? "";
type HeaderBag = Record<string, string | string[] | undefined>;

function headerValue(headers: HeaderBag, name: string) {
  const value = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function context(headers: HeaderBag) {
  return assertStoreContext({
    storeId: defaultStoreId,
    region: process.env.DEFAULT_STORE_REGION ?? "local",
    timezone: defaultTimezone,
    correlationId: headerValue(headers, "x-correlation-id") ?? randomUUID()
  });
}

function requiredUuid(value: unknown, field: string) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new HttpException({ code: ERROR_CODES.VALIDATION_FAILED, message: `${field} must be a UUID.` }, 400);
  }
  return normalized;
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function assertIngestToken(headers: HeaderBag) {
  const token = headerValue(headers, "x-analytics-ingest-token")?.trim() ?? "";
  if (!ingestToken || token !== ingestToken) {
    throw new HttpException({ code: ERROR_CODES.UNAUTHORIZED, message: "Analytics ingest token is invalid." }, 401);
  }
}

@Injectable()
class AnalyticsRepository {
  async serverRequest(headers: HeaderBag, body: Record<string, unknown>) {
    assertIngestToken(headers);
    const path = normalizePath(body.path);
    if (!shouldRecordServerPath(path)) return { accepted: false, reason: "excluded_path" };
    const store = context(headers);
    const ip = cleanText(body.ipAddress, 128) || "unknown";
    const country = normalizeCountry(cleanText(body.countryCode, 2));
    await pool.query(
      `insert into visitor_server_requests (
        id, store_id, ip_ciphertext, ip_masked, country_code, country_name,
        path, referrer, user_agent, requested_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())`,
      [
        randomUUID(),
        store.storeId,
        protectIp(ip),
        maskIp(ip),
        country.code,
        country.name,
        path,
        cleanText(body.referrer, 2_000),
        cleanText(body.userAgent, 500)
      ]
    );
    return { accepted: true };
  }

  async start(headers: HeaderBag, body: Record<string, unknown>) {
    assertIngestToken(headers);
    const store = context(headers);
    const sessionId = requiredUuid(body.sessionId, "sessionId");
    const pageViewId = requiredUuid(body.pageViewId, "pageViewId");
    const path = normalizePath(body.path);
    const country = normalizeCountry(headerValue(headers, "x-client-country"));
    const ip = headerValue(headers, "x-client-ip")?.trim() || "unknown";
    const now = new Date();

    await pool.query("begin");
    try {
      await pool.query(
        `insert into visitor_sessions (
          id, store_id, ip_ciphertext, ip_masked, country_code, country_name, user_agent,
          referrer, landing_path, exit_path, started_at, last_seen_at, consent_at
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10,$10,$10)
        on conflict (id) do nothing`,
        [
          sessionId,
          store.storeId,
          protectIp(ip),
          maskIp(ip),
          country.code,
          country.name,
          cleanText(headerValue(headers, "user-agent"), 500),
          cleanText(body.referrer, 2_000),
          path,
          now
        ]
      );
      await pool.query(
        `insert into visitor_page_views (id, session_id, store_id, path, title, entered_at, last_seen_at)
         values ($1,$2,$3,$4,$5,$6,$6)
         on conflict (id) do nothing`,
        [pageViewId, sessionId, store.storeId, path, cleanText(body.title, 500), now]
      );
      await pool.query("commit");
      return { sessionId, pageViewId, startedAt: now.toISOString() };
    } catch (error) {
      await pool.query("rollback");
      throw error;
    }
  }

  async addPage(headers: HeaderBag, sessionIdValue: string, body: Record<string, unknown>) {
    assertIngestToken(headers);
    const store = context(headers);
    const sessionId = requiredUuid(sessionIdValue, "sessionId");
    const pageViewId = requiredUuid(body.pageViewId, "pageViewId");
    const now = new Date();
    const result = await pool.query(
      `insert into visitor_page_views (id, session_id, store_id, path, title, entered_at, last_seen_at)
       select $1,$2,$3,$4,$5,$6,$6
       where exists (select 1 from visitor_sessions where id = $2 and store_id = $3)
       on conflict (id) do nothing
       returning id`,
      [pageViewId, sessionId, store.storeId, normalizePath(body.path), cleanText(body.title, 500), now]
    );
    if (result.rowCount === 0) {
      throw new HttpException({ code: ERROR_CODES.NOT_FOUND, message: "Visitor session was not found." }, 404);
    }
    await pool.query(
      "update visitor_sessions set last_seen_at = $1, exit_path = $2 where id = $3 and store_id = $4",
      [now, normalizePath(body.path), sessionId, store.storeId]
    );
    return { pageViewId, enteredAt: now.toISOString() };
  }

  async activity(headers: HeaderBag, sessionIdValue: string, body: Record<string, unknown>) {
    assertIngestToken(headers);
    const store = context(headers);
    const sessionId = requiredUuid(sessionIdValue, "sessionId");
    const pageViewId = requiredUuid(body.pageViewId, "pageViewId");
    const duration = clampDurationSeconds(body.durationSeconds);
    const ended = body.ended === true;
    const now = new Date();
    const result = await pool.query(
      `update visitor_page_views
       set duration_seconds = greatest(duration_seconds, $1),
           last_seen_at = $2,
           exited_at = case when $3 then $2 else exited_at end
       where id = $4 and session_id = $5 and store_id = $6
       returning path`,
      [duration, now, ended, pageViewId, sessionId, store.storeId]
    );
    if (result.rowCount === 0) {
      throw new HttpException({ code: ERROR_CODES.NOT_FOUND, message: "Visitor page view was not found." }, 404);
    }
    await pool.query(
      `update visitor_sessions
       set last_seen_at = $1,
           ended_at = case when $2 then $1 else ended_at end,
           exit_path = $3,
           duration_seconds = (
             select coalesce(sum(duration_seconds), 0)
             from visitor_page_views
             where session_id = $4 and store_id = $5
           )
       where id = $4 and store_id = $5`,
      [now, ended, result.rows[0].path, sessionId, store.storeId]
    );
    return { accepted: true, durationSeconds: duration };
  }

  async list(headers: HeaderBag, date: string, pageValue: string | undefined, sizeValue: string | undefined) {
    const store = context(headers);
    const page = Math.max(1, Number(pageValue ?? 1) || 1);
    const size = Math.max(1, Math.min(100, Number(sizeValue ?? 20) || 20));
    const range = resolveBusinessDayRange(date, store.timezone);
    const [countResult, summaryResult, rowsResult] = await Promise.all([
      pool.query<{ count: string }>(
        "select count(*)::text as count from visitor_sessions where store_id = $1 and started_at >= $2 and started_at < $3",
        [store.storeId, range.start, range.end]
      ),
      pool.query<{
        sessions: string;
        unique_visitors: string;
        average_duration_seconds: string;
        page_views: string;
      }>(
        `select count(*)::text as sessions,
          count(distinct coalesce(ip_ciphertext, ip_masked))::text as unique_visitors,
          coalesce(round(avg(duration_seconds)), 0)::text as average_duration_seconds,
          coalesce(sum((select count(*) from visitor_page_views pv where pv.session_id = s.id)), 0)::text as page_views
         from visitor_sessions s
         where store_id = $1 and started_at >= $2 and started_at < $3`,
        [store.storeId, range.start, range.end]
      ),
      pool.query<{
        id: string;
        ip_ciphertext: string | null;
        ip_masked: string;
        country_code: string | null;
        country_name: string;
        landing_path: string;
        exit_path: string;
        duration_seconds: number;
        started_at: Date;
        last_seen_at: Date;
        page_count: string;
      }>(
        `select s.id, s.ip_ciphertext, s.ip_masked, s.country_code, s.country_name,
          s.landing_path, s.exit_path, s.duration_seconds, s.started_at, s.last_seen_at,
          count(pv.id)::text as page_count
         from visitor_sessions s
         left join visitor_page_views pv on pv.session_id = s.id
         where s.store_id = $1 and s.started_at >= $2 and s.started_at < $3
         group by s.id
         order by s.started_at desc
         limit $4 offset $5`,
        [store.storeId, range.start, range.end, size, (page - 1) * size]
      )
    ]);
    const summary = summaryResult.rows[0];
    return {
      date,
      timezone: store.timezone,
      page,
      size,
      total: Number(countResult.rows[0]?.count ?? 0),
      summary: {
        sessions: Number(summary?.sessions ?? 0),
        uniqueVisitors: Number(summary?.unique_visitors ?? 0),
        averageDurationSeconds: Number(summary?.average_duration_seconds ?? 0),
        pageViews: Number(summary?.page_views ?? 0)
      },
      items: rowsResult.rows.map((row) => ({
        id: row.id,
        ipAddress: revealIp(row.ip_ciphertext) ?? row.ip_masked,
        countryCode: row.country_code,
        countryName: row.country_name,
        landingPath: row.landing_path,
        exitPath: row.exit_path,
        durationSeconds: row.duration_seconds,
        pageCount: Number(row.page_count),
        startedAt: row.started_at.toISOString(),
        lastSeenAt: row.last_seen_at.toISOString()
      }))
    };
  }

  async detail(headers: HeaderBag, idValue: string) {
    const store = context(headers);
    const id = requiredUuid(idValue, "sessionId");
    const [sessionResult, pagesResult] = await Promise.all([
      pool.query<{
        id: string;
        ip_ciphertext: string | null;
        ip_masked: string;
        country_code: string | null;
        country_name: string;
        user_agent: string;
        referrer: string;
        landing_path: string;
        exit_path: string;
        duration_seconds: number;
        started_at: Date;
        last_seen_at: Date;
        ended_at: Date | null;
      }>("select * from visitor_sessions where id = $1 and store_id = $2", [id, store.storeId]),
      pool.query<{
        id: string;
        path: string;
        title: string;
        duration_seconds: number;
        entered_at: Date;
        exited_at: Date | null;
      }>(
        `select id, path, title, duration_seconds, entered_at, exited_at
         from visitor_page_views where session_id = $1 and store_id = $2 order by entered_at`,
        [id, store.storeId]
      )
    ]);
    const row = sessionResult.rows[0];
    if (!row) throw new HttpException({ code: ERROR_CODES.NOT_FOUND, message: "Visitor session was not found." }, 404);
    return {
      id: row.id,
      ipAddress: revealIp(row.ip_ciphertext) ?? row.ip_masked,
      countryCode: row.country_code,
      countryName: row.country_name,
      userAgent: row.user_agent,
      referrer: row.referrer,
      landingPath: row.landing_path,
      exitPath: row.exit_path,
      durationSeconds: row.duration_seconds,
      startedAt: row.started_at.toISOString(),
      lastSeenAt: row.last_seen_at.toISOString(),
      endedAt: row.ended_at?.toISOString() ?? null,
      pages: pagesResult.rows.map((page) => ({
        id: page.id,
        path: page.path,
        title: page.title,
        durationSeconds: page.duration_seconds,
        enteredAt: page.entered_at.toISOString(),
        exitedAt: page.exited_at?.toISOString() ?? null
      }))
    };
  }

  async serverRequests(headers: HeaderBag, date: string, pageValue: string | undefined, sizeValue: string | undefined) {
    const store = context(headers);
    const page = Math.max(1, Number(pageValue ?? 1) || 1);
    const size = Math.max(1, Math.min(100, Number(sizeValue ?? 50) || 50));
    const range = resolveBusinessDayRange(date, store.timezone);
    const [countResult, uniqueResult, rowsResult] = await Promise.all([
      pool.query<{ count: string }>(
        "select count(*)::text as count from visitor_server_requests where store_id = $1 and requested_at >= $2 and requested_at < $3",
        [store.storeId, range.start, range.end]
      ),
      pool.query<{ count: string }>(
        `select count(distinct coalesce(ip_ciphertext, ip_masked))::text as count
         from visitor_server_requests where store_id = $1 and requested_at >= $2 and requested_at < $3`,
        [store.storeId, range.start, range.end]
      ),
      pool.query<{
        id: string;
        ip_ciphertext: string | null;
        ip_masked: string;
        country_code: string | null;
        country_name: string;
        path: string;
        referrer: string;
        user_agent: string;
        requested_at: Date;
      }>(
        `select id, ip_ciphertext, ip_masked, country_code, country_name, path, referrer, user_agent, requested_at
         from visitor_server_requests
         where store_id = $1 and requested_at >= $2 and requested_at < $3
         order by requested_at desc limit $4 offset $5`,
        [store.storeId, range.start, range.end, size, (page - 1) * size]
      )
    ]);
    return {
      date,
      timezone: store.timezone,
      page,
      size,
      total: Number(countResult.rows[0]?.count ?? 0),
      uniqueVisitors: Number(uniqueResult.rows[0]?.count ?? 0),
      items: rowsResult.rows.map((row) => ({
        id: row.id,
        ipAddress: revealIp(row.ip_ciphertext) ?? row.ip_masked,
        countryCode: row.country_code,
        countryName: row.country_name,
        path: row.path,
        referrer: row.referrer,
        userAgent: row.user_agent,
        requestedAt: row.requested_at.toISOString()
      }))
    };
  }

  async cleanup() {
    const [sessions, requests] = await Promise.all([
      pool.query(`delete from visitor_sessions where started_at < now() - ($1::text || ' days')::interval`, [retentionDays]),
      pool.query(`delete from visitor_server_requests where requested_at < now() - ($1::text || ' days')::interval`, [serverLogRetentionDays])
    ]);
    return { sessions: sessions.rowCount ?? 0, serverRequests: requests.rowCount ?? 0 };
  }
}

const analyticsRepository = new AnalyticsRepository();

@Controller()
class AnalyticsController {
  @Get("/health")
  health() {
    return { service: "analytics-service", status: "ok", retentionDays, serverLogRetentionDays };
  }

  @Get("/ready")
  async ready() {
    await pool.query("select 1");
    return { service: "analytics-service", status: "ready", postgres: "ok" };
  }

  @Post("/sessions/start")
  start(@Headers() headers: HeaderBag, @Body() body: Record<string, unknown>) {
    return analyticsRepository.start(headers, body);
  }

  @Post("/server-requests")
  serverRequest(@Headers() headers: HeaderBag, @Body() body: Record<string, unknown>) {
    return analyticsRepository.serverRequest(headers, body);
  }

  @Post("/sessions/:id/pages")
  page(@Headers() headers: HeaderBag, @Param("id") id: string, @Body() body: Record<string, unknown>) {
    return analyticsRepository.addPage(headers, id, body);
  }

  @Post("/sessions/:id/activity")
  activity(@Headers() headers: HeaderBag, @Param("id") id: string, @Body() body: Record<string, unknown>) {
    return analyticsRepository.activity(headers, id, body);
  }

  @Get("/admin/sessions")
  sessions(
    @Headers() headers: HeaderBag,
    @Query("date") date: string,
    @Query("page") page?: string,
    @Query("size") size?: string
  ) {
    return analyticsRepository.list(headers, date, page, size);
  }

  @Get("/admin/sessions/:id")
  session(@Headers() headers: HeaderBag, @Param("id") id: string) {
    return analyticsRepository.detail(headers, id);
  }

  @Get("/admin/server-requests")
  serverRequests(
    @Headers() headers: HeaderBag,
    @Query("date") date: string,
    @Query("page") page?: string,
    @Query("size") size?: string
  ) {
    return analyticsRepository.serverRequests(headers, date, page, size);
  }
}

@Module({ controllers: [AnalyticsController] })
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true });
  await analyticsRepository.cleanup();
  const cleanupTimer = setInterval(() => void analyticsRepository.cleanup(), 24 * 60 * 60 * 1000);
  cleanupTimer.unref();
  await app.listen(Number(process.env.PORT ?? 4115), "0.0.0.0");
}

void bootstrap();
