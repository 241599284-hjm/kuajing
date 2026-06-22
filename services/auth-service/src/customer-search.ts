export function normalizeCustomerSearch(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 100) : "";
}

export function customerSearchFilter(search: string, parameterIndex: number) {
  if (!search) return { sql: "", values: [] as string[] };
  return {
    sql: `AND (username ILIKE $${parameterIndex} OR email ILIKE $${parameterIndex})`,
    values: [`%${search}%`]
  };
}
