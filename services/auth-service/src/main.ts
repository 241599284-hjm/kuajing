import "reflect-metadata";
import { customerSearchFilter, normalizeCustomerSearch } from "./customer-search.js";
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Headers,
  Inject,
  Injectable,
  Module,
  NotFoundException,
  OnApplicationShutdown,
  Param,
  Post,
  Put,
  Query,
  Res,
  ServiceUnavailableException,
  UnauthorizedException
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ERROR_CODES, normalizeErrorPayload } from "@commerce/error-codes";
import { assertStoreContext, type StoreContext } from "@commerce/store-context";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import nodemailer, { type Transporter } from "nodemailer";
import {
  adminSessionCookie,
  expiredAdminSessionCookie,
  hashAdminSessionToken,
  parseAdminSessionToken
} from "./admin-session.js";

type RegisterRequest = {
  username?: string;
  email?: string;
  password?: string;
};

type LoginRequest = {
  email?: string;
  password?: string;
};

type ForgotPasswordRequest = {
  email?: string;
};

type ResetPasswordRequest = {
  token?: string;
  password?: string;
};

type ChangePasswordRequest = {
  email?: string;
  currentPassword?: string;
  newPassword?: string;
};

type EmailSettingsRequest = {
  provider?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUsername?: string | null;
  smtpPassword?: string | null;
  clearSmtpPassword?: boolean;
  fromEmail?: string;
  fromName?: string;
  replyToEmail?: string | null;
  enabled?: boolean;
  verificationTokenTtlMinutes?: number;
};

type AdminLoginRequest = LoginRequest;

type EmailSettings = {
  provider: "smtp";
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUsername: string | null;
  smtpPassword: string | null;
  fromEmail: string;
  fromName: string;
  replyToEmail: string | null;
  enabled: boolean;
  verificationTokenTtlMinutes: number;
};

type EmailSettingsResponse = Omit<EmailSettings, "smtpPassword"> & {
  smtpPasswordConfigured: boolean;
};

type TransactionalEmailBody = {
  to: string;
  templateKey: string;
  variables: Record<string, string | number | boolean | null>;
  idempotencyKey: string;
};

type CustomerRegistration = {
  customerId: string;
  email: string;
  username: string;
  verificationLink: string;
  verificationCode: string;
};

type PasswordReset = {
  email: string;
  username: string;
  resetToken: string;
  resetLink: string;
};

const selfHostedStore = {
  storeId: process.env.DEFAULT_STORE_ID ?? "00000000-0000-4000-8000-000000000001",
  region: process.env.DEFAULT_STORE_REGION ?? "local",
  timezone: process.env.DEFAULT_STORE_TIMEZONE ?? "Asia/Hong_Kong"
};
const notificationServiceUrl = process.env.NOTIFICATION_SERVICE_URL ?? "http://localhost:4111";
const emailDeliveryMode = process.env.AUTH_EMAIL_DELIVERY_MODE ?? "notification-service";

function validationFailed(message: string, details?: unknown): BadRequestException {
  return new BadRequestException({
    code: ERROR_CODES.VALIDATION_FAILED,
    message,
    ...(details === undefined ? {} : { details })
  });
}

function stateConflict(message: string, details?: unknown): ConflictException {
  return new ConflictException({
    code: ERROR_CODES.CONFLICT,
    message,
    ...(details === undefined ? {} : { details })
  });
}

function unauthorized(message: string): UnauthorizedException {
  return new UnauthorizedException({
    code: ERROR_CODES.UNAUTHORIZED,
    message
  });
}

function forbidden(message: string): ForbiddenException {
  return new ForbiddenException({
    code: ERROR_CODES.FORBIDDEN,
    message
  });
}

function dependencyUnavailable(message: string, details?: unknown): ServiceUnavailableException {
  return new ServiceUnavailableException({
    code: ERROR_CODES.DEPENDENCY_UNAVAILABLE,
    message,
    ...(details === undefined ? {} : { details })
  });
}

function providerUnavailable(message: string): ServiceUnavailableException {
  return new ServiceUnavailableException({
    code: ERROR_CODES.PROVIDER_UNAVAILABLE,
    message
  });
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeText(value: string | null | undefined, field: string, min: number, max: number): string {
  const text = value?.trim();

  if (!text || text.length < min || text.length > max || /[\r\n]/.test(text)) {
    throw validationFailed(`${field} must be ${min}-${max} characters`);
  }

  return text;
}

function normalizeOptionalText(value: string | null | undefined, field: string, max: number): string | null {
  const text = value?.trim();

  if (!text) {
    return null;
  }

  if (text.length > max || /[\r\n]/.test(text)) {
    throw validationFailed(`${field} must be at most ${max} characters`);
  }

  return text;
}

function createStoreContext(correlationId: string | undefined): StoreContext {
  return assertStoreContext({
    storeId: selfHostedStore.storeId,
    region: selfHostedStore.region,
    timezone: selfHostedStore.timezone,
    correlationId: correlationId ?? randomUUID()
  });
}

function publicBrandName(settings: EmailSettings): string {
  return settings.fromName || process.env.STOREFRONT_BRAND_NAME || "Demo Teaware";
}

async function sendTransactionalEmail(ctx: StoreContext, body: TransactionalEmailBody): Promise<void> {
  const response = await fetch(`${notificationServiceUrl}/emails/transactional`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-correlation-id": ctx.correlationId,
      "idempotency-key": body.idempotencyKey
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw dependencyUnavailable(
      "notification-service email delivery failed",
      normalizeErrorPayload(payload, response.status, ctx.correlationId)
    );
  }
}

function normalizeRegisterRequest(body: RegisterRequest) {
  const username = body.username?.trim();
  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";

  if (!username || username.length < 3 || username.length > 40) {
    throw validationFailed("username must be 3-40 characters");
  }

  if (!email || !isEmail(email)) {
    throw validationFailed("valid email is required");
  }

  if (password.length < 8 || password.length > 128) {
    throw validationFailed("password must be 8-128 characters");
  }

  return { username, email, password };
}

function normalizeLoginRequest(body: LoginRequest) {
  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";

  if (!email || !isEmail(email)) {
    throw validationFailed("valid email is required");
  }

  if (password.length < 8 || password.length > 128) {
    throw validationFailed("password must be 8-128 characters");
  }

  return { email, password };
}

function normalizeForgotPasswordRequest(body: ForgotPasswordRequest) {
  const email = body.email?.trim().toLowerCase();

  if (!email || !isEmail(email)) {
    throw validationFailed("valid email is required");
  }

  return { email };
}

function normalizeResetPasswordRequest(body: ResetPasswordRequest) {
  const token = body.token?.trim();
  const password = body.password ?? "";

  if (!token || token.length < 32 || token.length > 200) {
    throw validationFailed("token is required");
  }

  if (password.length < 8 || password.length > 128) {
    throw validationFailed("password must be 8-128 characters");
  }

  return { token, password };
}

function normalizeChangePasswordRequest(body: ChangePasswordRequest) {
  const email = body.email?.trim().toLowerCase();
  const currentPassword = body.currentPassword ?? "";
  const newPassword = body.newPassword ?? "";

  if (!email || !isEmail(email)) {
    throw validationFailed("valid email is required");
  }

  if (currentPassword.length < 8 || currentPassword.length > 128 || newPassword.length < 8 || newPassword.length > 128) {
    throw validationFailed("password must be 8-128 characters");
  }

  return { email, currentPassword, newPassword };
}

function normalizeEmailSettingsRequest(body: EmailSettingsRequest): EmailSettings & { clearSmtpPassword: boolean } {
  const provider = body.provider ?? "smtp";

  if (provider !== "smtp") {
    throw validationFailed("only smtp provider is supported locally");
  }

  const smtpHost = normalizeText(body.smtpHost, "smtpHost", 1, 200);
  const smtpPort = Number(body.smtpPort);

  if (!Number.isInteger(smtpPort) || smtpPort <= 0 || smtpPort > 65535) {
    throw validationFailed("smtpPort must be between 1 and 65535");
  }

  const fromEmail = normalizeText(body.fromEmail, "fromEmail", 3, 200).toLowerCase();

  if (!isEmail(fromEmail)) {
    throw validationFailed("fromEmail must be a valid email address");
  }

  const replyToEmail = normalizeOptionalText(body.replyToEmail, "replyToEmail", 200)?.toLowerCase() ?? null;

  if (replyToEmail && !isEmail(replyToEmail)) {
    throw validationFailed("replyToEmail must be a valid email address");
  }

  const smtpUsername = normalizeOptionalText(body.smtpUsername, "smtpUsername", 200);
  const smtpPassword = normalizeOptionalText(body.smtpPassword, "smtpPassword", 500);
  const verificationTokenTtlMinutes = Number(body.verificationTokenTtlMinutes ?? 30);

  if (!Number.isInteger(verificationTokenTtlMinutes) || verificationTokenTtlMinutes < 5 || verificationTokenTtlMinutes > 1440) {
    throw validationFailed("verificationTokenTtlMinutes must be an integer from 5 to 1440");
  }

  return {
    provider,
    smtpHost,
    smtpPort,
    smtpSecure: body.smtpSecure === true,
    smtpUsername,
    smtpPassword,
    clearSmtpPassword: body.clearSmtpPassword === true,
    fromEmail,
    fromName: normalizeText(body.fromName, "fromName", 1, 120),
    replyToEmail,
    enabled: body.enabled !== false,
    verificationTokenTtlMinutes
  };
}

function serializeEmailSettings(settings: EmailSettings): EmailSettingsResponse {
  return {
    provider: settings.provider,
    smtpHost: settings.smtpHost,
    smtpPort: settings.smtpPort,
    smtpSecure: settings.smtpSecure,
    smtpUsername: settings.smtpUsername,
    fromEmail: settings.fromEmail,
    fromName: settings.fromName,
    replyToEmail: settings.replyToEmail,
    enabled: settings.enabled,
    verificationTokenTtlMinutes: settings.verificationTokenTtlMinutes,
    smtpPasswordConfigured: Boolean(settings.smtpPassword)
  };
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password: string, passwordHash: string): boolean {
  const [, salt, storedHash] = passwordHash.split(":");

  if (!salt || !storedHash) {
    return false;
  }

  const actualHash = Buffer.from(scryptSync(password, salt, 64).toString("hex"), "hex");
  const expectedHash = Buffer.from(storedHash, "hex");

  return actualHash.length === expectedHash.length && timingSafeEqual(actualHash, expectedHash);
}

@Injectable()
class AuthRepository implements OnApplicationShutdown {
  private readonly pool = new Pool({
    connectionString:
      process.env.APP_DATABASE_URL ?? "postgres://commerce:commerce@localhost:5432/app_db"
  });

  async loginAdmin(ctx: StoreContext, input: ReturnType<typeof normalizeLoginRequest>) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const admin = (await client.query<{
        id: string; email: string; role: string; password_hash: string | null; status: string;
      }>(
        `SELECT id, email, role, password_hash, status FROM admin_users
         WHERE store_id = $1 AND lower(email) = $2 FOR UPDATE`,
        [ctx.storeId, input.email]
      )).rows[0];
      if (!admin || admin.status !== "active") throw unauthorized("invalid admin credentials");

      let passwordHash = admin.password_hash;
      if (!passwordHash) {
        const bootstrapEmail = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
        const bootstrapPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD;
        if (!bootstrapEmail || !bootstrapPassword || admin.email.toLowerCase() !== bootstrapEmail
          || input.password !== bootstrapPassword) throw unauthorized("invalid admin credentials");
        passwordHash = hashPassword(input.password);
        await client.query("UPDATE admin_users SET password_hash = $2 WHERE id = $1", [admin.id, passwordHash]);
      } else if (!verifyPassword(input.password, passwordHash)) {
        throw unauthorized("invalid admin credentials");
      }

      const token = randomBytes(32).toString("base64url");
      await client.query(
        `INSERT INTO admin_sessions (token_hash, admin_user_id, store_id, expires_at)
         VALUES ($1, $2, $3, now() + interval '8 hours')`,
        [hashAdminSessionToken(token), admin.id, ctx.storeId]
      );
      await client.query("COMMIT");
      return { token, adminId: admin.id, email: admin.email, role: admin.role };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getAdminSession(ctx: StoreContext, token: string) {
    const result = await this.pool.query<{ admin_id: string; email: string; role: string }>(
      `SELECT admin.id AS admin_id, admin.email, admin.role
       FROM admin_sessions session
       JOIN admin_users admin ON admin.id = session.admin_user_id AND admin.store_id = session.store_id
       WHERE session.store_id = $1 AND session.token_hash = $2
         AND session.expires_at > now() AND admin.status = 'active'`,
      [ctx.storeId, hashAdminSessionToken(token)]
    );
    const session = result.rows[0];
    if (!session) throw unauthorized("admin session is invalid or expired");
    return { adminId: session.admin_id, email: session.email, role: session.role };
  }

  async logoutAdmin(ctx: StoreContext, token: string) {
    await this.pool.query("DELETE FROM admin_sessions WHERE store_id = $1 AND token_hash = $2", [ctx.storeId, hashAdminSessionToken(token)]);
  }

  async listCustomers(storeId: string, search = "", limit = 100) {
    const filter = customerSearchFilter(search, 2);
    const limitIndex = 2 + filter.values.length;
    const result = await this.pool.query<{ id: string; username: string; email: string; status: string; created_at: Date }>(
      `SELECT id, username, email, status, created_at
       FROM customers
       WHERE store_id = $1
       ${filter.sql}
       ORDER BY created_at DESC
       LIMIT $${limitIndex}`,
      [storeId, ...filter.values, limit]
    );
    return result.rows.map((row) => ({ customerId: row.id, name: row.username, email: row.email, status: row.status, createdAt: row.created_at.toISOString() }));
  }

  async getCustomer(storeId: string, customerId: string) {
    const row = (await this.pool.query<{ id: string; username: string; email: string; status: string; email_verified_at: Date | null; created_at: Date }>(
      `SELECT id, username, email, status, email_verified_at, created_at
       FROM customers WHERE store_id = $1 AND id = $2 LIMIT 1`,
      [storeId, customerId]
    )).rows[0];
    return row ? {
      customerId: row.id,
      name: row.username,
      email: row.email,
      status: row.status,
      emailVerifiedAt: row.email_verified_at?.toISOString(),
      createdAt: row.created_at.toISOString()
    } : null;
  }

  async createPendingCustomer(
    ctx: StoreContext,
    input: ReturnType<typeof normalizeRegisterRequest>,
    verificationTokenTtlMinutes: number
  ): Promise<CustomerRegistration> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      const registration = await this.insertCustomerAndToken(client, ctx, input, verificationTokenTtlMinutes);
      await client.query("COMMIT");
      return registration;
    } catch (error) {
      await client.query("ROLLBACK");

      if (typeof error === "object" && error && "code" in error && error.code === "23505") {
        throw stateConflict("username or email already registered");
      }

      throw error;
    } finally {
      client.release();
    }
  }

  async getEmailSettings(ctx: StoreContext): Promise<EmailSettings> {
    const result = await this.pool.query<{
      provider: string;
      smtp_host: string;
      smtp_port: number;
      smtp_secure: boolean;
      smtp_username: string | null;
      smtp_password: string | null;
      from_email: string;
      from_name: string;
      reply_to_email: string | null;
      enabled: boolean;
      verification_token_ttl_minutes: number;
    }>(
      `
        SELECT
          provider,
          smtp_host,
          smtp_port,
          smtp_secure,
          smtp_username,
          smtp_password,
          from_email,
          from_name,
          reply_to_email,
          enabled,
          verification_token_ttl_minutes
        FROM email_settings
        WHERE store_id = $1
      `,
      [ctx.storeId]
    );

    const row = result.rows[0];

    if (!row) {
      return {
        provider: "smtp",
        smtpHost: process.env.MAILPIT_SMTP_HOST ?? "localhost",
        smtpPort: Number(process.env.MAILPIT_SMTP_PORT ?? 1025),
        smtpSecure: false,
        smtpUsername: null,
        smtpPassword: null,
        fromEmail: process.env.AUTH_EMAIL_FROM_ADDRESS ?? "no-reply@demo-teaware.local",
        fromName: process.env.AUTH_EMAIL_FROM_NAME ?? "Demo Teaware",
        replyToEmail: null,
        enabled: true,
        verificationTokenTtlMinutes: 30
      };
    }

    if (row.provider !== "smtp") {
      throw validationFailed("email provider is not supported by auth-service");
    }

    return {
      provider: "smtp",
      smtpHost: row.smtp_host,
      smtpPort: row.smtp_port,
      smtpSecure: row.smtp_secure,
      smtpUsername: row.smtp_username,
      smtpPassword: row.smtp_password,
      fromEmail: row.from_email,
      fromName: row.from_name,
      replyToEmail: row.reply_to_email,
      enabled: row.enabled,
      verificationTokenTtlMinutes: row.verification_token_ttl_minutes
    };
  }

  async saveEmailSettings(
    ctx: StoreContext,
    input: ReturnType<typeof normalizeEmailSettingsRequest>
  ): Promise<EmailSettings> {
    const current = await this.pool.query<{ smtp_password: string | null }>(
      "SELECT smtp_password FROM email_settings WHERE store_id = $1",
      [ctx.storeId]
    );
    const existingPassword = current.rows[0]?.smtp_password ?? null;
    const smtpPassword = input.clearSmtpPassword ? null : input.smtpPassword ?? existingPassword;

    const result = await this.pool.query<{
      provider: string;
      smtp_host: string;
      smtp_port: number;
      smtp_secure: boolean;
      smtp_username: string | null;
      smtp_password: string | null;
      from_email: string;
      from_name: string;
      reply_to_email: string | null;
      enabled: boolean;
      verification_token_ttl_minutes: number;
    }>(
      `
        INSERT INTO email_settings (
          store_id,
          provider,
          smtp_host,
          smtp_port,
          smtp_secure,
          smtp_username,
          smtp_password,
          from_email,
          from_name,
          reply_to_email,
          enabled,
          verification_token_ttl_minutes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (store_id) DO UPDATE
        SET
          provider = EXCLUDED.provider,
          smtp_host = EXCLUDED.smtp_host,
          smtp_port = EXCLUDED.smtp_port,
          smtp_secure = EXCLUDED.smtp_secure,
          smtp_username = EXCLUDED.smtp_username,
          smtp_password = EXCLUDED.smtp_password,
          from_email = EXCLUDED.from_email,
          from_name = EXCLUDED.from_name,
          reply_to_email = EXCLUDED.reply_to_email,
          enabled = EXCLUDED.enabled,
          verification_token_ttl_minutes = EXCLUDED.verification_token_ttl_minutes,
          updated_at = now()
        RETURNING
          provider,
          smtp_host,
          smtp_port,
          smtp_secure,
          smtp_username,
          smtp_password,
          from_email,
          from_name,
          reply_to_email,
          enabled,
          verification_token_ttl_minutes
      `,
      [
        ctx.storeId,
        input.provider,
        input.smtpHost,
        input.smtpPort,
        input.smtpSecure,
        input.smtpUsername,
        smtpPassword,
        input.fromEmail,
        input.fromName,
        input.replyToEmail,
        input.enabled,
        input.verificationTokenTtlMinutes
      ]
    );

    const row = result.rows[0];

    return {
      provider: "smtp",
      smtpHost: row.smtp_host,
      smtpPort: row.smtp_port,
      smtpSecure: row.smtp_secure,
      smtpUsername: row.smtp_username,
      smtpPassword: row.smtp_password,
      fromEmail: row.from_email,
      fromName: row.from_name,
      replyToEmail: row.reply_to_email,
      enabled: row.enabled,
      verificationTokenTtlMinutes: row.verification_token_ttl_minutes
    };
  }

  async verifyEmail(token: string): Promise<{ email: string; username: string }> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      const result = await client.query<{
        customer_id: string;
        email: string;
        username: string;
        expires_at: Date;
        used_at: Date | null;
      }>(
        `
          SELECT
            evt.customer_id,
            c.email,
            c.username,
            evt.expires_at,
            evt.used_at
          FROM email_verification_tokens evt
          JOIN customers c ON c.id = evt.customer_id AND c.store_id = evt.store_id
          WHERE evt.token = $1
          FOR UPDATE
        `,
        [token]
      );

      const row = result.rows[0];

      if (!row) {
        throw validationFailed("verification token is invalid");
      }

      if (row.used_at) {
        throw stateConflict("verification token has already been used");
      }

      if (new Date(row.expires_at).getTime() < Date.now()) {
        throw validationFailed("verification token has expired");
      }

      await client.query("UPDATE email_verification_tokens SET used_at = now() WHERE token = $1", [token]);
      await client.query(
        "UPDATE customers SET status = 'active', email_verified_at = now() WHERE id = $1",
        [row.customer_id]
      );
      await client.query("COMMIT");

      return { email: row.email, username: row.username };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async login(ctx: StoreContext, input: ReturnType<typeof normalizeLoginRequest>) {
    const result = await this.pool.query<{
      id: string;
      email: string;
      username: string;
      password_hash: string;
      status: string;
    }>(
      `
        SELECT id, email, username, password_hash, status
        FROM customers
        WHERE store_id = $1 AND email = $2
      `,
      [ctx.storeId, input.email]
    );
    const row = result.rows[0];

    if (!row || !verifyPassword(input.password, row.password_hash)) {
      throw unauthorized("email or password is invalid");
    }

    if (row.status !== "active") {
      throw forbidden("account is not active");
    }

    return {
      customerId: row.id,
      email: row.email,
      username: row.username
    };
  }

  async createPasswordReset(ctx: StoreContext, email: string): Promise<PasswordReset | null> {
    const result = await this.pool.query<{ id: string; email: string; username: string }>(
      `
        SELECT id, email, username
        FROM customers
        WHERE store_id = $1 AND email = $2 AND status = 'active'
      `,
      [ctx.storeId, email]
    );
    const customer = result.rows[0];

    if (!customer) {
      return null;
    }

    const token = randomBytes(32).toString("hex");
    await this.pool.query(
      `
        INSERT INTO password_reset_tokens (id, store_id, customer_id, token, expires_at)
        VALUES ($1, $2, $3, $4, now() + interval '30 minutes')
      `,
      [randomUUID(), ctx.storeId, customer.id, token]
    );

    return {
      email: customer.email,
      username: customer.username,
      resetToken: token,
      resetLink: `${process.env.STOREFRONT_PUBLIC_URL ?? "http://localhost:3000"}/reset-password?token=${token}`
    };
  }

  async resetPassword(ctx: StoreContext, input: ReturnType<typeof normalizeResetPasswordRequest>) {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      const result = await client.query<{ customer_id: string; expires_at: Date; used_at: Date | null }>(
        `
          SELECT customer_id, expires_at, used_at
          FROM password_reset_tokens
          WHERE store_id = $1 AND token = $2
          FOR UPDATE
        `,
        [ctx.storeId, input.token]
      );
      const row = result.rows[0];

      if (!row) {
        throw validationFailed("password reset token is invalid");
      }

      if (row.used_at) {
        throw stateConflict("password reset token has already been used");
      }

      if (new Date(row.expires_at).getTime() < Date.now()) {
        throw validationFailed("password reset token has expired");
      }

      await client.query("UPDATE customers SET password_hash = $1 WHERE id = $2 AND store_id = $3", [
        hashPassword(input.password),
        row.customer_id,
        ctx.storeId
      ]);
      await client.query("UPDATE password_reset_tokens SET used_at = now() WHERE store_id = $1 AND token = $2", [
        ctx.storeId,
        input.token
      ]);
      await client.query("COMMIT");

      return { status: "password_reset" };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async changePassword(ctx: StoreContext, input: ReturnType<typeof normalizeChangePasswordRequest>) {
    const login = await this.login(ctx, { email: input.email, password: input.currentPassword });
    await this.pool.query("UPDATE customers SET password_hash = $1 WHERE store_id = $2 AND id = $3", [
      hashPassword(input.newPassword),
      ctx.storeId,
      login.customerId
    ]);

    return { status: "password_changed" };
  }

  private async insertCustomerAndToken(
    client: PoolClient,
    ctx: StoreContext,
    input: ReturnType<typeof normalizeRegisterRequest>,
    verificationTokenTtlMinutes: number
  ): Promise<CustomerRegistration> {
    const customerId = randomUUID();
    const tokenId = randomUUID();
    const token = randomBytes(32).toString("hex");
    const verificationCode = randomBytes(3).toString("hex").toUpperCase();
    const verificationLink = `${process.env.AUTH_VERIFY_BASE_URL ?? "http://localhost:4102"}/verify-email?token=${token}`;

    await client.query(
      `
        INSERT INTO customers (id, store_id, username, email, password_hash, status)
        VALUES ($1, $2, $3, $4, $5, 'pending_email_verification')
      `,
      [customerId, ctx.storeId, input.username, input.email, hashPassword(input.password)]
    );

    await client.query(
      `
        INSERT INTO email_verification_tokens (id, store_id, customer_id, token, code, expires_at)
        VALUES ($1, $2, $3, $4, $5, now() + ($6::integer * interval '1 minute'))
      `,
      [tokenId, ctx.storeId, customerId, token, verificationCode, verificationTokenTtlMinutes]
    );

    return {
      customerId,
      email: input.email,
      username: input.username,
      verificationLink,
      verificationCode
    };
  }

  async onApplicationShutdown() {
    await this.pool.end();
  }
}

@Injectable()
class VerificationEmailSender {
  async send(ctx: StoreContext, registration: CustomerRegistration, settings: EmailSettings): Promise<void> {
    if (!settings.enabled) {
      throw providerUnavailable("email delivery is disabled");
    }

    if (emailDeliveryMode !== "smtp") {
      await sendTransactionalEmail(ctx, {
        to: registration.email,
        templateKey: "registration_verification",
        idempotencyKey: `auth-registration-${registration.customerId}`,
        variables: {
          brandName: publicBrandName(settings),
          name: registration.username,
          email: registration.email,
          verificationUrl: registration.verificationLink,
          verificationCode: registration.verificationCode,
          expiresInMinutes: settings.verificationTokenTtlMinutes,
          locale: process.env.DEFAULT_BUYER_LOCALE ?? "en"
        }
      });
      return;
    }

    const auth = settings.smtpUsername
      ? {
          user: settings.smtpUsername,
          pass: settings.smtpPassword ?? ""
        }
      : undefined;
    const transporter: Transporter = nodemailer.createTransport({
      host: settings.smtpHost,
      port: settings.smtpPort,
      secure: settings.smtpSecure,
      auth
    });

    await transporter.sendMail({
      from: `${settings.fromName} <${settings.fromEmail}>`,
      to: registration.email,
      replyTo: settings.replyToEmail ?? undefined,
      subject: `Verify your ${settings.fromName} account`,
      text: [
        `Hello ${registration.username},`,
        "",
        `Your verification code is ${registration.verificationCode}.`,
        `Click this link to complete registration: ${registration.verificationLink}`,
        "",
        `This local development link expires in ${settings.verificationTokenTtlMinutes} minutes.`
      ].join("\n"),
      html: `
        <p>Hello ${registration.username},</p>
        <p>Your verification code is <strong>${registration.verificationCode}</strong>.</p>
        <p><a href="${registration.verificationLink}">Complete registration</a></p>
        <p>This local development link expires in ${settings.verificationTokenTtlMinutes} minutes.</p>
      `
    });
  }
}

@Injectable()
class PasswordResetEmailSender {
  async send(ctx: StoreContext, reset: PasswordReset, settings: EmailSettings): Promise<void> {
    if (!settings.enabled) {
      throw providerUnavailable("email delivery is disabled");
    }

    if (emailDeliveryMode !== "smtp") {
      await sendTransactionalEmail(ctx, {
        to: reset.email,
        templateKey: "password_reset",
        idempotencyKey: `auth-password-reset-${reset.resetToken}`,
        variables: {
          brandName: publicBrandName(settings),
          name: reset.username,
          email: reset.email,
          resetUrl: reset.resetLink,
          locale: process.env.DEFAULT_BUYER_LOCALE ?? "en"
        }
      });
      return;
    }

    const auth = settings.smtpUsername
      ? {
          user: settings.smtpUsername,
          pass: settings.smtpPassword ?? ""
        }
      : undefined;
    const transporter: Transporter = nodemailer.createTransport({
      host: settings.smtpHost,
      port: settings.smtpPort,
      secure: settings.smtpSecure,
      auth
    });

    await transporter.sendMail({
      from: `${settings.fromName} <${settings.fromEmail}>`,
      to: reset.email,
      replyTo: settings.replyToEmail ?? undefined,
      subject: `Reset your ${settings.fromName} password`,
      text: [
        `Hello ${reset.username},`,
        "",
        `Click this link to reset your password: ${reset.resetLink}`,
        "",
        "This local development link expires in 30 minutes."
      ].join("\n"),
      html: `
        <p>Hello ${reset.username},</p>
        <p><a href="${reset.resetLink}">Reset your password</a></p>
        <p>This local development link expires in 30 minutes.</p>
      `
    });
  }
}

@Injectable()
class AuthService {
  constructor(
    @Inject(AuthRepository) private readonly authRepository: AuthRepository,
    @Inject(VerificationEmailSender) private readonly verificationEmailSender: VerificationEmailSender,
    @Inject(PasswordResetEmailSender) private readonly passwordResetEmailSender: PasswordResetEmailSender
  ) {}

  async register(ctx: StoreContext, body: RegisterRequest) {
    const input = normalizeRegisterRequest(body);
    const emailSettings = await this.authRepository.getEmailSettings(ctx);
    const registration = await this.authRepository.createPendingCustomer(ctx, input, emailSettings.verificationTokenTtlMinutes);
    await this.verificationEmailSender.send(ctx, registration, emailSettings);

    return {
      customerId: registration.customerId,
      email: registration.email,
      status: "verification_email_sent"
    };
  }

  async verifyEmail(ctx: StoreContext, token: string) {
    if (!token) {
      throw validationFailed("token is required");
    }

    const customer = await this.authRepository.verifyEmail(token);
    const emailSettings = await this.authRepository.getEmailSettings(ctx);

    if (emailSettings.enabled && emailDeliveryMode !== "smtp") {
      sendTransactionalEmail(ctx, {
        to: customer.email,
        templateKey: "registration_success",
        idempotencyKey: `auth-registration-success-${customer.email}`,
        variables: {
          brandName: publicBrandName(emailSettings),
          name: customer.username,
          email: customer.email,
          accountUrl: `${process.env.STOREFRONT_PUBLIC_URL ?? "http://localhost:3000"}/account`,
          locale: process.env.DEFAULT_BUYER_LOCALE ?? "en"
        }
      }).catch((error) => {
        console.warn("registration success email failed", error);
      });
    }

    return customer;
  }

  async login(ctx: StoreContext, body: LoginRequest) {
    return this.authRepository.login(ctx, normalizeLoginRequest(body));
  }

  async loginAdmin(ctx: StoreContext, body: AdminLoginRequest) {
    return this.authRepository.loginAdmin(ctx, normalizeLoginRequest(body));
  }

  async getAdminSession(ctx: StoreContext, cookie: string | undefined) {
    const token = parseAdminSessionToken(cookie);
    if (!token) throw unauthorized("admin authentication is required");
    return this.authRepository.getAdminSession(ctx, token);
  }

  async logoutAdmin(ctx: StoreContext, cookie: string | undefined) {
    const token = parseAdminSessionToken(cookie);
    if (token) await this.authRepository.logoutAdmin(ctx, token);
    return { status: "logged_out" };
  }

  async listCustomers(ctx: StoreContext, cookie: string | undefined, search = "", limit = 100) {
    await this.getAdminSession(ctx, cookie);
    return this.authRepository.listCustomers(ctx.storeId, search, limit);
  }

  async getCustomer(ctx: StoreContext, cookie: string | undefined, customerId: string) {
    await this.getAdminSession(ctx, cookie);
    const customer = await this.authRepository.getCustomer(ctx.storeId, customerId);
    if (!customer) throw new NotFoundException({ code: ERROR_CODES.NOT_FOUND, message: "Customer was not found." });
    return customer;
  }

  async forgotPassword(ctx: StoreContext, body: ForgotPasswordRequest) {
    const input = normalizeForgotPasswordRequest(body);
    const emailSettings = await this.authRepository.getEmailSettings(ctx);
    const reset = await this.authRepository.createPasswordReset(ctx, input.email);

    if (reset) {
      await this.passwordResetEmailSender.send(ctx, reset, emailSettings);
    }

    return { status: "password_reset_email_sent_if_account_exists" };
  }

  async resetPassword(ctx: StoreContext, body: ResetPasswordRequest) {
    return this.authRepository.resetPassword(ctx, normalizeResetPasswordRequest(body));
  }

  async changePassword(ctx: StoreContext, body: ChangePasswordRequest) {
    return this.authRepository.changePassword(ctx, normalizeChangePasswordRequest(body));
  }

  async getEmailSettings(ctx: StoreContext): Promise<EmailSettingsResponse> {
    return serializeEmailSettings(await this.authRepository.getEmailSettings(ctx));
  }

  async saveEmailSettings(ctx: StoreContext, body: EmailSettingsRequest): Promise<EmailSettingsResponse> {
    const input = normalizeEmailSettingsRequest(body);
    return serializeEmailSettings(await this.authRepository.saveEmailSettings(ctx, input));
  }
}

@Controller()
class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Get("/health")
  health() {
    return { service: "auth-service", status: "ok", rbac: "refund_roles", twoFactor: "reserved" };
  }

  @Post("/admin/login")
  async adminLogin(
    @Headers("x-correlation-id") correlationId: string | undefined,
    @Body() body: AdminLoginRequest,
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void }
  ) {
    const result = await this.authService.loginAdmin(createStoreContext(correlationId), body);
    response.setHeader("set-cookie", adminSessionCookie(result.token, process.env.NODE_ENV === "production"));
    return { adminId: result.adminId, email: result.email, role: result.role };
  }

  @Get("/admin/session")
  adminSession(
    @Headers("x-correlation-id") correlationId: string | undefined,
    @Headers("cookie") cookie: string | undefined
  ) {
    return this.authService.getAdminSession(createStoreContext(correlationId), cookie);
  }

  @Post("/admin/logout")
  async adminLogout(
    @Headers("x-correlation-id") correlationId: string | undefined,
    @Headers("cookie") cookie: string | undefined,
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void }
  ) {
    const result = await this.authService.logoutAdmin(createStoreContext(correlationId), cookie);
    response.setHeader("set-cookie", expiredAdminSessionCookie(process.env.NODE_ENV === "production"));
    return result;
  }

  @Get("/admin/customers")
  adminCustomers(
    @Headers("x-correlation-id") correlationId: string | undefined,
    @Headers("cookie") cookie: string | undefined,
    @Query("search") search: string | undefined,
    @Query("limit") limit: string | undefined
  ) {
    const ctx = createStoreContext(correlationId);
    const parsedLimit = Math.min(100, Math.max(1, Number.parseInt(limit ?? "100", 10) || 100));
    return this.authService.listCustomers(ctx, cookie, normalizeCustomerSearch(search), parsedLimit);
  }

  @Get("/admin/customers/:customerId")
  adminCustomer(
    @Headers("x-correlation-id") correlationId: string | undefined,
    @Headers("cookie") cookie: string | undefined,
    @Param("customerId") customerId: string
  ) {
    return this.authService.getCustomer(createStoreContext(correlationId), cookie, customerId);
  }

  @Post("/register")
  async register(
    @Headers("x-correlation-id") correlationId: string | undefined,
    @Body() body: RegisterRequest
  ) {
    const ctx = createStoreContext(correlationId);
    return this.authService.register(ctx, body);
  }

  @Post("/login")
  async login(
    @Headers("x-correlation-id") correlationId: string | undefined,
    @Body() body: LoginRequest
  ) {
    const ctx = createStoreContext(correlationId);
    return this.authService.login(ctx, body);
  }

  @Post("/forgot-password")
  async forgotPassword(
    @Headers("x-correlation-id") correlationId: string | undefined,
    @Body() body: ForgotPasswordRequest
  ) {
    const ctx = createStoreContext(correlationId);
    return this.authService.forgotPassword(ctx, body);
  }

  @Post("/reset-password")
  async resetPassword(
    @Headers("x-correlation-id") correlationId: string | undefined,
    @Body() body: ResetPasswordRequest
  ) {
    const ctx = createStoreContext(correlationId);
    return this.authService.resetPassword(ctx, body);
  }

  @Post("/change-password")
  async changePassword(
    @Headers("x-correlation-id") correlationId: string | undefined,
    @Body() body: ChangePasswordRequest
  ) {
    const ctx = createStoreContext(correlationId);
    return this.authService.changePassword(ctx, body);
  }

  @Get("/admin/email-settings")
  async getEmailSettings(
    @Headers("x-correlation-id") correlationId: string | undefined
  ) {
    const ctx = createStoreContext(correlationId);
    return this.authService.getEmailSettings(ctx);
  }

  @Put("/admin/email-settings")
  async saveEmailSettings(
    @Headers("x-correlation-id") correlationId: string | undefined,
    @Body() body: EmailSettingsRequest
  ) {
    const ctx = createStoreContext(correlationId);
    return this.authService.saveEmailSettings(ctx, body);
  }

  @Get("/verify-email")
  @Header("Content-Type", "text/html; charset=utf-8")
  async verifyEmail(@Headers("x-correlation-id") correlationId: string | undefined, @Query("token") token: string) {
    const customer = await this.authService.verifyEmail(createStoreContext(correlationId), token);

    return `
      <!doctype html>
      <html>
        <head><title>Registration complete</title></head>
        <body style="font-family: Arial, sans-serif; padding: 32px;">
          <h1>Registration complete</h1>
          <p>${customer.username} (${customer.email}) is verified.</p>
          <p><a href="${process.env.STOREFRONT_PUBLIC_URL ?? "http://localhost:3000"}">Return to storefront</a></p>
        </body>
      </html>
    `;
  }
}

@Module({
  controllers: [AuthController],
  providers: [AuthRepository, VerificationEmailSender, PasswordResetEmailSender, AuthService]
})
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true, credentials: true });
  await app.listen(Number(process.env.PORT ?? 4102), "0.0.0.0");
}

void bootstrap();
