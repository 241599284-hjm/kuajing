import type { StoreContext } from "@commerce/store-context";

export type AuditEvent = {
  store: StoreContext;
  action: string;
  actorId?: string;
  targetType: string;
  targetId: string;
  occurredAt: string;
  reason?: string;
};

export function createAuditEvent(input: Omit<AuditEvent, "occurredAt">): AuditEvent {
  return {
    ...input,
    occurredAt: new Date().toISOString()
  };
}

