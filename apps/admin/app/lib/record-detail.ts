export type RecordKind = "refunds" | "webhooks" | "customers";

const idFields: Record<RecordKind, string> = {
  refunds: "refundId",
  webhooks: "eventId",
  customers: "customerId"
};

const pathPrefixes: Record<RecordKind, string> = {
  refunds: "/payments/refunds",
  webhooks: "/payments/webhooks",
  customers: "/customers"
};

export function recordDetailRequest(kind: RecordKind, record: Record<string, unknown>) {
  const value = record[idFields[kind]];
  if (typeof value !== "string" || !value.trim()) throw new Error("record requires a stable business id");
  return { id: value, path: `${pathPrefixes[kind]}/${encodeURIComponent(value)}` };
}
