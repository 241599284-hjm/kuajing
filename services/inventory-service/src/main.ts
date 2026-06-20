import "reflect-metadata";
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  HttpException,
  Inject,
  Injectable,
  Module,
  OnApplicationShutdown,
  Param,
  Post
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ERROR_CODES } from "@commerce/error-codes";
import { assertStoreContext, type StoreContext } from "@commerce/store-context";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { assertReservationReplay } from "./reservation-idempotency.js";

type ReservationStatus = "reserved" | "confirmed" | "cancelled";
type StorageMode = "postgres" | "memory";
type InventoryAuditAction = "manual_adjustment" | "stocktake" | "safety_stock_update" | "manual_release";

type ReservationRequest = {
  skuId?: string;
  warehouseId?: string;
  orderId?: string;
  qty?: number;
  idempotencyKey?: string;
};

type ReservationResult = {
  reservationId: string;
  status: ReservationStatus;
  skuId: string;
  warehouseId: string;
  orderId?: string;
  qty: number;
  availableQty: number;
  reservedQty: number;
  safetyQty: number;
  inventoryVersion: number;
  idempotencyKey: string;
  storageMode: StorageMode;
};

type AdminInventoryItem = {
  itemId: string;
  skuId: string;
  warehouseId: string;
  availableQty: number;
  reservedQty: number;
  lockedQty: number;
  safetyQty: number;
  sellableQty: number;
  inventoryVersion: number;
  storageMode: StorageMode;
};

type AdminInventoryReservation = {
  reservationId: string;
  orderId: string | null;
  skuId: string;
  warehouseId: string;
  qty: number;
  status: ReservationStatus;
  idempotencyKey: string;
  storageMode: StorageMode;
  createdAt: string;
};

type AdminInventoryAdjustmentRequest = {
  availableDelta?: number;
  stocktakeAvailableQty?: number;
  safetyQty?: number;
  reason?: string;
  actorId?: string;
};

type AdminInventoryAuditEvent = {
  eventId: string;
  itemId: string;
  action: InventoryAuditAction;
  actorId: string;
  reason: string;
  oldValue: Record<string, number | string | null>;
  newValue: Record<string, number | string | null>;
  correlationId: string;
  storageMode: StorageMode;
  createdAt: string;
};

type InventoryItemRow = {
  id: string;
  sku_id: string;
  warehouse_id: string;
  available_qty: number;
  reserved_qty: number;
  safety_qty: number;
  inventory_version: number;
};

type ReservationRow = {
  id: string;
  order_id: string | null;
  sku_id: string;
  warehouse_id: string;
  qty: number;
  status: ReservationStatus;
  idempotency_key: string;
  created_at?: Date;
};

type InventoryAuditRow = {
  id: string;
  inventory_item_id: string;
  action: InventoryAuditAction;
  actor_id: string;
  reason: string;
  old_value: Record<string, number | string | null>;
  new_value: Record<string, number | string | null>;
  correlation_id: string;
  created_at: Date;
};

type MemoryInventoryItem = {
  id: string;
  skuId: string;
  warehouseId: string;
  availableQty: number;
  reservedQty: number;
  safetyQty: number;
  inventoryVersion: number;
};

type MemoryReservation = {
  id: string;
  orderId?: string;
  skuId: string;
  warehouseId: string;
  qty: number;
  status: ReservationStatus;
  idempotencyKey: string;
  createdAt: string;
};

const selfHostedStore = {
  storeId: process.env.DEFAULT_STORE_ID ?? "00000000-0000-4000-8000-000000000001",
  region: process.env.DEFAULT_STORE_REGION ?? "local",
  timezone: process.env.DEFAULT_STORE_TIMEZONE ?? "Asia/Hong_Kong"
};
const defaultWarehouseId = process.env.DEFAULT_WAREHOUSE_ID ?? "00000000-0000-4000-8000-000000003001";
const defaultSkuId = process.env.DEFAULT_SKU_ID ?? "00000000-0000-4000-8000-000000002001";
const slowInventoryReserveMs = Number(process.env.SLOW_INVENTORY_RESERVE_MS ?? 1000);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validationFailed(message: string, details?: unknown): BadRequestException {
  return new BadRequestException({
    code: ERROR_CODES.VALIDATION_FAILED,
    message,
    ...(details === undefined ? {} : { details })
  });
}

function notFound(message: string, details?: unknown): BadRequestException {
  return new BadRequestException({
    code: ERROR_CODES.NOT_FOUND,
    message,
    ...(details === undefined ? {} : { details })
  });
}

function inventoryShortage(details?: unknown): ConflictException {
  return new ConflictException({
    code: ERROR_CODES.INVENTORY_SHORTAGE,
    message: "Insufficient inventory for this item.",
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

function createStoreContext(correlationId: string | undefined): StoreContext {
  return assertStoreContext({
    storeId: selfHostedStore.storeId,
    region: selfHostedStore.region,
    timezone: selfHostedStore.timezone,
    correlationId: correlationId ?? randomUUID()
  });
}

function warnIfSlow(operation: string, startedAt: number, thresholdMs: number, ctx: StoreContext) {
  const durationMs = Date.now() - startedAt;

  if (durationMs <= thresholdMs) {
    return;
  }

  console.warn(
    JSON.stringify({
      event: "slow_request",
      service: "inventory-service",
      operation,
      durationMs,
      thresholdMs,
      correlationId: ctx.correlationId
    })
  );
}

function normalizeUuid(value: string | undefined, field: string): string {
  const uuid = value?.trim();

  if (!uuid || !uuidPattern.test(uuid)) {
    throw validationFailed(`${field} must be a UUID`, { field });
  }

  return uuid;
}

function normalizeQuantity(value: number | undefined): number {
  const qty = Number(value);

  if (!Number.isInteger(qty) || qty <= 0 || qty > 999) {
    throw validationFailed("qty must be an integer between 1 and 999", { field: "qty", min: 1, max: 999 });
  }

  return qty;
}

function normalizeNonNegativeInteger(value: number | undefined, field: string): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const qty = Number(value);

  if (!Number.isInteger(qty) || qty < 0 || qty > 999999) {
    throw validationFailed(`${field} must be an integer between 0 and 999999`, { field, min: 0, max: 999999 });
  }

  return qty;
}

function normalizeSignedInteger(value: number | undefined, field: string): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const qty = Number(value);

  if (!Number.isInteger(qty) || qty < -999999 || qty > 999999) {
    throw validationFailed(`${field} must be an integer between -999999 and 999999`, { field, min: -999999, max: 999999 });
  }

  return qty;
}

function normalizeReason(value: string | undefined): string {
  const reason = value?.trim();

  if (!reason || reason.length > 300) {
    throw validationFailed("reason is required and must be 300 characters or less", { field: "reason", maxLength: 300 });
  }

  return reason;
}

function normalizeActorId(value: string | undefined): string {
  const actorId = value?.trim() || "local-admin";

  if (actorId.length > 120) {
    throw validationFailed("actorId must be 120 characters or less", { field: "actorId", maxLength: 120 });
  }

  return actorId;
}

function normalizeAdjustmentRequest(body: AdminInventoryAdjustmentRequest) {
  const availableDelta = normalizeSignedInteger(body.availableDelta, "availableDelta");
  const stocktakeAvailableQty = normalizeNonNegativeInteger(body.stocktakeAvailableQty, "stocktakeAvailableQty");
  const safetyQty = normalizeNonNegativeInteger(body.safetyQty, "safetyQty");

  if (availableDelta !== undefined && stocktakeAvailableQty !== undefined) {
    throw validationFailed("availableDelta and stocktakeAvailableQty cannot be used together", {
      fields: ["availableDelta", "stocktakeAvailableQty"]
    });
  }

  if (availableDelta === undefined && stocktakeAvailableQty === undefined && safetyQty === undefined) {
    throw validationFailed("at least one inventory adjustment field is required", {
      fields: ["availableDelta", "stocktakeAvailableQty", "safetyQty"]
    });
  }

  return {
    availableDelta,
    stocktakeAvailableQty,
    safetyQty,
    reason: normalizeReason(body.reason),
    actorId: normalizeActorId(body.actorId)
  };
}

function normalizeRequest(body: ReservationRequest, idempotencyKeyHeader: string | undefined) {
  const idempotencyKey = idempotencyKeyHeader?.trim() || body.idempotencyKey?.trim();

  if (!idempotencyKey || idempotencyKey.length > 160) {
    throw validationFailed("idempotencyKey is required", { field: "idempotencyKey", maxLength: 160 });
  }

  return {
    skuId: normalizeUuid(body.skuId, "skuId"),
    warehouseId: body.warehouseId ? normalizeUuid(body.warehouseId, "warehouseId") : undefined,
    orderId: body.orderId ? normalizeUuid(body.orderId, "orderId") : undefined,
    qty: normalizeQuantity(body.qty),
    idempotencyKey
  };
}

function resultFromRows(
  reservation: ReservationRow,
  item: InventoryItemRow,
  storageMode: StorageMode
): ReservationResult {
  return {
    reservationId: reservation.id,
    status: reservation.status,
    skuId: reservation.sku_id,
    warehouseId: reservation.warehouse_id,
    orderId: reservation.order_id ?? undefined,
    qty: reservation.qty,
    availableQty: item.available_qty,
    reservedQty: item.reserved_qty,
    safetyQty: item.safety_qty,
    inventoryVersion: item.inventory_version,
    idempotencyKey: reservation.idempotency_key,
    storageMode
  };
}

function resultFromMemory(
  reservation: MemoryReservation,
  item: MemoryInventoryItem,
  storageMode: StorageMode
): ReservationResult {
  return {
    reservationId: reservation.id,
    status: reservation.status,
    skuId: reservation.skuId,
    warehouseId: reservation.warehouseId,
    orderId: reservation.orderId,
    qty: reservation.qty,
    availableQty: item.availableQty,
    reservedQty: item.reservedQty,
    safetyQty: item.safetyQty,
    inventoryVersion: item.inventoryVersion,
    idempotencyKey: reservation.idempotencyKey,
    storageMode
  };
}

@Injectable()
class InventoryMemoryStore {
  private readonly items = new Map<string, MemoryInventoryItem>();
  private readonly reservationsByIdempotencyKey = new Map<string, MemoryReservation>();
  private readonly auditEvents: AdminInventoryAuditEvent[] = [];

  constructor() {
    this.ensureItem(defaultSkuId, defaultWarehouseId);
  }

  tryReserve(input: ReturnType<typeof normalizeRequest>): ReservationResult {
    const existing = this.reservationsByIdempotencyKey.get(input.idempotencyKey);

    if (existing) {
      assertReservationReplay(input.idempotencyKey, {
        skuId: existing.skuId,
        warehouseId: existing.warehouseId,
        qty: existing.qty
      }, {
        skuId: input.skuId,
        warehouseId: input.warehouseId ?? defaultWarehouseId,
        qty: input.qty
      });
      return resultFromMemory(existing, this.ensureItem(existing.skuId, existing.warehouseId), "memory");
    }

    const warehouseId = input.warehouseId ?? defaultWarehouseId;
    const item = this.ensureItem(input.skuId, warehouseId);
    const sellableQty = item.availableQty - item.reservedQty - item.safetyQty;

    if (sellableQty < input.qty) {
      throw inventoryShortage({ skuId: input.skuId, requestedQty: input.qty, sellableQty });
    }

    item.reservedQty += input.qty;
    item.inventoryVersion += 1;
    const reservation: MemoryReservation = {
      id: randomUUID(),
      orderId: input.orderId,
      skuId: input.skuId,
      warehouseId,
      qty: input.qty,
      status: "reserved",
      idempotencyKey: input.idempotencyKey,
      createdAt: new Date().toISOString()
    };
    this.reservationsByIdempotencyKey.set(input.idempotencyKey, reservation);
    return resultFromMemory(reservation, item, "memory");
  }

  confirm(input: ReturnType<typeof normalizeRequest>): ReservationResult {
    const reservation = this.requireReservation(input.idempotencyKey);
    const item = this.ensureItem(reservation.skuId, reservation.warehouseId);

    if (reservation.status === "confirmed") {
      return resultFromMemory(reservation, item, "memory");
    }

    if (reservation.status === "cancelled") {
      throw stateConflict("cancelled reservation cannot be confirmed", { idempotencyKey: input.idempotencyKey });
    }

    item.availableQty -= reservation.qty;
    item.reservedQty -= reservation.qty;
    item.inventoryVersion += 1;
    reservation.status = "confirmed";
    return resultFromMemory(reservation, item, "memory");
  }

  cancel(input: ReturnType<typeof normalizeRequest>): ReservationResult {
    const reservation = this.requireReservation(input.idempotencyKey);
    const item = this.ensureItem(reservation.skuId, reservation.warehouseId);

    if (reservation.status === "cancelled") {
      return resultFromMemory(reservation, item, "memory");
    }

    if (reservation.status === "confirmed") {
      throw stateConflict("confirmed reservation cannot be cancelled", { idempotencyKey: input.idempotencyKey });
    }

    item.reservedQty -= reservation.qty;
    item.inventoryVersion += 1;
    reservation.status = "cancelled";
    return resultFromMemory(reservation, item, "memory");
  }

  listItems(): AdminInventoryItem[] {
    return [...this.items.values()].map((item) => ({
      itemId: item.id,
      skuId: item.skuId,
      warehouseId: item.warehouseId,
      availableQty: item.availableQty,
      reservedQty: item.reservedQty,
      lockedQty: 0,
      safetyQty: item.safetyQty,
      sellableQty: item.availableQty - item.reservedQty - item.safetyQty,
      inventoryVersion: item.inventoryVersion,
      storageMode: "memory"
    }));
  }

  listReservations(): AdminInventoryReservation[] {
    return [...this.reservationsByIdempotencyKey.values()]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 100)
      .map((reservation) => ({
        reservationId: reservation.id,
        orderId: reservation.orderId ?? null,
        skuId: reservation.skuId,
        warehouseId: reservation.warehouseId,
        qty: reservation.qty,
        status: reservation.status,
        idempotencyKey: reservation.idempotencyKey,
        storageMode: "memory",
        createdAt: reservation.createdAt
      }));
  }

  releaseReservation(reservationId: string, ctx: StoreContext, actorId: string, reason: string): ReservationResult {
    const reservation = [...this.reservationsByIdempotencyKey.values()].find((item) => item.id === reservationId);

    if (!reservation) {
      throw notFound("reservation does not exist", { reservationId });
    }

    const item = this.ensureItem(reservation.skuId, reservation.warehouseId);
    const oldValue = this.snapshotMemoryItem(item);
    const result = this.cancel({
      skuId: reservation.skuId,
      warehouseId: reservation.warehouseId,
      orderId: reservation.orderId,
      qty: reservation.qty,
      idempotencyKey: reservation.idempotencyKey
    });
    this.audit(ctx, item.id, "manual_release", actorId, reason, oldValue, this.snapshotMemoryItem(item));
    return result;
  }

  adjustItem(
    ctx: StoreContext,
    itemId: string,
    input: ReturnType<typeof normalizeAdjustmentRequest>
  ): AdminInventoryItem {
    const item = [...this.items.values()].find((candidate) => candidate.id === itemId);

    if (!item) {
      throw notFound("inventory item does not exist", { itemId });
    }

    const oldValue = this.snapshotMemoryItem(item);
    const nextAvailableQty = input.stocktakeAvailableQty ?? item.availableQty + (input.availableDelta ?? 0);
    const nextSafetyQty = input.safetyQty ?? item.safetyQty;

    if (nextAvailableQty < 0) {
      throw stateConflict("available inventory cannot be negative", { itemId, nextAvailableQty });
    }

    item.availableQty = nextAvailableQty;
    item.safetyQty = nextSafetyQty;
    item.inventoryVersion += 1;
    this.audit(ctx, item.id, this.actionForAdjustment(input), input.actorId, input.reason, oldValue, this.snapshotMemoryItem(item));
    return this.toAdminItem(item);
  }

  listAuditEvents(): AdminInventoryAuditEvent[] {
    return this.auditEvents.slice(0, 100);
  }

  private ensureItem(skuId: string, warehouseId: string): MemoryInventoryItem {
    const key = `${warehouseId}:${skuId}`;
    const existing = this.items.get(key);

    if (existing) {
      return existing;
    }

    const item = {
      id: randomUUID(),
      skuId,
      warehouseId,
      availableQty: Number(process.env.MEMORY_INVENTORY_DEFAULT_AVAILABLE_QTY ?? 50),
      reservedQty: 0,
      safetyQty: Number(process.env.MEMORY_INVENTORY_DEFAULT_SAFETY_QTY ?? 2),
      inventoryVersion: 1
    };
    this.items.set(key, item);
    return item;
  }

  private toAdminItem(item: MemoryInventoryItem): AdminInventoryItem {
    return {
      itemId: item.id,
      skuId: item.skuId,
      warehouseId: item.warehouseId,
      availableQty: item.availableQty,
      reservedQty: item.reservedQty,
      lockedQty: 0,
      safetyQty: item.safetyQty,
      sellableQty: item.availableQty - item.reservedQty - item.safetyQty,
      inventoryVersion: item.inventoryVersion,
      storageMode: "memory"
    };
  }

  private snapshotMemoryItem(item: MemoryInventoryItem) {
    return {
      availableQty: item.availableQty,
      reservedQty: item.reservedQty,
      safetyQty: item.safetyQty,
      inventoryVersion: item.inventoryVersion
    };
  }

  private actionForAdjustment(input: ReturnType<typeof normalizeAdjustmentRequest>): InventoryAuditAction {
    if (input.stocktakeAvailableQty !== undefined) {
      return "stocktake";
    }

    if (input.availableDelta !== undefined) {
      return "manual_adjustment";
    }

    return "safety_stock_update";
  }

  private audit(
    ctx: StoreContext,
    itemId: string,
    action: InventoryAuditAction,
    actorId: string,
    reason: string,
    oldValue: Record<string, number | string | null>,
    newValue: Record<string, number | string | null>
  ) {
    this.auditEvents.unshift({
      eventId: randomUUID(),
      itemId,
      action,
      actorId,
      reason,
      oldValue,
      newValue,
      correlationId: ctx.correlationId,
      storageMode: "memory",
      createdAt: new Date().toISOString()
    });

    if (this.auditEvents.length > 100) {
      this.auditEvents.pop();
    }
  }

  private requireReservation(idempotencyKey: string): MemoryReservation {
    const reservation = this.reservationsByIdempotencyKey.get(idempotencyKey);

    if (!reservation) {
      throw notFound("reservation does not exist for idempotencyKey", { idempotencyKey });
    }

    return reservation;
  }
}

@Injectable()
class InventoryRepository implements OnApplicationShutdown {
  private readonly pool = new Pool({
    connectionString: process.env.INVENTORY_DATABASE_URL ?? "postgres://commerce:commerce@localhost:5432/inventory_db",
    connectionTimeoutMillis: 800
  });

  async tryReserve(
    ctx: StoreContext,
    input: ReturnType<typeof normalizeRequest>
  ): Promise<ReservationResult> {
    return this.withTransaction(async (client) => {
      const existing = await this.findReservation(client, ctx, input.idempotencyKey);

      if (existing) {
        assertReservationReplay(input.idempotencyKey, {
          skuId: existing.sku_id,
          warehouseId: existing.warehouse_id,
          qty: existing.qty
        }, {
          skuId: input.skuId,
          warehouseId: input.warehouseId ?? defaultWarehouseId,
          qty: input.qty
        });
        const item = await this.findItemForReservation(client, ctx, existing);
        return resultFromRows(existing, item, "postgres");
      }

      const item = await this.findItemForReservationRequest(client, ctx, input);
      const sellableQty = item.available_qty - item.reserved_qty - item.safety_qty;

      if (sellableQty < input.qty) {
        throw inventoryShortage({ skuId: input.skuId, requestedQty: input.qty, sellableQty });
      }

      const reservation: ReservationRow = {
        id: randomUUID(),
        order_id: input.orderId ?? null,
        sku_id: input.skuId,
        warehouse_id: item.warehouse_id,
        qty: input.qty,
        status: "reserved",
        idempotency_key: input.idempotencyKey
      };

      const updatedItem = await this.updateItemQuantities(client, item.id, {
        reservedDelta: input.qty,
        availableDelta: 0
      });
      await client.query(
        `
          INSERT INTO inventory_reservations (
            id,
            store_id,
            order_id,
            sku_id,
            warehouse_id,
            qty,
            status,
            idempotency_key
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          reservation.id,
          ctx.storeId,
          reservation.order_id,
          reservation.sku_id,
          reservation.warehouse_id,
          reservation.qty,
          reservation.status,
          reservation.idempotency_key
        ]
      );

      return resultFromRows(reservation, updatedItem, "postgres");
    });
  }

  async confirm(ctx: StoreContext, input: ReturnType<typeof normalizeRequest>): Promise<ReservationResult> {
    return this.withTransaction(async (client) => {
      const reservation = await this.requireReservation(client, ctx, input.idempotencyKey);
      const item = await this.findItemForReservation(client, ctx, reservation);

      if (reservation.status === "confirmed") {
        return resultFromRows(reservation, item, "postgres");
      }

      if (reservation.status === "cancelled") {
        throw stateConflict("cancelled reservation cannot be confirmed", { idempotencyKey: input.idempotencyKey });
      }

      const updatedItem = await this.updateItemQuantities(client, item.id, {
        reservedDelta: -reservation.qty,
        availableDelta: -reservation.qty
      });
      const updatedReservation = await this.updateReservationStatus(client, reservation, "confirmed");
      return resultFromRows(updatedReservation, updatedItem, "postgres");
    });
  }

  async cancel(ctx: StoreContext, input: ReturnType<typeof normalizeRequest>): Promise<ReservationResult> {
    return this.withTransaction(async (client) => {
      const reservation = await this.requireReservation(client, ctx, input.idempotencyKey);
      const item = await this.findItemForReservation(client, ctx, reservation);

      if (reservation.status === "cancelled") {
        return resultFromRows(reservation, item, "postgres");
      }

      if (reservation.status === "confirmed") {
        throw stateConflict("confirmed reservation cannot be cancelled", { idempotencyKey: input.idempotencyKey });
      }

      const updatedItem = await this.updateItemQuantities(client, item.id, {
        reservedDelta: -reservation.qty,
        availableDelta: 0
      });
      const updatedReservation = await this.updateReservationStatus(client, reservation, "cancelled");
      return resultFromRows(updatedReservation, updatedItem, "postgres");
    });
  }

  async listItems(ctx: StoreContext): Promise<AdminInventoryItem[]> {
    const result = await this.pool.query<InventoryItemRow>(
      `
        SELECT id, sku_id, warehouse_id, available_qty, reserved_qty, safety_qty, inventory_version
        FROM inventory_items
        WHERE store_id = $1
        ORDER BY created_at DESC
        LIMIT 100
      `,
      [ctx.storeId]
    );

    return result.rows.map((item) => ({
      itemId: item.id,
      skuId: item.sku_id,
      warehouseId: item.warehouse_id,
      availableQty: item.available_qty,
      reservedQty: item.reserved_qty,
      lockedQty: 0,
      safetyQty: item.safety_qty,
      sellableQty: item.available_qty - item.reserved_qty - item.safety_qty,
      inventoryVersion: item.inventory_version,
      storageMode: "postgres"
    }));
  }

  async listReservations(ctx: StoreContext): Promise<AdminInventoryReservation[]> {
    const result = await this.pool.query<Required<ReservationRow>>(
      `
        SELECT id, order_id, sku_id, warehouse_id, qty, status, idempotency_key, created_at
        FROM inventory_reservations
        WHERE store_id = $1
        ORDER BY created_at DESC
        LIMIT 100
      `,
      [ctx.storeId]
    );

    return result.rows.map((reservation) => ({
      reservationId: reservation.id,
      orderId: reservation.order_id,
      skuId: reservation.sku_id,
      warehouseId: reservation.warehouse_id,
      qty: reservation.qty,
      status: reservation.status,
      idempotencyKey: reservation.idempotency_key,
      storageMode: "postgres",
      createdAt: reservation.created_at.toISOString()
    }));
  }

  async releaseReservation(ctx: StoreContext, reservationId: string, actorId: string, reason: string): Promise<ReservationResult> {
    return this.withTransaction(async (client) => {
      const reservationResult = await client.query<ReservationRow>(
        `
          SELECT id, order_id, sku_id, warehouse_id, qty, status, idempotency_key
          FROM inventory_reservations
          WHERE store_id = $1
            AND id = $2
          FOR UPDATE
        `,
        [ctx.storeId, reservationId]
      );
      const reservation = reservationResult.rows[0];

      if (!reservation) {
        throw notFound("reservation does not exist", { reservationId });
      }

      const item = await this.findItemForReservation(client, ctx, reservation);

      if (reservation.status === "cancelled") {
        return resultFromRows(reservation, item, "postgres");
      }

      if (reservation.status === "confirmed") {
        throw stateConflict("confirmed reservation cannot be manually released", { reservationId });
      }

      const oldValue = this.snapshotItem(item);
      const updatedItem = await this.updateItemQuantities(client, item.id, {
        reservedDelta: -reservation.qty,
        availableDelta: 0
      });
      const updatedReservation = await this.updateReservationStatus(client, reservation, "cancelled");
      await this.insertAuditEvent(client, ctx, {
        itemId: item.id,
        action: "manual_release",
        actorId,
        reason,
        oldValue,
        newValue: this.snapshotItem(updatedItem)
      });
      return resultFromRows(updatedReservation, updatedItem, "postgres");
    });
  }

  async adjustItem(
    ctx: StoreContext,
    itemId: string,
    input: ReturnType<typeof normalizeAdjustmentRequest>
  ): Promise<AdminInventoryItem> {
    return this.withTransaction(async (client) => {
      const item = await this.findItemById(client, ctx, itemId);
      const oldValue = this.snapshotItem(item);
      const nextAvailableQty = input.stocktakeAvailableQty ?? item.available_qty + (input.availableDelta ?? 0);
      const nextSafetyQty = input.safetyQty ?? item.safety_qty;

      if (nextAvailableQty < 0) {
        throw stateConflict("available inventory cannot be negative", { itemId, nextAvailableQty });
      }

      const result = await client.query<InventoryItemRow>(
        `
          UPDATE inventory_items
          SET available_qty = $3,
              safety_qty = $4,
              inventory_version = inventory_version + 1
          WHERE store_id = $1
            AND id = $2
          RETURNING id, sku_id, warehouse_id, available_qty, reserved_qty, safety_qty, inventory_version
        `,
        [ctx.storeId, itemId, nextAvailableQty, nextSafetyQty]
      );
      const updatedItem = result.rows[0];

      if (!updatedItem) {
        throw notFound("inventory item does not exist", { itemId });
      }

      await this.insertAuditEvent(client, ctx, {
        itemId,
        action: this.actionForAdjustment(input),
        actorId: input.actorId,
        reason: input.reason,
        oldValue,
        newValue: this.snapshotItem(updatedItem)
      });

      return this.toAdminItem(updatedItem);
    });
  }

  async listAuditEvents(ctx: StoreContext): Promise<AdminInventoryAuditEvent[]> {
    const result = await this.pool.query<InventoryAuditRow>(
      `
        SELECT id, inventory_item_id, action, actor_id, reason, old_value, new_value, correlation_id, created_at
        FROM inventory_audit_events
        WHERE store_id = $1
        ORDER BY created_at DESC
        LIMIT 100
      `,
      [ctx.storeId]
    );

    return result.rows.map((event) => ({
      eventId: event.id,
      itemId: event.inventory_item_id,
      action: event.action,
      actorId: event.actor_id,
      reason: event.reason,
      oldValue: event.old_value,
      newValue: event.new_value,
      correlationId: event.correlation_id,
      storageMode: "postgres",
      createdAt: event.created_at.toISOString()
    }));
  }

  private async withTransaction<T>(handler: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      const result = await handler(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async findReservation(client: PoolClient, ctx: StoreContext, idempotencyKey: string) {
    const result = await client.query<ReservationRow>(
      `
        SELECT id, order_id, sku_id, warehouse_id, qty, status, idempotency_key
        FROM inventory_reservations
        WHERE store_id = $1
          AND idempotency_key = $2
        FOR UPDATE
      `,
      [ctx.storeId, idempotencyKey]
    );
    return result.rows[0];
  }

  private async requireReservation(client: PoolClient, ctx: StoreContext, idempotencyKey: string) {
    const reservation = await this.findReservation(client, ctx, idempotencyKey);

    if (!reservation) {
      throw notFound("reservation does not exist for idempotencyKey", { idempotencyKey });
    }

    return reservation;
  }

  private async findItemForReservation(client: PoolClient, ctx: StoreContext, reservation: ReservationRow) {
    const result = await client.query<InventoryItemRow>(
      `
        SELECT id, sku_id, warehouse_id, available_qty, reserved_qty, safety_qty, inventory_version
        FROM inventory_items
        WHERE store_id = $1
          AND sku_id = $2
          AND warehouse_id = $3
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE
      `,
      [ctx.storeId, reservation.sku_id, reservation.warehouse_id]
    );

    if (!result.rows[0]) {
      throw notFound("inventory item does not exist", { skuId: reservation.sku_id, warehouseId: reservation.warehouse_id });
    }

    return result.rows[0];
  }

  private async findItemById(client: PoolClient, ctx: StoreContext, itemId: string) {
    const result = await client.query<InventoryItemRow>(
      `
        SELECT id, sku_id, warehouse_id, available_qty, reserved_qty, safety_qty, inventory_version
        FROM inventory_items
        WHERE store_id = $1
          AND id = $2
        FOR UPDATE
      `,
      [ctx.storeId, itemId]
    );

    if (!result.rows[0]) {
      throw notFound("inventory item does not exist", { itemId });
    }

    return result.rows[0];
  }

  private async findItemForReservationRequest(
    client: PoolClient,
    ctx: StoreContext,
    input: ReturnType<typeof normalizeRequest>
  ) {
    const warehouseFilter = input.warehouseId ? "AND warehouse_id = $3" : "";
    const params = input.warehouseId ? [ctx.storeId, input.skuId, input.warehouseId] : [ctx.storeId, input.skuId];
    const result = await client.query<InventoryItemRow>(
      `
        SELECT id, sku_id, warehouse_id, available_qty, reserved_qty, safety_qty, inventory_version
        FROM inventory_items
        WHERE store_id = $1
          AND sku_id = $2
          ${warehouseFilter}
        ORDER BY (available_qty - reserved_qty - safety_qty) DESC, created_at ASC
        LIMIT 1
        FOR UPDATE
      `,
      params
    );

    if (!result.rows[0]) {
      throw notFound("inventory item does not exist", { skuId: input.skuId, warehouseId: input.warehouseId });
    }

    return result.rows[0];
  }

  private async updateItemQuantities(
    client: PoolClient,
    itemId: string,
    change: { reservedDelta: number; availableDelta: number }
  ) {
    const result = await client.query<InventoryItemRow>(
      `
        UPDATE inventory_items
        SET reserved_qty = reserved_qty + $2,
            available_qty = available_qty + $3,
            inventory_version = inventory_version + 1
        WHERE id = $1
        RETURNING id, sku_id, warehouse_id, available_qty, reserved_qty, safety_qty, inventory_version
      `,
      [itemId, change.reservedDelta, change.availableDelta]
    );
    const item = result.rows[0];

    if (!item || item.available_qty < 0 || item.reserved_qty < 0) {
      throw stateConflict("inventory quantity invariant failed", { itemId, availableQty: item?.available_qty, reservedQty: item?.reserved_qty });
    }

    return item;
  }

  private async updateReservationStatus(
    client: PoolClient,
    reservation: ReservationRow,
    status: ReservationStatus
  ) {
    const result = await client.query<ReservationRow>(
      `
        UPDATE inventory_reservations
        SET status = $3
        WHERE id = $1
          AND store_id = $2
        RETURNING id, order_id, sku_id, warehouse_id, qty, status, idempotency_key
      `,
      [reservation.id, selfHostedStore.storeId, status]
    );
    return result.rows[0] ?? { ...reservation, status };
  }

  private toAdminItem(item: InventoryItemRow): AdminInventoryItem {
    return {
      itemId: item.id,
      skuId: item.sku_id,
      warehouseId: item.warehouse_id,
      availableQty: item.available_qty,
      reservedQty: item.reserved_qty,
      lockedQty: 0,
      safetyQty: item.safety_qty,
      sellableQty: item.available_qty - item.reserved_qty - item.safety_qty,
      inventoryVersion: item.inventory_version,
      storageMode: "postgres"
    };
  }

  private snapshotItem(item: InventoryItemRow) {
    return {
      availableQty: item.available_qty,
      reservedQty: item.reserved_qty,
      safetyQty: item.safety_qty,
      inventoryVersion: item.inventory_version
    };
  }

  private actionForAdjustment(input: ReturnType<typeof normalizeAdjustmentRequest>): InventoryAuditAction {
    if (input.stocktakeAvailableQty !== undefined) {
      return "stocktake";
    }

    if (input.availableDelta !== undefined) {
      return "manual_adjustment";
    }

    return "safety_stock_update";
  }

  private async insertAuditEvent(
    client: PoolClient,
    ctx: StoreContext,
    event: {
      itemId: string;
      action: InventoryAuditAction;
      actorId: string;
      reason: string;
      oldValue: Record<string, number | string | null>;
      newValue: Record<string, number | string | null>;
    }
  ) {
    await client.query(
      `
        INSERT INTO inventory_audit_events (
          id,
          store_id,
          inventory_item_id,
          action,
          actor_id,
          reason,
          old_value,
          new_value,
          correlation_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9)
      `,
      [
        randomUUID(),
        ctx.storeId,
        event.itemId,
        event.action,
        event.actorId,
        event.reason,
        JSON.stringify(event.oldValue),
        JSON.stringify(event.newValue),
        ctx.correlationId
      ]
    );
  }

  async onApplicationShutdown() {
    await this.pool.end();
  }
}

@Controller()
class InventoryController {
  constructor(
    @Inject(InventoryRepository) private readonly inventoryRepository: InventoryRepository,
    @Inject(InventoryMemoryStore) private readonly memoryStore: InventoryMemoryStore
  ) {}

  @Get("/health")
  health() {
    return {
      service: "inventory-service",
      status: "ok",
      tcc: ["tryReserve", "confirmDeduct", "cancelRelease"],
      sourceOfTruth: "inventory_reservations",
      fallback: "memory mode is explicit and only for local development when PostgreSQL is unavailable"
    };
  }

  @Get("/inventory/items")
  async items(@Headers("x-correlation-id") correlationId: string | undefined) {
    const ctx = createStoreContext(correlationId);

    try {
      return await this.inventoryRepository.listItems(ctx);
    } catch {
      return this.memoryStore.listItems();
    }
  }

  @Get("/inventory/reservations")
  async reservations(@Headers("x-correlation-id") correlationId: string | undefined) {
    const ctx = createStoreContext(correlationId);

    try {
      return await this.inventoryRepository.listReservations(ctx);
    } catch {
      return this.memoryStore.listReservations();
    }
  }

  @Get("/inventory/audit-events")
  async auditEvents(@Headers("x-correlation-id") correlationId: string | undefined) {
    const ctx = createStoreContext(correlationId);

    try {
      return await this.inventoryRepository.listAuditEvents(ctx);
    } catch {
      return this.memoryStore.listAuditEvents();
    }
  }

  @Post("/inventory/items/:id/adjust")
  async adjustInventoryItem(
    @Headers("x-correlation-id") correlationId: string | undefined,
    @Headers("x-admin-actor") actorHeader: string | undefined,
    @Param("id") id: string,
    @Body() body: AdminInventoryAdjustmentRequest
  ) {
    const ctx = createStoreContext(correlationId);
    const itemId = normalizeUuid(id, "itemId");
    const requestBody = body ?? {};
    const input = normalizeAdjustmentRequest({ ...requestBody, actorId: actorHeader ?? requestBody.actorId });

    try {
      return await this.inventoryRepository.adjustItem(ctx, itemId, input);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      return this.memoryStore.adjustItem(ctx, itemId, input);
    }
  }

  @Post("/inventory/reservations/:id/release")
  async releaseReservation(
    @Headers("x-correlation-id") correlationId: string | undefined,
    @Headers("x-admin-actor") actorHeader: string | undefined,
    @Param("id") id: string,
    @Body() body: { reason?: string; actorId?: string }
  ) {
    const ctx = createStoreContext(correlationId);
    const reservationId = normalizeUuid(id, "reservationId");
    const requestBody = body ?? {};
    const actorId = normalizeActorId(actorHeader ?? requestBody.actorId);
    const reason = normalizeReason(requestBody.reason ?? "manual reservation release");

    try {
      return await this.inventoryRepository.releaseReservation(ctx, reservationId, actorId, reason);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      return this.memoryStore.releaseReservation(reservationId, ctx, actorId, reason);
    }
  }

  @Post("/reservations/try")
  async tryReserve(
    @Headers("x-correlation-id") correlationId: string | undefined,
    @Headers("idempotency-key") idempotencyKeyHeader: string | undefined,
    @Headers("x-idempotency-key") alternateIdempotencyKeyHeader: string | undefined,
    @Body() body: ReservationRequest
  ) {
    const ctx = createStoreContext(correlationId);
    const startedAt = Date.now();

    try {
      return await this.useStorage(ctx, body, idempotencyKeyHeader ?? alternateIdempotencyKeyHeader, (storeCtx, input) =>
        this.inventoryRepository.tryReserve(storeCtx, input),
        (input) => this.memoryStore.tryReserve(input)
      );
    } finally {
      warnIfSlow("inventory.reserve", startedAt, slowInventoryReserveMs, ctx);
    }
  }

  @Post("/reservations/confirm")
  confirm(
    @Headers("x-correlation-id") correlationId: string | undefined,
    @Headers("idempotency-key") idempotencyKeyHeader: string | undefined,
    @Headers("x-idempotency-key") alternateIdempotencyKeyHeader: string | undefined,
    @Body() body: ReservationRequest
  ) {
    const ctx = createStoreContext(correlationId);
    return this.useStorage(ctx, body, idempotencyKeyHeader ?? alternateIdempotencyKeyHeader, (ctx, input) =>
      this.inventoryRepository.confirm(ctx, input),
      (input) => this.memoryStore.confirm(input)
    );
  }

  @Post("/reservations/cancel")
  cancel(
    @Headers("x-correlation-id") correlationId: string | undefined,
    @Headers("idempotency-key") idempotencyKeyHeader: string | undefined,
    @Headers("x-idempotency-key") alternateIdempotencyKeyHeader: string | undefined,
    @Body() body: ReservationRequest
  ) {
    const ctx = createStoreContext(correlationId);
    return this.useStorage(ctx, body, idempotencyKeyHeader ?? alternateIdempotencyKeyHeader, (ctx, input) =>
      this.inventoryRepository.cancel(ctx, input),
      (input) => this.memoryStore.cancel(input)
    );
  }

  private async useStorage(
    ctx: StoreContext,
    body: ReservationRequest,
    idempotencyKeyHeader: string | undefined,
    postgresAction: (ctx: StoreContext, input: ReturnType<typeof normalizeRequest>) => Promise<ReservationResult>,
    memoryAction: (input: ReturnType<typeof normalizeRequest>) => ReservationResult
  ) {
    const input = normalizeRequest(body, idempotencyKeyHeader);

    try {
      return await postgresAction(ctx, input);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      return memoryAction(input);
    }
  }
}

@Module({ controllers: [InventoryController], providers: [InventoryRepository, InventoryMemoryStore] })
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true });
  await app.listen(Number(process.env.PORT ?? 4104), "0.0.0.0");
}

void bootstrap();
