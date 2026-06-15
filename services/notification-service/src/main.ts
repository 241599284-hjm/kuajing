import "reflect-metadata";
import { BadRequestException, Body, Controller, Get, Headers, Injectable, Module, Param, Post, Put } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { assertStoreContext, type StoreContext } from "@commerce/store-context";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

type SendEmailBody = {
  to?: string;
  subject?: string;
  html?: string;
  text?: string;
  idempotencyKey?: string;
  templateKey?: string;
  variables?: Record<string, string | number | boolean | null>;
};

type EmailTemplateRecord = {
  key: string;
  nameZh: string;
  nameEn: string;
  subjectZh: string;
  subjectEn: string;
  htmlZh: string;
  htmlEn: string;
  textZh: string;
  textEn: string;
  enabled: boolean;
  updatedAt: string;
  storageMode?: "postgres" | "memory";
};

type EmailLogRecord = {
  id: string;
  idempotencyKey: string;
  recipientEmail: string;
  subject: string;
  templateKey?: string;
  provider: string;
  status: "sent" | "failed" | "rate_limited" | "duplicate";
  providerMessageId?: string;
  errorSummary?: string;
  consumedQuota: boolean;
  correlationId: string;
  durationMs: number;
  createdAt: string;
};

type NormalizedEmail = {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  idempotencyKey: string;
  templateKey?: string;
  variables?: Record<string, string | number | boolean | null>;
};

const selfHostedStore = {
  storeId: process.env.DEFAULT_STORE_ID ?? "00000000-0000-4000-8000-000000000001",
  region: process.env.DEFAULT_STORE_REGION ?? "local",
  timezone: process.env.DEFAULT_STORE_TIMEZONE ?? "Asia/Hong_Kong"
};
const globalPerMinuteLimit = Number(process.env.NOTIFICATION_GLOBAL_PER_MINUTE_LIMIT ?? 10);
const recipientCooldownMinutes = Number(process.env.NOTIFICATION_RECIPIENT_COOLDOWN_MINUTES ?? 60);
const memoryLogs: EmailLogRecord[] = [];

const defaultTemplates: EmailTemplateRecord[] = [
  {
    key: "registration_verification",
    nameZh: "注册邮箱验证",
    nameEn: "Registration verification",
    subjectZh: "请验证您的 {{brandName}} 账户",
    subjectEn: "Verify your {{brandName}} account",
    htmlZh: "<p>您好 {{name}}，</p><p>请点击下面的链接完成邮箱验证：</p><p><a href=\"{{verificationUrl}}\">验证邮箱</a></p><p>验证码：{{verificationCode}}</p><p>链接将在 {{expiresInMinutes}} 分钟后失效。</p>",
    htmlEn: "<p>Hello {{name}},</p><p>Please verify your email address:</p><p><a href=\"{{verificationUrl}}\">Verify email</a></p><p>Code: {{verificationCode}}</p><p>This link expires in {{expiresInMinutes}} minutes.</p>",
    textZh: "您好 {{name}}，请打开链接完成邮箱验证：{{verificationUrl}}，验证码：{{verificationCode}}。链接将在 {{expiresInMinutes}} 分钟后失效。",
    textEn: "Hello {{name}}, please verify your email address: {{verificationUrl}}. Code: {{verificationCode}}. This link expires in {{expiresInMinutes}} minutes.",
    enabled: true,
    updatedAt: new Date(0).toISOString(),
    storageMode: "memory"
  },
  {
    key: "registration_success",
    nameZh: "注册成功欢迎",
    nameEn: "Registration success",
    subjectZh: "欢迎加入 {{brandName}}",
    subjectEn: "Welcome to {{brandName}}",
    htmlZh: "<p>您好 {{name}}，</p><p>您的 {{brandName}} 账户已经注册成功。</p><p><a href=\"{{accountUrl}}\">进入个人主页</a></p>",
    htmlEn: "<p>Hello {{name}},</p><p>Your {{brandName}} account is ready.</p><p><a href=\"{{accountUrl}}\">Go to your account</a></p>",
    textZh: "您好 {{name}}，您的 {{brandName}} 账户已经注册成功：{{accountUrl}}",
    textEn: "Hello {{name}}, your {{brandName}} account is ready: {{accountUrl}}",
    enabled: true,
    updatedAt: new Date(0).toISOString(),
    storageMode: "memory"
  },
  {
    key: "password_reset",
    nameZh: "重置密码",
    nameEn: "Password reset",
    subjectZh: "重置您的 {{brandName}} 密码",
    subjectEn: "Reset your {{brandName}} password",
    htmlZh: "<p>请点击下面的链接重置密码：</p><p><a href=\"{{resetUrl}}\">重置密码</a></p>",
    htmlEn: "<p>Please reset your password using the link below:</p><p><a href=\"{{resetUrl}}\">Reset password</a></p>",
    textZh: "请打开链接重置密码：{{resetUrl}}",
    textEn: "Please reset your password: {{resetUrl}}",
    enabled: true,
    updatedAt: new Date(0).toISOString(),
    storageMode: "memory"
  },
  {
    key: "order_confirmation",
    nameZh: "订单确认邮件",
    nameEn: "Order confirmation",
    subjectZh: "我们已收到您的订单 {{orderNumber}}",
    subjectEn: "We received your order {{orderNumber}}",
    htmlZh: "<p>您好 {{name}}，</p><p>我们已收到您的订单 {{orderNumber}}。</p><p>订单金额：{{currency}} {{total}}</p><p><a href=\"{{orderUrl}}\">查看订单</a></p>",
    htmlEn: "<p>Hello {{name}},</p><p>We have received your order {{orderNumber}}.</p><p>Order total: {{currency}} {{total}}</p><p><a href=\"{{orderUrl}}\">View order</a></p>",
    textZh: "您好 {{name}}，我们已收到您的订单 {{orderNumber}}。订单金额：{{currency}} {{total}}。查看订单：{{orderUrl}}",
    textEn: "Hello {{name}}, we have received your order {{orderNumber}}. Order total: {{currency}} {{total}}. View order: {{orderUrl}}",
    enabled: true,
    updatedAt: new Date(0).toISOString(),
    storageMode: "memory"
  },
  {
    key: "payment_success",
    nameZh: "付款成功通知",
    nameEn: "Payment success",
    subjectZh: "您的订单 {{orderNumber}} 已付款成功",
    subjectEn: "Payment received for order {{orderNumber}}",
    htmlZh: "<p>您的订单 {{orderNumber}} 已付款成功。</p><p>金额：{{currency}} {{total}}</p><p><a href=\"{{orderUrl}}\">查看订单</a></p>",
    htmlEn: "<p>Payment has been received for order {{orderNumber}}.</p><p>Total: {{currency}} {{total}}</p><p><a href=\"{{orderUrl}}\">View order</a></p>",
    textZh: "订单 {{orderNumber}} 已付款成功。金额：{{currency}} {{total}}。查看订单：{{orderUrl}}",
    textEn: "Payment received for order {{orderNumber}}. Total: {{currency}} {{total}}. View order: {{orderUrl}}",
    enabled: true,
    updatedAt: new Date(0).toISOString(),
    storageMode: "memory"
  },
  {
    key: "shipping_notice",
    nameZh: "发货通知邮件",
    nameEn: "Shipping notice",
    subjectZh: "您的订单 {{orderNumber}} 已发货",
    subjectEn: "Your order {{orderNumber}} has shipped",
    htmlZh: "<p>您的订单 {{orderNumber}} 已发货。</p><p>物流单号：{{trackingNumber}}</p><p>当前状态：{{status}}</p><p><a href=\"{{trackingUrl}}\">查看物流</a></p>",
    htmlEn: "<p>Your order {{orderNumber}} has shipped.</p><p>Tracking number: {{trackingNumber}}</p><p>Current status: {{status}}</p><p><a href=\"{{trackingUrl}}\">Track shipment</a></p>",
    textZh: "订单 {{orderNumber}} 已发货。物流单号：{{trackingNumber}}。状态：{{status}}。查看物流：{{trackingUrl}}",
    textEn: "Your order {{orderNumber}} has shipped. Tracking number: {{trackingNumber}}. Status: {{status}}. Track shipment: {{trackingUrl}}",
    enabled: true,
    updatedAt: new Date(0).toISOString(),
    storageMode: "memory"
  },
  {
    key: "refund_notice",
    nameZh: "退款通知邮件",
    nameEn: "Refund notice",
    subjectZh: "您的订单 {{orderNumber}} 退款已处理",
    subjectEn: "Refund processed for order {{orderNumber}}",
    htmlZh: "<p>您的订单 {{orderNumber}} 退款已处理。</p><p>退款金额：{{currency}} {{refundAmount}}</p><p>到账时间通常为 3-7 个工作日。</p>",
    htmlEn: "<p>Your refund for order {{orderNumber}} has been processed.</p><p>Refund amount: {{currency}} {{refundAmount}}</p><p>Refunds usually arrive within 3-7 business days.</p>",
    textZh: "订单 {{orderNumber}} 退款已处理。金额：{{currency}} {{refundAmount}}。到账时间通常为 3-7 个工作日。",
    textEn: "Your refund for order {{orderNumber}} has been processed. Amount: {{currency}} {{refundAmount}}. Refunds usually arrive within 3-7 business days.",
    enabled: true,
    updatedAt: new Date(0).toISOString(),
    storageMode: "memory"
  },
  {
    key: "order_cancelled",
    nameZh: "订单取消邮件",
    nameEn: "Order cancellation",
    subjectZh: "您的订单 {{orderNumber}} 已取消",
    subjectEn: "Your order {{orderNumber}} was cancelled",
    htmlZh: "<p>您的订单 {{orderNumber}} 已取消。</p><p>原因：{{reason}}</p><p>如有疑问，请联系我们的客服团队。</p>",
    htmlEn: "<p>Your order {{orderNumber}} was cancelled.</p><p>Reason: {{reason}}</p><p>Please contact our support team if you have any questions.</p>",
    textZh: "您的订单 {{orderNumber}} 已取消。原因：{{reason}}。如有疑问，请联系我们的客服团队。",
    textEn: "Your order {{orderNumber}} was cancelled. Reason: {{reason}}. Please contact our support team if you have any questions.",
    enabled: true,
    updatedAt: new Date(0).toISOString(),
    storageMode: "memory"
  },
  {
    key: "logistics_update",
    nameZh: "物流状态提醒",
    nameEn: "Logistics update",
    subjectZh: "您的包裹 {{trackingNumber}} 有新物流更新",
    subjectEn: "Shipment {{trackingNumber}} has a new tracking update",
    htmlZh: "<p>物流单号 {{trackingNumber}} 当前状态：{{status}}。</p><p><a href=\"{{trackingUrl}}\">查看物流</a></p>",
    htmlEn: "<p>Tracking number {{trackingNumber}} status: {{status}}.</p><p><a href=\"{{trackingUrl}}\">Track shipment</a></p>",
    textZh: "物流单号 {{trackingNumber}} 当前状态：{{status}}。查看物流：{{trackingUrl}}",
    textEn: "Tracking number {{trackingNumber}} status: {{status}}. Track shipment: {{trackingUrl}}",
    enabled: true,
    updatedAt: new Date(0).toISOString(),
    storageMode: "memory"
  },
  {
    key: "review_invitation",
    nameZh: "购买评价邀请",
    nameEn: "Review invitation",
    subjectZh: "为您的 {{brandName}} 商品留下评价",
    subjectEn: "Review your {{brandName}} purchase",
    htmlZh: "<p>感谢您的购买。</p><p>您可以为已购买商品打分、写文字评价并上传照片：</p><p>{{{reviewLinksHtml}}}</p>",
    htmlEn: "<p>Thank you for your purchase.</p><p>You can rate each purchased item, write a review, and upload photos:</p><p>{{{reviewLinksHtml}}}</p>",
    textZh: "感谢您的购买。评价链接：{{reviewLinksText}}",
    textEn: "Thank you for your purchase. Review links: {{reviewLinksText}}",
    enabled: true,
    updatedAt: new Date(0).toISOString(),
    storageMode: "memory"
  },
  {
    key: "review_pending_admin",
    nameZh: "评论待审核提醒",
    nameEn: "Review pending moderation",
    subjectZh: "有新的商品评价待审核",
    subjectEn: "New product review pending moderation",
    htmlZh: "<p>商品：{{productId}}</p><p>评分：{{rating}}</p><p>评论人：{{nickname}}</p><p>{{content}}</p>",
    htmlEn: "<p>Product: {{productId}}</p><p>Rating: {{rating}}</p><p>Reviewer: {{nickname}}</p><p>{{content}}</p>",
    textZh: "商品：{{productId}}\n评分：{{rating}}\n评论人：{{nickname}}\n{{content}}",
    textEn: "Product: {{productId}}\nRating: {{rating}}\nReviewer: {{nickname}}\n{{content}}",
    enabled: true,
    updatedAt: new Date(0).toISOString(),
    storageMode: "memory"
  },
  {
    key: "company_credential_expiry",
    nameZh: "企业资质到期提醒",
    nameEn: "Company credential expiry reminder",
    subjectZh: "{{brandName}} 企业资质即将到期",
    subjectEn: "{{brandName}} company credentials expiring soon",
    htmlZh: "<p>以下企业资质将在 {{reminderDays}} 天内到期：</p><ul>{{{credentialSummaryHtml}}}</ul><p>请登录后台更新附件和截止日期。</p>",
    htmlEn: "<p>The following company credentials will expire within {{reminderDays}} days:</p><ul>{{{credentialSummaryHtml}}}</ul><p>Please update attachments and expiry dates in the admin portal.</p>",
    textZh: "以下企业资质将在 {{reminderDays}} 天内到期：{{credentialSummaryText}}。请登录后台更新附件和截止日期。",
    textEn: "The following company credentials will expire within {{reminderDays}} days: {{credentialSummaryText}}. Please update attachments and expiry dates in the admin portal.",
    enabled: true,
    updatedAt: new Date(0).toISOString(),
    storageMode: "memory"
  }
];
const memoryTemplates = new Map(defaultTemplates.map((template) => [template.key, template]));

function createStoreContext(correlationId: string | undefined): StoreContext {
  return assertStoreContext({
    storeId: selfHostedStore.storeId,
    region: selfHostedStore.region,
    timezone: selfHostedStore.timezone,
    correlationId: correlationId ?? randomUUID()
  });
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function htmlEscape(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[char] ?? char;
  });
}

function renderTemplate(template: string, variables: Record<string, string | number | boolean | null> | undefined, html: boolean) {
  const rawHtml = html
    ? template.replace(/\{\{\{\s*([a-zA-Z0-9_.-]+Html)\s*\}\}\}/g, (_match, key: string) => {
        const raw = variables?.[key];
        return raw === null || raw === undefined ? "" : String(raw);
      })
    : template;

  return rawHtml.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key: string) => {
    const raw = variables?.[key];
    const value = raw === null || raw === undefined ? "" : String(raw);
    return html ? htmlEscape(value) : value;
  });
}

function normalizeEmail(body: SendEmailBody): NormalizedEmail {
  const to = body.to?.trim().toLowerCase();
  const subject = body.subject?.trim();
  const html = body.html?.trim();
  const text = body.text?.trim();

  if (!to || !isEmail(to)) {
    throw new BadRequestException("valid recipient email is required");
  }
  if (!subject || subject.length > 200 || /[\r\n]/.test(subject)) {
    throw new BadRequestException("subject must be 1-200 characters without new lines");
  }
  if (!html && !text) {
    throw new BadRequestException("html or text content is required");
  }

  return {
    to,
    subject,
    html,
    text,
    idempotencyKey: body.idempotencyKey?.trim() || randomUUID(),
    templateKey: body.templateKey?.trim(),
    variables: body.variables
  };
}

@Injectable()
class EmailStore {
  private readonly pool = new Pool({
    connectionString: process.env.NOTIFICATION_DATABASE_URL ?? "postgres://commerce:commerce@localhost:5432/notification_db",
    connectionTimeoutMillis: 500
  });

  async listTemplates(store: StoreContext): Promise<EmailTemplateRecord[]> {
    try {
      const result = await this.pool.query<{
        template_key: string;
        name_zh: string;
        name_en: string;
        subject_zh: string;
        subject_en: string;
        html_zh: string;
        html_en: string;
        text_zh: string;
        text_en: string;
        enabled: boolean;
        updated_at: Date;
      }>(
        `SELECT template_key, name_zh, name_en, subject_zh, subject_en, html_zh, html_en, text_zh, text_en, enabled, updated_at
         FROM notification_email_templates WHERE store_id = $1`,
        [store.storeId]
      );
      const stored = new Map(
        result.rows.map((row) => [
          row.template_key,
          {
            key: row.template_key,
            nameZh: row.name_zh,
            nameEn: row.name_en,
            subjectZh: row.subject_zh,
            subjectEn: row.subject_en,
            htmlZh: row.html_zh,
            htmlEn: row.html_en,
            textZh: row.text_zh,
            textEn: row.text_en,
            enabled: row.enabled,
            updatedAt: row.updated_at.toISOString(),
            storageMode: "postgres" as const
          }
        ])
      );
      return defaultTemplates.map((template) => stored.get(template.key) ?? { ...template, storageMode: "memory" });
    } catch {
      return defaultTemplates.map((template) => memoryTemplates.get(template.key) ?? template);
    }
  }

  async saveTemplate(store: StoreContext, key: string, body: Partial<Omit<EmailTemplateRecord, "key" | "updatedAt" | "storageMode">>) {
    const current = (await this.listTemplates(store)).find((template) => template.key === key);
    if (!current) throw new BadRequestException("unknown template key");
    const next = { ...current, ...body, key, updatedAt: new Date().toISOString() };

    try {
      const result = await this.pool.query<{ updated_at: Date }>(
        `INSERT INTO notification_email_templates
          (store_id, template_key, name_zh, name_en, subject_zh, subject_en, html_zh, html_en, text_zh, text_en, enabled, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())
         ON CONFLICT (store_id, template_key) DO UPDATE SET
           name_zh = EXCLUDED.name_zh,
           name_en = EXCLUDED.name_en,
           subject_zh = EXCLUDED.subject_zh,
           subject_en = EXCLUDED.subject_en,
           html_zh = EXCLUDED.html_zh,
           html_en = EXCLUDED.html_en,
           text_zh = EXCLUDED.text_zh,
           text_en = EXCLUDED.text_en,
           enabled = EXCLUDED.enabled,
           updated_at = now()
         RETURNING updated_at`,
        [
          store.storeId,
          key,
          next.nameZh,
          next.nameEn,
          next.subjectZh,
          next.subjectEn,
          next.htmlZh,
          next.htmlEn,
          next.textZh,
          next.textEn,
          next.enabled
        ]
      );
      return { ...next, updatedAt: result.rows[0]?.updated_at.toISOString() ?? next.updatedAt, storageMode: "postgres" as const };
    } catch {
      memoryTemplates.set(key, { ...next, storageMode: "memory" });
      return { ...next, storageMode: "memory" as const };
    }
  }

  async findSentByIdempotency(store: StoreContext, idempotencyKey: string): Promise<EmailLogRecord | undefined> {
    try {
      const result = await this.pool.query<{
        id: string;
        recipient_email: string;
        subject: string;
        template_key: string | null;
        provider: string;
        status: EmailLogRecord["status"];
        provider_message_id: string | null;
        error_summary: string | null;
        consumed_quota: boolean;
        correlation_id: string;
        duration_ms: number;
        created_at: Date;
      }>(
        `SELECT id, recipient_email, subject, template_key, provider, status, provider_message_id, error_summary,
                consumed_quota, correlation_id, duration_ms, created_at
         FROM notification_email_logs
         WHERE store_id = $1 AND idempotency_key = $2 AND status = 'sent'`,
        [store.storeId, idempotencyKey]
      );
      const row = result.rows[0];
      return row
        ? {
            id: row.id,
            idempotencyKey,
            recipientEmail: row.recipient_email,
            subject: row.subject,
            templateKey: row.template_key ?? undefined,
            provider: row.provider,
            status: row.status,
            providerMessageId: row.provider_message_id ?? undefined,
            errorSummary: row.error_summary ?? undefined,
            consumedQuota: row.consumed_quota,
            correlationId: row.correlation_id,
            durationMs: row.duration_ms,
            createdAt: row.created_at.toISOString()
          }
        : undefined;
    } catch {
      return memoryLogs.find((log) => log.idempotencyKey === idempotencyKey && log.status === "sent");
    }
  }

  async countSentSince(store: StoreContext, options: { since: Date; recipientEmail?: string; templateKey?: string }) {
    try {
      const filters = ["store_id = $1", "created_at >= $2", "status = 'sent'"];
      const values: unknown[] = [store.storeId, options.since.toISOString()];
      if (options.recipientEmail) {
        values.push(options.recipientEmail);
        filters.push(`recipient_email = $${values.length}`);
      }
      if (options.templateKey) {
        values.push(options.templateKey);
        filters.push(`template_key = $${values.length}`);
      }
      const result = await this.pool.query<{ total: string }>(
        `SELECT COUNT(*)::text AS total FROM notification_email_logs WHERE ${filters.join(" AND ")}`,
        values
      );
      return Number(result.rows[0]?.total ?? 0);
    } catch {
      return memoryLogs.filter((log) => {
        if (log.status !== "sent" || new Date(log.createdAt).getTime() < options.since.getTime()) return false;
        if (options.recipientEmail && log.recipientEmail !== options.recipientEmail) return false;
        if (options.templateKey && log.templateKey !== options.templateKey) return false;
        return true;
      }).length;
    }
  }

  async log(store: StoreContext, input: Omit<EmailLogRecord, "id" | "createdAt" | "correlationId">) {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    try {
      await this.pool.query(
        `INSERT INTO notification_email_logs
          (id, store_id, idempotency_key, provider, recipient_email, subject, template_key, status,
           provider_message_id, error_summary, consumed_quota, correlation_id, duration_ms)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (store_id, idempotency_key) DO NOTHING`,
        [
          id,
          store.storeId,
          input.idempotencyKey,
          input.provider,
          input.recipientEmail,
          input.subject,
          input.templateKey ?? null,
          input.status,
          input.providerMessageId ?? null,
          input.errorSummary ?? null,
          input.consumedQuota,
          store.correlationId,
          input.durationMs
        ]
      );
    } catch {
      memoryLogs.unshift({ id, ...input, correlationId: store.correlationId, createdAt });
      memoryLogs.splice(200);
    }
  }

  async listLogs(store: StoreContext): Promise<EmailLogRecord[]> {
    try {
      const result = await this.pool.query<{
        id: string;
        idempotency_key: string;
        recipient_email: string;
        subject: string;
        template_key: string | null;
        provider: string;
        status: EmailLogRecord["status"];
        provider_message_id: string | null;
        error_summary: string | null;
        consumed_quota: boolean;
        correlation_id: string;
        duration_ms: number;
        created_at: Date;
      }>(
        `SELECT id, idempotency_key, recipient_email, subject, template_key, provider, status, provider_message_id,
                error_summary, consumed_quota, correlation_id, duration_ms, created_at
         FROM notification_email_logs
         WHERE store_id = $1
         ORDER BY created_at DESC
         LIMIT 100`,
        [store.storeId]
      );
      return result.rows.map((row) => ({
        id: row.id,
        idempotencyKey: row.idempotency_key,
        recipientEmail: row.recipient_email,
        subject: row.subject,
        templateKey: row.template_key ?? undefined,
        provider: row.provider,
        status: row.status,
        providerMessageId: row.provider_message_id ?? undefined,
        errorSummary: row.error_summary ?? undefined,
        consumedQuota: row.consumed_quota,
        correlationId: row.correlation_id,
        durationMs: row.duration_ms,
        createdAt: row.created_at.toISOString()
      }));
    } catch {
      return memoryLogs;
    }
  }
}

@Injectable()
class NotificationService {
  constructor(private readonly store: EmailStore) {}

  accounts() {
    return [
      {
        id: "local-mock",
        provider: "mock",
        label: "local-mock",
        fromEmailAddress: process.env.NOTIFICATION_FROM_EMAIL ?? "Demo Teaware <notify@demo-teaware.local>",
        dailyLimit: Number(process.env.NOTIFICATION_DAILY_LIMIT ?? 40),
        usedCount: memoryLogs.filter((log) => log.status === "sent").length,
        status: "active",
        failureCount: 0,
        secretIdRef: "env:NOTIFICATION_EMAIL_ACCOUNTS_JSON",
        secretKeyRef: "env:NOTIFICATION_EMAIL_ACCOUNTS_JSON",
        usageDate: new Date().toISOString().slice(0, 10)
      }
    ];
  }

  async prepare(store: StoreContext, body: SendEmailBody): Promise<NormalizedEmail> {
    if (!body.templateKey) return normalizeEmail(body);
    const template = (await this.store.listTemplates(store)).find((item) => item.key === body.templateKey);
    if (!template || !template.enabled) throw new BadRequestException("enabled templateKey is required");
    const locale = String(body.variables?.locale ?? body.variables?.language ?? "en").toLowerCase().startsWith("zh") ? "zh" : "en";
    return normalizeEmail({
      ...body,
      subject: body.subject ?? (locale === "zh" ? template.subjectZh : template.subjectEn),
      html: body.html ?? renderTemplate(locale === "zh" ? template.htmlZh : template.htmlEn, body.variables, true),
      text: body.text ?? renderTemplate(locale === "zh" ? template.textZh : template.textEn, body.variables, false)
    });
  }

  async send(store: StoreContext, body: SendEmailBody) {
    const email = await this.prepare(store, body);
    const duplicate = await this.store.findSentByIdempotency(store, email.idempotencyKey);
    if (duplicate) {
      return { status: "duplicate", message: "该幂等请求已经发送成功", provider: duplicate.provider, providerMessageId: duplicate.providerMessageId };
    }

    const sinceOneMinute = new Date(Date.now() - 60_000);
    const sinceCooldown = new Date(Date.now() - recipientCooldownMinutes * 60_000);
    if ((await this.store.countSentSince(store, { since: sinceOneMinute })) >= globalPerMinuteLimit) {
      await this.store.log(store, {
        idempotencyKey: email.idempotencyKey,
        recipientEmail: email.to,
        subject: email.subject,
        templateKey: email.templateKey,
        provider: "mock",
        status: "rate_limited",
        errorSummary: "global per-minute limit reached",
        consumedQuota: false,
        durationMs: 0
      });
      return { status: "rate_limited", message: "全局邮件发送频率已达到限制，请稍后再试。" };
    }
    if (
      email.templateKey &&
      (await this.store.countSentSince(store, { recipientEmail: email.to, templateKey: email.templateKey, since: sinceCooldown })) >= 1
    ) {
      await this.store.log(store, {
        idempotencyKey: email.idempotencyKey,
        recipientEmail: email.to,
        subject: email.subject,
        templateKey: email.templateKey,
        provider: "mock",
        status: "rate_limited",
        errorSummary: "recipient template cooldown reached",
        consumedQuota: false,
        durationMs: 0
      });
      return { status: "rate_limited", message: "同一收件邮箱短时间内已发送过同类事务邮件。" };
    }

    const startedAt = Date.now();
    const providerMessageId = `mock_email_${email.idempotencyKey}`;
    await this.store.log(store, {
      idempotencyKey: email.idempotencyKey,
      recipientEmail: email.to,
      subject: email.subject,
      templateKey: email.templateKey,
      provider: "mock",
      status: "sent",
      providerMessageId,
      consumedQuota: true,
      durationMs: Date.now() - startedAt
    });
    return { status: "sent", message: "邮件已进入事务发送通道", provider: "mock", providerMessageId };
  }
}

@Controller()
class NotificationController {
  constructor(private readonly service: NotificationService, private readonly store: EmailStore) {}

  @Get("/health")
  health() {
    return { service: "notification-service", status: "ok", provider: "mock", templates: defaultTemplates.length };
  }

  @Post("/emails/transactional")
  async sendTransactional(@Headers("x-correlation-id") correlationId: string | undefined, @Body() body: SendEmailBody) {
    return this.service.send(createStoreContext(correlationId), body);
  }

  @Get("/admin/notification/email-accounts")
  accounts() {
    return this.service.accounts();
  }

  @Get("/admin/notification/email-logs")
  logs(@Headers("x-correlation-id") correlationId: string | undefined) {
    return this.store.listLogs(createStoreContext(correlationId));
  }

  @Get("/admin/notification/templates")
  templates(@Headers("x-correlation-id") correlationId: string | undefined) {
    return this.store.listTemplates(createStoreContext(correlationId));
  }

  @Put("/admin/notification/templates/:key")
  saveTemplate(@Headers("x-correlation-id") correlationId: string | undefined, @Param("key") key: string, @Body() body: Partial<EmailTemplateRecord>) {
    return this.store.saveTemplate(createStoreContext(correlationId), key, body);
  }
}

@Module({ controllers: [NotificationController], providers: [EmailStore, NotificationService] })
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true });
  await app.listen(Number(process.env.PORT ?? 4111), "0.0.0.0");
}

void bootstrap();
