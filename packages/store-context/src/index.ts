export type StoreContext = {
  storeId: string;
  region: string;
  timezone: string;
  correlationId: string;
  actorId?: string;
};

export function assertStoreContext(value: Partial<StoreContext> | undefined): StoreContext {
  if (!value?.storeId) {
    throw new Error("store_id is required and must be injected by infrastructure");
  }
  if (!value.region) {
    throw new Error("store region is required");
  }
  if (!value.timezone) {
    throw new Error("store timezone is required");
  }
  if (!value.correlationId) {
    throw new Error("correlation_id is required");
  }

  return value as StoreContext;
}

export function storeCacheKey(ctx: StoreContext, key: string): string {
  return `store:${ctx.storeId}:${key}`;
}

